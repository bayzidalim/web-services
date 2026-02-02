const Transaction = require('../models/Transaction');
const UserBalance = require('../models/UserBalance');
const BalanceTransaction = require('../models/BalanceTransaction');
const PaymentConfig = require('../models/PaymentConfig');
const NotificationService = require('./notificationService');
const ErrorHandler = require('../utils/errorHandler');
const { formatTaka, parseTaka, roundTaka, areAmountsEqual } = require('../utils/currencyUtils');
const db = require('../config/database');

class RevenueManagementService {
  /**
   * Distribute revenue from a completed transaction with comprehensive error handling and rollback
   */
  static async distributeRevenue(transactionId, bookingAmount, hospitalId) {
    let rollbackRequired = false;
    const distributionContext = {
      transactionId,
      hospitalId,
      amount: bookingAmount,
      startTime: new Date().toISOString()
    };

    try {
      // Begin database transaction for atomicity
      db.exec('BEGIN TRANSACTION');
      rollbackRequired = true;

      // Validate transaction exists and is eligible for revenue distribution
      const transaction = Transaction.findById(transactionId);
      if (!transaction) {
        const error = new Error('Transaction not found');
        return ErrorHandler.handleRevenueDistributionError(error, distributionContext);
      }

      if (transaction.status !== 'completed') {
        const error = new Error('Can only distribute revenue for completed transactions');
        return ErrorHandler.handleRevenueDistributionError(error, {
          ...distributionContext,
          currentStatus: transaction.status
        });
      }

      // Validate Taka amounts
      const amountValidation = ErrorHandler.validateTakaAmount(bookingAmount, {
        minAmount: 1,
        maxAmount: 1000000
      });

      if (!amountValidation.isValid) {
        db.exec('ROLLBACK');
        return {
          success: false,
          errors: amountValidation.errors,
          message: 'Invalid booking amount for revenue distribution'
        };
      }

      const sanitizedAmount = amountValidation.sanitizedAmount;

      // Calculate service charge with error handling
      let serviceCharge, hospitalAmount;
      try {
        serviceCharge = this.calculateServiceChargeWithValidation(sanitizedAmount, hospitalId);
        hospitalAmount = roundTaka(sanitizedAmount - serviceCharge);
        
        // Validate calculation integrity
        if (!areAmountsEqual(sanitizedAmount, serviceCharge + hospitalAmount, 0.01)) {
          throw new Error('Revenue calculation integrity check failed');
        }
      } catch (calculationError) {
        const error = new Error(`Service charge calculation error: ${calculationError.message}`);
        return ErrorHandler.handleRevenueDistributionError(error, {
          ...distributionContext,
          amount: sanitizedAmount
        });
      }

      // Update hospital balance with error recovery
      let hospitalBalance;
      try {
        hospitalBalance = await this.updateHospitalBalanceWithValidation(hospitalId, hospitalAmount, transactionId);
      } catch (hospitalError) {
        const error = new Error(`Hospital balance update failed: ${hospitalError.message}`);
        return ErrorHandler.handleRevenueDistributionError(error, {
          ...distributionContext,
          hospitalAmount: formatTaka(hospitalAmount)
        });
      }

      // Update admin balance with error recovery using AdminBalanceService
      try {
        const AdminBalanceService = require('./adminBalanceService');
        const adminResult = await AdminBalanceService.addServiceCharge(
          serviceCharge, 
          transactionId, 
          `Service charge from booking transaction ${transactionId} - Hospital: ${hospitalId}`
        );
        
        if (!adminResult.success) {
          throw new Error(`Admin balance update failed: ${adminResult.error}`);
        }
      } catch (adminError) {
        const error = new Error(`Admin balance update failed: ${adminError.message}`);
        return ErrorHandler.handleRevenueDistributionError(error, {
          ...distributionContext,
          serviceCharge: formatTaka(serviceCharge)
        });
      }

      // Verify balance integrity after updates
      const integrityCheck = await this.verifyRevenueDistributionIntegrity(transactionId, sanitizedAmount, serviceCharge, hospitalAmount);
      if (!integrityCheck.isValid) {
        const error = new Error(`Revenue distribution integrity check failed: ${integrityCheck.errors.join(', ')}`);
        return ErrorHandler.handleFinancialConsistencyError(error, {
          expected: formatTaka(sanitizedAmount),
          actual: formatTaka(integrityCheck.actualTotal),
          difference: formatTaka(Math.abs(sanitizedAmount - integrityCheck.actualTotal)),
          affectedTransactions: [transactionId]
        });
      }

      // Commit transaction
      db.exec('COMMIT');
      rollbackRequired = false;

      // Send revenue notification to hospital authority (non-blocking)
      this.sendRevenueNotificationWithErrorHandling(
        transactionId, 
        hospitalId, 
        hospitalAmount, 
        serviceCharge, 
        sanitizedAmount, 
        hospitalBalance
      ).catch(error => ErrorHandler.logError(error, { 
        context: 'revenue_notification', 
        transactionId, 
        hospitalId 
      }));

      return {
        success: true,
        totalAmount: formatTaka(sanitizedAmount),
        hospitalAmount: formatTaka(hospitalAmount),
        serviceCharge: formatTaka(serviceCharge),
        distributedAt: new Date().toISOString(),
        integrityVerified: true,
        message: 'Revenue distributed successfully',
        messageEn: 'Revenue distributed successfully',
        messageBn: 'রাজস্ব সফলভাবে বিতরণ করা হয়েছে'
      };

    } catch (error) {
      // Rollback on error if transaction was started
      if (rollbackRequired) {
        try {
          db.exec('ROLLBACK');
        } catch (rollbackError) {
          ErrorHandler.logError(rollbackError, { 
            context: 'revenue_distribution_rollback', 
            originalError: error.message,
            transactionId 
          });
        }
      }

      // Log the error with full context
      ErrorHandler.logError(error, distributionContext);

      // Return structured error response
      return ErrorHandler.handleRevenueDistributionError(error, distributionContext);
    }
  }

