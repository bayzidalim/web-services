const express = require('express');
const router = express.Router();
const AdminBalanceService = require('../services/adminBalanceService');
const { authenticate, authorizeUserType } = require('../middleware/auth');

/**
 * @route   GET /api/admin/balance
 * @desc    Get admin balance information
 * @access  Private (admin only)
 */
router.get('/', authenticate, authorizeUserType(['admin']), async (req, res) => {
  try {
    const balance = AdminBalanceService.getAdminBalance();
    
    res.json({
      success: true,
      data: balance
    });
  } catch (error) {
    console.error('Error getting admin balance:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get admin balance'
    });
  }
});

/**
 * @route   GET /api/admin/balance/summary
 * @desc    Get admin financial summary
 * @access  Private (admin only)
 */
router.get('/summary', authenticate, authorizeUserType(['admin']), async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    const options = {};
    if (startDate && endDate) {
      options.startDate = startDate;
      options.endDate = endDate;
    }
    
    const summary = AdminBalanceService.getAdminFinancialSummary(options);
    
    res.json({
      success: true,
      data: summary
    });
  } catch (error) {
    console.error('Error getting admin financial summary:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get admin financial summary'
    });
  }
});

/**
 * @route   GET /api/admin/balance/transactions
 * @desc    Get admin balance transaction history
 * @access  Private (admin only)
 */
router.get('/transactions', authenticate, authorizeUserType(['admin']), async (req, res) => {
  try {
    const { startDate, endDate, transactionType, limit } = req.query;
    
    const options = {};
    if (startDate && endDate) {
      options.startDate = startDate;
      options.endDate = endDate;
    }
    if (transactionType) {
      options.transactionType = transactionType;
    }
    if (limit) {
      options.limit = parseInt(limit);
    }
    
    const transactions = AdminBalanceService.getAdminTransactionHistory(options);
    
    res.json({
      success: true,
      data: transactions
    });
  } catch (error) {
    console.error('Error getting admin transaction history:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get admin transaction history'
    });
  }
});

/**
 * @route   POST /api/admin/balance/withdraw
 * @desc    Process admin withdrawal
 * @access  Private (admin only)
 */
router.post('/withdraw', authenticate, authorizeUserType(['admin']), async (req, res) => {
  try {
    const { amount, description } = req.body;
    
    // Validate required fields
    if (!amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Valid withdrawal amount is required'
      });
    }
    
    const result = await AdminBalanceService.processWithdrawal(
      amount,
      description,
      req.user.id
    );
    
    if (result.success) {
      res.json({
        success: true,
        data: result.balance,
        message: result.message
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error
      });
    }
  } catch (error) {
    console.error('Error processing admin withdrawal:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to process withdrawal'
    });
  }
});

/**
 * @route   POST /api/admin/balance/initialize
 * @desc    Initialize admin balance (if not exists)
 * @access  Private (admin only)
 */
router.post('/initialize', authenticate, authorizeUserType(['admin']), async (req, res) => {
  try {
    const result = await AdminBalanceService.initializeAdminBalance();
    
    if (result.success) {
      res.json({
        success: true,
        data: result.balance,
        message: result.message
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error
      });
    }
  } catch (error) {
    console.error('Error initializing admin balance:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to initialize admin balance'
    });
  }
});

module.exports = router;
