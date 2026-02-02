const express = require('express');
const router = express.Router();
const Booking = require('../models/Booking');
const db = require('../config/database');
const { authenticate, requireRole } = require('../middleware/auth');
const BookingApprovalService = require('../services/bookingApprovalService');
const ValidationService = require('../services/validationService');
const HospitalPricing = require('../models/HospitalPricing');
const User = require('../models/User');

/**
 * @route   GET /api/bookings/my-bookings
 * @desc    Get current user bookings (for profile page)
 * @access  Private
 */
router.get('/my-bookings', authenticate, async (req, res) => {
  try {
    console.log('Fetching bookings for user:', req.user.id);
    const bookings = Booking.findByUserId(req.user.id);
    console.log('Found bookings:', bookings);
    res.json({
      success: true,
      data: bookings
    });
  } catch (error) {
    console.error('Error fetching user bookings:', error);
    res.status(500).json({
      success: false,
      error: 'Server error'
    });
  }
});

/**
 * @route   GET /api/bookings/:id
 * @desc    Get booking by ID
 * @access  Private
 */
router.get('/:id', authenticate, async (req, res) => {
  try {
    const booking = Booking.findById(req.params.id);
    
    if (!booking) {
      return res.status(404).json({
        success: false,
        error: 'Booking not found'
      });
    }
    
    // Check if user has permission to view this booking
    if (booking.userId !== req.user.id && req.user.userType !== 'admin') {
      // Hospital authorities can only view bookings for their hospital
      if (req.user.userType === 'hospital-authority') {
        if (booking.hospitalId !== req.user.hospitalId) {
          return res.status(403).json({
            success: false,
            error: 'Access denied'
          });
        }
      } else {
        return res.status(403).json({
          success: false,
          error: 'Access denied'
        });
      }
    }
    
    res.json({
      success: true,
      data: booking
    });
    
  } catch (error) {
    console.error('Error fetching booking:', error);
    res.status(500).json({
      success: false,
      error: 'Server error'
    });
  }
});

/**
 * @route   POST /api/bookings
 * @desc    Create new booking
 * @access  Private
 */