  /**
   * Calculate service charge with comprehensive validation
   */
  static calculateServiceChargeWithValidation(amount, hospitalId, serviceChargeRate = null) {
    try {
      // Validate amount
      const amountValidation = ErrorHandler.validateTakaAmount(amount, {
        minAmount: 0,
        maxAmount: 1000000
      });

      if (!amountValidation.isValid) {
        throw new Error('Invalid amount for service charge calculation');
      }

      const sanitizedAmount = amountValidation.sanitizedAmount;
      let rate = serviceChargeRate;

      // Get hospital-specific or default service charge rate
      if (rate === null) {
        try {
          const config = PaymentConfig.getConfigForHospital(hospitalId);
          rate = config ? config.serviceChargeRate : 0.05; // Default 5%
        } catch (configError) {
          ErrorHandler.logError(configError, { 
            context: 'service_charge_config', 
            hospitalId 
          });
          rate = 0.05; // Fallback to default 5%
        }
      }

      // Validate rate
      if (rate < 0 || rate > 0.5) { // Max 50% service charge
        throw new Error(`Invalid service charge rate: ${rate}. Must be between 0 and 0.5`);
      }

      const serviceCharge = roundTaka(sanitizedAmount * rate);

      // Validate result
      if (serviceCharge < 0 || serviceCharge > sanitizedAmount) {
        throw new Error(`Invalid service charge calculation: ${serviceCharge} for amount ${sanitizedAmount}`);
      }

      return serviceCharge;

    } catch (error) {
      ErrorHandler.logError(error, { 
        context: 'service_charge_calculation',
        amount: formatTaka(amount),
        hospitalId,
        serviceChargeRate 
      });
      throw error;
    }
  }

  /**
   * Calculate service charge (legacy method for backward compatibility)
   */
  static calculateServiceCharge(amount, hospitalId, serviceChargeRate = null) {
    try {
      return this.calculateServiceChargeWithValidation(amount, hospitalId, serviceChargeRate);
    } catch (error) {
      // Fallback to basic calculation
      const rate = serviceChargeRate || 0.05;
      return roundTaka(amount * rate);
    }
  }

