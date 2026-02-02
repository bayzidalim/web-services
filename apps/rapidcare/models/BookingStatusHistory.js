const db = require('../config/database');

/**
 * BookingStatusHistory Model
 * 
 * Manages the history of booking status changes including:
 * - Status transitions (pending -> approved/declined)
 * - User who made the change
 * - Reason and notes for the change
 * - Timestamp of the change
 */
class BookingStatusHistory {
  /**
   * Create a new booking status history entry
   * @param {Object} historyData - The status history data
   * @param {number} historyData.bookingId - Booking ID
   * @param {string} historyData.oldStatus - Previous status
   * @param {string} historyData.newStatus - New status
   * @param {number} historyData.changedBy - User who made the change
   * @param {string} historyData.reason - Reason for change (optional)
   * @param {string} historyData.notes - Additional notes (optional)
   * @returns {number} The ID of the created history entry
   */
  static create(historyData) {
    try {
      // Validate required fields
      if (!historyData.bookingId) {
        throw new Error('bookingId is required for status history');
      }
      if (!historyData.newStatus) {
        throw new Error('newStatus is required for status history');
      }
      if (!historyData.changedBy) {
        throw new Error('changedBy is required for status history');
      }

      const stmt = db.prepare(`
        INSERT INTO booking_status_history (
          bookingId, oldStatus, newStatus, changedBy, reason, notes, timestamp
        )
        VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `);
      
      const result = stmt.run(
        historyData.bookingId,
        historyData.oldStatus || null,
        historyData.newStatus,
        historyData.changedBy,
        historyData.reason || null,
        historyData.notes || null
      );
      
      return result.lastInsertRowid;
    } catch (error) {
      console.error('Error in BookingStatusHistory.create:', error);
      console.error('History data:', historyData);
      throw error;
    }
  }

  /**
   * Get status history by ID
   * @param {number} id - History entry ID
   * @returns {Object|null} History entry with user and booking details
   */
  static findById(id) {
    const stmt = db.prepare(`
      SELECT bsh.*, 
             u.name as changedByName,
             b.patientName,
             b.resourceType,
             h.name as hospitalName
      FROM booking_status_history bsh
      LEFT JOIN users u ON bsh.changedBy = u.id
      LEFT JOIN bookings b ON bsh.bookingId = b.id
      LEFT JOIN hospitals h ON b.hospitalId = h.id
      WHERE bsh.id = ?
    `);
    return stmt.get(id);
  }

  /**
   * Get status history for a specific booking
   * @param {number} bookingId - Booking ID
   * @returns {Array} Array of status history entries ordered by timestamp
   */
  static getByBooking(bookingId) {
    const stmt = db.prepare(`
      SELECT bsh.*, 
             u.name as changedByName,
             u.userType as changedByType
      FROM booking_status_history bsh
      LEFT JOIN users u ON bsh.changedBy = u.id
      WHERE bsh.bookingId = ?
      ORDER BY bsh.timestamp ASC
    `);
    return stmt.all(bookingId);
  }

  /**
   * Get status history for bookings at a specific hospital
   * @param {number} hospitalId - Hospital ID
   * @param {Object} options - Query options
   * @param {string} options.status - Filter by status
   * @param {Date} options.startDate - Filter from date
   * @param {Date} options.endDate - Filter to date
   * @param {number} options.limit - Limit results
   * @param {number} options.offset - Offset for pagination
   * @returns {Array} Array of status history entries
   */
  static getByHospital(hospitalId, options = {}) {
    let query = `
      SELECT bsh.*, 
             u.name as changedByName,
             u.userType as changedByType,
             b.patientName,
             b.resourceType,
             b.urgency
      FROM booking_status_history bsh
      LEFT JOIN users u ON bsh.changedBy = u.id
      LEFT JOIN bookings b ON bsh.bookingId = b.id
      WHERE b.hospitalId = ?
    `;
    
    const params = [hospitalId];
    
    // Add filters
    if (options.status) {
      query += ' AND bsh.newStatus = ?';
      params.push(options.status);
    }
    
    if (options.startDate) {
      query += ' AND bsh.timestamp >= ?';
      params.push(options.startDate);
    }
    
    if (options.endDate) {
      query += ' AND bsh.timestamp <= ?';
      params.push(options.endDate);
    }
    
    query += ' ORDER BY bsh.timestamp DESC';
    
    if (options.limit) {
      query += ' LIMIT ?';
      params.push(options.limit);
      
      if (options.offset) {
        query += ' OFFSET ?';
        params.push(options.offset);
      }
    }
    
    const stmt = db.prepare(query);
    return stmt.all(...params);
  }