router.post('/', authenticate, async (req, res) => {
  try {
    console.log('Received booking request:', req.body);
    console.log('User:', req.user);
    
    const { 
      hospitalId, 
      resourceType, 
      patientName, 
      patientAge, 
      patientGender, 
      emergencyContactName, 
      emergencyContactPhone, 
      emergencyContactRelationship, 
      medicalCondition, 
      urgency, 
      surgeonId,
      scheduledDate, 
      estimatedDuration,
      rapidAssistance 
    } = req.body;
    
    // Validate rapid assistance eligibility if requested
    if (rapidAssistance) {
      const validation = ValidationService.validateRapidAssistanceEligibility(patientAge, rapidAssistance);
      if (!validation.isValid) {
        return res.status(400).json({
          success: false,
          error: validation.errors[0]
        });
      }
    }
    
    // Validate required fields
    if (!hospitalId || !resourceType || !patientName || !patientAge || !patientGender ||
        !emergencyContactName || !emergencyContactPhone || !emergencyContactRelationship ||
        !medicalCondition || !urgency || !scheduledDate || !estimatedDuration) {
      // Special handling for rapid assistance validation
      if (rapidAssistance) {
        // Validate rapid assistance eligibility first
        const validation = ValidationService.validateRapidAssistanceEligibility(patientAge, rapidAssistance);
        if (!validation.isValid) {
          return res.status(400).json({
            success: false,
            error: validation.errors[0]
          });
        }
        // If validation passes but other fields are missing, return generic error
        return res.status(400).json({
          success: false,
          error: 'All required fields must be provided'
        });
      } else {
        return res.status(400).json({
          success: false,
          error: 'All required fields must be provided'
        });
      }
    }
    
    // Validate that required fields are not empty strings
    if (hospitalId.toString().trim() === '' || resourceType.trim() === '' || 
        patientName.trim() === '' || patientAge.toString().trim() === '' || 
        patientGender.trim() === '' || emergencyContactName.trim() === '' || 
        emergencyContactPhone.trim() === '' || emergencyContactRelationship.trim() === '' || 
        medicalCondition.trim() === '' || urgency.trim() === '' || 
        scheduledDate.trim() === '' || estimatedDuration.toString().trim() === '') {
      // Special handling for rapid assistance validation
      if (rapidAssistance) {
        // Validate rapid assistance eligibility first
        const validation = ValidationService.validateRapidAssistanceEligibility(patientAge, rapidAssistance);
        if (!validation.isValid) {
          return res.status(400).json({
            success: false,
            error: validation.errors[0]
          });
        }
        // If validation passes but other fields are empty, return generic error
        return res.status(400).json({
          success: false,
          error: 'All required fields must be provided and not empty'
        });
      } else {
        return res.status(400).json({
          success: false,
          error: 'All required fields must be provided and not empty'
        });
      }
    }
    
    // Validate resource type
    const validResourceTypes = ['beds', 'icu', 'operationTheatres'];
    if (!validResourceTypes.includes(resourceType)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid resource type. Must be one of: beds, icu, operationTheatres'
      });
    }
    
    // Calculate payment amount using hospital pricing
    const parsedHospitalId = hospitalId ? parseInt(hospitalId) : null;
    const parsedEstimatedDuration = estimatedDuration ? parseInt(estimatedDuration) : 24;
    
    // Get pricing from HospitalPricing model
    const costBreakdown = HospitalPricing.calculateBookingCost(
      parsedHospitalId,
      resourceType,
      parsedEstimatedDuration
    );
    
    // Create booking
    const bookingData = {
      userId: req.user.id,
      hospitalId: parsedHospitalId,
      resourceType,
      patientName,
      patientAge: patientAge ? parseInt(patientAge) : null,
      patientGender,
      emergencyContactName,
      emergencyContactPhone,
      emergencyContactRelationship,
      medicalCondition,
      urgency,
      surgeonId: surgeonId ? parseInt(surgeonId) : null,
      scheduledDate,
      estimatedDuration: parsedEstimatedDuration,
      paymentAmount: costBreakdown.total_cost,
      rapidAssistance: rapidAssistance ? 1 : 0, // Convert boolean to number for SQLite
      rapidAssistantName: null,
      rapidAssistantPhone: null
    };
    
    // Validate that parsed values are valid numbers
    if (isNaN(bookingData.hospitalId) || bookingData.hospitalId <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Invalid hospital ID'
      });
    }
    
    if (isNaN(bookingData.patientAge) || bookingData.patientAge <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Invalid patient age'
      });
    }
    
    if (isNaN(bookingData.estimatedDuration) || bookingData.estimatedDuration <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Invalid estimated duration'
      });
    }
    
    if (surgeonId && isNaN(bookingData.surgeonId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid surgeon ID'
      });
    }
    
    console.log('Processed booking data:', bookingData);
    
    const bookingId = Booking.create(bookingData);
    
    // Get the created booking
    const booking = Booking.findById(bookingId);
    
    res.status(201).json({
      success: true,
      data: booking,
      message: 'Booking created successfully'
    });
    
  } catch (error) {
    console.error('Error creating booking:', error);
    res.status(500).json({
      success: false,
      error: 'Server error: ' + error.message
    });
  }
});

/**
 * @route   POST /api/bookings/payment
 * @desc    Process booking payment with rapid assistance support
 * @access  Private
 */