  /**
   * Update hospital authority balance with comprehensive validation and error recovery
   */
  static async updateHospitalBalanceWithValidation(hospitalId, amount, transactionId) {
    try {
      // Validate amount
      const amountValidation = ErrorHandler.validateTakaAmount(amount, {
        minAmount: -1000000, // Allow negative for refunds
        maxAmount: 1000000
      });

      if (!amountValidation.isValid) {
        throw new Error(`Invalid amount for hospital balance update: ${amount}`);
      }

      const sanitizedAmount = amountValidation.sanitizedAmount;

      // Find hospital authority user for this hospital
      const hospitalAuthority = db.prepare(`
        SELECT id FROM users 
        WHERE userType = 'hospital-authority' AND hospital_id = ? 
        LIMIT 1
      `).get(hospitalId);

      if (!hospitalAuthority) {
        throw new Error(`No hospital authority found for hospital ${hospitalId}`);
      }

      // Get current balance for integrity check
      const currentBalance = UserBalance.findByUserId(hospitalAuthority.id, hospitalId);
      const previousBalance = currentBalance ? currentBalance.currentBalance : 0;

      // Update balance with error handling
      let updatedBalance;
      try {
        updatedBalance = UserBalance.updateBalance(
          hospitalAuthority.id,
          hospitalId,
          sanitizedAmount,
          sanitizedAmount >= 0 ? 'payment_received' : 'refund_processed',
          transactionId,
          `${sanitizedAmount >= 0 ? 'Payment received' : 'Refund processed'} from booking transaction ${transactionId} - Amount: ${formatTaka(sanitizedAmount)}`
        );
      } catch (balanceError) {
        throw new Error(`Balance update operation failed: ${balanceError.message}`);
      }

      // Verify balance update integrity
      const expectedBalance = roundTaka(previousBalance + sanitizedAmount);
      if (!areAmountsEqual(updatedBalance.currentBalance, expectedBalance, 0.01)) {
        throw new Error(`Balance update integrity check failed. Expected: ${formatTaka(expectedBalance)}, Actual: ${formatTaka(updatedBalance.currentBalance)}`);
      }

      return updatedBalance;

    } catch (error) {
      ErrorHandler.logError(error, { 
        context: 'hospital_balance_update',
        hospitalId,
        amount: formatTaka(amount),
        transactionId 
      });
      throw error;
    }
  }

  /**
   * Update hospital balance (legacy method for backward compatibility)
   */
  static async updateHospitalBalance(hospitalId, amount, transactionId) {
    try {
      return await this.updateHospitalBalanceWithValidation(hospitalId, amount, transactionId);
    } catch (error) {
      // Log error but don't throw to maintain backward compatibility
      ErrorHandler.logError(error, { 
        context: 'hospital_balance_update_legacy',
        hospitalId,
        amount: formatTaka(amount),
        transactionId 
      });
      throw error;
    }
  }

  /**
   * Update admin balance with comprehensive validation and error recovery
   */
  static async updateAdminBalanceWithValidation(amount, transactionId) {
    try {
      // Validate amount
      const amountValidation = ErrorHandler.validateTakaAmount(amount, {
        minAmount: -1000000, // Allow negative for refunds
        maxAmount: 1000000
      });

      if (!amountValidation.isValid) {
        throw new Error(`Invalid amount for admin balance update: ${amount}`);
      }

      const sanitizedAmount = amountValidation.sanitizedAmount;

      // Find admin user
      const admin = db.prepare(`
        SELECT id FROM users 
        WHERE userType = 'admin' 
        LIMIT 1
      `).get();

      if (!admin) {
        throw new Error('No admin user found');
      }

      // Get current balance for integrity check
      const currentBalance = UserBalance.findByUserId(admin.id, null);
      const previousBalance = currentBalance ? currentBalance.currentBalance : 0;

      // Update admin balance with error handling
      let updatedBalance;
      try {
        updatedBalance = UserBalance.updateBalance(
          admin.id,
          null, // Admin balance is not hospital-specific
          sanitizedAmount,
          sanitizedAmount >= 0 ? 'service_charge' : 'service_charge_refund',
          transactionId,
          `${sanitizedAmount >= 0 ? 'Service charge' : 'Service charge refund'} from booking transaction ${transactionId} - Amount: ${formatTaka(sanitizedAmount)}`
        );
      } catch (balanceError) {
        throw new Error(`Admin balance update operation failed: ${balanceError.message}`);
      }

      // Verify balance update integrity
      const expectedBalance = roundTaka(previousBalance + sanitizedAmount);
      if (!areAmountsEqual(updatedBalance.currentBalance, expectedBalance, 0.01)) {
        throw new Error(`Admin balance update integrity check failed. Expected: ${formatTaka(expectedBalance)}, Actual: ${formatTaka(updatedBalance.currentBalance)}`);
      }

      return updatedBalance;

    } catch (error) {
      ErrorHandler.logError(error, { 
        context: 'admin_balance_update',
        amount: formatTaka(amount),
        transactionId 
      });
      throw error;
    }
  }

