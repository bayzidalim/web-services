const HospitalService = require('../services/hospitalService');
const ResourceManagementService = require('../services/resourceManagementService');
const BookingApprovalService = require('../services/bookingApprovalService');
const PollingService = require('../services/pollingService');
const AnalyticsService = require('../services/analyticsService');
const UserService = require('../services/userService');

// Get all hospitals (public)
exports.getAllHospitals = async (req, res) => {
  try {
    const hospitals = HospitalService.getAll();
    
    res.json({
      success: true,
      data: hospitals,
      count: hospitals.length
    });
  } catch (error) {
    console.error('Error fetching hospitals:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch hospitals'
    });
  }
};

// Get specific hospital by ID
exports.getHospitalById = async (req, res) => {
  try {
    // Allow admins and hospital authorities to see unapproved hospitals
    const includeUnapproved = req.user && (req.user.userType === 'admin' || req.user.userType === 'hospital-authority');
    const hospital = HospitalService.getById(req.params.id, includeUnapproved);
    
    if (!hospital) {
      return res.status(404).json({
        success: false,
        error: 'Hospital not found'
      });
    }
    
    res.json({
      success: true,
      data: hospital
    });
  } catch (error) {
    console.error('Error fetching hospital:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch hospital'
    });
  }
};

// Get hospitals with available resources
exports.getHospitalsWithResources = async (req, res) => {
  try {
    const { resourceType, minAvailable = 1 } = req.query;
    
    if (resourceType && !['beds', 'icu', 'operationTheatres'].includes(resourceType)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid resource type. Must be beds, icu, or operationTheatres'
      });
    }
    
    const hospitals = HospitalService.getWithResources({ resourceType, minAvailable });
    
    res.json({
      success: true,
      data: hospitals,
      count: hospitals.length
    });
  } catch (error) {
    console.error('Error fetching hospitals with resources:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch hospitals with resources'
    });
  }
};

// Create new hospital (for hospital authority use)
exports.createHospital = async (req, res) => {
  try {
    const hospital = HospitalService.create(req.body);
    
    res.status(201).json({
      success: true,
      data: hospital
    });
  } catch (error) {
    console.error('Error creating hospital:', error);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
};

// Update hospital resources (for hospital authority use)
exports.updateHospitalResources = async (req, res) => {
  try {
    const { id } = req.params;
    const hospitalId = parseInt(id);
    
    // Check if user has permission to update this hospital
    if (req.user.userType === 'hospital-authority' && req.user.hospital_id !== hospitalId) {
      return res.status(403).json({
        success: false,
        error: 'You can only update your assigned hospital'
      });
    }
    
    // Use ResourceManagementService for enhanced resource management
    const result = await ResourceManagementService.updateResourceQuantities(
      hospitalId, 
      req.body, 
      req.user.id
    );
    
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
    console.error('Error updating hospital resources:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update hospital resources'
    });
  }
};

// Search hospitals
exports.searchHospitals = async (req, res) => {
  try {
    const { q, city, service } = req.query;
    const hospitals = HospitalService.search({ q, city, service });
    
    res.json({
      success: true,
      data: hospitals,
      count: hospitals.length
    });
  } catch (error) {
    console.error('Error searching hospitals:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to search hospitals'
    });
  }
};

// Update hospital
exports.updateHospital = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check if user has permission to update this hospital
    if (req.user.userType === 'hospital-authority' && req.user.hospitalId !== parseInt(id)) {
      return res.status(403).json({
        success: false,
        error: 'You can only update your assigned hospital'
      });
    }
    
    const hospital = HospitalService.update(id, req.body);
    
    res.json({
      success: true,
      data: hospital,
      message: 'Hospital updated successfully'
    });
  } catch (error) {
    console.error('Error updating hospital:', error);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
};

// Delete hospital
exports.deleteHospital = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check if user has permission to delete this hospital
    if (req.user.userType === 'hospital-authority' && req.user.hospitalId !== parseInt(id)) {
      return res.status(403).json({
        success: false,
        error: 'You can only delete your assigned hospital'
      });
    }
    
    HospitalService.delete(id);
    
    res.json({
      success: true,
      message: 'Hospital deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting hospital:', error);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
};

// Get hospitals managed by current user
exports.getMyHospitals = async (req, res) => {
  try {
    const hospitals = HospitalService.getByUserId(req.user.id);
    
    res.json({
      success: true,
      data: hospitals,
      count: hospitals.length
    });
  } catch (error) {
    console.error('Error fetching user hospitals:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch hospitals'
    });
  }
};