router.post('/payment', authenticate, async (req, res) => {
  try {
    const { bookingId, transactionId, amount, rapidAssistance } = req.body;
    
    console.log('💳 Payment request received:', {
      bookingId,
      transactionId,
      amount,
      rapidAssistance,
      userId: req.user.id
    });
    
    // Validate required fields
    if (!bookingId || !transactionId) {
      console.log('❌ Validation failed: Missing bookingId or transactionId');
      return res.status(400).json({
        success: false,
        error: 'Booking ID and transaction ID are required'
      });
    }
    
    // Get booking
    const booking = Booking.findById(bookingId);
    if (!booking) {
      return res.status(404).json({
        success: false,
        error: 'Booking not found'
      });
    }
    
    // Check if user owns this booking
    if (booking.userId !== req.user.id) {
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      });
    }
    
    // Check if booking is already paid
    if (booking.paymentStatus === 'paid') {
      return res.status(400).json({
        success: false,
        error: 'Booking is already paid'
      });
    }
    
    // Calculate base payment amount (excluding any existing rapid assistance charge)
    let baseBookingAmount = booking.paymentAmount;
    
    // If booking already has rapid assistance charge included, subtract it to get base amount
    if (booking.rapidAssistance && booking.rapidAssistanceCharge) {
      baseBookingAmount = booking.paymentAmount - booking.rapidAssistanceCharge;
    }
    
    let rapidAssistanceCharge = 0;
    
    // Handle rapid assistance charge calculation
    const requestedRapidAssistance = rapidAssistance !== undefined ? rapidAssistance : booking.rapidAssistance;
    
    if (requestedRapidAssistance) {
      // Validate rapid assistance eligibility
      if (!booking.patientAge || booking.patientAge < 60) {
        return res.status(400).json({
          success: false,
          error: 'Rapid Assistance is only available for patients aged 60 and above'
        });
      }
      
      rapidAssistanceCharge = 200; // Fixed charge of 200৳
    }
    
    // Calculate total payment amount
    const totalExpectedAmount = baseBookingAmount + rapidAssistanceCharge;
    
    console.log('💰 Payment calculation:', {
      bookingPaymentAmount: booking.paymentAmount,
      baseBookingAmount,
      rapidAssistanceCharge,
      totalExpectedAmount,
      receivedAmount: amount
    });
    
    // Validate amount if provided
    if (amount && Math.abs(parseFloat(amount) - totalExpectedAmount) > 0.01) {
      console.log('❌ Amount mismatch:', {
        expected: totalExpectedAmount,
        received: amount,
        difference: Math.abs(parseFloat(amount) - totalExpectedAmount)
      });
      return res.status(400).json({
        success: false,
        error: `Payment amount mismatch. Expected: ${totalExpectedAmount}৳, Received: ${amount}৳`
      });
    }
    
    const paymentAmount = amount || totalExpectedAmount;
    
    // Create detailed cost breakdown for transparency
    const baseServiceChargeRate = 0.1; // 10% service charge on base booking
    const baseServiceCharge = Math.round(baseBookingAmount * baseServiceChargeRate);
    const hospitalShare = baseBookingAmount - baseServiceCharge;
    
    // Rapid assistance goes entirely to platform (no hospital share)
    const platformRevenue = baseServiceCharge + rapidAssistanceCharge;
    
    const itemizedBreakdown = {
      base_booking_cost: baseBookingAmount,
      base_service_charge: baseServiceCharge,
      base_service_charge_rate: baseServiceChargeRate,
      hospital_share: hospitalShare,
      rapid_assistance_charge: rapidAssistanceCharge,
      platform_revenue: platformRevenue,
      total_amount: paymentAmount,
      currency: 'BDT',
      currency_symbol: '৳',
      breakdown_items: [
        {
          item: 'Hospital Resource Booking',
          amount: baseBookingAmount,
          description: `${booking.resourceType} for ${booking.estimatedDuration || 24} hours`,
          category: 'medical_service'
        }
      ]
    };
    
    // Add rapid assistance line item if applicable
    if (rapidAssistanceCharge > 0) {
      itemizedBreakdown.breakdown_items.push({
        item: 'Rapid Assistance Service',
        amount: rapidAssistanceCharge,
        description: 'Senior citizen escort service from gate to bed/ICU',
        category: 'addon_service'
      });
    }
    
    // Process payment through mock gateway
    // In production, this would integrate with bKash or other payment gateways
    const paymentProcessingResult = await processPaymentGateway({
      amount: paymentAmount
    });
    
    if (!paymentProcessingResult.success) {
      return res.status(402).json({
        success: false,
        error: paymentProcessingResult.error || 'Payment processing failed',
        data: {
          breakdown: itemizedBreakdown,
          gateway_response: paymentProcessingResult.gatewayResponse
        }
      });
    }
    
    // Deduct balance from user account
    let balanceUpdateResult;
    try {
      // Create a simplified cost breakdown for User.processPayment
      const simpleCostBreakdown = {
        hospital_share: hospitalShare,
        service_charge_share: baseServiceCharge,
        rapid_assistance_charge: rapidAssistanceCharge
      };
      
      balanceUpdateResult = User.processPayment(
        req.user.id, 
        parseFloat(paymentAmount), 
        bookingId, 
        transactionId,
        simpleCostBreakdown
      );
      
      console.log('💰 Balance updated:', balanceUpdateResult);
    } catch (error) {
      console.error('Balance update failed:', error);
      return res.status(400).json({
        success: false,
        error: error.message || 'Failed to update user balance'
      });
    }
    
    // Update booking with payment details
    Booking.updatePaymentStatus(bookingId, 'paid', 'bkash', transactionId);
    
    // Update booking payment amount to reflect total with rapid assistance
    if (paymentAmount !== booking.paymentAmount) {
      const updateAmountStmt = db.prepare(`
        UPDATE bookings 
        SET paymentAmount = ?
        WHERE id = ?
      `);
      updateAmountStmt.run(paymentAmount, bookingId);
    }
    
    // Create transaction record for payment history
    const Transaction = require('../models/Transaction');
    const transactionData = {
      userId: req.user.id,
      bookingId: bookingId,
      hospitalId: booking.hospitalId,
      amount: paymentAmount,
      type: 'payment',
      status: 'completed',
      paymentMethod: 'bkash',
      transactionId: transactionId,
      gatewayTransactionId: paymentProcessingResult.gatewayTransactionId,
      paymentData: JSON.stringify(itemizedBreakdown),
      serviceCharge: platformRevenue,
      hospitalAmount: hospitalShare
    };
    
    console.log('💾 Creating transaction record:', transactionData);
    Transaction.create(transactionData);
    
    // If Rapid Assistance is requested, add the assistant details
    if (requestedRapidAssistance && !booking.rapidAssistance) {
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
      
      const updateStmt = db.prepare(`
        UPDATE bookings 
        SET rapidAssistance = ?, 
            rapidAssistantName = ?, 
            rapidAssistantPhone = ?,
            rapidAssistanceCharge = ?
        WHERE id = ?
      `);
      updateStmt.run(1, randomAssistant.name, randomAssistant.phone, rapidAssistanceCharge, bookingId);
    }
    
    // Get updated booking with all changes
    const updatedBooking = Booking.findById(bookingId);
    
    // Create comprehensive payment response
    const paymentResult = {
      amount: parseFloat(paymentAmount),
      transaction_id: transactionId,
      gateway_transaction_id: paymentProcessingResult.gatewayTransactionId,
      payment_method: 'bkash',
      processed_at: new Date().toISOString(),
      cost_breakdown: itemizedBreakdown,
      new_balance: balanceUpdateResult.newBalance,
      previous_balance: balanceUpdateResult.previousBalance,
      rapid_assistance: {
        requested: requestedRapidAssistance,
        charge: rapidAssistanceCharge,
        assistant_name: updatedBooking.rapidAssistantName,
        assistant_phone: updatedBooking.rapidAssistantPhone
      }
    };
    
    res.json({
      success: true,
      data: {
        booking: updatedBooking,
        payment: paymentResult
      },
      message: 'Payment processed successfully'
    });
    
  } catch (error) {
    console.error('Payment processing error:', error);
    res.status(500).json({
      success: false,
      error: 'Payment processing failed: ' + error.message
    });
  }
});