  /**
   * Update admin balance (legacy method for backward compatibility)
   */
  static async updateAdminBalance(amount, transactionId) {
    try {
      return await this.updateAdminBalanceWithValidation(amount, transactionId);
    } catch (error) {
      // Log error but don't throw to maintain backward compatibility
      ErrorHandler.logError(error, { 
        context: 'admin_balance_update_legacy',
        amount: formatTaka(amount),
        transactionId 
      });
      throw error;
    }
  }

  /**
   * Process refund distribution (reverse revenue distribution)
   */
  static async processRefundDistribution(transactionId, refundAmount) {
    try {
      db.exec('BEGIN TRANSACTION');

      const transaction = Transaction.findById(transactionId);
      if (!transaction) {
        throw new Error('Transaction not found');
      }

      // Calculate refund distribution
      const originalServiceCharge = transaction.serviceCharge;
      const originalHospitalAmount = transaction.hospitalAmount;
      
      // Calculate proportional refund amounts
      const refundRatio = refundAmount / transaction.amount;
      const hospitalRefund = originalHospitalAmount * refundRatio;
      const adminRefund = originalServiceCharge * refundRatio;

      // Process hospital refund (deduct from balance)
      await this.updateHospitalBalance(
        transaction.hospitalId, 
        -hospitalRefund, 
        transactionId
      );

      // Process admin refund (deduct from balance)
      await this.updateAdminBalance(-adminRefund, transactionId);

      db.exec('COMMIT');

      return {
        success: true,
        totalRefund: refundAmount,
        hospitalRefund,
        adminRefund,
        processedAt: new Date().toISOString()
      };

    } catch (error) {
      db.exec('ROLLBACK');
      console.error('Refund distribution error:', error);
      throw error;
    }
  }

  /**
   * Get revenue analytics for a hospital
   */
  static getRevenueAnalytics(hospitalId, dateRange = {}) {
    try {
      const analytics = Transaction.getRevenueAnalytics(hospitalId, dateRange);
      const totalRevenue = Transaction.getTotalRevenue(hospitalId, dateRange);

      // Get balance information
      const hospitalAuthority = db.prepare(`
        SELECT id FROM users 
        WHERE userType = 'hospital-authority' AND hospital_id = ? 
        LIMIT 1
      `).get(hospitalId);

      let currentBalance = null;
      if (hospitalAuthority) {
        const balance = UserBalance.findByUserId(hospitalAuthority.id, hospitalId);
        currentBalance = Array.isArray(balance) ? balance[0] : balance;
      }

      // Get resource-wise revenue breakdown
      const resourceRevenue = this.getResourceRevenueBreakdown(hospitalId, dateRange);

      return {
        totalRevenue,
        dailyAnalytics: analytics,
        currentBalance,
        resourceBreakdown: resourceRevenue,
        dateRange
      };

    } catch (error) {
      console.error('Revenue analytics error:', error);
      throw error;
    }
  }

  /**
   * Get admin revenue analytics
   */
  static getAdminRevenueAnalytics(dateRange = {}) {
    try {
      // Get total platform revenue
      const totalRevenue = Transaction.getTotalRevenue(null, dateRange);
      
      // Get service charge analytics
      const serviceChargeAnalytics = this.getServiceChargeAnalytics(dateRange);
      
      // Get admin balance
      const adminBalances = UserBalance.getAdminBalances();
      
      // Get hospital-wise revenue distribution
      const hospitalRevenue = this.getHospitalRevenueDistribution(dateRange);

      return {
        platformRevenue: totalRevenue,
        serviceChargeAnalytics,
        adminBalances,
        hospitalDistribution: hospitalRevenue,
        dateRange
      };

    } catch (error) {
      console.error('Admin revenue analytics error:', error);
      throw error;
    }
  }

