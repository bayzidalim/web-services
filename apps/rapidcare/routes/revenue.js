const express = require('express');
const router = express.Router();
const RevenueManagementService = require('../services/revenueManagementService');
const { authenticate, requireAdmin, requireOwnHospital } = require('../middleware/auth');

/**
 * @route   GET /api/revenue/hospital/:id
 * @desc    Get revenue analytics for a hospital
 * @access  Private (hospital authority for own hospital or admin)
 */
router.get('/hospital/:id', authenticate, requireOwnHospital, async (req, res) => {
  try {
    const hospitalId = parseInt(req.params.id);
    const { startDate, endDate, period } = req.query;

    if (isNaN(hospitalId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid hospital ID'
      });
    }

    let dateRange = {};
    
    // Use period if provided, otherwise use custom date range
    if (period) {
      dateRange = RevenueManagementService.getDateRangeForPeriod(period);
    } else {
      if (startDate) dateRange.startDate = startDate;
      if (endDate) dateRange.endDate = endDate;
    }

    const analytics = RevenueManagementService.getRevenueAnalytics(hospitalId, dateRange);

    res.status(200).json({
      success: true,
      data: analytics
    });

  } catch (error) {
    console.error('Hospital revenue analytics error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to retrieve hospital revenue analytics'
    });
  }
});

/**
 * @route   GET /api/revenue/admin
 * @desc    Get admin revenue analytics (platform-wide)
 * @access  Private (admin only)
 */
router.get('/admin', authenticate, requireAdmin, async (req, res) => {
  try {
    const { startDate, endDate, period } = req.query;

    let dateRange = {};
    
    // Use period if provided, otherwise use custom date range
    if (period) {
      dateRange = RevenueManagementService.getDateRangeForPeriod(period);
    } else {
      if (startDate) dateRange.startDate = startDate;
      if (endDate) dateRange.endDate = endDate;
    }

    const analytics = RevenueManagementService.getAdminRevenueAnalytics(dateRange);

    res.status(200).json({
      success: true,
      data: analytics
    });

  } catch (error) {
    console.error('Admin revenue analytics error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to retrieve admin revenue analytics'
    });
  }
});

/**
 * @route   GET /api/revenue/analytics
 * @desc    Get comprehensive revenue analytics
 * @access  Private (admin or hospital authority)
 */
router.get('/analytics', authenticate, async (req, res) => {
  try {
    const { hospitalId, period } = req.query;

    // Check authorization
    if (hospitalId) {
      const parsedHospitalId = parseInt(hospitalId);
      
      // Hospital authorities can only access their own hospital data
      if (req.user.userType === 'hospital-authority') {
        if (req.user.hospital_id !== parsedHospitalId) {
          return res.status(403).json({
            success: false,
            error: 'Access denied. You can only access your hospital data.'
          });
        }
      }
      
      // Get hospital-specific analytics
      const analytics = RevenueManagementService.getRevenueMetrics(parsedHospitalId, period);
      
      res.status(200).json({
        success: true,
        data: analytics
      });
    } else {
      // Platform-wide analytics (admin only)
      if (req.user.userType !== 'admin') {
        return res.status(403).json({
          success: false,
          error: 'Access denied. Admin privileges required for platform analytics.'
        });
      }
      
      const analytics = RevenueManagementService.getRevenueMetrics(null, period);
      
      res.status(200).json({
        success: true,
        data: analytics
      });
    }

  } catch (error) {
    console.error('Revenue analytics error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to retrieve revenue analytics'
    });
  }
});

/**
 * @route   GET /api/balances/hospital/:id
 * @desc    Get hospital balance information
 * @access  Private (hospital authority for own hospital or admin)
 */
