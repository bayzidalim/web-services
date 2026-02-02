const express = require('express');
const router = express.Router();
const SampleCollectionService = require('../services/sampleCollectionService');
const { authenticate, requireRole } = require('../middleware/auth');
const ErrorHandler = require('../utils/errorHandler');

// Initialize service (will be set by the main app)
let sampleCollectionService;

function initializeSampleCollectionService(database) {
  sampleCollectionService = new SampleCollectionService(database);
}

/**
 * GET /api/sample-collection/hospitals
 * Get hospitals that offer home sample collection services
 */
router.get('/hospitals', async (req, res) => {
  try {
    const result = await sampleCollectionService.getCollectionHospitals();
    res.json(result);
  } catch (error) {
    const handledError = ErrorHandler.handleError(error, 'Failed to get collection hospitals');
    res.status(handledError.statusCode || 500).json({ 
      success: false,
      error: handledError.message 
    });
  }
});

/**
 * GET /api/sample-collection/test-types
 * Get all available test types
 */
router.get('/test-types', async (req, res) => {
  try {
    const result = await sampleCollectionService.getAllTestTypes();
    res.json(result);
  } catch (error) {
    const handledError = ErrorHandler.handleError(error, 'Failed to get test types');
    res.status(handledError.statusCode || 500).json({ 
      success: false,
      error: handledError.message 
    });
  }
});

/**
 * GET /api/sample-collection/hospitals/:hospitalId/test-types
 * Get test types available at a specific hospital
 */
router.get('/hospitals/:hospitalId/test-types', async (req, res) => {
  try {
    const { hospitalId } = req.params;
    const result = await sampleCollectionService.getHospitalTestTypes(parseInt(hospitalId));
    res.json(result);
  } catch (error) {
    const handledError = ErrorHandler.handleError(error, 'Failed to get hospital test types');
    res.status(handledError.statusCode || 500).json({ 
      success: false,
      error: handledError.message 
    });
  }
});

/**
 * POST /api/sample-collection/calculate-pricing
 * Calculate pricing for selected test types at a hospital
 */
router.post('/calculate-pricing', async (req, res) => {
  try {
    const { hospitalId, testTypeIds } = req.body;

    if (!hospitalId || !testTypeIds || !Array.isArray(testTypeIds)) {
      return res.status(400).json({
        success: false,
        error: 'Hospital ID and test type IDs are required'
      });
    }

    const result = await sampleCollectionService.calculatePricing(
      parseInt(hospitalId), 
      testTypeIds.map(id => parseInt(id))
    );
    res.json(result);
  } catch (error) {
    const handledError = ErrorHandler.handleError(error, 'Failed to calculate pricing');
    res.status(handledError.statusCode || 500).json({ 
      success: false,
      error: handledError.message 
    });
  }
});

/**
 * POST /api/sample-collection/submit-request
 * Create a new sample collection request
 */
router.post('/submit-request', authenticate, async (req, res) => {
  try {
    const {
      hospitalId,
      testTypeIds,
      patientName,
      patientPhone,
      collectionAddress,
      preferredTime,
      specialInstructions
    } = req.body;

    // Validation
    if (!hospitalId || !testTypeIds || !Array.isArray(testTypeIds) || testTypeIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Hospital ID and at least one test type are required'
      });
    }

    if (!patientName || !patientPhone || !collectionAddress) {
      return res.status(400).json({
        success: false,
        error: 'Patient name, phone, and collection address are required'
      });
    }

    const requestData = {
      userId: req.user.id, // Use authenticated user's ID
      hospitalId: parseInt(hospitalId),
      testTypeIds: testTypeIds.map(id => parseInt(id)),
      patientName: patientName.trim(),
      patientPhone: patientPhone.trim(),
      collectionAddress: collectionAddress.trim(),
      preferredTime: preferredTime || 'anytime',
      specialInstructions: specialInstructions || ''
    };

    const result = await sampleCollectionService.createCollectionRequest(requestData);
    res.status(201).json(result);
  } catch (error) {
    const handledError = ErrorHandler.handleError(error, 'Failed to create collection request');
    res.status(handledError.statusCode || 500).json({ 
      success: false,
      error: handledError.message 
    });
  }
});

