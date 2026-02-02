const AuditTrailService = require('../services/auditTrailService');

// Get audit trail for entity (admin only)
exports.getEntityAuditTrail = async (req, res) => {
  try {
    if (req.user.userType !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Access denied. Admin privileges required.'
      });
    }

    const { entityType, entityId } = req.params;
    const { limit = 100 } = req.query;
    
    const auditTrail = AuditTrailService.getByEntity(entityType, parseInt(entityId), parseInt(limit));
    
    res.json({
      success: true,
      data: auditTrail,
      count: auditTrail.length
    });
  } catch (error) {
    console.error('Error fetching audit trail:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch audit trail'
    });
  }
};

// Get approval workflow metrics (admin only)
exports.getApprovalMetrics = async (req, res) => {
  try {
    if (req.user.userType !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Access denied. Admin privileges required.'
      });
    }

    const { startDate, endDate } = req.query;
    const start = startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(); // 30 days ago
    const end = endDate || new Date().toISOString();
    
    const metrics = AuditTrailService.getApprovalMetrics(start, end);
    
    res.json({
      success: true,
      data: metrics,
      period: { startDate: start, endDate: end }
    });
  } catch (error) {
    console.error('Error fetching approval metrics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch approval metrics'
    });
  }
};

// Get approval efficiency stats (admin only)
exports.getApprovalEfficiency = async (req, res) => {
  try {
    if (req.user.userType !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Access denied. Admin privileges required.'
      });
    }
    
    const efficiency = AuditTrailService.getApprovalEfficiency();
    
    res.json({
      success: true,
      data: efficiency
    });
  } catch (error) {
    console.error('Error fetching approval efficiency:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch approval efficiency'
    });
  }
};

// Get user audit trail (users can see their own actions)
exports.getUserAuditTrail = async (req, res) => {
  try {
    const userId = req.params.userId;
    
    // Users can only see their own audit trail, admins can see any
    if (req.user.userType !== 'admin' && req.user.id !== parseInt(userId)) {
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      });
    }

    const { limit = 100 } = req.query;
    const auditTrail = AuditTrailService.getByUser(parseInt(userId), parseInt(limit));
    
    res.json({
      success: true,
      data: auditTrail,
      count: auditTrail.length
    });
  } catch (error) {
    console.error('Error fetching user audit trail:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch audit trail'
    });
  }
};