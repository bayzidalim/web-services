const BookingService = require('../services/bookingService');
const BookingApprovalService = require('../services/bookingApprovalService');
const ValidationService = require('../services/validationService');
const User = require('../models/User');
const HospitalPricing = require('../models/HospitalPricing');

// Create a new booking
exports.createBooking = async (req, res) => {
  try {
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
      notes,
      rapidAssistance
    } = req.body;

    // Validate rapid assistance eligibility
    const rapidAssistanceValidation = ValidationService.validateRapidAssistanceEligibility(patientAge, rapidAssistance);
    if (!rapidAssistanceValidation.isValid) {
      return res.status(400).json({
        success: false,
        error: rapidAssistanceValidation.errors[0]
      });
    }

    const bookingData = {
      userId: req.user.id, // Use authenticated user's ID
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
      notes,
      rapidAssistance
    };

    const booking = BookingService.create(bookingData);

    res.status(201).json({
      success: true,
      data: booking,
      message: 'Booking created successfully'
    });
  } catch (error) {
    console.error('Error creating booking:', error);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
};

// Get user bookings
exports.getUserBookings = async (req, res) => {
  try {
    const bookings = BookingService.getByUserId(req.user.id);

    res.json({
      success: true,
      data: bookings,
      count: bookings.length
    });
  } catch (error) {
    console.error('Error fetching user bookings:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch bookings'
    });
  }
};

// Get specific booking
exports.getBookingById = async (req, res) => {
  try {
    const booking = BookingService.getById(req.params.id);

    if (!booking) {
      return res.status(404).json({
        success: false,
        error: 'Booking not found'
      });
    }

    res.json({
      success: true,
      data: booking
    });
  } catch (error) {
    console.error('Error fetching booking:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch booking'
    });
  }
};

// Update booking status
exports.updateBookingStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    BookingService.updateStatus(id, status);
    const booking = BookingService.getById(id);

    res.json({
      success: true,
      data: booking,
      message: 'Booking status updated successfully'
    });
  } catch (error) {
    console.error('Error updating booking status:', error);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
};

// Get all bookings (for hospital authority use)
exports.getAllBookings = async (req, res) => {
  try {
    let bookings;
    
    // If hospital authority, only show bookings for their hospital
    if (req.user.userType === 'hospital-authority' && req.user.hospitalId) {
      bookings = BookingService.getByHospitalId(req.user.hospitalId);
    } else {
      bookings = BookingService.getAll();
    }

    res.json({
      success: true,
      data: bookings,
      count: bookings.length
    });
  } catch (error) {
    console.error('Error fetching all bookings:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch bookings'
    });
  }
};

// Cancel booking
exports.cancelBooking = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason, notes } = req.body;
    const cancelledBy = req.user.id;

    const result = await BookingApprovalService.cancelBooking(id, cancelledBy, { reason, notes });

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.message
      });
    }

    res.json({
      success: true,
      data: result.data,
      message: 'Booking cancelled successfully'
    });
  } catch (error) {
    console.error('Error cancelling booking:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to cancel booking'
    });
  }
};

// Get current user's bookings (for profile page)
exports.getCurrentUserBookings = async (req, res) => {
  try {
    const bookings = BookingService.getByUserId(req.user.id);

    res.json({
      success: true,
      data: bookings,
      count: bookings.length
    });
  } catch (error) {
    console.error('Error fetching current user bookings:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch bookings'
    });
  }
};

// Booking approval endpoints

// Get pending bookings for a hospital
exports.getPendingBookings = async (req, res) => {
  try {
    const { hospitalId } = req.params;
    const { urgency, resourceType, limit, sortBy, sortOrder } = req.query;

    // Check if user has permission to view this hospital's bookings
    if (req.user.userType === 'hospital-authority') {
      // Use hospitalId from user object (set by UserService.getById)
      const userHospitalId = req.user.hospitalId || req.user.hospital_id;
      if (!userHospitalId || userHospitalId !== parseInt(hospitalId)) {
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

    const result = await BookingApprovalService.getPendingBookings(parseInt(hospitalId), options);

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
      error: 'Failed to fetch pending bookings'
    });
  }
};

