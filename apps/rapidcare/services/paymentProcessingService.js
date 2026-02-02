const Transaction = require('../models/Transaction');
const PaymentConfig = require('../models/PaymentConfig');
const Booking = require('../models/Booking');
const ValidationService = require('./validationService');
const NotificationService = require('./notificationService');
const ErrorHandler = require('../utils/errorHandler');
const { formatTaka, parseTaka, isValidTakaAmount, roundTaka } = require('../utils/currencyUtils');
const db = require('../config/database');

// Security imports
const securityUtils = require('../utils/securityUtils');
const auditService = require('./auditService');
const fraudDetectionService = require('./fraudDetectionService');
const securePaymentDataService = require('./securePaymentDataService');

class PaymentProcessingService {
  /**
   * Process booking payment through bKash-style payment gateway with comprehensive error handling and security
   */
  static async processBookingPayment(bookingId, paymentData, userId, attemptCount = 1, requestContext = {}) {
    let transaction = null;
    const { ipAddress, userAgent, sessionId } = requestContext;
    
    try {
      // Begin database transaction for atomicity
      db.exec('BEGIN TRANSACTION');

      // Securely process payment data
      const secureDataResult = await securePaymentDataService.processPaymentData(
        paymentData, 
        userId, 
        'BOOKING_PAYMENT'
      );

      if (!secureDataResult.success) {
        db.exec('ROLLBACK');
        return {
          success: false,
          error: 'Payment data processing failed',
          details: secureDataResult.error
        };
      }

      const processedPaymentData = secureDataResult.processedData;

      // Validate booking exists and is payable
      const booking = Booking.findById(bookingId);
      if (!booking) {
        db.exec('ROLLBACK');
        return ErrorHandler.createError('bkash', 'INVALID_TRANSACTION', {
          bookingId,
          reason: 'Booking not found'
        });
      }

      if (booking.paymentStatus === 'paid') {
        db.exec('ROLLBACK');
        return ErrorHandler.createError('bkash', 'DUPLICATE_TRANSACTION', {
          bookingId,
          transactionId: booking.transactionId
        });
      }

      if (booking.status === 'cancelled') {
        db.exec('ROLLBACK');
        return ErrorHandler.createError('bkash', 'INVALID_TRANSACTION', {
          bookingId,
          reason: 'Cannot pay for cancelled booking'
        });
      }

      // Check if Rapid Assistance is requested and validate senior citizen status
      const rapidAssistance = paymentData.rapidAssistance || false;
      let rapidAssistanceAmount = 0;
      
      if (rapidAssistance) {
        // Use ValidationService for consistent rapid assistance validation
        const rapidAssistanceValidation = ValidationService.validateRapidAssistanceEligibility(booking.patientAge, rapidAssistance);
        if (!rapidAssistanceValidation.isValid) {
          db.exec('ROLLBACK');
          return {
            success: false,
            error: rapidAssistanceValidation.errors[0]
          };
        }
        rapidAssistanceAmount = ValidationService.calculateRapidAssistanceCharge(rapidAssistance);
      }

      // Validate bKash payment data with comprehensive error handling
      const validation = ErrorHandler.validateBkashPaymentData({
        ...paymentData,
        amount: booking.paymentAmount + rapidAssistanceAmount
      });
      
      if (!validation.isValid) {
        db.exec('ROLLBACK');
        return {
          success: false,
          errors: validation.errors,
          message: 'Payment validation failed'
        };
      }

      // Perform fraud detection analysis
      const fraudAnalysis = await fraudDetectionService.analyzeTransaction({
        userId,
        amountTaka: parseFloat(booking.paymentAmount + rapidAssistanceAmount),
        mobileNumber: paymentData.mobileNumber,
        ipAddress,
        userAgent,
        sessionId,
        transactionTime: new Date()
      });

      if (!fraudAnalysis.success) {
        console.warn('Fraud analysis failed, proceeding with caution:', fraudAnalysis.error);
      } else {
        // Handle fraud detection results
        switch (fraudAnalysis.analysis.recommendation.action) {
          case 'BLOCK':
            db.exec('ROLLBACK');
            await auditService.logSecurityEvent({
              eventType: 'PAYMENT_BLOCKED_FRAUD',
              userId,
              ipAddress,
              userAgent,
              sessionId,
              eventData: {
                bookingId,
                riskScore: fraudAnalysis.analysis.riskScore,
                fraudFlags: fraudAnalysis.analysis.fraudFlags,
                amount: booking.paymentAmount + rapidAssistanceAmount
              },
              severity: 'CRITICAL'
            });
            
            return {
              success: false,
              error: 'Payment blocked due to security concerns. Please contact support.',
              errorCode: 'FRAUD_DETECTED',
              riskLevel: fraudAnalysis.analysis.riskLevel
            };

          case 'CHALLENGE':
            // For now, we'll log and continue, but in production this would require additional verification
            await auditService.logSecurityEvent({
              eventType: 'PAYMENT_REQUIRES_VERIFICATION',
              userId,
              ipAddress,
              userAgent,
              sessionId,
              eventData: {
                bookingId,
                riskScore: fraudAnalysis.analysis.riskScore,
                fraudFlags: fraudAnalysis.analysis.fraudFlags,
                amount: booking.paymentAmount + rapidAssistanceAmount
              },
              severity: 'HIGH'
            });
            break;
        }
      }

      // Validate Taka amount
      const amountValidation = ErrorHandler.validateTakaAmount(booking.paymentAmount + rapidAssistanceAmount, {
        minAmount: 10,
        maxAmount: 25000
      });

      if (!amountValidation.isValid) {
        db.exec('ROLLBACK');
        return {
          success: false,
          errors: amountValidation.errors,
          message: 'Invalid payment amount'
        };
      }

      // Get payment configuration with error handling
      let config, serviceCharge, hospitalAmount;
      try {
        config = PaymentConfig.getConfigForHospital(booking.hospitalId);
        serviceCharge = PaymentConfig.calculateServiceCharge(amountValidation.sanitizedAmount, booking.hospitalId);
        hospitalAmount = roundTaka(amountValidation.sanitizedAmount - serviceCharge);
      } catch (configError) {
        db.exec('ROLLBACK');
        ErrorHandler.logError(configError, { bookingId, hospitalId: booking.hospitalId });
        return ErrorHandler.handleRevenueDistributionError(configError, {
          transactionId: null,
          hospitalId: booking.hospitalId,
          amount: amountValidation.sanitizedAmount
        });
      }

      // Generate unique transaction ID
      const transactionId = securityUtils.generateSecureTransactionRef();

      // Create transaction record with bKash-style data and security metadata
      const transactionData = {
        bookingId,
        userId,
        hospitalId: booking.hospitalId,
        amount: amountValidation.sanitizedAmount,
        serviceCharge: roundTaka(serviceCharge),
        hospitalAmount: roundTaka(hospitalAmount),
        paymentMethod: 'bkash',
        transactionId,
        status: 'pending',
        paymentData: {
          mobileNumber: securityUtils.maskMobileNumber(paymentData.mobileNumber),
          paymentMethod: 'bkash',
          attemptCount,
          bkashTransactionId: null, // Will be set after successful payment
          security_metadata: processedPaymentData.security_metadata,
          riskScore: fraudAnalysis.success ? fraudAnalysis.analysis.riskScore : 0,
          fraudFlags: fraudAnalysis.success ? fraudAnalysis.analysis.fraudFlags : [],
          rapidAssistance: rapidAssistance,
          rapidAssistanceAmount: rapidAssistance ? rapidAssistanceAmount : 0
        }
      };

      transaction = Transaction.create(transactionData);

      // Process payment through bKash simulation with comprehensive error handling
      const paymentResult = await this.processBkashPayment(
        processedPaymentData, 
        amountValidation.sanitizedAmount, 
        attemptCount,
        requestContext
      );

      if (paymentResult.success) {
        // Payment successful - confirm transaction
        const confirmedTransaction = this.confirmBkashPayment(transaction.id, paymentResult.bkashTransactionId);
        
        // Update booking payment status and add Rapid Assistance info if applicable
        const updatedBookingData = {
          paymentStatus: 'paid',
          paymentMethod: 'bkash',
          transactionId: transactionId
        };
        
        // Add Rapid Assistance details if requested
        if (rapidAssistance) {
          // Generate random Rapid Assistant details
          const rapidAssistants = [
            { name: "আব্দুল কাদের", phone: "01712345678" },
            { name: "ফাতেমা বেগম", phone: "01723456789" },
            { name: "মোহাম্মদ আলী", phone: "01734567890" },
            { name: "সাবরিনা আক্তার", phone: "01745678901" },
            { name: "আবুল হোসেন", phone: "01756789012" },
            { name: "শাহজাহান মিয়া", phone: "01767890123" },
            { name: "নাসিমা খাতুন", phone: "01778901234" },
            { name: "রশিদ মিয়া", phone: "01789012345" }
          ];
          
          const randomAssistant = rapidAssistants[Math.floor(Math.random() * rapidAssistants.length)];
          
          updatedBookingData.rapidAssistance = true;
          updatedBookingData.rapidAssistantName = randomAssistant.name;
          updatedBookingData.rapidAssistantPhone = randomAssistant.phone;
        }
        
        Booking.updatePaymentStatus(bookingId, 'paid', 'bkash', transactionId);
        
        // Update booking with Rapid Assistance details
        if (rapidAssistance) {
          const updateStmt = db.prepare(`
            UPDATE bookings 
            SET rapidAssistance = ?, 
                rapidAssistantName = ?, 
                rapidAssistantPhone = ?,
                rapidAssistanceCharge = ?
            WHERE id = ?
          `);
          updateStmt.run(
            updatedBookingData.rapidAssistance,
            updatedBookingData.rapidAssistantName,
            updatedBookingData.rapidAssistantPhone,
            rapidAssistanceAmount,
            bookingId
          );
        }

        // Log successful financial operation
        await auditService.logFinancialOperation({
          transactionId,
          userId,
          operationType: 'BKASH_PAYMENT',
          amountTaka: amountValidation.sanitizedAmount,
          currency: 'BDT',
          paymentMethod: 'bkash',
          mobileNumber: paymentData.mobileNumber,
          status: 'completed',
          ipAddress,
          userAgent,
          sessionId,
          riskScore: fraudAnalysis.success ? fraudAnalysis.analysis.riskScore : 0,
          fraudFlags: fraudAnalysis.success ? fraudAnalysis.analysis.fraudFlags : []
        });

        // Commit database transaction
        db.exec('COMMIT');

        // Send bKash-style payment confirmation notification (non-blocking)
        this.sendBkashConfirmationNotification(transaction.id, userId, booking, paymentResult)
          .catch(error => ErrorHandler.logError(error, { transactionId: transaction.id, type: 'notification' }));

        // Generate and send bKash-style receipt (non-blocking)
        this.generateAndSendBkashReceipt(transaction.id, userId)
          .catch(error => ErrorHandler.logError(error, { transactionId: transaction.id, type: 'receipt' }));

        // Create itemized payment breakdown for response
        const itemizedBreakdown = {
          base_booking_cost: amountValidation.sanitizedAmount - rapidAssistanceAmount,
          service_charge: roundTaka(serviceCharge),
          hospital_amount: roundTaka(hospitalAmount),
          rapid_assistance_charge: rapidAssistanceAmount,
          total_amount: amountValidation.sanitizedAmount,
          currency: 'BDT',
          currency_symbol: '৳',
          breakdown_items: [
            {
              item: 'Hospital Resource Booking',
              amount: amountValidation.sanitizedAmount - rapidAssistanceAmount,
              description: `${booking.resourceType} booking`,
              category: 'medical_service'
            }
          ]
        };

        // Add rapid assistance line item if applicable
        if (rapidAssistanceAmount > 0) {
          itemizedBreakdown.breakdown_items.push({
            item: 'Rapid Assistance Service',
            amount: rapidAssistanceAmount,
            description: 'Senior citizen escort service from gate to bed/ICU',
            category: 'addon_service'
          });
        }

        return {
          success: true,
          transaction: confirmedTransaction,
          paymentResult: {
            ...paymentResult,
            cost_breakdown: itemizedBreakdown,
            rapid_assistance: {
              requested: rapidAssistance,
              charge: rapidAssistanceAmount,
              assistant_name: booking.rapidAssistantName,
              assistant_phone: booking.rapidAssistantPhone
            }
          },
          message: 'bKash payment processed successfully',
          messageEn: 'bKash payment processed successfully',
          messageBn: 'bKash পেমেন্ট সফলভাবে সম্পন্ন হয়েছে',
          receiptUrl: `/api/payments/bkash/${transactionId}/receipt`
        };
      } else {
        // Payment failed - handle with retry logic
        db.exec('ROLLBACK');
        
        // Log failed financial operation
        await auditService.logFinancialOperation({
          transactionId,
          userId,
          operationType: 'BKASH_PAYMENT',
          amountTaka: amountValidation.sanitizedAmount,
          currency: 'BDT',
          paymentMethod: 'bkash',
          mobileNumber: paymentData.mobileNumber,
          status: 'failed',
          ipAddress,
          userAgent,
          sessionId,
          riskScore: fraudAnalysis.success ? fraudAnalysis.analysis.riskScore : 0,
          fraudFlags: fraudAnalysis.success ? fraudAnalysis.analysis.fraudFlags : []
        });
        
        const errorResponse = ErrorHandler.handleBkashPaymentError(
          new Error(paymentResult.error), 
          attemptCount
        );

        // Update transaction status to failed
        if (transaction && transaction.id) {
          this.handleBkashPaymentFailure(transaction.id, paymentResult.error, attemptCount);
        }

        // Add retry information if applicable
        if (errorResponse.error.canRetry) {
          errorResponse.retryFunction = () => this.processBookingPayment(
            bookingId, 
            paymentData, 
            userId, 
            attemptCount + 1, 
            requestContext
          );
        }

        return errorResponse;
      }

    } catch (error) {
      // Rollback database transaction on any error
      try {
        db.exec('ROLLBACK');
      } catch (rollbackError) {
        ErrorHandler.logError(rollbackError, { context: 'transaction_rollback', originalError: error.message });
      }

      // Log the error with context
      ErrorHandler.logError(error, { 
        bookingId, 
        userId, 
        attemptCount,
        transactionId: transaction?.id,
        context: 'payment_processing' 
      });

      // Return structured error response
      return ErrorHandler.handleBkashPaymentError(error, attemptCount);
    }
  }