/**
 * Mock payment gateway processing function
 * In production, this would integrate with bKash API
 */
async function processPaymentGateway({ amount }) {
  try {
    // Simulate processing delay
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Mock payment gateway validation
    if (amount <= 0) {
      return {
        success: false,
        error: 'Invalid payment amount',
        gatewayResponse: { code: 'INVALID_AMOUNT', message: 'Amount must be greater than 0' }
      };
    }
    
    if (amount > 50000) {
      return {
        success: false,
        error: 'Payment amount exceeds limit',
        gatewayResponse: { code: 'AMOUNT_LIMIT_EXCEEDED', message: 'Maximum transaction limit is 50,000৳' }
      };
    }
    
    // Simulate random payment failures (5% failure rate for testing)
    if (Math.random() < 0.05) {
      const failures = [
        { error: 'Insufficient balance', code: 'INSUFFICIENT_BALANCE' },
        { error: 'Invalid PIN', code: 'INVALID_PIN' },
        { error: 'Network timeout', code: 'TIMEOUT' }
      ];
      const failure = failures[Math.floor(Math.random() * failures.length)];
      
      return {
        success: false,
        error: failure.error,
        gatewayResponse: { code: failure.code, message: failure.error }
      };
    }
    
    // Simulate successful payment
    const gatewayTransactionId = `BK${Date.now()}${Math.random().toString(36).substr(2, 6)}`.toUpperCase();
    
    return {
      success: true,
      gatewayTransactionId,
      gatewayResponse: {
        code: '0000',
        message: 'Transaction successful',
        transactionId: gatewayTransactionId,
        amount: amount.toString(),
        currency: 'BDT'
      }
    };
    
  } catch (error) {
    return {
      success: false,
      error: 'Gateway communication error',
      gatewayResponse: { code: 'GATEWAY_ERROR', message: error.message }
    };
  }
}