// Approve a booking
exports.approveBooking = async (req, res) => {
  try {
    const { id } = req.params;
    const { notes, resourcesAllocated, scheduledDate, autoAllocateResources } = req.body || {};

    // Get booking to check hospital ownership
    const BookingService = require('../services/bookingService');
    const booking = BookingService.getById(id);
    
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

    const approvalData = {
      notes,
      resourcesAllocated: resourcesAllocated ? parseInt(resourcesAllocated) : undefined,
      scheduledDate: scheduledDate ? new Date(scheduledDate) : undefined,
      autoAllocateResources: autoAllocateResources !== false
    };

    const result = await BookingApprovalService.approveBooking(parseInt(id), req.user.id, approvalData);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.message
      });
    }

    res.json({
      success: true,
      data: result.data,
      message: result.message
    });

  } catch (error) {
    console.error('Error approving booking:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to approve booking'
    });
  }
};

// Decline a booking
exports.declineBooking = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason, notes, alternativeSuggestions } = req.body || {};

    if (!reason) {
      return res.status(400).json({
        success: false,
        error: 'Decline reason is required'
      });
    }

    // Get booking to check hospital ownership
    const BookingService = require('../services/bookingService');
    const booking = BookingService.getById(id);
    
    if (!booking) {
      return res.status(404).json({
        success: false,
        error: 'Booking not found'
      });
    }

    // Check if user has permission to decline this booking
    if (req.user.userType === 'hospital-authority' && req.user.hospitalId !== booking.hospitalId) {
      return res.status(403).json({
        success: false,
        error: 'You can only decline bookings for your assigned hospital'
      });
    }

    const declineData = {
      reason,
      notes,
      alternativeSuggestions: alternativeSuggestions || []
    };

    const result = await BookingApprovalService.declineBooking(parseInt(id), req.user.id, declineData);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.message
      });
    }

    res.json({
      success: true,
      data: result.data,
      message: result.message
    });

  } catch (error) {
    console.error('Error declining booking:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to decline booking'
    });
  }
};

// Get booking history for a hospital
exports.getBookingHistory = async (req, res) => {
  try {
    const { hospitalId } = req.params;
    const { status, startDate, endDate, limit, offset } = req.query;

    // Check if user has permission to view this hospital's history
    if (req.user.userType === 'hospital-authority' && req.user.hospital_id !== parseInt(hospitalId)) {
      return res.status(403).json({
        success: false,
        error: 'You can only view booking history for your assigned hospital'
      });
    }

    const options = {
      status,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      limit: limit ? parseInt(limit) : undefined,
      offset: offset ? parseInt(offset) : undefined
    };

    const result = await BookingApprovalService.getBookingHistory(parseInt(hospitalId), options);

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
      currentPage: result.data.currentPage,
      totalPages: result.data.totalPages,
      filters: result.data.filters
    });

  } catch (error) {
    console.error('Error fetching booking history:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch booking history'
    });
  }
};

