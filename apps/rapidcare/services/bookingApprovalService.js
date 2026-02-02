const Booking = require('../models/Booking');
const BookingStatusHistory = require('../models/BookingStatusHistory');
const ResourceManagementService = require('./resourceManagementService');
const NotificationService = require('./notificationService');
const db = require('../config/database');

/**
 * BookingApprovalService
 * 
 * Handles all booking approval workflow operations including:
 * - Retrieving pending bookings for hospital authorities
 * - Approving bookings with resource allocation
 * - Declining bookings with reason tracking
 * - Booking validation and resource availability checking
 * - Automatic resource quantity adjustments
 * - Booking history and analytics
 */
class BookingApprovalService {
  /**
   * Get pending bookings for a hospital
   * @param {number} hospitalId - Hospital ID
   * @param {Object} options - Query options
   * @param {string} options.urgency - Filter by urgency level
   * @param {string} options.resourceType - Filter by resource type
   * @param {number} options.limit - Limit number of results
   * @param {string} options.sortBy - Sort field (urgency, date, patient)
   * @param {string} options.sortOrder - Sort order (asc, desc)
   * @returns {Object} Pending bookings with metadata
   */
  static async getPendingBookings(hospitalId, options = {}) {
    try {
      // Validate hospital exists
      const hospitalStmt = db.prepare('SELECT id FROM hospitals WHERE id = ? AND isActive = 1');
      const hospital = hospitalStmt.get(hospitalId);
      if (!hospital) {
        throw new Error('Hospital not found or inactive');
      }

      // Get pending bookings with enhanced data
      let query = `
        SELECT b.*, 
               u.name as userName,
               u.phone as userPhone,
               u.email as userEmail,
               h.name as hospitalName,
               CASE 
                 WHEN b.urgency = 'critical' THEN 1
                 WHEN b.urgency = 'high' THEN 2
                 WHEN b.urgency = 'medium' THEN 3
                 WHEN b.urgency = 'low' THEN 4
                 ELSE 5
               END as urgencyOrder,
               julianday('now') - julianday(b.createdAt) as daysSinceCreated
        FROM bookings b
        LEFT JOIN users u ON b.userId = u.id
        LEFT JOIN hospitals h ON b.hospitalId = h.id
        WHERE b.hospitalId = ? AND b.status = 'pending'
      `;
      
      const params = [hospitalId];
      
      // Add filters
      if (options.urgency) {
        query += ' AND b.urgency = ?';
        params.push(options.urgency);
      }
      
      if (options.resourceType) {
        query += ' AND b.resourceType = ?';
        params.push(options.resourceType);
      }

      // Add sorting
      const sortBy = options.sortBy || 'urgency';
      const sortOrder = options.sortOrder || 'asc';
      
      switch (sortBy) {
        case 'urgency':
          query += ` ORDER BY urgencyOrder ${sortOrder}, b.createdAt ASC`;
          break;
        case 'date':
          query += ` ORDER BY b.createdAt ${sortOrder}`;
          break;
        case 'patient':
          query += ` ORDER BY b.patientName ${sortOrder}`;
          break;
        case 'amount':
          query += ` ORDER BY b.paymentAmount ${sortOrder}`;
          break;
        default:
          query += ' ORDER BY urgencyOrder ASC, b.createdAt ASC';
      }
      
      if (options.limit) {
        query += ' LIMIT ?';
        params.push(options.limit);
      }
      
      const stmt = db.prepare(query);
      const bookings = stmt.all(...params);

      // Enhance bookings with resource availability info
      const enhancedBookings = await Promise.all(
        bookings.map(async (booking) => {
          const resourceAvailability = await ResourceManagementService.checkResourceAvailability(
            hospitalId,
            booking.resourceType,
            booking.resourcesAllocated || 1
          );

          return {
            ...booking,
            resourceAvailability: resourceAvailability.data,
            canApprove: resourceAvailability.success && resourceAvailability.data.available,
            waitingTime: Math.round(booking.daysSinceCreated * 24), // hours
            estimatedCompletionDate: new Date(
              new Date(booking.scheduledDate).getTime() + 
              (booking.estimatedDuration || 24) * 60 * 60 * 1000
            ).toISOString()
          };
        })
      );

      // Get summary statistics
      const summaryStats = this.getPendingBookingsSummary(hospitalId);

      return {
        success: true,
        data: {
          bookings: enhancedBookings,
          totalCount: enhancedBookings.length,
          summary: summaryStats,
          filters: options
        }
      };

    } catch (error) {
      return {
        success: false,
        message: error.message,
        error: error
      };
    }
  }