router.get('/balances/hospital/:id', authenticate, requireOwnHospital, async (req, res) => {
  try {
    const hospitalId = parseInt(req.params.id);

    if (isNaN(hospitalId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid hospital ID'
      });
    }

    // Get hospital authority user for this hospital
    const db = require('../config/database');
    const hospitalAuthority = db.prepare(`
      SELECT id FROM users 
      WHERE userType = 'hospital-authority' AND hospital_id = ? 
      LIMIT 1
    `).get(hospitalId);

    if (!hospitalAuthority) {
      return res.status(404).json({
        success: false,
        error: 'No hospital authority found for this hospital'
      });
    }

    const UserBalance = require('../models/UserBalance');
    const balance = UserBalance.findByUserId(hospitalAuthority.id, hospitalId);
    const balanceHistory = UserBalance.getBalanceHistory(hospitalAuthority.id, hospitalId, 20);

    res.status(200).json({
      success: true,
      data: {
        balance: Array.isArray(balance) ? balance[0] : balance,
        history: balanceHistory
      }
    });

  } catch (error) {
    console.error('Hospital balance error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to retrieve hospital balance'
    });
  }
});

/**
 * @route   GET /api/balances/admin
 * @desc    Get admin balance information
 * @access  Private (admin only)
 */
router.get('/balances/admin', authenticate, requireAdmin, async (req, res) => {
  try {
    const UserBalance = require('../models/UserBalance');
    const adminBalances = UserBalance.getAdminBalances();
    
    // Get balance history for the first admin (or current admin)
    let balanceHistory = [];
    if (adminBalances.length > 0) {
      balanceHistory = UserBalance.getBalanceHistory(adminBalances[0].userId, null, 20);
    }

    res.status(200).json({
      success: true,
      data: {
        balances: adminBalances,
        history: balanceHistory
      }
    });

  } catch (error) {
    console.error('Admin balance error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to retrieve admin balance'
    });
  }
});

/**
 * @route   GET /api/revenue/reconciliation
 * @desc    Get revenue reconciliation report
 * @access  Private (admin only)
 */
router.get('/reconciliation', authenticate, requireAdmin, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    const dateRange = {};
    if (startDate) dateRange.startDate = startDate;
    if (endDate) dateRange.endDate = endDate;

    const reconciliationReport = RevenueManagementService.reconcileBalances(dateRange);

    res.status(200).json({
      success: true,
      data: reconciliationReport
    });

  } catch (error) {
    console.error('Revenue reconciliation error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to generate reconciliation report'
    });
  }
});

/**
 * @route   GET /api/revenue/low-balance-alerts
 * @desc    Get low balance alerts
 * @access  Private (admin only)
 */
router.get('/low-balance-alerts', authenticate, requireAdmin, async (req, res) => {
  try {
    const threshold = parseFloat(req.query.threshold) || 100.00;

    const alerts = RevenueManagementService.getLowBalanceAlerts(threshold);

    res.status(200).json({
      success: true,
      data: alerts
    });

  } catch (error) {
    console.error('Low balance alerts error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to retrieve low balance alerts'
    });
  }
});

/**
 * @route   POST /api/revenue/distribute
 * @desc    Manually distribute revenue for a transaction
 * @access  Private (admin only)
 */
router.post('/distribute', authenticate, requireAdmin, async (req, res) => {
  try {
    const { transactionId, bookingAmount, hospitalId } = req.body;

    if (!transactionId || !bookingAmount || !hospitalId) {
      return res.status(400).json({
        success: false,
        error: 'Transaction ID, booking amount, and hospital ID are required'
      });
    }

    const result = await RevenueManagementService.distributeRevenue(
      parseInt(transactionId),
      parseFloat(bookingAmount),
      parseInt(hospitalId)
    );

    res.status(200).json({
      success: true,
      data: result,
      message: 'Revenue distributed successfully'
    });

  } catch (error) {
    console.error('Manual revenue distribution error:', error);
    res.status(400).json({
      success: false,
      error: error.message || 'Revenue distribution failed'
    });
  }
});

/**
 * @route   POST /api/revenue/bulk-distribute
 * @desc    Bulk distribute revenue for multiple transactions
 * @access  Private (admin only)
 */
