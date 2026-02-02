const express = require('express');
const router = express.Router();
const PollingService = require('../services/pollingService');
const { 
  authenticate, 
  authorizeUserType 
} = require('../middleware/auth');

// GET /api/polling/resources - Get system-wide resource updates
router.get('/resources', authenticate, async (req, res) => {
  try {
    const { lastUpdate, resourceTypes, hospitalId } = req.query;

    // If user is hospital-authority, restrict to their hospital
    let targetHospitalId = hospitalId ? parseInt(hospitalId) : null;
    if (req.user.userType === 'hospital-authority') {
      if (targetHospitalId && targetHospitalId !== req.user.hospital_id) {
        return res.status(403).json({
          success: false,
          error: 'You can only poll resources for your assigned hospital'
        });
      }
      targetHospitalId = req.user.hospital_id;
    }

    const resourceTypeArray = resourceTypes ? resourceTypes.split(',') : null;
    const result = PollingService.getResourceUpdates(targetHospitalId, lastUpdate, resourceTypeArray);

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
        endpoint: 'system-resource-updates',
        scope: targetHospitalId ? 'hospital' : 'system',
        hospitalId: targetHospitalId,
        recommendedInterval: result.data.hasChanges ? 10000 : 30000
      }
    });

  } catch (error) {
    console.error('Error fetching system resource updates:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch system resource updates'
    });
  }
});

// GET /api/polling/bookings - Get system-wide booking updates
router.get('/bookings', authenticate, async (req, res) => {
  try {
    const { lastUpdate, statuses, hospitalId } = req.query;

    // If user is hospital-authority, restrict to their hospital
    let targetHospitalId = hospitalId ? parseInt(hospitalId) : null;
    if (req.user.userType === 'hospital-authority') {
      if (targetHospitalId && targetHospitalId !== req.user.hospital_id) {
        return res.status(403).json({
          success: false,
          error: 'You can only poll bookings for your assigned hospital'
        });
      }
      targetHospitalId = req.user.hospital_id;
    }

    const statusArray = statuses ? statuses.split(',') : null;
    const result = PollingService.getBookingUpdates(targetHospitalId, lastUpdate, statusArray);

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
        endpoint: 'system-booking-updates',
        scope: targetHospitalId ? 'hospital' : 'system',
        hospitalId: targetHospitalId,
        recommendedInterval: result.data.hasChanges ? 10000 : 30000
      }
    });

  } catch (error) {
    console.error('Error fetching system booking updates:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch system booking updates'
    });
  }
});

// GET /api/polling/combined - Get combined system updates
router.get('/combined', authenticate, async (req, res) => {
  try {
    const { lastUpdate, resourceTypes, bookingStatuses, hospitalId } = req.query;

    // If user is hospital-authority, restrict to their hospital
    let targetHospitalId = hospitalId ? parseInt(hospitalId) : null;
    if (req.user.userType === 'hospital-authority') {
      if (targetHospitalId && targetHospitalId !== req.user.hospital_id) {
        return res.status(403).json({
          success: false,
          error: 'You can only poll data for your assigned hospital'
        });
      }
      targetHospitalId = req.user.hospital_id;
    }

    const options = {
      resourceTypes: resourceTypes ? resourceTypes.split(',') : null,
      bookingStatuses: bookingStatuses ? bookingStatuses.split(',') : null
    };

    const result = PollingService.getCombinedUpdates(targetHospitalId, lastUpdate, options);

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
        endpoint: 'system-combined-updates',
        scope: targetHospitalId ? 'hospital' : 'system',
        hospitalId: targetHospitalId,
        recommendedInterval: result.data.hasChanges ? 10000 : 30000
      }
    });

  } catch (error) {
    console.error('Error fetching combined updates:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch combined updates'
    });
  }
});