  /**
   * Get resource-wise revenue breakdown for a hospital
   */
  static getResourceRevenueBreakdown(hospitalId, dateRange = {}) {
    let query = `
      SELECT 
        b.resourceType,
        COUNT(t.id) as transactionCount,
        SUM(t.hospitalAmount) as totalRevenue,
        AVG(t.hospitalAmount) as averageRevenue,
        SUM(t.amount) as totalBookingAmount
      FROM transactions t
      JOIN bookings b ON t.bookingId = b.id
      WHERE t.hospitalId = ? AND t.status = 'completed'
    `;

    const params = [hospitalId];

    if (dateRange.startDate) {
      query += ' AND DATE(t.createdAt) >= ?';
      params.push(dateRange.startDate);
    }

    if (dateRange.endDate) {
      query += ' AND DATE(t.createdAt) <= ?';
      params.push(dateRange.endDate);
    }

    query += ' GROUP BY b.resourceType ORDER BY totalRevenue DESC';

    const stmt = db.prepare(query);
    return stmt.all(...params);
  }

  /**
   * Get service charge analytics
   */
  static getServiceChargeAnalytics(dateRange = {}) {
    let query = `
      SELECT 
        t.hospitalId,
        h.name as hospitalName,
        COUNT(t.id) as transactionCount,
        SUM(t.serviceCharge) as totalServiceCharge,
        AVG(t.serviceCharge) as averageServiceCharge,
        SUM(t.amount) as totalTransactionAmount
      FROM transactions t
      JOIN hospitals h ON t.hospitalId = h.id
      WHERE t.status = 'completed'
    `;

    const params = [];

    if (dateRange.startDate) {
      query += ' AND DATE(t.createdAt) >= ?';
      params.push(dateRange.startDate);
    }

    if (dateRange.endDate) {
      query += ' AND DATE(t.createdAt) <= ?';
      params.push(dateRange.endDate);
    }

    query += ' GROUP BY t.hospitalId ORDER BY totalServiceCharge DESC';

    const stmt = db.prepare(query);
    return stmt.all(...params);
  }

  /**
   * Get hospital revenue distribution
   */
  static getHospitalRevenueDistribution(dateRange = {}) {
    let query = `
      SELECT 
        t.hospitalId,
        h.name as hospitalName,
        h.city,
        COUNT(t.id) as transactionCount,
        SUM(t.hospitalAmount) as totalHospitalRevenue,
        SUM(t.serviceCharge) as totalServiceCharge,
        SUM(t.amount) as totalTransactionAmount,
        AVG(t.amount) as averageTransactionAmount
      FROM transactions t
      JOIN hospitals h ON t.hospitalId = h.id
      WHERE t.status = 'completed'
    `;

    const params = [];

    if (dateRange.startDate) {
      query += ' AND DATE(t.createdAt) >= ?';
      params.push(dateRange.startDate);
    }

    if (dateRange.endDate) {
      query += ' AND DATE(t.createdAt) <= ?';
      params.push(dateRange.endDate);
    }

    query += ' GROUP BY t.hospitalId ORDER BY totalHospitalRevenue DESC';

    const stmt = db.prepare(query);
    return stmt.all(...params);
  }