  /**
   * Approve a booking
   * @param {number} bookingId - Booking ID
   * @param {number} approvedBy - User ID of approver
   * @param {Object} approvalData - Approval data
   * @param {string} approvalData.notes - Approval notes
   * @param {number} approvalData.resourcesAllocated - Number of resources to allocate
   * @param {Date} approvalData.scheduledDate - Updated scheduled date (optional)
   * @param {boolean} approvalData.autoAllocateResources - Whether to automatically allocate resources
   * @returns {Object} Approval result
   */
  static async approveBooking(bookingId, approvedBy, approvalData = {}) {
    try {
      // Get booking details
      const booking = Booking.findById(bookingId);
      if (!booking) {
        throw new Error('Booking not found');
      }

      if (booking.status !== 'pending') {
        throw new Error(`Cannot approve booking with status: ${booking.status}`);
      }

      // Validate booking approval
      const validationResult = await this.validateBookingApproval(
        bookingId, 
        booking.resourceType, 
        approvalData.resourcesAllocated || booking.resourcesAllocated || 1
      );

      if (!validationResult.valid) {
        throw new Error(validationResult.message);
      }

      // Check resource availability (outside transaction)
      const resourcesNeeded = approvalData.resourcesAllocated || booking.resourcesAllocated || 1;
      const availability = await ResourceManagementService.checkResourceAvailability(
        booking.hospitalId,
        booking.resourceType,
        resourcesNeeded
      );

      if (!availability.success || !availability.data.available) {
        throw new Error(`Insufficient ${booking.resourceType} available. ${availability.data.message}`);
      }

      // Allocate resources if auto-allocation is enabled (default: true)
      let allocationResult = null;
      if (approvalData.autoAllocateResources !== false) {
        allocationResult = await ResourceManagementService.allocateResources(
          booking.hospitalId,
          booking.resourceType,
          resourcesNeeded,
          bookingId,
          approvedBy
        );

        if (!allocationResult.success) {
          throw new Error(`Resource allocation failed: ${allocationResult.message}`);
        }
      }

      // Execute database updates in transaction (synchronous)
      const transaction = db.transaction(() => {
        // Update booking status
        const approvalSuccess = Booking.approve(bookingId, approvedBy, approvalData.notes);
        if (!approvalSuccess) {
          throw new Error('Failed to update booking status');
        }

        // Update resources allocated if specified
        if (approvalData.resourcesAllocated && approvalData.resourcesAllocated !== booking.resourcesAllocated) {
          const updateStmt = db.prepare(`
            UPDATE bookings 
            SET resourcesAllocated = ?, updatedAt = CURRENT_TIMESTAMP
            WHERE id = ?
          `);
          updateStmt.run(approvalData.resourcesAllocated, bookingId);
        }

        // Update scheduled date if provided
        if (approvalData.scheduledDate) {
          const dateUpdateStmt = db.prepare(`
            UPDATE bookings 
            SET scheduledDate = ?, updatedAt = CURRENT_TIMESTAMP
            WHERE id = ?
          `);
          const scheduledDateString = approvalData.scheduledDate instanceof Date ? 
            approvalData.scheduledDate.toISOString() : approvalData.scheduledDate;
          dateUpdateStmt.run(scheduledDateString, bookingId);
        }

        // Set booking expiration if not provided
        if (!booking.expiresAt) {
          const expirationDate = new Date();
          expirationDate.setHours(expirationDate.getHours() + (booking.estimatedDuration || 24));
          Booking.setExpiration(bookingId, expirationDate);
        }

        return true;
      });

      // Execute transaction
      transaction();

      // Get updated booking
      const updatedBooking = Booking.findById(bookingId);

      // Send approval notification to patient
      try {
        const notificationResult = await NotificationService.sendBookingApprovalNotification(
          bookingId,
          booking.userId,
          {
            hospitalName: updatedBooking.hospitalName,
            resourceType: booking.resourceType,
            scheduledDate: booking.scheduledDate,
            notes: approvalData.notes
          }
        );

        if (!notificationResult.success) {
          console.warn('Failed to send approval notification:', notificationResult.message);
        }
      } catch (notificationError) {
        console.error('Error sending approval notification:', notificationError);
      }

      return {
        success: true,
        message: 'Booking approved successfully',
        data: {
          booking: updatedBooking,
          resourcesAllocated: resourcesNeeded,
          approvedBy,
          approvedAt: new Date().toISOString(),
          notes: approvalData.notes
        }
      };

    } catch (error) {
      return {
        success: false,
        message: error.message,
        error: error
      };
    }
  }

