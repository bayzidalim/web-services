const db = require('../config/database');
const BookingStatusHistory = require('./BookingStatusHistory');

class Booking {
  static create(bookingData) {
    try {
      const stmt = db.prepare(`
        INSERT INTO bookings (
          userId, hospitalId, resourceType, patientName, patientAge, 
          patientGender, emergencyContactName, emergencyContactPhone, 
          emergencyContactRelationship, medicalCondition, urgency, 
          surgeonId, scheduledDate, estimatedDuration, paymentAmount,
          rapidAssistance, rapidAssistantName, rapidAssistantPhone
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      
      // Ensure all values are properly defined
      const values = [
        bookingData.userId || null,
        bookingData.hospitalId || null,
        bookingData.resourceType || '',
        bookingData.patientName || '',
        bookingData.patientAge || 0,
        bookingData.patientGender || '',
        bookingData.emergencyContactName || '',
        bookingData.emergencyContactPhone || '',
        bookingData.emergencyContactRelationship || '',
        bookingData.medicalCondition || '',
        bookingData.urgency || 'medium',
        bookingData.surgeonId || null,
        bookingData.scheduledDate || '',
        bookingData.estimatedDuration || 0,
        bookingData.paymentAmount || 0,
        bookingData.rapidAssistance ? 1 : 0, // Convert boolean to number for SQLite
        bookingData.rapidAssistantName || null,
        bookingData.rapidAssistantPhone || null
      ];
      
      // Debug: Check for undefined values
      for (let i = 0; i < values.length; i++) {
        if (values[i] === undefined) {
          console.error(`Undefined value at index ${i} in values array`);
          console.error('All values:', values);
          throw new Error(`Undefined value at index ${i} in values array`);
        }
      }
      
      const result = stmt.run(...values);
      
      return result.lastInsertRowid;
    } catch (error) {
      console.error('Error creating booking in database:', error);
      console.error('Booking data:', bookingData);
      throw error;
    }
  }

  static findById(id) {
    const stmt = db.prepare(`
      SELECT b.*, h.name as hospitalName, u.name as userName
      FROM bookings b
      LEFT JOIN hospitals h ON b.hospitalId = h.id
      LEFT JOIN users u ON b.userId = u.id
      WHERE b.id = ?
    `);
    return stmt.get(id);
  }

  static findByUserId(userId) {
    const stmt = db.prepare(`
      SELECT b.*, h.name as hospitalName
      FROM bookings b
      LEFT JOIN hospitals h ON b.hospitalId = h.id
      WHERE b.userId = ?
      ORDER BY b.createdAt DESC
    `);
    return stmt.all(userId);
  }

  static getAll() {
    const stmt = db.prepare(`
      SELECT b.*, h.name as hospitalName, u.name as userName
      FROM bookings b
      LEFT JOIN hospitals h ON b.hospitalId = h.id
      LEFT JOIN users u ON b.userId = u.id
      ORDER BY b.createdAt DESC
    `);
    return stmt.all();
  }

  static updateStatus(id, status, changedBy = null, reason = null, notes = null) {
    const transaction = db.transaction(() => {
      // Get current booking to track old status
      const currentBooking = this.findById(id);
      if (!currentBooking) {
        throw new Error('Booking not found');
      }

      // Update booking status
      const stmt = db.prepare(`
        UPDATE bookings 
        SET status = ?, updatedAt = CURRENT_TIMESTAMP
        WHERE id = ?
      `);
      stmt.run(status, id);

      // Log status change if changedBy is provided
      if (changedBy) {
        BookingStatusHistory.create({
          bookingId: id,
          oldStatus: currentBooking.status,
          newStatus: status,
          changedBy,
          reason,
          notes
        });
      }
    });

    transaction();
    return true;
  }

  static updatePaymentStatus(id, paymentStatus, paymentMethod, transactionId) {
    const stmt = db.prepare(`
      UPDATE bookings 
      SET paymentStatus = ?, paymentMethod = ?, transactionId = ?, updatedAt = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    return stmt.run(paymentStatus, paymentMethod, transactionId, id);
  }

  static delete(id) {
    const stmt = db.prepare('DELETE FROM bookings WHERE id = ?');
    return stmt.run(id);
  }

  static getByHospital(hospitalId) {
    const stmt = db.prepare(`
      SELECT b.*, u.name as userName
      FROM bookings b
      LEFT JOIN users u ON b.userId = u.id
      WHERE b.hospitalId = ?
      ORDER BY b.createdAt DESC
    `);
    return stmt.all(hospitalId);
  }

  static getByStatus(status) {
    const stmt = db.prepare(`
      SELECT b.*, h.name as hospitalName, u.name as userName
      FROM bookings b
      LEFT JOIN hospitals h ON b.hospitalId = h.id
      LEFT JOIN users u ON b.userId = u.id
      WHERE b.status = ?
      ORDER BY b.createdAt DESC
    `);
    return stmt.all(status);
  }

  /**
   * Get pending bookings for a hospital
   * @param {number} hospitalId - Hospital ID
   * @param {Object} options - Query options
   * @returns {Array} Array of pending bookings
   */
  static getPendingByHospital(hospitalId, options = {}) {
    let query = `
      SELECT b.*, 
             u.name as userName,
             u.phone as userPhone,
             h.name as hospitalName
      FROM bookings b
      LEFT JOIN users u ON b.userId = u.id
      LEFT JOIN hospitals h ON b.hospitalId = h.id
      WHERE b.hospitalId = ? AND b.status = 'pending'
    `;
    
    const params = [hospitalId];
    
    // Add urgency filter
    if (options.urgency) {
      query += ' AND b.urgency = ?';
      params.push(options.urgency);
    }
    
    // Add resource type filter
    if (options.resourceType) {
      query += ' AND b.resourceType = ?';
      params.push(options.resourceType);
    }
    
    // Order by urgency and creation date
    query += ` 
      ORDER BY 
        CASE b.urgency 
          WHEN 'critical' THEN 1 
          WHEN 'high' THEN 2 
          WHEN 'medium' THEN 3 
          WHEN 'low' THEN 4 
        END,
        b.createdAt ASC
    `;
    
    if (options.limit) {
      query += ' LIMIT ?';
      params.push(options.limit);
    }
    
    const stmt = db.prepare(query);
    return stmt.all(...params);
  }

  /**
   * Approve a booking
   * @param {number} id - Booking ID
   * @param {number} approvedBy - User who approved the booking
   * @param {string} notes - Approval notes
   * @returns {boolean} Success status
   */
  static approve(id, approvedBy, notes = null) {
    const transaction = db.transaction(() => {
      // Get current booking
      const booking = this.findById(id);
      if (!booking) {
        throw new Error('Booking not found');
      }
      
      if (booking.status !== 'pending') {
        throw new Error('Only pending bookings can be approved');
      }

      // Update booking
      const stmt = db.prepare(`
        UPDATE bookings 
        SET status = 'approved', 
            approvedBy = ?, 
            approvedAt = CURRENT_TIMESTAMP,
            authorityNotes = ?,
            updatedAt = CURRENT_TIMESTAMP
        WHERE id = ?
      `);
      stmt.run(approvedBy, notes, id);

      // Log the approval
      BookingStatusHistory.logApproval(id, approvedBy, notes);
    });

    transaction();
    return true;
  }

  /**
   * Decline a booking
   * @param {number} id - Booking ID
   * @param {number} declinedBy - User who declined the booking
   * @param {string} reason - Reason for decline
   * @param {string} notes - Additional notes
   * @returns {boolean} Success status
   */
  static decline(id, declinedBy, reason, notes = null) {
    const transaction = db.transaction(() => {
      // Get current booking
      const booking = this.findById(id);
      if (!booking) {
        throw new Error('Booking not found');
      }
      
      if (booking.status !== 'pending') {
        throw new Error('Only pending bookings can be declined');
      }

      // Update booking
      const stmt = db.prepare(`
        UPDATE bookings 
        SET status = 'declined', 
            approvedBy = ?, 
            approvedAt = CURRENT_TIMESTAMP,
            declineReason = ?,
            authorityNotes = ?,
            updatedAt = CURRENT_TIMESTAMP
        WHERE id = ?
      `);
      stmt.run(declinedBy, reason, notes, id);

      // Log the decline
      BookingStatusHistory.logDecline(id, declinedBy, reason, notes);
    });

    transaction();
    return true;
  }

  /**
   * Complete a booking
   * @param {number} id - Booking ID
   * @param {number} completedBy - User who completed the booking
   * @param {string} notes - Completion notes
   * @returns {boolean} Success status
   */
  static complete(id, completedBy, notes = null) {
    const transaction = db.transaction(() => {
      // Get current booking
      const booking = this.findById(id);
      if (!booking) {
        throw new Error('Booking not found');
      }
      
      if (booking.status !== 'approved') {
        throw new Error('Only approved bookings can be completed');
      }

      // Update booking
      const stmt = db.prepare(`
        UPDATE bookings 
        SET status = 'completed', 
            updatedAt = CURRENT_TIMESTAMP
        WHERE id = ?
      `);
      stmt.run(id);

      // Log the completion
      BookingStatusHistory.logCompletion(id, completedBy, notes);
    });

    transaction();
    return true;
  }

  static cancel(id, cancelledBy, reason, notes = null) {
    try {
      // Get current booking to capture old status BEFORE transaction
      const booking = this.findById(id);
      if (!booking) {
        throw new Error('Booking not found');
      }
      
      const oldStatus = booking.status;
      
      if (!['pending', 'approved'].includes(oldStatus)) {
        throw new Error('Only pending or approved bookings can be cancelled');
      }

      // Validate cancelledBy is a valid user ID
      if (!cancelledBy || isNaN(cancelledBy)) {
        throw new Error('Invalid user ID for cancellation');
      }

      // Validate reason
      if (!reason || typeof reason !== 'string' || reason.trim().length === 0) {
        reason = 'Cancelled by user';
      }

      const transaction = db.transaction(() => {
        // Update booking
        const stmt = db.prepare(`
          UPDATE bookings 
          SET status = 'cancelled', 
              declineReason = ?,
              authorityNotes = ?,
              updatedAt = CURRENT_TIMESTAMP
          WHERE id = ?
        `);
        stmt.run(reason, notes || null, id);

        // Log the cancellation with the actual old status
        // If logging fails, don't fail the cancellation
        try {
          BookingStatusHistory.logCancellation(id, cancelledBy, reason, notes, oldStatus);
        } catch (historyError) {
          console.error('Failed to log cancellation history (non-fatal):', historyError);
          // Don't throw - cancellation should still succeed even if history logging fails
        }
      });

      transaction();
      return true;
    } catch (error) {
      console.error('Error in Booking.cancel:', error);
      console.error('Error details:', {
        id,
        cancelledBy,
        reason,
        notes,
        errorMessage: error.message,
        errorStack: error.stack
      });
      throw error;
    }
  }

  /**
   * Get booking statistics for a hospital
   * @param {number} hospitalId - Hospital ID
   * @param {Object} options - Query options
   * @returns {Object} Booking statistics
   */
  static getStatistics(hospitalId, options = {}) {
    let query = `
      SELECT 
        status,
        COUNT(*) as count,
        AVG(paymentAmount) as avgAmount
      FROM bookings
      WHERE hospitalId = ?
    `;
    
    const params = [hospitalId];
    
    if (options.startDate) {
      query += ' AND createdAt >= ?';
      params.push(options.startDate);
    }
    
    if (options.endDate) {
      query += ' AND createdAt <= ?';
      params.push(options.endDate);
    }
    
    query += ' GROUP BY status';
    
    const stmt = db.prepare(query);
    return stmt.all(...params);
  }

  /**
   * Get bookings with status history
   * @param {number} hospitalId - Hospital ID
   * @param {Object} options - Query options
   * @returns {Array} Bookings with their status history
   */
  static getWithHistory(hospitalId) {
    const bookings = this.getByHospital(hospitalId);
    
    return bookings.map(booking => ({
      ...booking,
      statusHistory: BookingStatusHistory.getByBooking(booking.id)
    }));
  }

  /**
   * Set booking expiration
   * @param {number} id - Booking ID
   * @param {Date} expiresAt - Expiration date
   * @returns {boolean} Success status
   */
  static setExpiration(id, expiresAt) {
    const stmt = db.prepare(`
      UPDATE bookings 
      SET expiresAt = ?, updatedAt = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    // Convert Date object to ISO string for SQLite
    const expirationString = expiresAt instanceof Date ? expiresAt.toISOString() : expiresAt;
    stmt.run(expirationString, id);
    return true;
  }

  /**
   * Get expired bookings
   * @returns {Array} Array of expired bookings
   */
  static getExpired() {
    const stmt = db.prepare(`
      SELECT b.*, h.name as hospitalName, u.name as userName
      FROM bookings b
      LEFT JOIN hospitals h ON b.hospitalId = h.id
      LEFT JOIN users u ON b.userId = u.id
      WHERE b.expiresAt IS NOT NULL 
      AND b.expiresAt < CURRENT_TIMESTAMP
      AND b.status IN ('pending', 'approved')
    `);
    return stmt.all();
  }

  static count(options = {}) {
    let query = 'SELECT COUNT(*) as count FROM bookings';
    const params = [];
    if (options && options.where) {
      const conditions = [];
      Object.keys(options.where).forEach(key => {
        const value = options.where[key];
        if (
          typeof value === 'number' ||
          typeof value === 'string' ||
          typeof value === 'bigint' ||
          value === null
        ) {
          conditions.push(`${key} = ?`);
          params.push(value);
        }
      });
      if (conditions.length > 0) {
        query += ' WHERE ' + conditions.join(' AND ');
      }
    }
    const stmt = db.prepare(query);
    const result = stmt.get(...params);
    return result.count;
  }
}

module.exports = Booking; 