/**
 * @route   GET /api/bookings/user
 * @desc    Get current user bookings
 * @access  Private
 */
router.get('/user', authenticate, async (req, res) => {
  console.log('GET /api/bookings/user called');
  console.log('req.user:', req.user);
  try {
    const bookings = Booking.findByUserId(req.user.id);
    res.json({
      success: true,
      data: bookings
    });
  } catch (error) {
    console.error('Error fetching user bookings:', error);
    res.status(500).json({
      success: false,
      error: 'Server error'
    });
  }
});


/**
 * @route   PUT /api/bookings/:id/status
 * @desc    Update booking status
 * @access  Private
 */
router.put('/:id/status', authenticate, requireRole('hospital-authority'), async (req, res) => {
  try {
    const { status } = req.body;
    
    // Validate required fields
    if (!status) {
      return res.status(400).json({
        success: false,
        error: 'Status is required'
      });
    }
    
    // Get booking
    const booking = Booking.findById(req.params.id);
    if (!booking) {
      return res.status(404).json({
        success: false,
        error: 'Booking not found'
      });
    }
    
    // Check if user has permission to update this booking
    if (booking.hospitalId !== req.user.hospitalId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      });
    }
    
    // Update booking status
    Booking.updateStatus(req.params.id, status);
    
    // Get updated booking
    const updatedBooking = Booking.findById(req.params.id);
    
    res.json({
      success: true,
      data: updatedBooking,
      message: 'Booking status updated successfully'
    });
    
  } catch (error) {
    console.error('Error updating booking status:', error);
    res.status(500).json({
      success: false,
      error: 'Server error'
    });
  }
});

/**
 * @route   PUT /api/bookings/:id/cancel
 * @desc    Cancel booking
 * @access  Private
 */