// Get current user's hospital (for hospital authorities)
exports.getMyHospital = async (req, res) => {
  try {
    if (req.user.userType !== 'hospital-authority') {
      return res.status(403).json({
        success: false,
        error: 'Only hospital authorities can access this endpoint'
      });
    }

    const hospital = HospitalService.getByUserId(req.user.id);
    
    if (!hospital) {
      return res.status(404).json({
        success: false,
        error: 'No hospital found for this authority'
      });
    }

    res.json({
      success: true,
      data: hospital
    });
  } catch (error) {
    console.error('Error fetching authority hospital:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch hospital'
    });
  }
};

// Resubmit current user's hospital information (for hospital authorities)
exports.resubmitMyHospital = async (req, res) => {
  try {
    if (req.user.userType !== 'hospital-authority') {
      return res.status(403).json({
        success: false,
        error: 'Only hospital authorities can resubmit hospital information'
      });
    }

    const hospital = HospitalService.getByUserId(req.user.id);
    
    if (!hospital) {
      return res.status(404).json({
        success: false,
        error: 'No hospital found for this authority'
      });
    }

    // Only allow resubmission if hospital was rejected
    if (hospital.approvalStatus !== 'rejected') {
      return res.status(400).json({
        success: false,
        error: 'Hospital can only be resubmitted if it was rejected'
      });
    }

    const updatedHospital = HospitalService.resubmitHospital(hospital.id, req.body, req.user.id);
    
    res.json({
      success: true,
      message: 'Hospital information resubmitted successfully',
      data: updatedHospital
    });
  } catch (error) {
    console.error('Error resubmitting hospital:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to resubmit hospital information'
    });
  }
};

// Update current user's hospital resources (for hospital authorities)
exports.updateMyHospitalResources = async (req, res) => {
  try {
    if (req.user.userType !== 'hospital-authority') {
      return res.status(403).json({
        success: false,
        error: 'Only hospital authorities can access this endpoint',
        code: 'ACCESS_DENIED'
      });
    }

    if (!req.user.hospital_id) {
      return res.status(403).json({
        success: false,
        error: 'No hospital assigned to your account',
        code: 'HOSPITAL_NOT_ASSIGNED'
      });
    }

    const hospital = HospitalService.updateResources(req.user.hospital_id, req.body);
    
    res.json({
      success: true,
      data: hospital,
      message: 'Hospital resources updated successfully'
    });
  } catch (error) {
    console.error('Error updating hospital resources:', error);
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to update hospital resources'
    });
  }
};

// Get resource audit history for a hospital
exports.getResourceHistory = async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      resourceType, 
      changeType, 
      startDate, 
      endDate, 
      limit = 50, 
      offset = 0 
    } = req.query;

    // Build options object for filtering
    const options = {
      limit: parseInt(limit),
      offset: parseInt(offset)
    };

    if (resourceType) {
      options.resourceType = resourceType;
    }
    if (changeType) {
      options.changeType = changeType;
    }
    if (startDate) {
      options.startDate = new Date(startDate);
    }
    if (endDate) {
      options.endDate = new Date(endDate);
    }

    const result = await ResourceManagementService.getResourceHistory(parseInt(id), options);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.message
      });
    }

    res.json({
      success: true,
      data: result.data.history,
      totalCount: result.data.totalCount,
      pagination: {
        limit: options.limit,
        offset: options.offset,
        hasMore: result.data.history.length === options.limit
      },
      filters: {
        resourceType,
        changeType,
        startDate,
        endDate
      }
    });

  } catch (error) {
    console.error('Error fetching resource history:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch resource history'
    });
  }
};

// Public-safe resource history endpoint: returns empty data when unauthorized
exports.getResourceHistoryPublic = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      resourceType,
      changeType,
      startDate,
      endDate,
      limit = 50,
      offset = 0
    } = req.query;

    const options = {
      limit: parseInt(limit),
      offset: parseInt(offset)
    };

    if (resourceType) options.resourceType = resourceType;
    if (changeType) options.changeType = changeType;
    if (startDate) options.startDate = new Date(startDate);
    if (endDate) options.endDate = new Date(endDate);

    const user = req.user;
    const hospitalId = parseInt(id);

    const isAuthorized = !!user && (
      (user.userType === 'admin') ||
      (user.userType === 'hospital-authority' && (user.hospitalId === hospitalId))
    );

    if (!isAuthorized) {
      return res.json({
        success: true,
        data: [],
        totalCount: 0,
        pagination: {
          limit: options.limit,
          offset: options.offset,
          hasMore: false
        },
        filters: {
          resourceType,
          changeType,
          startDate,
          endDate
        }
      });
    }

    const result = await ResourceManagementService.getResourceHistory(hospitalId, options);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.message
      });
    }

    return res.json({
      success: true,
      data: result.data.history,
      totalCount: result.data.totalCount,
      pagination: {
        limit: options.limit,
        offset: options.offset,
        hasMore: result.data.history.length === options.limit
      },
      filters: {
        resourceType,
        changeType,
        startDate,
        endDate
      }
    });
  } catch (error) {
    console.error('Error fetching public-safe resource history:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch resource history'
    });
  }
};