  /**
   * Reconcile balances - verify balance integrity
   */
  static reconcileBalances(dateRange = {}) {
    try {
      const reconciliationReport = {
        timestamp: new Date().toISOString(),
        dateRange,
        discrepancies: [],
        summary: {
          totalTransactions: 0,
          totalRevenue: 0,
          totalServiceCharges: 0,
          totalHospitalRevenue: 0,
          balanceDiscrepancies: 0
        }
      };

      // Get all completed transactions in date range
      let query = `
        SELECT 
          COUNT(*) as totalTransactions,
          SUM(amount) as totalRevenue,
          SUM(serviceCharge) as totalServiceCharges,
          SUM(hospitalAmount) as totalHospitalRevenue
        FROM transactions 
        WHERE status = 'completed'
      `;

      const params = [];

      if (dateRange.startDate) {
        query += ' AND DATE(createdAt) >= ?';
        params.push(dateRange.startDate);
      }

      if (dateRange.endDate) {
        query += ' AND DATE(createdAt) <= ?';
        params.push(dateRange.endDate);
      }

      const stmt = db.prepare(query);
      const transactionSummary = stmt.get(...params);
      
      reconciliationReport.summary = {
        ...reconciliationReport.summary,
        ...transactionSummary
      };

      // Check for balance discrepancies
      const balanceDiscrepancies = BalanceTransaction.findDiscrepancies(0.01);
      reconciliationReport.discrepancies = balanceDiscrepancies;
      reconciliationReport.summary.balanceDiscrepancies = balanceDiscrepancies.length;

      return reconciliationReport;

    } catch (error) {
      console.error('Balance reconciliation error:', error);
      throw error;
    }
  }

  /**
   * Get revenue metrics for a specific time period
   */
  static getRevenueMetrics(hospitalId = null, period = 'month') {
    try {
      const dateRange = this.getDateRangeForPeriod(period);
      
      if (hospitalId) {
        return this.getRevenueAnalytics(hospitalId, dateRange);
      } else {
        return this.getAdminRevenueAnalytics(dateRange);
      }

    } catch (error) {
      console.error('Revenue metrics error:', error);
      throw error;
    }
  }

  /**
   * Get date range for specified period
   */
  static getDateRangeForPeriod(period) {
    const now = new Date();
    const startDate = new Date();

    switch (period) {
      case 'today':
        startDate.setHours(0, 0, 0, 0);
        break;
      case 'week':
        startDate.setDate(now.getDate() - 7);
        break;
      case 'month':
        startDate.setMonth(now.getMonth() - 1);
        break;
      case 'quarter':
        startDate.setMonth(now.getMonth() - 3);
        break;
      case 'year':
        startDate.setFullYear(now.getFullYear() - 1);
        break;
      default:
        startDate.setMonth(now.getMonth() - 1); // Default to month
    }

    return {
      startDate: startDate.toISOString().split('T')[0],
      endDate: now.toISOString().split('T')[0]
    };
  }

  /**
   * Process bulk revenue distribution for multiple transactions
   */
  static async processBulkRevenueDistribution(transactionIds) {
    const results = [];
    const errors = [];

    for (const transactionId of transactionIds) {
      try {
        const transaction = Transaction.findById(transactionId);
        if (transaction && transaction.status === 'completed') {
          const result = await this.distributeRevenue(
            transactionId,
            transaction.amount,
            transaction.hospitalId
          );
          results.push({ transactionId, ...result });
        }
      } catch (error) {
        errors.push({ transactionId, error: error.message });
      }
    }

    return {
      successful: results,
      failed: errors,
      totalProcessed: results.length,
      totalFailed: errors.length
    };
  }

  /**
   * Get low balance alerts
   */
  static getLowBalanceAlerts(threshold = 100.00) {
    try {
      const lowBalanceAccounts = UserBalance.getLowBalanceAccounts(threshold);
      
      return {
        threshold,
        alertCount: lowBalanceAccounts.length,
        accounts: lowBalanceAccounts,
        generatedAt: new Date().toISOString()
      };

    } catch (error) {
      console.error('Low balance alerts error:', error);
      throw error;
    }
  }