router.post('/bulk-distribute', authenticate, requireAdmin, async (req, res) => {
  try {
    const { transactionIds } = req.body;

    if (!Array.isArray(transactionIds) || transactionIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Transaction IDs array is required'
      });
    }

    const result = await RevenueManagementService.processBulkRevenueDistribution(
      transactionIds.map(id => parseInt(id))
    );

    res.status(200).json({
      success: true,
      data: result,
      message: `Bulk revenue distribution completed: ${result.totalProcessed} successful, ${result.totalFailed} failed`
    });

  } catch (error) {
    console.error('Bulk revenue distribution error:', error);
    res.status(400).json({
      success: false,
      error: error.message || 'Bulk revenue distribution failed'
    });
  }
});

/**
 * @route   GET /api/revenue/service-charges
 * @desc    Get service charge analytics
 * @access  Private (admin only)
 */
router.get('/service-charges', authenticate, requireAdmin, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    const dateRange = {};
    if (startDate) dateRange.startDate = startDate;
    if (endDate) dateRange.endDate = endDate;

    const serviceChargeAnalytics = RevenueManagementService.getServiceChargeAnalytics(dateRange);

    res.status(200).json({
      success: true,
      data: serviceChargeAnalytics
    });

  } catch (error) {
    console.error('Service charge analytics error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to retrieve service charge analytics'
    });
  }
});

/**
 * @route   GET /api/revenue/hospital-distribution
 * @desc    Get hospital revenue distribution
 * @access  Private (admin only)
 */
router.get('/hospital-distribution', authenticate, requireAdmin, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    const dateRange = {};
    if (startDate) dateRange.startDate = startDate;
    if (endDate) dateRange.endDate = endDate;

    const hospitalDistribution = RevenueManagementService.getHospitalRevenueDistribution(dateRange);

    res.status(200).json({
      success: true,
      data: hospitalDistribution
    });

  } catch (error) {
    console.error('Hospital revenue distribution error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to retrieve hospital revenue distribution'
    });
  }
});

/**
 * @route   GET /api/revenue/balance-summary
 * @desc    Get balance summary statistics
 * @access  Private (admin only)
 */
router.get('/balance-summary', authenticate, requireAdmin, async (req, res) => {
  try {
    const { userType, hospitalId } = req.query;

    const UserBalance = require('../models/UserBalance');
    const summary = UserBalance.getBalanceSummary(
      userType,
      hospitalId ? parseInt(hospitalId) : null
    );

    res.status(200).json({
      success: true,
      data: summary
    });

  } catch (error) {
    console.error('Balance summary error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to retrieve balance summary'
    });
  }
});

/**
 * @route   GET /api/revenue/audit-trail
 * @desc    Get revenue audit trail
 * @access  Private (admin or hospital authority for own data)
 */
router.get('/audit-trail', authenticate, async (req, res) => {
  try {
    const { 
      userId, 
      hospitalId, 
      transactionType, 
      startDate, 
      endDate, 
      limit 
    } = req.query;

    // Authorization check
    if (req.user.userType === 'hospital-authority') {
      // Hospital authorities can only see their own hospital's audit trail
      if (hospitalId && parseInt(hospitalId) !== req.user.hospital_id) {
        return res.status(403).json({
          success: false,
          error: 'Access denied. You can only access your hospital audit trail.'
        });
      }
      
      if (userId && parseInt(userId) !== req.user.id) {
        return res.status(403).json({
          success: false,
          error: 'Access denied. You can only access your own audit trail.'
        });
      }
    }

    const options = {
      userId: userId ? parseInt(userId) : undefined,
      hospitalId: hospitalId ? parseInt(hospitalId) : undefined,
      transactionType,
      startDate,
      endDate,
      limit: limit ? parseInt(limit) : 50
    };

    const BalanceTransaction = require('../models/BalanceTransaction');
    const auditTrail = BalanceTransaction.getAuditTrail(options);

    res.status(200).json({
      success: true,
      data: auditTrail,
      count: auditTrail.length
    });

  } catch (error) {
    console.error('Audit trail error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to retrieve audit trail'
    });
  }
});

module.exports = router;