  /**
   * Decline a booking
   * @param {number} bookingId - Booking ID
   * @param {number} declinedBy - User ID of decliner
   * @param {Object} declineData - Decline data
   * @param {string} declineData.reason - Reason for decline (required)
   * @param {string} declineData.notes - Additional notes
   * @param {Array} declineData.alternativeSuggestions - Alternative hospital/time suggestions
   * @returns {Object} Decline result
   */
  static async declineBooking(bookingId, declinedBy, declineData) {
    try {
      // Validate required data
      if (!declineData.reason) {
        throw new Error('Decline reason is required');
      }

      // Get booking details
      const booking = Booking.findById(bookingId);
      if (!booking) {
        throw new Error('Booking not found');
      }

      if (booking.status !== 'pending') {
        throw new Error(`Cannot decline booking with status: ${booking.status}`);
      }

      // Decline booking
      const declineSuccess = Booking.decline(
        bookingId, 
        declinedBy, 
        declineData.reason, 
        declineData.notes
      );

      if (!declineSuccess) {
        throw new Error('Failed to update booking status');
      }

      // Store alternative suggestions if provided
      if (declineData.alternativeSuggestions && declineData.alternativeSuggestions.length > 0) {
        const suggestionsStmt = db.prepare(`
          UPDATE bookings 
          SET authorityNotes = ?
          WHERE id = ?
        `);
        
        const notesWithSuggestions = [
          declineData.notes || '',
          'Alternative suggestions:',
          ...declineData.alternativeSuggestions
        ].filter(Boolean).join('\n');
        
        suggestionsStmt.run(notesWithSuggestions, bookingId);
      }

      // Get updated booking
      const updatedBooking = Booking.findById(bookingId);

      // Send decline notification to patient
      try {
        const notificationResult = await NotificationService.sendBookingDeclineNotification(
          bookingId,
          booking.userId,
          {
            hospitalName: updatedBooking.hospitalName,
            reason: declineData.reason,
            notes: declineData.notes,
            alternativeSuggestions: declineData.alternativeSuggestions
          }
        );

        if (!notificationResult.success) {
          console.warn('Failed to send decline notification:', notificationResult.message);
        }
      } catch (notificationError) {
        console.error('Error sending decline notification:', notificationError);
      }

      return {
        success: true,
        message: 'Booking declined successfully',
        data: {
          booking: updatedBooking,
          reason: declineData.reason,
          declinedBy,
          declinedAt: new Date().toISOString(),
          notes: declineData.notes,
          alternativeSuggestions: declineData.alternativeSuggestions || []
        }
      };

    } catch (error) {
      return {
        success: false,
        message: error.message,
        error: error
      };
    }
  }