  /**
   * Process bKash payment with comprehensive error handling and security
   */
  static async processBkashPayment(paymentData, amount, attemptCount = 1, requestContext = {}) {
    try {
      // Simulate processing delay
      await new Promise(resolve => setTimeout(resolve, 1000 + (attemptCount * 500)));

      // Simulate different payment outcomes based on mobile number and amount
      const simulationResult = this.simulateBkashPaymentOutcome(paymentData, amount, attemptCount);

      if (simulationResult.shouldFail) {
        return {
          success: false,
          error: simulationResult.reason,
          errorCode: simulationResult.code,
          attemptCount,
          bkashResponse: {
            statusCode: simulationResult.statusCode,
            statusMessage: simulationResult.reason
          }
        };
      }

      // Simulate successful payment
      const bkashTransactionId = securityUtils.generateSecureTransactionRef();
      
      return {
        success: true,
        bkashTransactionId,
        amount: formatTaka(amount),
        mobileNumber: securityUtils.maskMobileNumber(paymentData.mobileNumber || ''),
        processedAt: new Date().toISOString(),
        bkashResponse: {
          statusCode: '0000',
          statusMessage: 'Successful',
          transactionId: bkashTransactionId,
          customerMsisdn: securityUtils.maskMobileNumber(paymentData.mobileNumber || ''),
          amount: amount.toString(),
          currency: 'BDT',
          intent: 'sale'
        }
      };

    } catch (error) {
      return {
        success: false,
        error: 'Network error occurred during payment processing',
        errorCode: 'NETWORK_ERROR',
        attemptCount,
        originalError: error.message
      };
    }
  }