  /**
   * Get status history for a specific user (hospital authority)
   * @param {number} userId - User ID
   * @param {Object} options - Query options
   * @returns {Array} Array of status history entries made by the user
   */
  static getByUser(userId, options = {}) {
    let query = `
      SELECT bsh.*, 
             b.patientName,
             b.resourceType,
             b.urgency,
             h.name as hospitalName
      FROM booking_status_history bsh
      LEFT JOIN bookings b ON bsh.bookingId = b.id
      LEFT JOIN hospitals h ON b.hospitalId = h.id
      WHERE bsh.changedBy = ?
    `;
    
    const params = [userId];
    
    if (options.startDate) {
      query += ' AND bsh.timestamp >= ?';
      params.push(options.startDate);
    }
    
    if (options.endDate) {
      query += ' AND bsh.timestamp <= ?';
      params.push(options.endDate);
    }
    
    query += ' ORDER BY bsh.timestamp DESC';
    
    if (options.limit) {
      query += ' LIMIT ?';
      params.push(options.limit);
    }
    
    const stmt = db.prepare(query);
    return stmt.all(...params);
  }

  /**
   * Get booking approval statistics for a hospital
   * @param {number} hospitalId - Hospital ID
   * @param {Object} options - Query options
   * @param {Date} options.startDate - Start date for statistics
   * @param {Date} options.endDate - End date for statistics
   * @returns {Object} Statistics object with approval counts
   */
  static getApprovalStatistics(hospitalId, options = {}) {
    let query = `
      SELECT 
        bsh.newStatus,
        COUNT(*) as statusCount,
        AVG(julianday(bsh.timestamp) - julianday(b.createdAt)) * 24 as avgHoursToDecision
      FROM booking_status_history bsh
      LEFT JOIN bookings b ON bsh.bookingId = b.id
      WHERE b.hospitalId = ? 
      AND bsh.newStatus IN ('approved', 'declined')
    `;
    
    const params = [hospitalId];
    
    if (options.startDate) {
      query += ' AND bsh.timestamp >= ?';
      params.push(options.startDate);
    }
    
    if (options.endDate) {
      query += ' AND bsh.timestamp <= ?';
      params.push(options.endDate);
    }
    
    query += ' GROUP BY bsh.newStatus';
    
    const stmt = db.prepare(query);
    return stmt.all(...params);
  }

  /**
   * Get recent status changes for dashboard display
   * @param {number} hospitalId - Hospital ID
   * @param {number} limit - Number of recent changes to return
   * @returns {Array} Array of recent status changes
   */
  static getRecentChanges(hospitalId, limit = 10) {
    const stmt = db.prepare(`
      SELECT bsh.*, 
             u.name as changedByName,
             b.patientName,
             b.resourceType,
             b.urgency
      FROM booking_status_history bsh
      LEFT JOIN users u ON bsh.changedBy = u.id
      LEFT JOIN bookings b ON bsh.bookingId = b.id
      WHERE b.hospitalId = ?
      ORDER BY bsh.timestamp DESC
      LIMIT ?
    `);
    return stmt.all(hospitalId, limit);
  }

  /**
   * Log a booking approval
   * @param {number} bookingId - Booking ID
   * @param {number} approvedBy - User who approved the booking
   * @param {string} notes - Approval notes
   * @returns {number} History entry ID
   */
  static logApproval(bookingId, approvedBy, notes = null) {
    return this.create({
      bookingId,
      oldStatus: 'pending',
      newStatus: 'approved',
      changedBy: approvedBy,
      reason: 'Booking approved by hospital authority',
      notes
    });
  }

  /**
   * Log a booking decline
   * @param {number} bookingId - Booking ID
   * @param {number} declinedBy - User who declined the booking
   * @param {string} reason - Reason for decline
   * @param {string} notes - Additional notes
   * @returns {number} History entry ID
   */
  static logDecline(bookingId, declinedBy, reason, notes = null) {
    return this.create({
      bookingId,
      oldStatus: 'pending',
      newStatus: 'declined',
      changedBy: declinedBy,
      reason,
      notes
    });
  }