  /**
   * Complete a booking
   * @param {number} bookingId - Booking ID
   * @param {number} completedBy - User ID of completer
   * @param {Object} completionData - Completion data
   * @param {string} completionData.notes - Completion notes
   * @param {boolean} completionData.autoReleaseResources - Whether to automatically release resources
   * @returns {Object} Completion result
   */
  static async completeBooking(bookingId, completedBy, completionData = {}) {
    const transaction = db.transaction(async () => {
        // Get booking details
        const booking = Booking.findById(bookingId);
        if (!booking) {
          throw new Error('Booking not found');
        }

        if (booking.status !== 'approved') {
          throw new Error(`Cannot complete booking with status: ${booking.status}`);
        }

        // Complete booking
        const completionSuccess = Booking.complete(bookingId, completedBy, completionData.notes);
        if (!completionSuccess) {
          throw new Error('Failed to update booking status');
        }

        // Release resources if auto-release is enabled (default: true)
        if (completionData.autoReleaseResources !== false) {
          const resourcesAllocated = booking.resourcesAllocated || 1;
          const releaseResult = await ResourceManagementService.releaseResources(
            booking.hospitalId,
            booking.resourceType,
            resourcesAllocated,
            bookingId,
            completedBy,
            'completed'
          );

          if (!releaseResult.success) {
            throw new Error(`Resource release failed: ${releaseResult.message}`);
          }
        }

        // Get updated booking
        const updatedBooking = Booking.findById(bookingId);

        // Send completion notification to patient
        try {
          const notificationResult = await NotificationService.sendBookingCompletionNotification(
            bookingId,
            booking.userId,
            {
              hospitalName: updatedBooking.hospitalName,
              notes: completionData.notes
            }
          );

          if (!notificationResult.success) {
            console.warn('Failed to send completion notification:', notificationResult.message);
          }
        } catch (notificationError) {
          console.error('Error sending completion notification:', notificationError);
        }

        return {
          success: true,
          message: 'Booking completed successfully',
          data: {
            booking: updatedBooking,
            completedBy,
            completedAt: new Date().toISOString(),
            notes: completionData.notes
          }
        };
    });

    try {
      return await transaction();
    } catch (error) {
      return {
        success: false,
        message: error.message,
        error: error
      };
    }
  }

  /**
   * Cancel a booking
   * @param {number} bookingId - Booking ID
   * @param {number} cancelledBy - User ID of canceller
   * @param {Object} cancellationData - Cancellation data
   * @param {string} cancellationData.reason - Reason for cancellation
   * @param {string} cancellationData.notes - Additional notes
   * @param {boolean} cancellationData.autoReleaseResources - Whether to automatically release resources
   * @returns {Object} Cancellation result
   */
  static async cancelBooking(bookingId, cancelledBy, cancellationData) {
    const transaction = db.transaction(async () => {
        // Get booking details
        const booking = Booking.findById(bookingId);
        if (!booking) {
          throw new Error('Booking not found');
        }

        if (!['pending', 'approved'].includes(booking.status)) {
          throw new Error(`Cannot cancel booking with status: ${booking.status}`);
        }

        // Cancel booking
        const cancellationSuccess = Booking.cancel(
          bookingId, 
          cancelledBy, 
          cancellationData.reason, 
          cancellationData.notes
        );

        if (!cancellationSuccess) {
          throw new Error('Failed to update booking status');
        }

        // Release resources if booking was approved and auto-release is enabled
        if (booking.status === 'approved' && cancellationData.autoReleaseResources !== false) {
          const resourcesAllocated = booking.resourcesAllocated || 1;
          const releaseResult = await ResourceManagementService.releaseResources(
            booking.hospitalId,
            booking.resourceType,
            resourcesAllocated,
            bookingId,
            cancelledBy,
            'cancelled'
          );

          if (!releaseResult.success) {
            throw new Error(`Resource release failed: ${releaseResult.message}`);
          }
        }

        // Get updated booking
        const updatedBooking = Booking.findById(bookingId);

        // Send cancellation notification to patient
        try {
          const notificationResult = await NotificationService.sendBookingCancellationNotification(
            bookingId,
            booking.userId,
            {
              hospitalName: updatedBooking.hospitalName,
              reason: cancellationData.reason,
              notes: cancellationData.notes,
              refundInfo: cancellationData.refundInfo
            }
          );

          if (!notificationResult.success) {
            console.warn('Failed to send cancellation notification:', notificationResult.message);
          }
        } catch (notificationError) {
          console.error('Error sending cancellation notification:', notificationError);
        }

        return {
          success: true,
          message: 'Booking cancelled successfully',
          data: {
            booking: updatedBooking,
            cancelledBy,
            cancelledAt: new Date().toISOString(),
            reason: cancellationData.reason,
            notes: cancellationData.notes
          }
        };
    });

    try {
      return await transaction();
    } catch (error) {
      return {
        success: false,
        message: error.message,
        error: error
      };
    }
  }