  /**
   * Simulate bKash payment outcomes for testing
   */
  static simulateBkashPaymentOutcome(paymentData, amount, attemptCount) {
    // Test mobile numbers for different scenarios
    const testScenarios = {
      '01700000001': { shouldFail: true, reason: 'Insufficient balance', code: 'INSUFFICIENT_BALANCE', statusCode: '2001' },
      '01700000002': { shouldFail: true, reason: 'Invalid PIN', code: 'INVALID_PIN', statusCode: '2002' },
      '01700000003': { shouldFail: true, reason: 'Account blocked', code: 'ACCOUNT_BLOCKED', statusCode: '2003' },
      '01700000004': { shouldFail: true, reason: 'Transaction limit exceeded', code: 'TRANSACTION_LIMIT_EXCEEDED', statusCode: '2004' },
      '01700000005': { shouldFail: true, reason: 'Service unavailable', code: 'SERVICE_UNAVAILABLE', statusCode: '2005' }
    };

    // Check for test scenarios
    if (testScenarios[paymentData.mobileNumber]) {
      return testScenarios[paymentData.mobileNumber];
    }

    // Simulate network errors on first attempt (5% chance)
    if (attemptCount === 1 && Math.random() < 0.05) {
      return {
        shouldFail: true,
        reason: 'Network timeout',
        code: 'TIMEOUT',
        statusCode: '2006'
      };
    }

    // Simulate random failures (3% chance after first attempt)
    if (attemptCount > 1 && Math.random() < 0.03) {
      const randomFailures = [
        { reason: 'Service temporarily unavailable', code: 'SERVICE_UNAVAILABLE', statusCode: '2005' },
        { reason: 'Network error', code: 'NETWORK_ERROR', statusCode: '2006' }
      ];
      
      return {
        shouldFail: true,
        ...randomFailures[Math.floor(Math.random() * randomFailures.length)]
      };
    }

    // Success case
    return { shouldFail: false };
  }

