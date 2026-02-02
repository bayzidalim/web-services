const db = require('../config/database');

/**
 * ResourceAuditLog Model
 * 
 * Manages audit logging for hospital resource changes including:
 * - Manual updates by hospital authorities
 * - Automatic updates from booking approvals/completions
 * - System adjustments and maintenance
 */
class ResourceAuditLog {
  /**
   * Create a new resource audit log entry
   * @param {Object} logData - The audit log data
   * @param {number} logData.hospitalId - Hospital ID
   * @param {string} logData.resourceType - Resource type (beds, icu, operationTheatres)
   * @param {string} logData.changeType - Type of change (manual_update, booking_approved, etc.)
   * @param {number} logData.oldValue - Previous value
   * @param {number} logData.newValue - New value
   * @param {number} logData.quantity - Quantity changed
   * @param {number} logData.bookingId - Related booking ID (optional)
   * @param {number} logData.changedBy - User who made the change
   * @param {string} logData.reason - Reason for change (optional)
   * @param {string} logData.notes - Additional notes (optional)
   * @returns {number} The ID of the created audit log entry
   */
  static create(logData) {
    const stmt = db.prepare(`
      INSERT INTO resource_audit_log (
        hospitalId, resourceType, changeType, oldValue, newValue, 
        quantity, bookingId, changedBy, reason, notes, timestamp
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `);
    
    const result = stmt.run(
      logData.hospitalId,
      logData.resourceType,
      logData.changeType,
      logData.oldValue,
      logData.newValue,
      logData.quantity,
      logData.bookingId || null,
      logData.changedBy,
      logData.reason || null,
      logData.notes || null
    );
    
    return result.lastInsertRowid;
  }

  /**
   * Get audit log by ID
   * @param {number} id - Audit log ID
   * @returns {Object|null} Audit log entry with user and hospital details
   */
  static findById(id) {
    const stmt = db.prepare(`
      SELECT ral.*, 
             h.name as hospitalName,
             u.name as changedByName,
             b.patientName as bookingPatientName
      FROM resource_audit_log ral
      LEFT JOIN hospitals h ON ral.hospitalId = h.id
      LEFT JOIN users u ON ral.changedBy = u.id
      LEFT JOIN bookings b ON ral.bookingId = b.id
      WHERE ral.id = ?
    `);
    return stmt.get(id);
  }

