const db = require('../config/database');
const Hospital = require('../models/Hospital');
const Booking = require('../models/Booking');
const ResourceAuditLog = require('../models/ResourceAuditLog');

/**
 * PollingService
 * 
 * Handles polling-based real-time updates for resource status and booking changes.
 * Provides efficient data change detection and timestamp-based filtering.
 */
class PollingService {
  /**
   * Get resource updates since a specific timestamp
   * @param {number} hospitalId - Hospital ID (optional, for specific hospital)
   * @param {string} lastUpdate - ISO timestamp of last update
   * @param {Array} resourceTypes - Array of resource types to filter
   * @returns {Object} Resource updates with change detection
   */
  static getResourceUpdates(hospitalId = null, lastUpdate = null, resourceTypes = null) {
    try {
      let query = `
        SELECT 
          hr.hospitalId,
          hr.resourceType,
          hr.total,
          hr.available,
          hr.occupied,
          hr.reserved,
          hr.maintenance,
          hr.lastUpdated,
          hr.updatedBy,
          h.name as hospitalName
        FROM hospital_resources hr
        INNER JOIN hospitals h ON hr.hospitalId = h.id
        WHERE h.isActive = 1
      `;
      
      const params = [];
      
      // Filter by hospital if specified
      if (hospitalId) {
        query += ' AND hr.hospitalId = ?';
        params.push(hospitalId);
      }
      
      // Filter by timestamp if specified
      if (lastUpdate) {
        query += ' AND hr.lastUpdated > ?';
        params.push(lastUpdate);
      }
      
      // Filter by resource types if specified
      if (resourceTypes && resourceTypes.length > 0) {
        const placeholders = resourceTypes.map(() => '?').join(',');
        query += ` AND hr.resourceType IN (${placeholders})`;
        params.push(...resourceTypes);
      }
      
      query += ' ORDER BY hr.lastUpdated DESC';
      
      const stmt = db.prepare(query);
      const resources = stmt.all(...params);
      
      // Get current timestamp for next polling
      const currentTimestamp = new Date().toISOString();
      
      // Calculate change indicators
      const hasChanges = resources.length > 0;
      const changesByHospital = {};
      const changesByResourceType = {};
      
      resources.forEach(resource => {
        // Group by hospital
        if (!changesByHospital[resource.hospitalId]) {
          changesByHospital[resource.hospitalId] = {
            hospitalId: resource.hospitalId,
            hospitalName: resource.hospitalName,
            resources: [],
            lastUpdated: resource.lastUpdated
          };
        }
        changesByHospital[resource.hospitalId].resources.push({
          resourceType: resource.resourceType,
          total: resource.total,
          available: resource.available,
          occupied: resource.occupied,
          reserved: resource.reserved || 0,
          maintenance: resource.maintenance || 0,
          lastUpdated: resource.lastUpdated,
          updatedBy: resource.updatedBy
        });
        
        // Group by resource type
        if (!changesByResourceType[resource.resourceType]) {
          changesByResourceType[resource.resourceType] = [];
        }
        changesByResourceType[resource.resourceType].push({
          hospitalId: resource.hospitalId,
          hospitalName: resource.hospitalName,
          total: resource.total,
          available: resource.available,
          occupied: resource.occupied,
          reserved: resource.reserved || 0,
          maintenance: resource.maintenance || 0,
          lastUpdated: resource.lastUpdated
        });
      });
      
      return {
        success: true,
        data: {
          hasChanges,
          totalChanges: resources.length,
          currentTimestamp,
          lastPolled: lastUpdate,
          changes: {
            byHospital: Object.values(changesByHospital),
            byResourceType: changesByResourceType,
            raw: resources
          }
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
   * Get booking status updates since a specific timestamp
   * @param {number} hospitalId - Hospital ID (optional, for specific hospital)
   * @param {string} lastUpdate - ISO timestamp of last update
   * @param {Array} statuses - Array of statuses to filter
   * @returns {Object} Booking updates with change detection
   */
  static getBookingUpdates(hospitalId = null, lastUpdate = null, statuses = null) {
    try {
      let query = `
        SELECT 
          b.id,
          b.userId,
          b.hospitalId,
          b.resourceType,
          b.patientName,
          b.urgency,
          b.status,
          b.approvedBy,
          b.approvedAt,
          b.declineReason,
          b.authorityNotes,
          b.resourcesAllocated,
          b.updatedAt,
          b.createdAt,
          h.name as hospitalName,
          u.name as userName,
          approver.name as approverName
        FROM bookings b
        INNER JOIN hospitals h ON b.hospitalId = h.id
        LEFT JOIN users u ON b.userId = u.id
        LEFT JOIN users approver ON b.approvedBy = approver.id
        WHERE h.isActive = 1
      `;
      
      const params = [];
      
      // Filter by hospital if specified
      if (hospitalId) {
        query += ' AND b.hospitalId = ?';
        params.push(hospitalId);
      }
      
      // Filter by timestamp if specified
      if (lastUpdate) {
        query += ' AND b.updatedAt > ?';
        params.push(lastUpdate);
      }
      
      // Filter by statuses if specified
      if (statuses && statuses.length > 0) {
        const placeholders = statuses.map(() => '?').join(',');
        query += ` AND b.status IN (${placeholders})`;
        params.push(...statuses);
      }
      
      query += ' ORDER BY b.updatedAt DESC';
      
      const stmt = db.prepare(query);
      const bookings = stmt.all(...params);
      
      // Get current timestamp for next polling
      const currentTimestamp = new Date().toISOString();
      
      // Calculate change indicators
      const hasChanges = bookings.length > 0;
      const changesByHospital = {};
      const changesByStatus = {};
      const changesByUrgency = {};
      
      bookings.forEach(booking => {
        // Group by hospital
        if (!changesByHospital[booking.hospitalId]) {
          changesByHospital[booking.hospitalId] = {
            hospitalId: booking.hospitalId,
            hospitalName: booking.hospitalName,
            bookings: []
          };
        }
        changesByHospital[booking.hospitalId].bookings.push(booking);
        
        // Group by status
        if (!changesByStatus[booking.status]) {
          changesByStatus[booking.status] = [];
        }
        changesByStatus[booking.status].push(booking);
        
        // Group by urgency
        if (!changesByUrgency[booking.urgency]) {
          changesByUrgency[booking.urgency] = [];
        }
        changesByUrgency[booking.urgency].push(booking);
      });
      
      return {
        success: true,
        data: {
          hasChanges,
          totalChanges: bookings.length,
          currentTimestamp,
          lastPolled: lastUpdate,
          changes: {
            byHospital: Object.values(changesByHospital),
            byStatus: changesByStatus,
            byUrgency: changesByUrgency,
            raw: bookings
          }
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
   * Get combined resource and booking updates
   * @param {number} hospitalId - Hospital ID (optional, for specific hospital)
   * @param {string} lastUpdate - ISO timestamp of last update
   * @param {Object} options - Additional filtering options
   * @returns {Object} Combined updates with change detection
   */
  static getCombinedUpdates(hospitalId = null, lastUpdate = null, options = {}) {
    try {
      const resourceUpdates = this.getResourceUpdates(
        hospitalId, 
        lastUpdate, 
        options.resourceTypes
      );
      
      const bookingUpdates = this.getBookingUpdates(
        hospitalId, 
        lastUpdate, 
        options.bookingStatuses
      );
      
      if (!resourceUpdates.success || !bookingUpdates.success) {
        throw new Error('Failed to fetch updates');
      }
      
      const hasChanges = resourceUpdates.data.hasChanges || bookingUpdates.data.hasChanges;
      const currentTimestamp = new Date().toISOString();
      
      return {
        success: true,
        data: {
          hasChanges,
          currentTimestamp,
          lastPolled: lastUpdate,
          resources: resourceUpdates.data,
          bookings: bookingUpdates.data,
          summary: {
            totalResourceChanges: resourceUpdates.data.totalChanges,
            totalBookingChanges: bookingUpdates.data.totalChanges,
            totalChanges: resourceUpdates.data.totalChanges + bookingUpdates.data.totalChanges
          }
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
   * Get resource audit log updates since a specific timestamp
   * @param {number} hospitalId - Hospital ID (optional, for specific hospital)
   * @param {string} lastUpdate - ISO timestamp of last update
   * @param {Object} options - Additional filtering options
   * @returns {Object} Audit log updates
   */
  static getAuditLogUpdates(hospitalId = null, lastUpdate = null, options = {}) {
    try {
      let query = `
        SELECT 
          ral.*,
          h.name as hospitalName,
          u.name as changedByName
        FROM resource_audit_log ral
        INNER JOIN hospitals h ON ral.hospitalId = h.id
        LEFT JOIN users u ON ral.changedBy = u.id
        WHERE h.isActive = 1
      `;
      
      const params = [];
      
      // Filter by hospital if specified
      if (hospitalId) {
        query += ' AND ral.hospitalId = ?';
        params.push(hospitalId);
      }
      
      // Filter by timestamp if specified
      if (lastUpdate) {
        query += ' AND ral.timestamp > ?';
        params.push(lastUpdate);
      }
      
      // Filter by change type if specified
      if (options.changeTypes && options.changeTypes.length > 0) {
        const placeholders = options.changeTypes.map(() => '?').join(',');
        query += ` AND ral.changeType IN (${placeholders})`;
        params.push(...options.changeTypes);
      }
      
      // Filter by resource type if specified
      if (options.resourceTypes && options.resourceTypes.length > 0) {
        const placeholders = options.resourceTypes.map(() => '?').join(',');
        query += ` AND ral.resourceType IN (${placeholders})`;
        params.push(...options.resourceTypes);
      }
      
      query += ' ORDER BY ral.timestamp DESC';
      
      if (options.limit) {
        query += ' LIMIT ?';
        params.push(options.limit);
      }
      
      const stmt = db.prepare(query);
      const auditLogs = stmt.all(...params);
      
      const currentTimestamp = new Date().toISOString();
      const hasChanges = auditLogs.length > 0;
      
      // Group by change type for analysis
      const changesByType = {};
      auditLogs.forEach(log => {
        if (!changesByType[log.changeType]) {
          changesByType[log.changeType] = [];
        }
        changesByType[log.changeType].push(log);
      });
      
      return {
        success: true,
        data: {
          hasChanges,
          totalChanges: auditLogs.length,
          currentTimestamp,
          lastPolled: lastUpdate,
          changes: {
            byType: changesByType,
            raw: auditLogs
          }
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
   * Get hospital-specific dashboard updates
   * @param {number} hospitalId - Hospital ID
   * @param {string} lastUpdate - ISO timestamp of last update
   * @param {Object} options - Additional options
   * @returns {Object} Hospital dashboard updates
   */
  static getHospitalDashboardUpdates(hospitalId, lastUpdate = null, options = {}) {
    try {
      if (!hospitalId) {
        throw new Error('Hospital ID is required');
      }
      
      // Get combined updates for this hospital
      const combinedUpdates = this.getCombinedUpdates(hospitalId, lastUpdate, options);
      
      if (!combinedUpdates.success) {
        throw new Error('Failed to fetch hospital updates');
      }
      
      // Get current resource status
      const currentResources = Hospital.getResources(hospitalId);
      const resourceUtilization = Hospital.getResourceUtilization(hospitalId);
      
      // Get pending bookings count
      const pendingBookingsStmt = db.prepare(`
        SELECT COUNT(*) as count FROM bookings 
        WHERE hospitalId = ? AND status = 'pending'
      `);
      const pendingBookingsCount = pendingBookingsStmt.get(hospitalId).count;
      
      // Get recent activity summary
      const recentActivityStmt = db.prepare(`
        SELECT 
          'booking' as type,
          status as subtype,
          COUNT(*) as count,
          MAX(updatedAt) as lastActivity
        FROM bookings 
        WHERE hospitalId = ? AND updatedAt > datetime('now', '-1 hour')
        GROUP BY status
        UNION ALL
        SELECT 
          'resource' as type,
          changeType as subtype,
          COUNT(*) as count,
          MAX(timestamp) as lastActivity
        FROM resource_audit_log 
        WHERE hospitalId = ? AND timestamp > datetime('now', '-1 hour')
        GROUP BY changeType
      `);
      const recentActivity = recentActivityStmt.all(hospitalId, hospitalId);
      
      return {
        success: true,
        data: {
          ...combinedUpdates.data,
          dashboard: {
            currentResources,
            resourceUtilization,
            pendingBookingsCount,
            recentActivity,
            lastUpdated: new Date().toISOString()
          }
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
   * Check if there are any changes since last update
   * @param {number} hospitalId - Hospital ID (optional)
   * @param {string} lastUpdate - ISO timestamp of last update
   * @returns {Object} Change detection result
   */
  static hasChanges(hospitalId = null, lastUpdate = null) {
    try {
      if (!lastUpdate) {
        return {
          success: true,
          data: {
            hasChanges: true,
            reason: 'No previous timestamp provided'
          }
        };
      }
      
      // Check for resource changes
      let resourceQuery = `
        SELECT COUNT(*) as count FROM hospital_resources hr
        INNER JOIN hospitals h ON hr.hospitalId = h.id
        WHERE h.isActive = 1 AND hr.lastUpdated > ?
      `;
      const resourceParams = [lastUpdate];
      
      if (hospitalId) {
        resourceQuery += ' AND hr.hospitalId = ?';
        resourceParams.push(hospitalId);
      }
      
      const resourceStmt = db.prepare(resourceQuery);
      const resourceChanges = resourceStmt.get(...resourceParams).count;
      
      // Check for booking changes
      let bookingQuery = `
        SELECT COUNT(*) as count FROM bookings b
        INNER JOIN hospitals h ON b.hospitalId = h.id
        WHERE h.isActive = 1 AND b.updatedAt > ?
      `;
      const bookingParams = [lastUpdate];
      
      if (hospitalId) {
        bookingQuery += ' AND b.hospitalId = ?';
        bookingParams.push(hospitalId);
      }
      
      const bookingStmt = db.prepare(bookingQuery);
      const bookingChanges = bookingStmt.get(...bookingParams).count;
      
      const hasChanges = resourceChanges > 0 || bookingChanges > 0;
      
      return {
        success: true,
        data: {
          hasChanges,
          resourceChanges,
          bookingChanges,
          totalChanges: resourceChanges + bookingChanges,
          lastChecked: new Date().toISOString()
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
   * Get polling configuration recommendations
   * @param {number} hospitalId - Hospital ID (optional)
   * @param {Object} options - Configuration options
   * @returns {Object} Polling configuration recommendations
   */
  static getPollingConfig(hospitalId = null, options = {}) {
    try {
      // Analyze activity patterns to recommend polling intervals
      let activityQuery = `
        SELECT 
          COUNT(*) as totalChanges,
          AVG(julianday('now') - julianday(hr.lastUpdated)) * 24 * 60 as avgMinutesSinceUpdate,
          MIN(hr.lastUpdated) as oldestUpdate,
          MAX(hr.lastUpdated) as newestUpdate
        FROM hospital_resources hr
        INNER JOIN hospitals h ON hr.hospitalId = h.id
        WHERE h.isActive = 1
      `;
      
      const params = [];
      if (hospitalId) {
        activityQuery += ' AND hr.hospitalId = ?';
        params.push(hospitalId);
      }
      
      const stmt = db.prepare(activityQuery);
      const activity = stmt.get(...params);
      
      // Recommend polling interval based on activity
      let recommendedInterval = 30000; // Default 30 seconds
      
      if (activity && activity.avgMinutesSinceUpdate !== null) {
        if (activity.avgMinutesSinceUpdate < 5) {
          recommendedInterval = 10000; // High activity: 10 seconds
        } else if (activity.avgMinutesSinceUpdate < 15) {
          recommendedInterval = 20000; // Medium activity: 20 seconds
        } else if (activity.avgMinutesSinceUpdate > 60) {
          recommendedInterval = 60000; // Low activity: 1 minute
        }
      }
      
      return {
        success: true,
        data: {
          recommendedInterval,
          activityAnalysis: activity,
          configuration: {
            minInterval: 5000,   // Minimum 5 seconds
            maxInterval: 300000, // Maximum 5 minutes
            defaultInterval: 30000,
            adaptivePolling: true
          }
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

module.exports = PollingService;