router.put('/:id/cancel', authenticate, async (req, res) => {
  try {
    const { reason, requestRefund } = req.body;
    const bookingId = parseInt(req.params.id);
    
    console.log('Cancel booking request:', {
      bookingId,
      userId: req.user.id,
      userType: req.user.userType,
      reason,
      requestRefund
    });
    
    if (isNaN(bookingId) || bookingId <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Invalid booking ID'
      });
    }
    
    // Validate user ID
    if (!req.user || !req.user.id) {
      return res.status(401).json({
        success: false,
        error: 'User authentication required'
      });
    }
    
    // Get booking
    const booking = Booking.findById(bookingId);
    if (!booking) {
      return res.status(404).json({
        success: false,
        error: 'Booking not found'
      });
    }
    
    console.log('Found booking:', {
      id: booking.id,
      userId: booking.userId,
      status: booking.status,
      hospitalId: booking.hospitalId
    });
    
    // Check if user owns this booking (unless admin or hospital authority)
    if (req.user.userType !== 'admin' && req.user.userType !== 'hospital-authority') {
      if (booking.userId !== req.user.id) {
        return res.status(403).json({
          success: false,
          error: 'Access denied. You can only cancel your own bookings.'
        });
      }
    }
    
    // Check if booking can be cancelled
    if (booking.status === 'cancelled') {
      return res.status(400).json({
        success: false,
        error: 'Booking is already cancelled'
      });
    }
    
    if (!['pending', 'approved'].includes(booking.status)) {
      return res.status(400).json({
        success: false,
        error: `Cannot cancel booking with status: ${booking.status}. Only pending or approved bookings can be cancelled.`
      });
    }
    
    // Cancel booking with required parameters
    const cancelReason = reason && reason.trim() ? reason.trim() : 'Cancelled by user';
    const notes = requestRefund ? 'Refund requested' : null;
    
    // Ensure user ID is an integer
    const userId = parseInt(req.user.id);
    if (isNaN(userId) || userId <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Invalid user ID'
      });
    }
    
    console.log('Calling Booking.cancel with:', {
      bookingId,
      cancelledBy: userId,
      reason: cancelReason,
      notes
    });
    
    Booking.cancel(bookingId, userId, cancelReason, notes);
    
    // Get updated booking
    const updatedBooking = Booking.findById(bookingId);
    
    if (!updatedBooking) {
      console.error('Booking not found after cancellation:', bookingId);
      return res.status(500).json({
        success: false,
        error: 'Booking was cancelled but could not be retrieved'
      });
    }
    
    console.log('Booking cancelled successfully:', bookingId);
    
    res.json({
      success: true,
      data: updatedBooking,
      message: 'Booking cancelled successfully'
    });
    
  } catch (error) {
    console.error('Error cancelling booking:', error);
    console.error('Error stack:', error.stack);
    console.error('Request details:', {
      bookingId: req.params.id,
      userId: req.user?.id,
      body: req.body
    });
    
    // Return detailed error message
    const errorMessage = error.message || 'Failed to cancel booking. Please try again.';
    
    res.status(500).json({
      success: false,
      error: errorMessage,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

/**
 * @route   GET /api/bookings/hospital/:hospitalId/pending
 * @desc    Get pending bookings for a hospital
 * @access  Private
 */
router.get('/hospital/:hospitalId/pending', authenticate, requireRole(['hospital-authority', 'admin']), async (req, res) => {
  try {
    const hospitalId = parseInt(req.params.hospitalId);
    const { urgency, resourceType, limit, sortBy, sortOrder } = req.query;

    // Check if user has permission to view this hospital's bookings
    if (req.user.userType === 'hospital-authority') {
      // Use hospitalId from user object (set by UserService.getById)
      const userHospitalId = req.user.hospitalId || req.user.hospital_id;
      if (!userHospitalId || userHospitalId !== hospitalId) {
        return res.status(403).json({
          success: false,
          error: 'You can only view bookings for your assigned hospital'
        });
      }
    }

    const options = {
      urgency,
      resourceType,
      limit: limit ? parseInt(limit) : undefined,
      sortBy,
      sortOrder
    };

    const result = await BookingApprovalService.getPendingBookings(hospitalId, options);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.message
      });
    }

    res.json({
      success: true,
      data: result.data.bookings,
      totalCount: result.data.totalCount,
      summary: result.data.summary,
      filters: result.data.filters
    });
  } catch (error) {
    console.error('Error fetching pending bookings:', error);
    res.status(500).json({
      success: false,
      error: 'Server error'
    });
  }
});