/**
 * GET /api/sample-collection/requests
 * Get user's collection requests
 */
router.get('/requests', authenticate, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;

    const result = await sampleCollectionService.getUserRequests(req.user.id, page, limit);
    res.json(result);
  } catch (error) {
    const handledError = ErrorHandler.handleError(error, 'Failed to get collection requests');
    res.status(handledError.statusCode || 500).json({ 
      success: false,
      error: handledError.message 
    });
  }
});

/**
 * GET /api/sample-collection/requests/:requestId
 * Get a specific collection request
 */
router.get('/requests/:requestId', authenticate, async (req, res) => {
  try {
    const { requestId } = req.params;
    const result = await sampleCollectionService.getRequestById(
      parseInt(requestId), 
      req.user.id
    );
    res.json(result);
  } catch (error) {
    const handledError = ErrorHandler.handleError(error, 'Failed to get collection request');
    res.status(handledError.statusCode || 500).json({ 
      success: false,
      error: handledError.message 
    });
  }
});

/**
 * PUT /api/sample-collection/requests/:requestId/cancel
 * Cancel a collection request
 */
router.put('/requests/:requestId/cancel', authenticate, async (req, res) => {
  try {
    const { requestId } = req.params;
    const { reason } = req.body;

    const result = await sampleCollectionService.cancelRequest(
      parseInt(requestId), 
      req.user.id, 
      reason
    );
    res.json(result);
  } catch (error) {
    const handledError = ErrorHandler.handleError(error, 'Failed to cancel collection request');
    res.status(handledError.statusCode || 500).json({ 
      success: false,
      error: handledError.message 
    });
  }
});

// Hospital Management Routes (for hospital authorities)

/**
 * GET /api/sample-collection/hospital/requests
 * Get collection requests for the hospital (hospital authority only)
 */
router.get('/hospital/requests', authenticate, requireRole(['hospital_authority', 'admin']), async (req, res) => {
  try {
    const status = req.query.status;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;

    // Get hospital ID from user's profile
    const hospitalId = req.user.hospital_id;
    if (!hospitalId) {
      return res.status(400).json({
        success: false,
        error: 'Hospital ID not found in user profile'
      });
    }

    const result = await sampleCollectionService.getHospitalRequests(
      hospitalId, 
      status, 
      page, 
      limit
    );
    res.json(result);
  } catch (error) {
    const handledError = ErrorHandler.handleError(error, 'Failed to get hospital requests');
    res.status(handledError.statusCode || 500).json({ 
      success: false,
      error: handledError.message 
    });
  }
});

/**
 * PUT /api/sample-collection/hospital/requests/:requestId/status
 * Update request status (hospital authority only)
 */
router.put('/hospital/requests/:requestId/status', authenticate, requireRole(['hospital_authority', 'admin']), async (req, res) => {
  try {
    const { requestId } = req.params;
    const { status, collectionDate, collectionTime, estimatedPrice } = req.body;

    const validStatuses = ['pending', 'assigned', 'collected', 'completed', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid status'
      });
    }

    const additionalData = {};
    if (collectionDate) additionalData.collectionDate = collectionDate;
    if (collectionTime) additionalData.collectionTime = collectionTime;
    if (estimatedPrice) additionalData.estimatedPrice = estimatedPrice;

    const result = await sampleCollectionService.updateRequestStatus(
      parseInt(requestId), 
      status, 
      additionalData
    );
    res.json(result);
  } catch (error) {
    const handledError = ErrorHandler.handleError(error, 'Failed to update request status');
    res.status(handledError.statusCode || 500).json({ 
      success: false,
      error: handledError.message 
    });
  }
});

/**
 * PUT /api/sample-collection/hospital/requests/:requestId/assign-agent
 * Assign agent to a request (hospital authority only)
 */