  /**
   * Validate booking approval
   * @param {number} bookingId - Booking ID
   * @param {string} resourceType - Resource type
   * @param {number} quantity - Quantity needed
   * @returns {Object} Validation result
   */
  static async validateBookingApproval(bookingId, resourceType, quantity) {
    try {
      // Get booking details
      const booking = Booking.findById(bookingId);
      if (!booking) {
        return { valid: false, message: 'Booking not found' };
      }

      if (booking.status !== 'pending') {
        return { valid: false, message: `Booking status is ${booking.status}, not pending` };
      }

      // Check if booking is expired
      if (booking.expiresAt && new Date(booking.expiresAt) < new Date()) {
        return { valid: false, message: 'Booking has expired' };
      }

      // Validate resource type matches
      if (booking.resourceType !== resourceType) {
        return { valid: false, message: 'Resource type mismatch' };
      }

      // Validate quantity
      if (quantity <= 0) {
        return { valid: false, message: 'Quantity must be positive' };
      }

      // Check resource availability
      const availability = await ResourceManagementService.checkResourceAvailability(
        booking.hospitalId,
        resourceType,
        quantity
      );

      if (!availability.success || !availability.data.available) {
        return { 
          valid: false, 
          message: `Insufficient resources: ${availability.data.message}` 
        };
      }

      return { valid: true, message: 'Booking can be approved' };

    } catch (error) {
      return { valid: false, message: `Validation error: ${error.message}` };
    }
  }

  /**
   * Get booking history for a hospital
   * @param {number} hospitalId - Hospital ID
   * @param {Object} options - Query options
   * @param {string} options.status - Filter by status
   * @param {Date} options.startDate - Start date filter
   * @param {Date} options.endDate - End date filter
   * @param {number} options.limit - Limit results
   * @param {number} options.offset - Offset for pagination
   * @returns {Object} Booking history
   */
  static async getBookingHistory(hospitalId, options = {}) {
    try {
      let query = `
        SELECT b.*, 
               u.name as userName,
               u.phone as userPhone,
               approver.name as approvedByName,
               bsh.reason as lastStatusReason,
               bsh.notes as lastStatusNotes,
               bsh.timestamp as lastStatusChange
        FROM bookings b
        LEFT JOIN users u ON b.userId = u.id
        LEFT JOIN users approver ON b.approvedBy = approver.id
        LEFT JOIN (
          SELECT DISTINCT bookingId, reason, notes, timestamp,
                 ROW_NUMBER() OVER (PARTITION BY bookingId ORDER BY timestamp DESC) as rn
          FROM booking_status_history
        ) bsh ON b.id = bsh.bookingId AND bsh.rn = 1
        WHERE b.hospitalId = ?
      `;
      
      const params = [hospitalId];
      
      // Add filters
      if (options.status) {
        query += ' AND b.status = ?';
        params.push(options.status);
      }
      
      if (options.startDate) {
        query += ' AND b.createdAt >= ?';
        params.push(options.startDate);
      }
      
      if (options.endDate) {
        query += ' AND b.createdAt <= ?';
        params.push(options.endDate);
      }
      
      query += ' ORDER BY b.updatedAt DESC';
      
      if (options.limit) {
        query += ' LIMIT ?';
        params.push(options.limit);
        
        if (options.offset) {
          query += ' OFFSET ?';
          params.push(options.offset);
        }
      }
      
      const stmt = db.prepare(query);
      const bookings = stmt.all(...params);

      // Get total count for pagination
      let countQuery = 'SELECT COUNT(*) as count FROM bookings WHERE hospitalId = ?';
      const countParams = [hospitalId];
      
      if (options.status) {
        countQuery += ' AND status = ?';
        countParams.push(options.status);
      }
      
      if (options.startDate) {
        countQuery += ' AND createdAt >= ?';
        countParams.push(options.startDate);
      }
      
      if (options.endDate) {
        countQuery += ' AND createdAt <= ?';
        countParams.push(options.endDate);
      }
      
      const countStmt = db.prepare(countQuery);
      const totalCount = countStmt.get(...countParams).count;

      return {
        success: true,
        data: {
          bookings,
          totalCount,
          currentPage: options.offset ? Math.floor(options.offset / (options.limit || 10)) + 1 : 1,
          totalPages: options.limit ? Math.ceil(totalCount / options.limit) : 1,
          filters: options
        }
      };

    } catch (error) {
      return {
        success: false,
        message: error.message,
        error: error
      };
    }
  }