  /**
   * Log a booking completion
   * @param {number} bookingId - Booking ID
   * @param {number} completedBy - User who completed the booking
   * @param {string} notes - Completion notes
   * @returns {number} History entry ID
   */
  static logCompletion(bookingId, completedBy, notes = null) {
    return this.create({
      bookingId,
      oldStatus: 'approved',
      newStatus: 'completed',
      changedBy: completedBy,
      reason: 'Booking completed',
      notes
    });
  }

  /**
   * Log a booking cancellation
   * @param {number} bookingId - Booking ID
   * @param {number} cancelledBy - User who cancelled the booking
   * @param {string} reason - Reason for cancellation
   * @param {string} notes - Additional notes
   * @param {string} oldStatus - Previous status of the booking (optional, defaults to 'pending' if not provided)
   * @returns {number} History entry ID
   */
  static logCancellation(bookingId, cancelledBy, reason, notes = null, oldStatus = null) {
    try {
      // Validate required parameters
      if (!bookingId) {
        throw new Error('bookingId is required for cancellation logging');
      }
      if (!cancelledBy) {
        throw new Error('cancelledBy is required for cancellation logging');
      }
      if (!reason) {
        reason = 'Cancelled by user';
      }

      // If oldStatus is not provided, try to get it from the latest status history
      if (!oldStatus) {
        try {
          const latestStatus = this.getLatestStatus(bookingId);
          if (latestStatus && latestStatus.newStatus) {
            oldStatus = latestStatus.newStatus;
          } else {
            // Default to 'pending' if no history exists
            // This is safe because cancellations typically come from pending or approved status
            oldStatus = 'pending';
          }
        } catch (error) {
          console.warn('Could not get latest status for booking:', bookingId, error.message);
          oldStatus = 'pending';
        }
      }
      
      return this.create({
        bookingId: parseInt(bookingId),
        oldStatus: oldStatus || 'pending',
        newStatus: 'cancelled',
        changedBy: parseInt(cancelledBy),
        reason: reason || 'Cancelled by user',
        notes: notes || null
      });
    } catch (error) {
      console.error('Error in BookingStatusHistory.logCancellation:', error);
      console.error('Cancellation data:', {
        bookingId,
        cancelledBy,
        reason,
        notes,
        oldStatus
      });
      throw error;
    }
  }

  /**
   * Get the latest status change for a booking
   * @param {number} bookingId - Booking ID
   * @returns {Object|null} Latest status change entry
   */
  static getLatestStatus(bookingId) {
    const stmt = db.prepare(`
      SELECT bsh.*, 
             u.name as changedByName
      FROM booking_status_history bsh
      LEFT JOIN users u ON bsh.changedBy = u.id
      WHERE bsh.bookingId = ?
      ORDER BY bsh.timestamp DESC
      LIMIT 1
    `);
    return stmt.get(bookingId);
  }

  /**
   * Delete status history older than specified days
   * @param {number} days - Number of days to keep
   * @returns {number} Number of deleted records
   */
  static cleanup(days = 365) {
    const stmt = db.prepare(`
      DELETE FROM booking_status_history 
      WHERE timestamp < datetime('now', '-' || ? || ' days')
    `);
    const result = stmt.run(days);
    return result.changes;
  }

  /**
   * Get total count of status history entries for a hospital
   * @param {number} hospitalId - Hospital ID
   * @param {Object} options - Filter options
   * @returns {number} Total count
   */
  static count(hospitalId, options = {}) {
    let query = `
      SELECT COUNT(*) as count 
      FROM booking_status_history bsh
      LEFT JOIN bookings b ON bsh.bookingId = b.id
      WHERE b.hospitalId = ?
    `;
    const params = [hospitalId];
    
    if (options.status) {
      query += ' AND bsh.newStatus = ?';
      params.push(options.status);
    }
    
    if (options.startDate) {
      query += ' AND bsh.timestamp >= ?';
      params.push(options.startDate);
    }
    
    if (options.endDate) {
      query += ' AND bsh.timestamp <= ?';
      params.push(options.endDate);
    }
    
    const stmt = db.prepare(query);
    const result = stmt.get(...params);
    return result.count;
  }
}

module.exports = BookingStatusHistory;