// Validate resource update data
exports.validateResourceUpdate = async (req, res) => {
  try {
    const { id } = req.params;
    const { resources } = req.body;

    if (!resources) {
      return res.status(400).json({
        success: false,
        error: 'Resource data is required for validation'
      });
    }

    const validation = ResourceManagementService.validateResourceUpdate(parseInt(id), resources);

    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        error: validation.message,
        valid: false
      });
    }

    // Also check resource availability for additional context
    const availabilityChecks = {};
    for (const [resourceType, resourceData] of Object.entries(resources)) {
      if (['beds', 'icu', 'operationTheatres'].includes(resourceType)) {
        const availability = await ResourceManagementService.checkResourceAvailability(
          parseInt(id), 
          resourceType, 
          resourceData.available || 0
        );
        availabilityChecks[resourceType] = availability.data;
      }
    }

    res.json({
      success: true,
      valid: true,
      message: validation.message,
      availabilityChecks,
      recommendations: generateResourceRecommendations(resources, availabilityChecks)
    });

  } catch (error) {
    console.error('Error validating resource update:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to validate resource update'
    });
  }
};

// Helper function to generate resource recommendations
function generateResourceRecommendations(resources, availabilityChecks) {
  const recommendations = [];

  for (const [resourceType, resourceData] of Object.entries(resources)) {
    const availability = availabilityChecks[resourceType];
    
    if (availability) {
      // Check for potential overbooking
      if (resourceData.available && resourceData.available < availability.currentlyBooked) {
        recommendations.push({
          type: 'warning',
          resourceType,
          message: `Setting available ${resourceType} below currently booked quantity (${availability.currentlyBooked})`
        });
      }

      // Check for underutilization
      const utilizationRate = availability.currentlyBooked / (resourceData.total || 1);
      if (utilizationRate < 0.3 && resourceData.total > 10) {
        recommendations.push({
          type: 'info',
          resourceType,
          message: `Low utilization rate (${Math.round(utilizationRate * 100)}%) for ${resourceType}`
        });
      }

      // Check for high utilization
      if (utilizationRate > 0.9) {
        recommendations.push({
          type: 'warning',
          resourceType,
          message: `High utilization rate (${Math.round(utilizationRate * 100)}%) for ${resourceType}. Consider increasing capacity.`
        });
      }
    }
  }

  return recommendations;
}

// Get pending bookings for a hospital
exports.getPendingBookings = async (req, res) => {
  try {
    const { id } = req.params;
    const { urgency, resourceType, limit, sortBy, sortOrder } = req.query;

    // Check if user has permission to view this hospital's bookings
    if (req.user.userType === 'hospital-authority' && req.user.hospital_id !== parseInt(id)) {
      return res.status(403).json({
        success: false,
        error: 'You can only view bookings for your assigned hospital'
      });
    }

    const options = {
      urgency,
      resourceType,
      limit: limit ? parseInt(limit) : undefined,
      sortBy,
      sortOrder
    };

    const result = await BookingApprovalService.getPendingBookings(parseInt(id), options);

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

// Get booking history for a hospital
exports.getBookingHistory = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, startDate, endDate, limit, offset } = req.query;

    // Check if user has permission to view this hospital's history
    if (req.user.userType === 'hospital-authority' && req.user.hospital_id !== parseInt(id)) {
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

    const result = await BookingApprovalService.getBookingHistory(parseInt(id), options);

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

// Polling endpoints for real-time updates

// Get resource updates since last poll
exports.getResourceUpdates = async (req, res) => {
  try {
    const { id } = req.params;
    const { lastUpdate, resourceTypes } = req.query;

    // Check if user has permission to poll this hospital's resources
    if (req.user.userType === 'hospital-authority' && req.user.hospital_id !== parseInt(id)) {
      return res.status(403).json({
        success: false,
        error: 'You can only poll resources for your assigned hospital'
      });
    }

    const resourceTypeArray = resourceTypes ? resourceTypes.split(',') : null;
    const result = PollingService.getResourceUpdates(parseInt(id), lastUpdate, resourceTypeArray);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.message
      });
    }

    // Set appropriate cache headers for polling
    res.set({
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    });

    res.json({
      success: true,
      data: result.data,
      pollingInfo: {
        endpoint: 'resource-updates',
        hospitalId: parseInt(id),
        recommendedInterval: result.data.hasChanges ? 10000 : 30000 // Faster polling if changes detected
      }
    });

  } catch (error) {
    console.error('Error fetching resource updates:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch resource updates'
    });
  }
};