  /**
   * Check and send balance threshold notifications
   */
  static async checkAndSendBalanceThresholdNotifications(threshold = 100.00) {
    try {
      const lowBalanceAccounts = UserBalance.getLowBalanceAccounts(threshold);
      const notifications = [];

      for (const account of lowBalanceAccounts) {
        try {
          // Get hospital name if applicable
          let hospitalName = null;
          if (account.hospitalId) {
            const hospital = db.prepare('SELECT name FROM hospitals WHERE id = ?').get(account.hospitalId);
            hospitalName = hospital?.name;
          }

          // Get last transaction info
          const lastTransaction = db.prepare(`
            SELECT bt.description, bt.createdAt 
            FROM balance_transactions bt 
            WHERE bt.balanceId = ? 
            ORDER BY bt.createdAt DESC 
            LIMIT 1
          `).get(account.id);

          const result = await NotificationService.sendBalanceThresholdNotification(
            account.userId,
            {
              currentBalance: account.currentBalance,
              threshold,
              hospitalId: account.hospitalId,
              hospitalName,
              lastTransaction: lastTransaction ? 
                `${lastTransaction.description} on ${new Date(lastTransaction.createdAt).toLocaleDateString()}` : 
                null
            }
          );

          notifications.push({
            userId: account.userId,
            hospitalId: account.hospitalId,
            currentBalance: account.currentBalance,
            notificationResult: result
          });

        } catch (notificationError) {
          console.error(`Failed to send balance threshold notification for user ${account.userId}:`, notificationError);
          notifications.push({
            userId: account.userId,
            hospitalId: account.hospitalId,
            currentBalance: account.currentBalance,
            error: notificationError.message
          });
        }
      }

      return {
        success: true,
        threshold,
        accountsChecked: lowBalanceAccounts.length,
        notificationsSent: notifications.filter(n => !n.error).length,
        notifications
      };

    } catch (error) {
      console.error('Balance threshold notification check error:', error);
      throw error;
    }
  }

  /**
   * Verify revenue distribution integrity
   */
  static async verifyRevenueDistributionIntegrity(transactionId, totalAmount, serviceCharge, hospitalAmount) {
    try {
      const errors = [];
      
      // Check if amounts add up correctly
      const calculatedTotal = roundTaka(serviceCharge + hospitalAmount);
      if (!areAmountsEqual(totalAmount, calculatedTotal, 0.01)) {
        errors.push(`Amount mismatch: Expected ${formatTaka(totalAmount)}, Calculated ${formatTaka(calculatedTotal)}`);
      }

      // Verify transaction exists and amounts match
      const transaction = Transaction.findById(transactionId);
      if (transaction) {
        if (!areAmountsEqual(transaction.amount, totalAmount, 0.01)) {
          errors.push(`Transaction amount mismatch: DB ${formatTaka(transaction.amount)}, Expected ${formatTaka(totalAmount)}`);
        }
        
        if (!areAmountsEqual(transaction.serviceCharge, serviceCharge, 0.01)) {
          errors.push(`Service charge mismatch: DB ${formatTaka(transaction.serviceCharge)}, Expected ${formatTaka(serviceCharge)}`);
        }
        
        if (!areAmountsEqual(transaction.hospitalAmount, hospitalAmount, 0.01)) {
          errors.push(`Hospital amount mismatch: DB ${formatTaka(transaction.hospitalAmount)}, Expected ${formatTaka(hospitalAmount)}`);
        }
      } else {
        errors.push('Transaction not found in database');
      }

      return {
        isValid: errors.length === 0,
        errors,
        actualTotal: calculatedTotal,
        verifiedAt: new Date().toISOString()
      };

    } catch (error) {
      ErrorHandler.logError(error, { 
        context: 'revenue_integrity_verification',
        transactionId,
        totalAmount: formatTaka(totalAmount)
      });
      
      return {
        isValid: false,
        errors: [`Integrity verification failed: ${error.message}`],
        actualTotal: 0,
        verifiedAt: new Date().toISOString()
      };
    }
  }

  /**
   * Send revenue notification with error handling
   */
  static async sendRevenueNotificationWithErrorHandling(transactionId, hospitalId, hospitalAmount, serviceCharge, totalAmount, hospitalBalance) {
    try {
      const hospitalAuthority = db.prepare(`
        SELECT id FROM users 
        WHERE userType = 'hospital-authority' AND hospital_id = ? 
        LIMIT 1
      `).get(hospitalId);

      if (hospitalAuthority) {
        const hospitalInfo = db.prepare('SELECT name FROM hospitals WHERE id = ?').get(hospitalId);
        const transaction = Transaction.findById(transactionId);
        const booking = transaction ? db.prepare('SELECT patientName, resourceType FROM bookings WHERE id = ?').get(transaction.bookingId) : null;
        
        await NotificationService.sendRevenueNotification(
          hospitalId,
          hospitalAuthority.id,
          {
            hospitalName: hospitalInfo?.name || 'Hospital',
            amount: formatTaka(hospitalAmount),
            transactionId: transaction?.transactionId,
            bookingId: transaction?.bookingId,
            resourceType: booking?.resourceType || 'Resource',
            patientName: booking?.patientName || 'Patient',
            serviceCharge: formatTaka(serviceCharge),
            totalAmount: formatTaka(totalAmount),
            currentBalance: formatTaka(hospitalBalance?.currentBalance || 0),
            currency: 'BDT',
            currencySymbol: '৳'
          }
        );
      }
    } catch (error) {
      ErrorHandler.logError(error, { 
        context: 'revenue_notification',
        transactionId,
        hospitalId,
        amount: formatTaka(hospitalAmount)
      });
      throw error;
    }
  }