  /**
   * Generate bKash-style transaction ID
   */
  static generateBkashTransactionId() {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substr(2, 6);
    return `BK${timestamp}${random}`.toUpperCase();
  }

  /**
   * Confirm bKash payment and update transaction
   */
  static confirmBkashPayment(transactionId, bkashTransactionId) {
    const processedAt = new Date().toISOString();
    const transaction = Transaction.updateStatus(transactionId, 'completed', processedAt);
    
    // Update payment data with bKash transaction ID
    if (transaction) {
      const paymentData = JSON.parse(transaction.paymentData || '{}');
      paymentData.bkashTransactionId = bkashTransactionId;
      paymentData.confirmedAt = processedAt;
      
      // Update transaction with bKash details
      Transaction.updatePaymentData(transactionId, JSON.stringify(paymentData));
    }
    
    return transaction;
  }

  /**
   * Handle bKash payment failure with retry tracking
   */
  static handleBkashPaymentFailure(transactionId, errorReason, attemptCount) {
    const transaction = Transaction.findById(transactionId);
    if (transaction) {
      // Update transaction status to failed
      Transaction.updateStatus(transactionId, 'failed');
      
      // Update payment data with failure details
      const paymentData = JSON.parse(transaction.paymentData || '{}');
      paymentData.failureReason = errorReason;
      paymentData.attemptCount = attemptCount;
      paymentData.failedAt = new Date().toISOString();
      
      Transaction.updatePaymentData(transactionId, JSON.stringify(paymentData));
      
      // Log the failure with context
      ErrorHandler.logError(new Error(errorReason), {
        transactionId: transaction.transactionId,
        bkashTransactionId: transaction.id,
        attemptCount,
        mobileNumber: paymentData.mobileNumber,
        amount: formatTaka(transaction.amount)
      });
    }
    
    return transaction;
  }