// Get booking updates since last poll
exports.getBookingUpdates = async (req, res) => {
  try {
    const { id } = req.params;
    const { lastUpdate, statuses } = req.query;

    // Check if user has permission to poll this hospital's bookings
    if (req.user.userType === 'hospital-authority' && req.user.hospital_id !== parseInt(id)) {
      return res.status(403).json({
        success: false,
        error: 'You can only poll bookings for your assigned hospital'
      });
    }

    const statusArray = statuses ? statuses.split(',') : null;
    const result = PollingService.getBookingUpdates(parseInt(id), lastUpdate, statusArray);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.message
      });
    }

    // Set appropriate cache headers for polling
    res.set({
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    });

    res.json({
      success: true,
      data: result.data,
      pollingInfo: {
        endpoint: 'booking-updates',
        hospitalId: parseInt(id),
        recommendedInterval: result.data.hasChanges ? 10000 : 30000
      }
    });

  } catch (error) {
    console.error('Error fetching booking updates:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch booking updates'
    });
  }
};

// Get combined dashboard updates since last poll
exports.getDashboardUpdates = async (req, res) => {
  try {
    const { id } = req.params;
    const { lastUpdate, resourceTypes, bookingStatuses } = req.query;

    // Check if user has permission to poll this hospital's dashboard
    if (req.user.userType === 'hospital-authority' && req.user.hospital_id !== parseInt(id)) {
      return res.status(403).json({
        success: false,
        error: 'You can only poll dashboard for your assigned hospital'
      });
    }

    const options = {
      resourceTypes: resourceTypes ? resourceTypes.split(',') : null,
      bookingStatuses: bookingStatuses ? bookingStatuses.split(',') : null
    };

    const result = PollingService.getHospitalDashboardUpdates(parseInt(id), lastUpdate, options);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.message
      });
    }

    // Set appropriate cache headers for polling
    res.set({
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    });

    res.json({
      success: true,
      data: result.data,
      pollingInfo: {
        endpoint: 'dashboard-updates',
        hospitalId: parseInt(id),
        recommendedInterval: result.data.hasChanges ? 10000 : 30000
      }
    });

  } catch (error) {
    console.error('Error fetching dashboard updates:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch dashboard updates'
    });
  }
};

// Check for changes without returning full data
exports.checkForChanges = async (req, res) => {
  try {
    const { id } = req.params;
    const { lastUpdate } = req.query;

    // Check if user has permission to check this hospital's changes
    if (req.user.userType === 'hospital-authority' && req.user.hospital_id !== parseInt(id)) {
      return res.status(403).json({
        success: false,
        error: 'You can only check changes for your assigned hospital'
      });
    }

    const result = PollingService.hasChanges(parseInt(id), lastUpdate);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.message
      });
    }

    // Set appropriate cache headers for polling
    res.set({
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    });

    res.json({
      success: true,
      data: result.data,
      pollingInfo: {
        endpoint: 'check-changes',
        hospitalId: parseInt(id),
        recommendedInterval: result.data.hasChanges ? 5000 : 30000 // Very fast polling for change detection
      }
    });

  } catch (error) {
    console.error('Error checking for changes:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to check for changes'
    });
  }
};

// Get polling configuration recommendations
exports.getPollingConfig = async (req, res) => {
  try {
    const { id } = req.params;

    // Check if user has permission to get config for this hospital
    if (req.user.userType === 'hospital-authority' && req.user.hospital_id !== parseInt(id)) {
      return res.status(403).json({
        success: false,
        error: 'You can only get polling config for your assigned hospital'
      });
    }

    const result = PollingService.getPollingConfig(parseInt(id));

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.message
      });
    }

    res.json({
      success: true,
      data: result.data,
      hospitalId: parseInt(id)
    });

  } catch (error) {
    console.error('Error fetching polling config:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch polling config'
    });
  }
};