// Process booking payment with enhanced rapid assistance support
exports.processBookingPayment = async (req, res) => {
  try {
    const { bookingId, transactionId, amount, rapidAssistance } = req.body;

    // Validate required fields
    if (!bookingId || !transactionId) {
      return res.status(400).json({
        success: false,
        error: 'Booking ID and transaction ID are required'
      });
    }

    // Get booking details
    const booking = BookingService.getById(bookingId);
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
        error: 'You can only pay for your own bookings'
      });
    }

    // Check if booking is already paid
    if (booking.paymentStatus === 'paid') {
      return res.status(400).json({
        success: false,
        error: 'Booking is already paid'
      });
    }

    // Calculate base payment amount using hospital pricing
    const costBreakdown = HospitalPricing.calculateBookingCost(
      booking.hospitalId,
      booking.resourceType,
      booking.estimatedDuration || 24
    );

    let basePaymentAmount = costBreakdown.total_cost;
    let rapidAssistanceCharge = 0;

    // Handle rapid assistance charge calculation
    const requestedRapidAssistance = rapidAssistance !== undefined ? rapidAssistance : booking.rapidAssistance;
    
    if (requestedRapidAssistance) {
      // Validate rapid assistance eligibility during payment
      const rapidAssistanceValidation = ValidationService.validateRapidAssistanceEligibility(booking.patientAge, requestedRapidAssistance);
      if (!rapidAssistanceValidation.isValid) {
        return res.status(400).json({
          success: false,
          error: rapidAssistanceValidation.errors[0]
        });
      }
      
      rapidAssistanceCharge = ValidationService.calculateRapidAssistanceCharge(requestedRapidAssistance);
    }

    // Calculate total payment amount
    const totalPaymentAmount = basePaymentAmount + rapidAssistanceCharge;

    // Validate payment amount if provided
    const paymentAmount = amount || totalPaymentAmount;
    if (amount && Math.abs(amount - totalPaymentAmount) > 0.01) {
      return res.status(400).json({
        success: false,
        error: `Payment amount mismatch. Expected: ${totalPaymentAmount}৳, Received: ${amount}৳`
      });
    }

    // Check user balance
    if (!User.hasSufficientBalance(req.user.id, paymentAmount)) {
      return res.status(400).json({
        success: false,
        error: 'Insufficient balance. Please add funds to your account.',
        data: {
          required_amount: paymentAmount,
          current_balance: User.getBalance(req.user.id),
          shortfall: paymentAmount - User.getBalance(req.user.id)
        }
      });
    }

    // Create enhanced cost breakdown for payment processing
    const enhancedCostBreakdown = {
      ...costBreakdown,
      rapid_assistance_charge: rapidAssistanceCharge,
      total_amount: paymentAmount,
      hospital_share: costBreakdown.hospital_share,
      service_charge_share: costBreakdown.service_charge_share,
      rapid_assistance_share: rapidAssistanceCharge, // Rapid assistance goes to platform
      platform_revenue: costBreakdown.service_charge_share + rapidAssistanceCharge
    };

    // Process payment (deduct balance)
    const paymentResult = User.processPayment(
      req.user.id,
      paymentAmount,
      bookingId,
      transactionId,
      enhancedCostBreakdown
    );

    // Update booking with rapid assistance details if selected
    if (requestedRapidAssistance && !booking.rapidAssistance) {
      BookingService.updateRapidAssistance(bookingId, true, rapidAssistanceCharge);
    }

    // Update booking payment status
    BookingService.updatePaymentStatus(bookingId, 'paid', 'balance', transactionId);

    // Get updated booking with all changes
    const updatedBooking = BookingService.getById(bookingId);

    // Create comprehensive itemized payment breakdown for response
    const itemizedBreakdown = {
      base_booking_cost: costBreakdown.total_cost,
      base_price: costBreakdown.base_price,
      service_charge_percentage: costBreakdown.service_charge_percentage,
      service_charge_amount: costBreakdown.service_charge_amount,
      hospital_share: costBreakdown.hospital_share,
      rapid_assistance_charge: rapidAssistanceCharge,
      platform_revenue: enhancedCostBreakdown.platform_revenue,
      total_amount: paymentAmount,
      currency: 'BDT',
      currency_symbol: '৳',
      breakdown_items: [
        {
          item: 'Hospital Resource Booking',
          amount: costBreakdown.total_cost,
          description: `${booking.resourceType} for ${costBreakdown.duration_days} days`,
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

    res.json({
      success: true,
      data: {
        booking: updatedBooking,
        payment: {
          amount: paymentAmount,
          transaction_id: transactionId,
          payment_method: 'balance',
          processed_at: new Date().toISOString(),
          previous_balance: paymentResult.previousBalance,
          new_balance: paymentResult.newBalance,
          cost_breakdown: itemizedBreakdown,
          rapid_assistance: {
            requested: requestedRapidAssistance,
            charge: rapidAssistanceCharge,
            assistant_name: updatedBooking.rapidAssistantName,
            assistant_phone: updatedBooking.rapidAssistantPhone
          }
        }
      },
      message: 'Payment processed successfully'
    });

  } catch (error) {
    console.error('Error processing booking payment:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Payment processing failed'
    });
  }
}; 