  /**
   * Send bKash-style confirmation notification
   */
  static async sendBkashConfirmationNotification(transactionId, userId, booking, paymentResult) {
    try {
      await NotificationService.sendBkashPaymentConfirmationNotification(
        transactionId,
        userId,
        {
          hospitalName: booking.hospitalName || 'Hospital',
          resourceType: booking.resourceType,
          amount: paymentResult.amount,
          bkashTransactionId: paymentResult.bkashTransactionId,
          mobileNumber: paymentResult.mobileNumber,
          processedAt: paymentResult.processedAt
        }
      );
    } catch (error) {
      ErrorHandler.logError(error, { 
        context: 'bkash_confirmation_notification',
        transactionId,
        userId 
      });
    }
  }

  /**
   * Generate and send bKash-style receipt
   */
  static async generateAndSendBkashReceipt(transactionId, userId) {
    try {
      const receipt = this.generateBkashPaymentReceipt(transactionId);
      await NotificationService.sendBkashReceiptNotification(userId, receipt);
    } catch (error) {
      ErrorHandler.logError(error, { 
        context: 'bkash_receipt_generation',
        transactionId,
        userId 
      });
    }
  }

  /**
   * Generate bKash-style payment receipt
   */
  static generateBkashPaymentReceipt(transactionId) {
    const transaction = Transaction.findById(transactionId);
    if (!transaction) {
      throw new Error('Transaction not found');
    }

    const booking = Booking.findById(transaction.bookingId);
    const paymentData = JSON.parse(transaction.paymentData || '{}');
    
    return {
      receiptId: `BKASH_RCPT_${transaction.transactionId}`,
      transactionId: transaction.transactionId,
      bkashTransactionId: paymentData.bkashTransactionId,
      bookingId: transaction.bookingId,
      patientName: booking?.patientName,
      hospitalName: transaction.hospitalName,
      resourceType: booking?.resourceType,
      scheduledDate: booking?.scheduledDate,
      amount: formatTaka(transaction.amount),
      serviceCharge: formatTaka(transaction.serviceCharge),
      hospitalAmount: formatTaka(transaction.hospitalAmount),
      paymentMethod: 'bKash',
      mobileNumber: paymentData.mobileNumber,
      paymentDate: transaction.processedAt,
      status: transaction.status,
      receiptDate: new Date().toISOString(),
      bkashLogo: true,
      receiptType: 'bkash_payment',
      currency: 'BDT',
      currencySymbol: '৳'
    };
  }