/**
 * @route   GET /api/bookings/hospital/:hospitalId/history
 * @desc    Get booking history for a hospital
 * @access  Private
 */
router.get('/hospital/:hospitalId/history', authenticate, requireRole(['hospital-authority', 'admin']), async (req, res) => {
  try {
    const bookings = Booking.findByHospitalId(req.params.hospitalId);
    res.json({
      success: true,
      data: bookings
    });
  } catch (error) {
    console.error('Error fetching booking history:', error);
    res.status(500).json({
      success: false,
      error: 'Server error'
    });
  }
});

/**
 * @route   PUT /api/bookings/:id/approve
 * @desc    Approve a booking
 * @access  Private
 */
router.put('/:id/approve', authenticate, requireRole(['hospital-authority', 'admin']), async (req, res) => {
  try {
    // Get booking
    const booking = Booking.findById(req.params.id);
    if (!booking) {
      return res.status(404).json({
        success: false,
        error: 'Booking not found'
      });
    }

    // Check if user has permission to approve this booking
    if (req.user.userType === 'hospital-authority') {
      // Use hospitalId from user object (set by UserService.getById)
      const userHospitalId = req.user.hospitalId || req.user.hospital_id;
      if (!userHospitalId || booking.hospitalId !== userHospitalId) {
      return res.status(403).json({
        success: false,
          error: 'You can only approve bookings for your assigned hospital'
      });
      }
    }

    const { notes, resourcesAllocated, scheduledDate, autoAllocateResources } = req.body || {};
    const approvalData = {
      notes,
      resourcesAllocated: resourcesAllocated ? parseInt(resourcesAllocated) : undefined,
      scheduledDate: scheduledDate ? new Date(scheduledDate) : undefined,
      autoAllocateResources: autoAllocateResources !== false
    };

    const result = await BookingApprovalService.approveBooking(
      parseInt(req.params.id),
      req.user.id,
      approvalData
    );

    if (!result.success) {
      return res.status(400).json({ success: false, error: result.message });
    }

    res.json({ success: true, message: result.message, data: result.data });
  } catch (error) {
    console.error('Error approving booking:', error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

/**
 * @route   PUT /api/bookings/:id/decline
 * @desc    Decline a booking
 * @access  Private
 */
router.put('/:id/decline', authenticate, requireRole(['hospital-authority', 'admin']), async (req, res) => {
  try {
    // Get booking
    const booking = Booking.findById(req.params.id);
    if (!booking) {
      return res.status(404).json({
        success: false,
        error: 'Booking not found'
      });
    }

    // Check if user has permission to decline this booking
    if (req.user.userType === 'hospital-authority' && booking.hospitalId !== req.user.hospitalId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      });
    }

    const { reason, notes, alternativeSuggestions } = req.body || {};
    if (!reason) {
      return res.status(400).json({ success: false, error: 'Decline reason is required' });
    }

    const result = await BookingApprovalService.declineBooking(
      parseInt(req.params.id),
      req.user.id,
      { reason, notes, alternativeSuggestions: alternativeSuggestions || [] }
    );

    if (!result.success) {
      return res.status(400).json({ success: false, error: result.message });
    }

    res.json({ success: true, message: result.message, data: result.data });
  } catch (error) {
    console.error('Error declining booking:', error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

/**
 * @route   GET /api/bookings
 * @desc    Get all bookings
 * @access  Private
 */
router.get('/', authenticate, requireRole('admin'), async (req, res) => {
  try {
    const bookings = Booking.findAll();
    res.json({
      success: true,
      data: bookings
    });
  } catch (error) {
    console.error('Error fetching bookings:', error);
    res.status(500).json({
      success: false,
      error: 'Server error'
    });
  }
});

module.exports = router;