  /**
   * Get booking approval analytics
   * @param {number} hospitalId - Hospital ID
   * @param {Object} options - Query options
   * @returns {Object} Approval analytics
   */
  static async getBookingAnalytics(hospitalId, options = {}) {
    try {
      // Get approval statistics
      const approvalStats = BookingStatusHistory.getApprovalStatistics(hospitalId, options);
      
      // Get booking statistics by resource type
      const resourceStats = Booking.getStatistics(hospitalId, options);
      
      // Get recent activity
      const recentActivity = BookingStatusHistory.getRecentChanges(hospitalId, 10);
      
      // Calculate average response time
      const responseTimeQuery = `
        SELECT 
          AVG(julianday(bsh.timestamp) - julianday(b.createdAt)) * 24 as avgResponseHours,
          COUNT(*) as totalProcessed
        FROM booking_status_history bsh
        JOIN bookings b ON bsh.bookingId = b.id
        WHERE b.hospitalId = ? 
        AND bsh.newStatus IN ('approved', 'declined')
        ${options.startDate ? 'AND bsh.timestamp >= ?' : ''}
        ${options.endDate ? 'AND bsh.timestamp <= ?' : ''}
      `;
      
      const responseParams = [hospitalId];
      if (options.startDate) responseParams.push(options.startDate);
      if (options.endDate) responseParams.push(options.endDate);
      
      const responseStmt = db.prepare(responseTimeQuery);
      const responseTime = responseStmt.get(...responseParams);

      return {
        success: true,
        data: {
          approvalStatistics: approvalStats,
          resourceStatistics: resourceStats,
          recentActivity,
          averageResponseTime: {
            hours: Math.round((responseTime.avgResponseHours || 0) * 100) / 100,
            totalProcessed: responseTime.totalProcessed
          },
          hospitalId,
          period: options
        }
      };

    } catch (error) {
      return {
        success: false,
        message: error.message,
        error: error
      };
    }
  }

  // Helper methods

  /**
   * Get pending bookings summary statistics
   * @param {number} hospitalId - Hospital ID
   * @returns {Object} Summary statistics
   */
  static getPendingBookingsSummary(hospitalId) {
    const summaryQuery = `
      SELECT 
        COUNT(*) as totalPending,
        SUM(CASE WHEN urgency = 'critical' THEN 1 ELSE 0 END) as critical,
        SUM(CASE WHEN urgency = 'high' THEN 1 ELSE 0 END) as high,
        SUM(CASE WHEN urgency = 'medium' THEN 1 ELSE 0 END) as medium,
        SUM(CASE WHEN urgency = 'low' THEN 1 ELSE 0 END) as low,
        SUM(CASE WHEN resourceType = 'beds' THEN 1 ELSE 0 END) as beds,
        SUM(CASE WHEN resourceType = 'icu' THEN 1 ELSE 0 END) as icu,
        SUM(CASE WHEN resourceType = 'operationTheatres' THEN 1 ELSE 0 END) as operationTheatres,
        AVG(julianday('now') - julianday(createdAt)) as avgWaitingDays
      FROM bookings 
      WHERE hospitalId = ? AND status = 'pending'
    `;
    
    const stmt = db.prepare(summaryQuery);
    return stmt.get(hospitalId);
  }

  /**
   * Process expired bookings
   * @param {number} hospitalId - Hospital ID (optional, processes all if not provided)
   * @returns {Object} Processing result
   */
  static async processExpiredBookings(hospitalId = null) {
    try {
      let expiredBookings;
      
      if (hospitalId) {
        const stmt = db.prepare(`
          SELECT * FROM bookings 
          WHERE hospitalId = ? 
          AND expiresAt IS NOT NULL 
          AND expiresAt < CURRENT_TIMESTAMP
          AND status IN ('pending', 'approved')
        `);
        expiredBookings = stmt.all(hospitalId);
      } else {
        expiredBookings = Booking.getExpired();
      }

      const results = [];
      
      for (const booking of expiredBookings) {
        const cancellationResult = await this.cancelBooking(
          booking.id,
          1, // System user ID
          {
            reason: 'Booking expired',
            notes: 'Automatically cancelled due to expiration',
            autoReleaseResources: true
          }
        );
        
        results.push({
          bookingId: booking.id,
          patientName: booking.patientName,
          result: cancellationResult
        });
      }

      return {
        success: true,
        message: `Processed ${results.length} expired bookings`,
        data: {
          processedCount: results.length,
          results
        }
      };

    } catch (error) {
      return {
        success: false,
        message: error.message,
        error: error
      };
    }
  }
}

module.exports = BookingApprovalService;