  /**
   * Get audit logs for a specific hospital
   * @param {number} hospitalId - Hospital ID
   * @param {Object} options - Query options
   * @param {string} options.resourceType - Filter by resource type
   * @param {string} options.changeType - Filter by change type
   * @param {Date} options.startDate - Filter from date
   * @param {Date} options.endDate - Filter to date
   * @param {number} options.limit - Limit results
   * @param {number} options.offset - Offset for pagination
   * @returns {Array} Array of audit log entries
   */
  static getByHospital(hospitalId, options = {}) {
    let query = `
      SELECT ral.*, 
             h.name as hospitalName,
             u.name as changedByName,
             b.patientName as bookingPatientName
      FROM resource_audit_log ral
      LEFT JOIN hospitals h ON ral.hospitalId = h.id
      LEFT JOIN users u ON ral.changedBy = u.id
      LEFT JOIN bookings b ON ral.bookingId = b.id
      WHERE ral.hospitalId = ?
    `;
    
    const params = [hospitalId];
    
    // Add filters
    if (options.resourceType) {
      query += ' AND ral.resourceType = ?';
      params.push(options.resourceType);
    }
    
    if (options.changeType) {
      query += ' AND ral.changeType = ?';
      params.push(options.changeType);
    }
    
    if (options.startDate) {
      query += ' AND ral.timestamp >= ?';
      params.push(options.startDate);
    }
    
    if (options.endDate) {
      query += ' AND ral.timestamp <= ?';
      params.push(options.endDate);
    }
    
    query += ' ORDER BY ral.timestamp DESC';
    
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
   * Get audit logs for a specific resource type across all hospitals
   * @param {string} resourceType - Resource type
   * @param {Object} options - Query options
   * @returns {Array} Array of audit log entries
   */
  static getByResourceType(resourceType, options = {}) {
    let query = `
      SELECT ral.*, 
             h.name as hospitalName,
             u.name as changedByName,
             b.patientName as bookingPatientName
      FROM resource_audit_log ral
      LEFT JOIN hospitals h ON ral.hospitalId = h.id
      LEFT JOIN users u ON ral.changedBy = u.id
      LEFT JOIN bookings b ON ral.bookingId = b.id
      WHERE ral.resourceType = ?
    `;
    
    const params = [resourceType];
    
    if (options.startDate) {
      query += ' AND ral.timestamp >= ?';
      params.push(options.startDate);
    }
    
    if (options.endDate) {
      query += ' AND ral.timestamp <= ?';
      params.push(options.endDate);
    }
    
    query += ' ORDER BY ral.timestamp DESC';
    
    if (options.limit) {
      query += ' LIMIT ?';
      params.push(options.limit);
    }
    
    const stmt = db.prepare(query);
    return stmt.all(...params);
  }

  /**
   * Get audit logs for a specific booking
   * @param {number} bookingId - Booking ID
   * @returns {Array} Array of audit log entries related to the booking
   */
  static getByBooking(bookingId) {
    const stmt = db.prepare(`
      SELECT ral.*, 
             h.name as hospitalName,
             u.name as changedByName
      FROM resource_audit_log ral
      LEFT JOIN hospitals h ON ral.hospitalId = h.id
      LEFT JOIN users u ON ral.changedBy = u.id
      WHERE ral.bookingId = ?
      ORDER BY ral.timestamp DESC
    `);
    return stmt.all(bookingId);
  }

  /**
   * Get resource change statistics for a hospital
   * @param {number} hospitalId - Hospital ID
   * @param {Object} options - Query options
   * @param {Date} options.startDate - Start date for statistics
   * @param {Date} options.endDate - End date for statistics
   * @returns {Object} Statistics object with change counts by type
   */
  static getChangeStatistics(hospitalId, options = {}) {
    let query = `
      SELECT 
        resourceType,
        changeType,
        COUNT(*) as changeCount,
        SUM(CASE WHEN quantity > 0 THEN quantity ELSE 0 END) as totalIncreases,
        SUM(CASE WHEN quantity < 0 THEN ABS(quantity) ELSE 0 END) as totalDecreases
      FROM resource_audit_log
      WHERE hospitalId = ?
    `;
    
    const params = [hospitalId];
    
    if (options.startDate) {
      query += ' AND timestamp >= ?';
      params.push(options.startDate);
    }
    
    if (options.endDate) {
      query += ' AND timestamp <= ?';
      params.push(options.endDate);
    }
    
    query += ' GROUP BY resourceType, changeType ORDER BY resourceType, changeType';
    
    const stmt = db.prepare(query);
    return stmt.all(...params);
  }

  /**
   * Log a manual resource update
   * @param {number} hospitalId - Hospital ID
   * @param {string} resourceType - Resource type
   * @param {number} oldValue - Previous value
   * @param {number} newValue - New value
   * @param {number} changedBy - User who made the change
   * @param {string} reason - Reason for change
   * @returns {number} Audit log entry ID
   */
  static logManualUpdate(hospitalId, resourceType, oldValue, newValue, changedBy, reason = null) {
    return this.create({
      hospitalId,
      resourceType,
      changeType: 'manual_update',
      oldValue,
      newValue,
      quantity: newValue - oldValue,
      changedBy,
      reason: reason || 'Manual resource quantity update'
    });
  }

  /**
   * Log a booking approval resource allocation
   * @param {number} hospitalId - Hospital ID
   * @param {string} resourceType - Resource type
   * @param {number} quantity - Quantity allocated
   * @param {number} bookingId - Booking ID
   * @param {number} approvedBy - User who approved the booking
   * @returns {number} Audit log entry ID
   */
  static logBookingApproval(hospitalId, resourceType, quantity, bookingId, approvedBy) {
    return this.create({
      hospitalId,
      resourceType,
      changeType: 'booking_approved',
      oldValue: null,
      newValue: null,
      quantity: -quantity, // Negative because resources are being allocated
      bookingId,
      changedBy: approvedBy,
      reason: 'Resource allocated for approved booking'
    });
  }

  /**
   * Log a booking completion resource release
   * @param {number} hospitalId - Hospital ID
   * @param {string} resourceType - Resource type
   * @param {number} quantity - Quantity released
   * @param {number} bookingId - Booking ID
   * @param {number} completedBy - User who completed the booking
   * @returns {number} Audit log entry ID
   */
  static logBookingCompletion(hospitalId, resourceType, quantity, bookingId, completedBy) {
    return this.create({
      hospitalId,
      resourceType,
      changeType: 'booking_completed',
      oldValue: null,
      newValue: null,
      quantity: quantity, // Positive because resources are being released
      bookingId,
      changedBy: completedBy,
      reason: 'Resource released after booking completion'
    });
  }

  /**
   * Log a booking cancellation resource release
   * @param {number} hospitalId - Hospital ID
   * @param {string} resourceType - Resource type
   * @param {number} quantity - Quantity released
   * @param {number} bookingId - Booking ID
   * @param {number} cancelledBy - User who cancelled the booking
   * @returns {number} Audit log entry ID
   */
  static logBookingCancellation(hospitalId, resourceType, quantity, bookingId, cancelledBy) {
    return this.create({
      hospitalId,
      resourceType,
      changeType: 'booking_cancelled',
      oldValue: null,
      newValue: null,
      quantity: quantity, // Positive because resources are being released
      bookingId,
      changedBy: cancelledBy,
      reason: 'Resource released due to booking cancellation'
    });
  }

  /**
   * Delete audit logs older than specified days
   * @param {number} days - Number of days to keep
   * @returns {number} Number of deleted records
   */
  static cleanup(days = 365) {
    const stmt = db.prepare(`
      DELETE FROM resource_audit_log 
      WHERE timestamp < datetime('now', '-' || ? || ' days')
    `);
    const result = stmt.run(days);
    return result.changes;
  }

  /**
   * Get total count of audit logs for a hospital
   * @param {number} hospitalId - Hospital ID
   * @param {Object} options - Filter options
   * @returns {number} Total count
   */
  static count(hospitalId, options = {}) {
    let query = 'SELECT COUNT(*) as count FROM resource_audit_log WHERE hospitalId = ?';
    const params = [hospitalId];
    
    if (options.resourceType) {
      query += ' AND resourceType = ?';
      params.push(options.resourceType);
    }
    
    if (options.changeType) {
      query += ' AND changeType = ?';
      params.push(options.changeType);
    }
    
    if (options.startDate) {
      query += ' AND timestamp >= ?';
      params.push(options.startDate);
    }
    
    if (options.endDate) {
      query += ' AND timestamp <= ?';
      params.push(options.endDate);
    }
    
    const stmt = db.prepare(query);
    const result = stmt.get(...params);
    return result.count;
  }
}

module.exports = ResourceAuditLog;