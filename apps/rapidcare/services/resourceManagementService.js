const Hospital = require('../models/Hospital');
const ResourceAuditLog = require('../models/ResourceAuditLog');
const db = require('../config/database');

/**
 * ResourceManagementService
 * 
 * Handles all resource management operations including:
 * - Resource quantity updates with validation
 * - Resource availability checking
 * - Resource allocation and release
 * - Audit logging for all resource changes
 */
class ResourceManagementService {
  /**
   * Update resource quantities for a hospital
   * @param {number} hospitalId - Hospital ID
   * @param {Object} resources - Resource updates
   * @param {number} updatedBy - User making the update
   * @returns {Object} Update result with success status and updated resources
   */
  static async updateResourceQuantities(hospitalId, resources, updatedBy) {
    try {
      // Validate hospital exists
      const hospital = Hospital.findById(hospitalId);
      if (!hospital) {
        throw new Error('Hospital not found');
      }

      // Validate user permissions (this would typically check if user is hospital authority for this hospital)
      if (!updatedBy) {
        throw new Error('User ID required for resource updates');
      }

      // Validate resource data
      const validationResult = this.validateResourceUpdate(hospitalId, resources);
      if (!validationResult.valid) {
        throw new Error(validationResult.message);
      }

      // Get current resources for comparison
      const currentResources = Hospital.getResources(hospitalId);
      const currentResourceMap = {};
      currentResources.forEach(resource => {
        currentResourceMap[resource.resourceType] = resource;
      });

      // Prepare resource updates with proper structure
      const resourceUpdates = [];
      for (const [resourceType, resourceData] of Object.entries(resources)) {
        if (!['beds', 'icu', 'operationTheatres'].includes(resourceType)) {
          throw new Error(`Invalid resource type: ${resourceType}`);
        }

        const updateData = {
          resourceType,
          total: resourceData.total || 0,
          available: resourceData.available || 0,
          occupied: resourceData.occupied || 0,
          reserved: resourceData.reserved || 0,
          maintenance: resourceData.maintenance || 0
        };

        // Validate resource constraints
        if (updateData.total < 0 || updateData.available < 0 || updateData.occupied < 0) {
          throw new Error(`Resource quantities cannot be negative for ${resourceType}`);
        }

        if (updateData.available + updateData.occupied + updateData.reserved + updateData.maintenance > updateData.total) {
          throw new Error(`Sum of allocated resources exceeds total for ${resourceType}`);
        }

        resourceUpdates.push(updateData);
      }

      // Update resources using transaction
      const transaction = db.transaction(() => {
        // Update each resource type
        resourceUpdates.forEach(resourceData => {
          Hospital.updateResourceType(hospitalId, resourceData.resourceType, resourceData, updatedBy);
        });
      });

      transaction();

      // Get updated resources
      const updatedResources = Hospital.getResources(hospitalId);

      return {
        success: true,
        message: 'Resources updated successfully',
        data: {
          hospitalId,
          resources: updatedResources,
          updatedBy,
          updatedAt: new Date().toISOString()
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
   * Validate resource update data
   * @param {number} hospitalId - Hospital ID
   * @param {Object} resources - Resource data to validate
   * @returns {Object} Validation result
   */
  static validateResourceUpdate(hospitalId, resources) {
    try {
      if (!hospitalId || typeof hospitalId !== 'number') {
        return { valid: false, message: 'Valid hospital ID is required' };
      }

      if (!resources || typeof resources !== 'object') {
        return { valid: false, message: 'Resource data is required' };
      }

      // Get current bookings to check minimum available resources
      const currentBookings = this.getCurrentBookingsByHospital(hospitalId);
      const bookedResources = {};

      // Calculate currently booked resources
      currentBookings.forEach(booking => {
        if (booking.status === 'approved') {
          const resourceType = booking.resourceType;
          const quantity = booking.resourcesAllocated || 1;
          bookedResources[resourceType] = (bookedResources[resourceType] || 0) + quantity;
        }
      });

      // Validate each resource type
      for (const [resourceType, resourceData] of Object.entries(resources)) {
        if (!['beds', 'icu', 'operationTheatres'].includes(resourceType)) {
          return { valid: false, message: `Invalid resource type: ${resourceType}` };
        }

        const total = resourceData.total || 0;
        const available = resourceData.available || 0;
        const occupied = resourceData.occupied || 0;
        const reserved = resourceData.reserved || 0;
        const maintenance = resourceData.maintenance || 0;

        // Check non-negative values
        if (total < 0 || available < 0 || occupied < 0 || reserved < 0 || maintenance < 0) {
          return { valid: false, message: `All resource quantities must be non-negative for ${resourceType}` };
        }

        // Check total capacity
        if (available + occupied + reserved + maintenance > total) {
          return { 
            valid: false, 
            message: `Sum of allocated resources (${available + occupied + reserved + maintenance}) exceeds total capacity (${total}) for ${resourceType}` 
          };
        }

        // Check against current bookings
        const currentlyBooked = bookedResources[resourceType] || 0;
        if (available + occupied < currentlyBooked) {
          return { 
            valid: false, 
            message: `Cannot reduce ${resourceType} below currently booked quantity (${currentlyBooked})` 
          };
        }
      }

      return { valid: true, message: 'Resource data is valid' };

    } catch (error) {
      return { valid: false, message: `Validation error: ${error.message}` };
    }
  }

  /**
   * Check resource availability for booking
   * @param {number} hospitalId - Hospital ID
   * @param {string} resourceType - Resource type
   * @param {number} quantity - Required quantity
   * @param {Date} startDate - Booking start date
   * @param {Date} endDate - Booking end date
   * @returns {Object} Availability information
   */
  static async checkResourceAvailability(hospitalId, resourceType, quantity = 1, startDate = null, endDate = null) {
    try {
      const availability = Hospital.checkResourceAvailability(hospitalId, resourceType, quantity);
      
      // If dates are provided, check for overlapping bookings
      if (startDate && endDate) {
        const overlappingBookings = this.getOverlappingBookings(hospitalId, resourceType, startDate, endDate);
        const overlappingQuantity = overlappingBookings.reduce((sum, booking) => 
          sum + (booking.resourcesAllocated || 1), 0
        );
        
        availability.availableForPeriod = Math.max(0, availability.currentAvailable - overlappingQuantity);
        availability.overlappingBookings = overlappingBookings.length;
      }

      return {
        success: true,
        data: availability
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
   * Allocate resources for a booking
   * @param {number} hospitalId - Hospital ID
   * @param {string} resourceType - Resource type
   * @param {number} quantity - Quantity to allocate
   * @param {number} bookingId - Booking ID
   * @param {number} allocatedBy - User allocating resources
   * @returns {Object} Allocation result
   */
  static async allocateResources(hospitalId, resourceType, quantity, bookingId, allocatedBy) {
    try {
      // Check availability first
      const availability = await this.checkResourceAvailability(hospitalId, resourceType, quantity);
      if (!availability.success || !availability.data.available) {
        throw new Error(availability.data.message || 'Insufficient resources available');
      }

      // Allocate resources
      Hospital.allocateResources(hospitalId, resourceType, quantity, bookingId, allocatedBy);

      return {
        success: true,
        message: 'Resources allocated successfully',
        data: {
          hospitalId,
          resourceType,
          quantity,
          bookingId,
          allocatedBy,
          allocatedAt: new Date().toISOString()
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
   * Release resources from a booking
   * @param {number} hospitalId - Hospital ID
   * @param {string} resourceType - Resource type
   * @param {number} quantity - Quantity to release
   * @param {number} bookingId - Booking ID
   * @param {number} releasedBy - User releasing resources
   * @param {string} reason - Reason for release
   * @returns {Object} Release result
   */
  static async releaseResources(hospitalId, resourceType, quantity, bookingId, releasedBy, reason = 'completed') {
    try {
      // Release resources
      Hospital.releaseResources(hospitalId, resourceType, quantity, bookingId, releasedBy, reason);

      return {
        success: true,
        message: 'Resources released successfully',
        data: {
          hospitalId,
          resourceType,
          quantity,
          bookingId,
          releasedBy,
          reason,
          releasedAt: new Date().toISOString()
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
   * Get resource history for a hospital
   * @param {number} hospitalId - Hospital ID
   * @param {Object} options - Query options
   * @returns {Object} Resource history
   */
  static async getResourceHistory(hospitalId, options = {}) {
    try {
      const history = ResourceAuditLog.getByHospital(hospitalId, options);
      const totalCount = ResourceAuditLog.count(hospitalId, options);

      return {
        success: true,
        data: {
          history,
          totalCount,
          options
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
   * Get resource utilization statistics
   * @param {number} hospitalId - Hospital ID
   * @param {Object} options - Query options
   * @returns {Object} Utilization statistics
   */
  static async getResourceUtilization(hospitalId, options = {}) {
    try {
      const utilization = Hospital.getResourceUtilization(hospitalId);
      const statistics = ResourceAuditLog.getChangeStatistics(hospitalId, options);

      return {
        success: true,
        data: {
          current: utilization,
          statistics,
          hospitalId
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
   * Get hospitals with available resources
   * @param {string} resourceType - Resource type filter
   * @param {number} minQuantity - Minimum available quantity
   * @param {Object} options - Additional options
   * @returns {Object} Hospitals with available resources
   */
  static async getHospitalsWithAvailableResources(resourceType = null, minQuantity = 1, options = {}) {
    try {
      const hospitals = Hospital.getWithAvailableResources(resourceType, minQuantity);

      return {
        success: true,
        data: {
          hospitals,
          filters: {
            resourceType,
            minQuantity
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
   * Perform resource maintenance update
   * @param {number} hospitalId - Hospital ID
   * @param {string} resourceType - Resource type
   * @param {number} maintenanceCount - Number of resources under maintenance
   * @param {number} updatedBy - User making the update
   * @param {string} reason - Reason for maintenance
   * @returns {Object} Update result
   */
  static async updateMaintenanceResources(hospitalId, resourceType, maintenanceCount, updatedBy, reason = 'Scheduled maintenance') {
    try {
      // Get current resource data
      const currentResources = Hospital.getResources(hospitalId);
      const currentResource = currentResources.find(r => r.resourceType === resourceType);
      
      if (!currentResource) {
        throw new Error(`Resource type ${resourceType} not found for hospital`);
      }

      // Calculate new available count
      const newAvailable = Math.max(0, currentResource.total - currentResource.occupied - maintenanceCount);
      
      // Update resource
      const updateData = {
        total: currentResource.total,
        available: newAvailable,
        occupied: currentResource.occupied,
        reserved: currentResource.reserved || 0,
        maintenance: maintenanceCount
      };

      const result = await this.updateResourceQuantities(hospitalId, {
        [resourceType]: updateData
      }, updatedBy);

      if (result.success) {
        // Log maintenance update
        ResourceAuditLog.create({
          hospitalId,
          resourceType,
          changeType: 'system_adjustment',
          oldValue: currentResource.maintenance || 0,
          newValue: maintenanceCount,
          quantity: maintenanceCount - (currentResource.maintenance || 0),
          changedBy: updatedBy,
          reason: reason
        });
      }

      return result;

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
   * Get current bookings for a hospital
   * @param {number} hospitalId - Hospital ID
   * @returns {Array} Current bookings
   */
  static getCurrentBookingsByHospital(hospitalId) {
    const stmt = db.prepare(`
      SELECT * FROM bookings 
      WHERE hospitalId = ? AND status IN ('pending', 'approved')
    `);
    return stmt.all(hospitalId);
  }

  /**
   * Get overlapping bookings for a time period
   * @param {number} hospitalId - Hospital ID
   * @param {string} resourceType - Resource type
   * @param {Date} startDate - Period start date
   * @param {Date} endDate - Period end date
   * @returns {Array} Overlapping bookings
   */
  static getOverlappingBookings(hospitalId, resourceType, startDate, endDate) {
    const stmt = db.prepare(`
      SELECT * FROM bookings 
      WHERE hospitalId = ? 
      AND resourceType = ? 
      AND status = 'approved'
      AND scheduledDate < ?
      AND datetime(scheduledDate, '+' || estimatedDuration || ' hours') > ?
    `);
    return stmt.all(hospitalId, resourceType, endDate, startDate);
  }

  /**
   * Validate user permissions for hospital resource management
   * @param {number} userId - User ID
   * @param {number} hospitalId - Hospital ID
   * @returns {boolean} Permission status
   */
  static async validateUserPermissions(userId, hospitalId) {
    try {
      const stmt = db.prepare(`
        SELECT ha.* FROM hospital_authorities ha
        WHERE ha.userId = ? AND ha.hospitalId = ?
      `);
      const authority = stmt.get(userId, hospitalId);
      
      return authority !== null;

    } catch (error) {
      return false;
    }
  }

  /**
   * Get resource change summary for a time period
   * @param {number} hospitalId - Hospital ID
   * @param {Date} startDate - Start date
   * @param {Date} endDate - End date
   * @returns {Object} Change summary
   */
  static async getResourceChangeSummary(hospitalId, startDate, endDate) {
    try {
      const changes = ResourceAuditLog.getByHospital(hospitalId, {
        startDate,
        endDate
      });

      const summary = {
        totalChanges: changes.length,
        byResourceType: {},
        byChangeType: {},
        netChanges: {}
      };

      changes.forEach(change => {
        // By resource type
        if (!summary.byResourceType[change.resourceType]) {
          summary.byResourceType[change.resourceType] = 0;
        }
        summary.byResourceType[change.resourceType]++;

        // By change type
        if (!summary.byChangeType[change.changeType]) {
          summary.byChangeType[change.changeType] = 0;
        }
        summary.byChangeType[change.changeType]++;

        // Net changes
        if (!summary.netChanges[change.resourceType]) {
          summary.netChanges[change.resourceType] = 0;
        }
        summary.netChanges[change.resourceType] += change.quantity || 0;
      });

      return {
        success: true,
        data: summary
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

module.exports = ResourceManagementService;