// GET /api/polling/audit - Get audit log updates
router.get('/audit', authenticate, authorizeUserType(['hospital-authority', 'admin']), async (req, res) => {
  try {
    const { lastUpdate, changeTypes, resourceTypes, hospitalId, limit } = req.query;

    // If user is hospital-authority, restrict to their hospital
    let targetHospitalId = hospitalId ? parseInt(hospitalId) : null;
    if (req.user.userType === 'hospital-authority') {
      if (targetHospitalId && targetHospitalId !== req.user.hospital_id) {
        return res.status(403).json({
          success: false,
          error: 'You can only poll audit logs for your assigned hospital'
        });
      }
      targetHospitalId = req.user.hospital_id;
    }

    const options = {
      changeTypes: changeTypes ? changeTypes.split(',') : null,
      resourceTypes: resourceTypes ? resourceTypes.split(',') : null,
      limit: limit ? parseInt(limit) : 50
    };

    const result = PollingService.getAuditLogUpdates(targetHospitalId, lastUpdate, options);

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
        endpoint: 'audit-updates',
        scope: targetHospitalId ? 'hospital' : 'system',
        hospitalId: targetHospitalId,
        recommendedInterval: result.data.hasChanges ? 15000 : 60000 // Slower polling for audit logs
      }
    });

  } catch (error) {
    console.error('Error fetching audit updates:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch audit updates'
    });
  }
});

// GET /api/polling/changes - Check for changes across system
router.get('/changes', authenticate, async (req, res) => {
  try {
    const { lastUpdate, hospitalId } = req.query;

    // If user is hospital-authority, restrict to their hospital
    let targetHospitalId = hospitalId ? parseInt(hospitalId) : null;
    if (req.user.userType === 'hospital-authority') {
      if (targetHospitalId && targetHospitalId !== req.user.hospital_id) {
        return res.status(403).json({
          success: false,
          error: 'You can only check changes for your assigned hospital'
        });
      }
      targetHospitalId = req.user.hospital_id;
    }

    const result = PollingService.hasChanges(targetHospitalId, lastUpdate);

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
        endpoint: 'system-change-detection',
        scope: targetHospitalId ? 'hospital' : 'system',
        hospitalId: targetHospitalId,
        recommendedInterval: result.data.hasChanges ? 5000 : 30000
      }
    });

  } catch (error) {
    console.error('Error checking for system changes:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to check for system changes'
    });
  }
});

// GET /api/polling/config - Get system polling configuration
router.get('/config', authenticate, async (req, res) => {
  try {
    const { hospitalId } = req.query;

    // If user is hospital-authority, restrict to their hospital
    let targetHospitalId = hospitalId ? parseInt(hospitalId) : null;
    if (req.user.userType === 'hospital-authority') {
      if (targetHospitalId && targetHospitalId !== req.user.hospital_id) {
        return res.status(403).json({
          success: false,
          error: 'You can only get polling config for your assigned hospital'
        });
      }
      targetHospitalId = req.user.hospital_id;
    }

    const result = PollingService.getPollingConfig(targetHospitalId);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.message
      });
    }

    res.json({
      success: true,
      data: result.data,
      scope: targetHospitalId ? 'hospital' : 'system',
      hospitalId: targetHospitalId
    });

  } catch (error) {
    console.error('Error fetching polling config:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch polling config'
    });
  }
});

// GET /api/polling/health - Health check for polling endpoints
router.get('/health', authenticate, async (req, res) => {
  try {
    const currentTime = new Date().toISOString();
    
    // Basic health check - verify database connectivity
    const db = require('../config/database');
    const healthCheck = db.prepare('SELECT 1 as healthy').get();
    
    if (!healthCheck || healthCheck.healthy !== 1) {
      throw new Error('Database connectivity issue');
    }

    res.json({
      success: true,
      data: {
        status: 'healthy',
        timestamp: currentTime,
        endpoints: [
          '/api/polling/resources',
          '/api/polling/bookings', 
          '/api/polling/combined',
          '/api/polling/audit',
          '/api/polling/changes',
          '/api/polling/config'
        ],
        userType: req.user.userType,
        hospitalId: req.user.hospital_id || null
      }
    });

  } catch (error) {
    console.error('Polling health check failed:', error);
    res.status(500).json({
      success: false,
      error: 'Polling service health check failed',
      timestamp: new Date().toISOString()
    });
  }
});

module.exports = router;