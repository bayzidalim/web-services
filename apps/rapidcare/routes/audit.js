const express = require('express');
const router = express.Router();
const auditController = require('../controllers/auditController');
const { authenticate } = require('../middleware/auth');

// GET /api/audit/entity/:entityType/:entityId - Get audit trail for entity (admin only)
router.get('/entity/:entityType/:entityId', authenticate, auditController.getEntityAuditTrail);

// GET /api/audit/metrics/approval - Get approval workflow metrics (admin only)
router.get('/metrics/approval', authenticate, auditController.getApprovalMetrics);

// GET /api/audit/efficiency/approval - Get approval efficiency stats (admin only)
router.get('/efficiency/approval', authenticate, auditController.getApprovalEfficiency);

// GET /api/audit/user/:userId - Get user audit trail
router.get('/user/:userId', authenticate, auditController.getUserAuditTrail);

module.exports = router;