// Get comprehensive analytics dashboard
exports.getAnalyticsDashboard = async (req, res) => {
  try {
    const { id } = req.params;
    const hospitalId = parseInt(id);

    // Check if user has permission to view analytics for this hospital
    if (req.user.userType === 'hospital-authority' && req.user.hospital_id !== hospitalId) {
      return res.status(403).json({
        success: false,
        error: 'You can only view analytics for your assigned hospital'
      });
    }

    // Parse query parameters for date filtering
    const options = {
      startDate: req.query.startDate,
      endDate: req.query.endDate,
      resourceType: req.query.resourceType
    };

    const analytics = AnalyticsService.getAnalyticsDashboard(hospitalId, options);

    res.json({
      success: true,
      data: analytics,
      hospitalId
    });

  } catch (error) {
    console.error('Error fetching analytics dashboard:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch analytics dashboard'
    });
  }
};

// Get resource utilization analytics
exports.getResourceUtilizationAnalytics = async (req, res) => {
  try {
    const { id } = req.params;
    const hospitalId = parseInt(id);

    // Check if user has permission to view analytics for this hospital
    if (req.user.userType === 'hospital-authority' && req.user.hospital_id !== hospitalId) {
      return res.status(403).json({
        success: false,
        error: 'You can only view analytics for your assigned hospital'
      });
    }

    // Parse query parameters for filtering
    const options = {
      startDate: req.query.startDate,
      endDate: req.query.endDate,
      resourceType: req.query.resourceType
    };

    const analytics = AnalyticsService.getResourceUtilizationAnalytics(hospitalId, options);

    res.json({
      success: true,
      data: analytics,
      hospitalId
    });

  } catch (error) {
    console.error('Error fetching resource utilization analytics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch resource utilization analytics'
    });
  }
};

// Get booking history analytics
exports.getBookingHistoryAnalytics = async (req, res) => {
  try {
    const { id } = req.params;
    const hospitalId = parseInt(id);

    // Check if user has permission to view analytics for this hospital
    if (req.user.userType === 'hospital-authority' && req.user.hospital_id !== hospitalId) {
      return res.status(403).json({
        success: false,
        error: 'You can only view analytics for your assigned hospital'
      });
    }

    // Parse query parameters for filtering
    const options = {
      startDate: req.query.startDate,
      endDate: req.query.endDate,
      status: req.query.status,
      resourceType: req.query.resourceType,
      urgency: req.query.urgency
    };

    const analytics = AnalyticsService.getBookingHistoryAnalytics(hospitalId, options);

    res.json({
      success: true,
      data: analytics,
      hospitalId
    });

  } catch (error) {
    console.error('Error fetching booking history analytics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch booking history analytics'
    });
  }
};

// Get resource usage patterns
exports.getResourceUsagePatterns = async (req, res) => {
  try {
    const { id } = req.params;
    const hospitalId = parseInt(id);

    // Check if user has permission to view analytics for this hospital
    if (req.user.userType === 'hospital-authority' && req.user.hospital_id !== hospitalId) {
      return res.status(403).json({
        success: false,
        error: 'You can only view analytics for your assigned hospital'
      });
    }

    // Parse query parameters for filtering
    const options = {
      startDate: req.query.startDate,
      endDate: req.query.endDate,
      resourceType: req.query.resourceType
    };

    const patterns = AnalyticsService.getResourceUsagePatterns(hospitalId, options);

    res.json({
      success: true,
      data: patterns,
      hospitalId
    });

  } catch (error) {
    console.error('Error fetching resource usage patterns:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch resource usage patterns'
    });
  }
};

// Get performance metrics
exports.getPerformanceMetrics = async (req, res) => {
  try {
    const { id } = req.params;
    const hospitalId = parseInt(id);

    // Check if user has permission to view analytics for this hospital
    if (req.user.userType === 'hospital-authority' && req.user.hospital_id !== hospitalId) {
      return res.status(403).json({
        success: false,
        error: 'You can only view analytics for your assigned hospital'
      });
    }

    // Parse query parameters for filtering
    const options = {
      startDate: req.query.startDate,
      endDate: req.query.endDate,
      resourceType: req.query.resourceType
    };

    const metrics = AnalyticsService.getPerformanceMetrics(hospitalId, options);

    res.json({
      success: true,
      data: metrics,
      hospitalId
    });

  } catch (error) {
    console.error('Error fetching performance metrics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch performance metrics'
    });
  }
}; 