router.put('/hospital/requests/:requestId/assign-agent', authenticate, requireRole(['hospital_authority', 'admin']), async (req, res) => {
  try {
    const { requestId } = req.params;
    const { agentId } = req.body;

    const result = await sampleCollectionService.assignAgentToRequest(
      parseInt(requestId), 
      agentId ? parseInt(agentId) : null
    );
    res.json(result);
  } catch (error) {
    const handledError = ErrorHandler.handleError(error, 'Failed to assign agent');
    res.status(handledError.statusCode || 500).json({ 
      success: false,
      error: handledError.message 
    });
  }
});

/**
 * GET /api/sample-collection/hospital/stats
 * Get collection statistics for the hospital
 */
router.get('/hospital/stats', authenticate, requireRole(['hospital-authority', 'admin']), async (req, res) => {
  try {
    const hospitalId = req.user.hospital_id || req.user.hospitalId;
    if (!hospitalId) {
      return res.status(400).json({
        success: false,
        error: 'Hospital ID not found in user profile'
      });
    }

    const result = await sampleCollectionService.getHospitalStats(hospitalId);
    res.json(result);
  } catch (error) {
    const handledError = ErrorHandler.handleError(error, 'Failed to get hospital statistics');
    res.status(handledError.statusCode || 500).json({ 
      success: false,
      error: handledError.message 
    });
  }
});

/**
 * GET /api/sample-collection/hospital/pending-approvals
 * Get pending approval requests for the hospital
 */
router.get('/hospital/pending-approvals', authenticate, requireRole(['hospital-authority', 'admin']), async (req, res) => {
  try {
    const hospitalId = req.user.hospital_id || req.user.hospitalId;
    if (!hospitalId) {
      return res.status(400).json({
        success: false,
        error: 'Hospital ID not found in user profile'
      });
    }

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;

    const result = await sampleCollectionService.getPendingApprovalRequests(
      hospitalId,
      page,
      limit
    );
    res.json(result);
  } catch (error) {
    const handledError = ErrorHandler.handleError(error, 'Failed to get pending approvals');
    res.status(handledError.statusCode || 500).json({ 
      success: false,
      error: handledError.message 
    });
  }
});

/**
 * PUT /api/sample-collection/hospital/requests/:requestId/approve
 * Approve a sample collection request (hospital authority only)
 */
router.put('/hospital/requests/:requestId/approve', authenticate, requireRole(['hospital-authority', 'admin']), async (req, res) => {
  try {
    const { requestId } = req.params;
    const hospitalId = req.user.hospital_id || req.user.hospitalId;
    
    if (!hospitalId) {
      return res.status(400).json({
        success: false,
        error: 'Hospital ID not found in user profile'
      });
    }

    const result = await sampleCollectionService.approveRequest(
      parseInt(requestId),
      req.user.id,
      hospitalId
    );
    res.json(result);
  } catch (error) {
    const handledError = ErrorHandler.handleError(error, 'Failed to approve request');
    res.status(handledError.statusCode || 500).json({ 
      success: false,
      error: handledError.message 
    });
  }
});

/**
 * PUT /api/sample-collection/hospital/requests/:requestId/reject
 * Reject a sample collection request (hospital authority only)
 */
router.put('/hospital/requests/:requestId/reject', authenticate, requireRole(['hospital-authority', 'admin']), async (req, res) => {
  try {
    const { requestId } = req.params;
    const { reason } = req.body;
    const hospitalId = req.user.hospital_id || req.user.hospitalId;

    if (!hospitalId) {
      return res.status(400).json({
        success: false,
        error: 'Hospital ID not found in user profile'
      });
    }

    if (!reason || reason.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Rejection reason is required'
      });
    }

    const result = await sampleCollectionService.rejectRequest(
      parseInt(requestId),
      req.user.id,
      hospitalId,
      reason.trim()
    );
    res.json(result);
  } catch (error) {
    const handledError = ErrorHandler.handleError(error, 'Failed to reject request');
    res.status(handledError.statusCode || 500).json({ 
      success: false,
      error: handledError.message 
    });
  }
});


// Error handling middleware
router.use((error, req, res, _next) => {
  console.error('Sample Collection API Error:', error);
  const handledError = ErrorHandler.handleError(error, 'Sample collection API error');
  res.status(handledError.statusCode || 500).json({
    success: false,
    error: handledError.message
  });
});

module.exports = { router, initializeSampleCollectionService };