const express = require('express');
const router = express.Router();
const bloodController = require('../controllers/bloodController');
const { authenticate, authorizePermission } = require('../middleware/auth');

// POST /api/blood/request - Create blood request (authenticated users)
router.post('/request', authenticate, bloodController.createBloodRequest);

// GET /api/blood/requests - Get all blood requests (authenticated users)
router.get('/requests', authenticate, bloodController.getAllBloodRequests);

// GET /api/blood/my-requests - Get current user's blood requests (for profile page)
router.get('/my-requests', authenticate, bloodController.getCurrentUserBloodRequests);

// GET /api/blood/requests/search - Search blood requests (authenticated users)
router.get('/requests/search', authenticate, bloodController.searchBloodRequests);

// GET /api/blood/requests/:id - Get specific blood request (authenticated users)
router.get('/requests/:id', authenticate, bloodController.getBloodRequestById);

// PUT /api/blood/requests/:id/status - Update blood request status (hospital authority)
router.put('/requests/:id/status', authenticate, authorizePermission('update_bookings'), bloodController.updateBloodRequestStatus);

// POST /api/blood/requests/:id/match - Match donor to blood request (authenticated users)
router.post('/requests/:id/match', authenticate, bloodController.matchDonor);

// PUT /api/blood/requests/:id/donors/:donorId - Update donor status (authenticated users)
router.put('/requests/:id/donors/:donorId', authenticate, bloodController.updateDonorStatus);

module.exports = router; 