  /**
   * Create transaction record
   */
  static createTransaction(bookingId, amount, paymentMethod, userId) {
    const booking = Booking.findById(bookingId);
    if (!booking) {
      throw new Error('Booking not found');
    }

    const serviceCharge = PaymentConfig.calculateServiceCharge(amount, booking.hospitalId);
    const hospitalAmount = amount - serviceCharge;

    return Transaction.create({
      bookingId,
      userId,
      hospitalId: booking.hospitalId,
      amount,
      serviceCharge,
      hospitalAmount,
      paymentMethod,
      transactionId: this.generateTransactionId(),
      status: 'pending'
    });
  }

  /**
   * Confirm payment and update transaction status
   */
  static confirmPayment(transactionId) {
    const processedAt = new Date().toISOString();
    return Transaction.updateStatus(transactionId, 'completed', processedAt);
  }

  /**
   * Handle payment failure
   */
  static handlePaymentFailure(transactionId, errorReason) {
    const transaction = Transaction.findById(transactionId);
    if (transaction) {
      // Update transaction status to failed
      Transaction.updateStatus(transactionId, 'failed');
      
      // Log the failure reason
      console.error(`Payment failed for transaction ${transaction.transactionId}: ${errorReason}`);
    }
    
    return transaction;
  }

  /**
   * Generate payment receipt
   */
  static generatePaymentReceipt(transactionId) {
    const transaction = Transaction.findById(transactionId);
    if (!transaction) {
      throw new Error('Transaction not found');
    }

    const booking = Booking.findById(transaction.bookingId);
    
    return {
      receiptId: `RCPT_${transaction.transactionId}`,
      transactionId: transaction.transactionId,
      bookingId: transaction.bookingId,
      patientName: booking?.patientName,
      hospitalName: transaction.hospitalName,
      resourceType: booking?.resourceType,
      scheduledDate: booking?.scheduledDate,
      amount: transaction.amount,
      serviceCharge: transaction.serviceCharge,
      hospitalAmount: transaction.hospitalAmount,
      paymentMethod: transaction.paymentMethod,
      paymentDate: transaction.processedAt,
      status: transaction.status,
      receiptDate: new Date().toISOString()
    };
  }

  /**
   * Process refund
   */
  static async processRefund(transactionId, refundAmount, reason) {
    try {
      const transaction = Transaction.findById(transactionId);
      if (!transaction) {
        throw new Error('Transaction not found');
      }

      if (transaction.status !== 'completed') {
        throw new Error('Can only refund completed transactions');
      }

      // Validate refund amount
      if (refundAmount > transaction.amount) {
        throw new Error('Refund amount cannot exceed original transaction amount');
      }

      // Process dummy refund
      const refundResult = await this.processDummyRefund(transaction, refundAmount);

      if (refundResult.success) {
        // Update transaction status
        Transaction.updateStatus(transaction.id, 'refunded');

        // Update booking status
        const booking = Booking.findById(transaction.bookingId);
        if (booking) {
          Booking.updateStatus(booking.id, 'cancelled');
        }

        return {
          success: true,
          refundId: refundResult.refundId,
          amount: refundAmount,
          reason,
          processedAt: new Date().toISOString()
        };
      } else {
        throw new Error(`Refund processing failed: ${refundResult.error}`);
      }

    } catch (error) {
      console.error('Refund processing error:', error);
      throw error;
    }
  }

