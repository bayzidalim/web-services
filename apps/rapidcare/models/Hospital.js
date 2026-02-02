const db = require('../config/database');
const ResourceAuditLog = require('./ResourceAuditLog');

class Hospital {
  static create(hospitalData) {
    const stmt = db.prepare(`
      INSERT INTO hospitals (name, street, city, state, zipCode, country, phone, email, emergency)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    const result = stmt.run(
      hospitalData.name,
      hospitalData.street,
      hospitalData.city,
      hospitalData.state,
      hospitalData.zipCode,
      hospitalData.country,
      hospitalData.phone,
      hospitalData.email,
      hospitalData.emergency
    );
    
    return result.lastInsertRowid;
  }

  static findById(id) {
    const stmt = db.prepare('SELECT * FROM hospitals WHERE id = ?');
    return stmt.get(id);
  }

  static getAll() {
    const stmt = db.prepare('SELECT * FROM hospitals WHERE isActive = 1 ORDER BY name');
    return stmt.all();
  }

  static search(searchTerm) {
    const stmt = db.prepare(`
      SELECT * FROM hospitals 
      WHERE isActive = 1 
      AND (name LIKE ? OR city LIKE ? OR state LIKE ?)
      ORDER BY name
    `);
    const searchPattern = `%${searchTerm}%`;
    return stmt.all(searchPattern, searchPattern, searchPattern);
  }

  static update(id, updateData) {
    const stmt = db.prepare(`
      UPDATE hospitals 
      SET name = ?, street = ?, city = ?, state = ?, zipCode = ?, 
          country = ?, phone = ?, email = ?, emergency = ?, 
          lastUpdated = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    
    return stmt.run(
      updateData.name,
      updateData.street,
      updateData.city,
      updateData.state,
      updateData.zipCode,
      updateData.country,
      updateData.phone,
      updateData.email,
      updateData.emergency,
      id
    );
  }

  static delete(id) {
    const stmt = db.prepare('UPDATE hospitals SET isActive = 0 WHERE id = ?');
    return stmt.run(id);
  }

  static getWithResources() {
    const stmt = db.prepare(`
      SELECT h.*, 
             hr.resourceType,
             hr.total,
             hr.available,
             hr.occupied
      FROM hospitals h
      LEFT JOIN hospital_resources hr ON h.id = hr.hospitalId
      WHERE h.isActive = 1
      ORDER BY h.name, hr.resourceType
    `);
    return stmt.all();
  }

  static getResources(hospitalId) {
    const stmt = db.prepare(`
      SELECT * FROM hospital_resources 
      WHERE hospitalId = ?
      ORDER BY resourceType
    `);
    return stmt.all(hospitalId);
  }

  static updateResources(hospitalId, resources, updatedBy = null) {
    const transaction = db.transaction(() => {
      // Get current resources for audit logging
      const currentResources = this.getResources(hospitalId);
      const currentResourceMap = {};
      currentResources.forEach(resource => {
        currentResourceMap[resource.resourceType] = resource;
      });

      // Delete existing resources
      const deleteStmt = db.prepare('DELETE FROM hospital_resources WHERE hospitalId = ?');
      deleteStmt.run(hospitalId);

      // Insert new resources and log changes
      const insertStmt = db.prepare(`
        INSERT INTO hospital_resources (
          hospitalId, resourceType, total, available, occupied, 
          reserved, maintenance, lastUpdated, updatedBy
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?)
      `);

      resources.forEach(resource => {
        insertStmt.run(
          hospitalId,
          resource.resourceType,
          resource.total,
          resource.available,
          resource.occupied,
          resource.reserved || 0,
          resource.maintenance || 0,
          updatedBy
        );

        // Log the change if there's a difference and updatedBy is provided
        if (updatedBy && currentResourceMap[resource.resourceType]) {
          const oldResource = currentResourceMap[resource.resourceType];
          if (oldResource.available !== resource.available) {
            ResourceAuditLog.logManualUpdate(
              hospitalId,
              resource.resourceType,
              oldResource.available,
              resource.available,
              updatedBy,
              'Resource quantity updated via hospital management'
            );
          }
        }
      });
    });

    transaction();
  }

  /**
   * Update a specific resource type for a hospital
   * @param {number} hospitalId - Hospital ID
   * @param {string} resourceType - Resource type (beds, icu, operationTheatres)
   * @param {Object} resourceData - Resource data
   * @param {number} updatedBy - User who made the update
   * @returns {boolean} Success status
   */
  static updateResourceType(hospitalId, resourceType, resourceData, updatedBy) {
    const transaction = db.transaction(() => {
      // Get current resource for audit logging
      const currentStmt = db.prepare(`
        SELECT * FROM hospital_resources 
        WHERE hospitalId = ? AND resourceType = ?
      `);
      const currentResource = currentStmt.get(hospitalId, resourceType);

      // Update or insert resource
      const upsertStmt = db.prepare(`
        INSERT OR REPLACE INTO hospital_resources (
          hospitalId, resourceType, total, available, occupied, 
          reserved, maintenance, lastUpdated, updatedBy
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?)
      `);

      upsertStmt.run(
        hospitalId,
        resourceType,
        resourceData.total,
        resourceData.available,
        resourceData.occupied || 0,
        resourceData.reserved || 0,
        resourceData.maintenance || 0,
        updatedBy
      );

      // Log the change
      if (currentResource && currentResource.available !== resourceData.available) {
        ResourceAuditLog.logManualUpdate(
          hospitalId,
          resourceType,
          currentResource.available,
          resourceData.available,
          updatedBy,
          'Individual resource type updated'
        );
      }
    });

    transaction();
    return true;
  }

  /**
   * Allocate resources for a booking
   * @param {number} hospitalId - Hospital ID
   * @param {string} resourceType - Resource type
   * @param {number} quantity - Quantity to allocate
   * @param {number} bookingId - Booking ID
   * @param {number} allocatedBy - User who allocated the resources
   * @returns {boolean} Success status
   */
  static allocateResources(hospitalId, resourceType, quantity, bookingId, allocatedBy) {
    const transaction = db.transaction(() => {
      // Get current resource
      const stmt = db.prepare(`
        SELECT * FROM hospital_resources 
        WHERE hospitalId = ? AND resourceType = ?
      `);
      const resource = stmt.get(hospitalId, resourceType);

      if (!resource || resource.available < quantity) {
        throw new Error('Insufficient resources available');
      }

      // Update resource quantities
      const updateStmt = db.prepare(`
        UPDATE hospital_resources 
        SET available = available - ?, 
            occupied = occupied + ?,
            lastUpdated = CURRENT_TIMESTAMP,
            updatedBy = ?
        WHERE hospitalId = ? AND resourceType = ?
      `);

      updateStmt.run(quantity, quantity, allocatedBy, hospitalId, resourceType);

      // Log the allocation
      ResourceAuditLog.logBookingApproval(
        hospitalId,
        resourceType,
        quantity,
        bookingId,
        allocatedBy
      );
    });

    transaction();
    return true;
  }

  /**
   * Release resources from a booking
   * @param {number} hospitalId - Hospital ID
   * @param {string} resourceType - Resource type
   * @param {number} quantity - Quantity to release
   * @param {number} bookingId - Booking ID
   * @param {number} releasedBy - User who released the resources
   * @param {string} reason - Reason for release (completion, cancellation)
   * @returns {boolean} Success status
   */
  static releaseResources(hospitalId, resourceType, quantity, bookingId, releasedBy, reason = 'completed') {
    const transaction = db.transaction(() => {
      // Update resource quantities
      const updateStmt = db.prepare(`
        UPDATE hospital_resources 
        SET available = available + ?, 
            occupied = occupied - ?,
            lastUpdated = CURRENT_TIMESTAMP,
            updatedBy = ?
        WHERE hospitalId = ? AND resourceType = ?
      `);

      updateStmt.run(quantity, quantity, releasedBy, hospitalId, resourceType);

      // Log the release
      if (reason === 'completed') {
        ResourceAuditLog.logBookingCompletion(
          hospitalId,
          resourceType,
          quantity,
          bookingId,
          releasedBy
        );
      } else {
        ResourceAuditLog.logBookingCancellation(
          hospitalId,
          resourceType,
          quantity,
          bookingId,
          releasedBy
        );
      }
    });

    transaction();
    return true;
  }

  /**
   * Check resource availability
   * @param {number} hospitalId - Hospital ID
   * @param {string} resourceType - Resource type
   * @param {number} quantity - Required quantity
   * @returns {Object} Availability information
   */
  static checkResourceAvailability(hospitalId, resourceType, quantity = 1) {
    const stmt = db.prepare(`
      SELECT * FROM hospital_resources 
      WHERE hospitalId = ? AND resourceType = ?
    `);
    const resource = stmt.get(hospitalId, resourceType);

    if (!resource) {
      return {
        available: false,
        currentAvailable: 0,
        requested: quantity,
        message: 'Resource type not found'
      };
    }

    return {
      available: resource.available >= quantity,
      currentAvailable: resource.available,
      requested: quantity,
      total: resource.total,
      occupied: resource.occupied,
      reserved: resource.reserved || 0,
      maintenance: resource.maintenance || 0,
      message: resource.available >= quantity 
        ? 'Resources available' 
        : `Only ${resource.available} of ${quantity} requested resources available`
    };
  }

  /**
   * Get resource utilization statistics
   * @param {number} hospitalId - Hospital ID
   * @returns {Object} Utilization statistics
   */
  static getResourceUtilization(hospitalId) {
    const stmt = db.prepare(`
      SELECT 
        resourceType,
        total,
        available,
        occupied,
        reserved,
        maintenance,
        ROUND((CAST(occupied AS REAL) / CAST(total AS REAL)) * 100, 2) as utilizationPercentage,
        lastUpdated
      FROM hospital_resources 
      WHERE hospitalId = ?
      ORDER BY resourceType
    `);
    return stmt.all(hospitalId);
  }

  /**
   * Get hospitals with available resources
   * @param {string} resourceType - Resource type to filter by
   * @param {number} minQuantity - Minimum available quantity
   * @returns {Array} Hospitals with available resources
   */
  static getWithAvailableResources(resourceType = null, minQuantity = 1) {
    let query = `
      SELECT h.*, hr.resourceType, hr.total, hr.available, hr.occupied
      FROM hospitals h
      INNER JOIN hospital_resources hr ON h.id = hr.hospitalId
      WHERE h.isActive = 1 AND hr.available >= ?
    `;
    
    const params = [minQuantity];
    
    if (resourceType) {
      query += ' AND hr.resourceType = ?';
      params.push(resourceType);
    }
    
    query += ' ORDER BY h.name, hr.resourceType';
    
    const stmt = db.prepare(query);
    return stmt.all(...params);
  }

  static count(options = {}) {
    let query = 'SELECT COUNT(*) as count FROM hospitals';
    const params = [];
    if (options.where) {
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

  /**
   * Update hospital rating based on average of reviews
   * @param {number} hospitalId - Hospital ID
   * @returns {number|null} Updated rating or null on error
   */
  static updateRating(hospitalId) {
    try {
      // Calculate average rating from reviews
      const stats = db.prepare(`
        SELECT AVG(rating) as averageRating
        FROM reviews
        WHERE hospitalId = ? AND isActive = 1
      `).get(hospitalId);

      const rating = stats?.averageRating || 0;

      // Update hospital rating
      const stmt = db.prepare(`
        UPDATE hospitals 
        SET rating = ?, updatedAt = CURRENT_TIMESTAMP
        WHERE id = ?
      `);
      
      stmt.run(rating, hospitalId);
      return rating;
    } catch (error) {
      console.error('Error updating hospital rating:', error);
      return null;
    }
  }
}

module.exports = Hospital; 