  /**
   * Detect and alert financial anomalies
   */
  static async detectAndAlertFinancialAnomalies() {
    try {
      const anomalies = [];

      // Check for large transaction amounts (potential fraud)
      const largeTransactions = db.prepare(`
        SELECT t.*, h.name as hospitalName
        FROM transactions t
        LEFT JOIN hospitals h ON t.hospitalId = h.id
        WHERE t.amount > 10000 
        AND t.status = 'completed'
        AND DATE(t.createdAt) = DATE('now')
      `).all();

      for (const transaction of largeTransactions) {
        anomalies.push({
          type: 'Large Transaction Amount',
          severity: 'medium',
          description: `Transaction ${transaction.transactionId} has unusually large amount: $${transaction.amount}`,
          affectedTransactions: [transaction.transactionId],
          hospitalId: transaction.hospitalId,
          hospitalName: transaction.hospitalName,
          amount: transaction.amount,
          recommendedAction: 'Review transaction details and verify legitimacy'
        });
      }

      // Check for balance discrepancies
      const balanceDiscrepancies = BalanceTransaction.findDiscrepancies(1.00);
      
      for (const discrepancy of balanceDiscrepancies) {
        anomalies.push({
          type: 'Balance Discrepancy',
          severity: 'high',
          description: `Balance discrepancy detected for user ${discrepancy.userId}: Expected ${discrepancy.expectedBalance}, Actual ${discrepancy.actualBalance}`,
          affectedTransactions: discrepancy.affectedTransactions || [],
          hospitalId: discrepancy.hospitalId,
          hospitalName: discrepancy.hospitalName,
          discrepancy: Math.abs(discrepancy.expectedBalance - discrepancy.actualBalance),
          recommendedAction: 'Investigate balance calculation and correct if necessary'
        });
      }

      // Check for multiple failed transactions from same user
      const failedTransactionUsers = db.prepare(`
        SELECT userId, COUNT(*) as failedCount, SUM(amount) as totalAmount
        FROM transactions 
        WHERE status = 'failed' 
        AND DATE(createdAt) = DATE('now')
        GROUP BY userId
        HAVING failedCount >= 3
      `).all();

      for (const user of failedTransactionUsers) {
        anomalies.push({
          type: 'Multiple Failed Transactions',
          severity: 'medium',
          description: `User ${user.userId} has ${user.failedCount} failed transactions today totaling $${user.totalAmount}`,
          affectedTransactions: [],
          amount: user.totalAmount,
          recommendedAction: 'Review user account and payment methods'
        });
      }

      // Send alerts for detected anomalies
      const alertResults = [];
      for (const anomaly of anomalies) {
        try {
          const result = await NotificationService.sendFinancialAnomalyAlert(anomaly);
          alertResults.push({
            anomaly: anomaly.type,
            alertResult: result
          });
        } catch (alertError) {
          console.error(`Failed to send anomaly alert for ${anomaly.type}:`, alertError);
          alertResults.push({
            anomaly: anomaly.type,
            error: alertError.message
          });
        }
      }

      return {
        success: true,
        anomaliesDetected: anomalies.length,
        alertsSent: alertResults.filter(r => !r.error).length,
        anomalies,
        alertResults
      };

    } catch (error) {
      console.error('Financial anomaly detection error:', error);
      throw error;
    }
  }
}

module.exports = RevenueManagementService;