  /**
   * Dummy payment gateway simulation
   */
  static async processDummyPayment(paymentData, amount) {
    // Simulate processing delay
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Simulate different payment outcomes based on card number or amount
    const simulateFailure = this.shouldSimulateFailure(paymentData, amount);

    if (simulateFailure.shouldFail) {
      return {
        success: false,
        error: simulateFailure.reason,
        gatewayResponse: {
          code: simulateFailure.code,
          message: simulateFailure.reason
        }
      };
    }

    // Simulate successful payment
    return {
      success: true,
      gatewayTransactionId: `GATEWAY_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      gatewayResponse: {
        code: '00',
        message: 'Transaction approved',
        authCode: Math.random().toString(36).substr(2, 6).toUpperCase()
      },
      processedAt: new Date().toISOString()
    };
  }

  /**
   * Dummy refund processing simulation
   */
  static async processDummyRefund(transaction, refundAmount) {
    // Simulate processing delay
    await new Promise(resolve => setTimeout(resolve, 800));

    // Simulate refund success (95% success rate)
    const shouldFail = Math.random() < 0.05;

    if (shouldFail) {
      return {
        success: false,
        error: 'Refund processing failed - please try again later'
      };
    }

    return {
      success: true,
      refundId: `REFUND_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      originalTransactionId: transaction.transactionId,
      refundAmount,
      processedAt: new Date().toISOString()
    };
  }

  /**
   * Determine if payment should be simulated as failed (for testing)
   */
  static shouldSimulateFailure(paymentData, amount) {
    // Simulate failures based on test card numbers
    if (paymentData.cardNumber) {
      const testFailureCards = {
        '4000000000000002': { code: '05', reason: 'Card declined' },
        '4000000000000119': { code: '14', reason: 'Invalid card number' },
        '4000000000000127': { code: '54', reason: 'Expired card' },
        '4000000000000069': { code: '51', reason: 'Insufficient funds' }
      };

      if (testFailureCards[paymentData.cardNumber]) {
        return {
          shouldFail: true,
          ...testFailureCards[paymentData.cardNumber]
        };
      }
    }

    // Simulate random failures (5% failure rate)
    if (Math.random() < 0.05) {
      const randomFailures = [
        { code: '05', reason: 'Card declined' },
        { code: '51', reason: 'Insufficient funds' },
        { code: '91', reason: 'Issuer unavailable' }
      ];
      
      return {
        shouldFail: true,
        ...randomFailures[Math.floor(Math.random() * randomFailures.length)]
      };
    }

    return { shouldFail: false };
  }

  /**
   * Generate unique transaction ID
   */
  static generateTransactionId() {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substr(2, 9);
    return `TXN_${timestamp}_${random}`.toUpperCase();
  }

  /**
   * Get payment history for user
   */
  static getPaymentHistory(userId, limit = 50) {
    return Transaction.findByUserId(userId).slice(0, limit);
  }

  /**
   * Get transaction by ID with receipt data
   */
  static getTransactionWithReceipt(transactionId) {
    const transaction = Transaction.findByTransactionId(transactionId);
    if (!transaction) {
      return null;
    }

    return {
      transaction,
      receipt: this.generatePaymentReceipt(transaction.id)
    };
  }

  /**
   * Retry failed payment
   */
  static async retryPayment(transactionId, newPaymentData) {
    const transaction = Transaction.findById(transactionId);
    if (!transaction) {
      throw new Error('Transaction not found');
    }

    if (transaction.status !== 'failed') {
      throw new Error('Can only retry failed transactions');
    }

    // Process new payment attempt
    return this.processBookingPayment(
      transaction.bookingId,
      newPaymentData,
      transaction.userId
    );
  }
}

module.exports = PaymentProcessingService;