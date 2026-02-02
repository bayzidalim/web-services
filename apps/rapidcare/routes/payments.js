const express = require('express');
const router = express.Router();
const PaymentProcessingService = require('../services/paymentProcessingService');
const RevenueManagementService = require('../services/revenueManagementService');
const { authenticate } = require('../middleware/auth');

/**
 * @route   POST /api/payments/process
 * @desc    Process booking payment
 * @access  Private (authenticated users)
 */
router.post('/process', authenticate, async (req, res) => {
  try {
    const { bookingId, paymentData } = req.body;

    // Validate required fields
    if (!bookingId || !paymentData) {
      return res.status(400).json({
        success: false,
        error: 'Booking ID and payment data are required'
      });
    }

    // Process payment
    const result = await PaymentProcessingService.processBookingPayment(
      bookingId,
      paymentData,
      req.user.id
    );

    if (result.success) {
      // Distribute revenue after successful payment
      try {
        await RevenueManagementService.distributeRevenue(
          result.transaction.id,
          result.transaction.amount,
          result.transaction.hospitalId
        );
      } catch (revenueError) {
        console.error('Revenue distribution error:', revenueError);
        // Payment was successful, but revenue distribution failed
        // This should be handled by a background job in production
      }

      res.status(200).json({
        success: true,
        data: {
          transaction: result.transaction,
          paymentResult: result.paymentResult
        },
        message: result.message
      });
    } else {
      res.status(402).json({
        success: false,
        data: {
          transaction: result.transaction
        },
        error: result.error,
        message: result.message
      });
    }

  } catch (error) {
    console.error('Payment processing error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Payment processing failed'
    });
  }
});

/**
 * @route   GET /api/payments/:id/receipt
 * @desc    Get payment receipt
 * @access  Private (authenticated users)
 */
router.get('/:id/receipt', authenticate, async (req, res) => {
  try {
    const transactionId = req.params.id;

    // Get transaction with receipt
    const transactionWithReceipt = PaymentProcessingService.getTransactionWithReceipt(transactionId);

    if (!transactionWithReceipt) {
      return res.status(404).json({
        success: false,
        error: 'Transaction not found'
      });
    }

    // Check if user has access to this transaction
    if (transactionWithReceipt.transaction.userId !== req.user.id && req.user.userType !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      });
    }

    res.status(200).json({
      success: true,
      data: {
        transaction: transactionWithReceipt.transaction,
        receipt: transactionWithReceipt.receipt
      }
    });

  } catch (error) {
    console.error('Receipt retrieval error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to retrieve receipt'
    });
  }
});

/**
 * @route   POST /api/payments/:id/refund
 * @desc    Process payment refund
 * @access  Private (admin or hospital authority)
 */
router.post('/:id/refund', authenticate, async (req, res) => {
  try {
    // Check authorization
    if (!['admin', 'hospital-authority'].includes(req.user.userType)) {
      return res.status(403).json({
        success: false,
        error: 'Only admins and hospital authorities can process refunds'
      });
    }

    const transactionId = req.params.id;
    const { refundAmount, reason } = req.body;

    // Validate required fields
    if (!refundAmount || !reason) {
      return res.status(400).json({
        success: false,
        error: 'Refund amount and reason are required'
      });
    }

    // Process refund
    const refundResult = await PaymentProcessingService.processRefund(
      transactionId,
      parseFloat(refundAmount),
      reason
    );

    if (refundResult.success) {
      // Process refund revenue distribution
      try {
        await RevenueManagementService.processRefundDistribution(
          transactionId,
          parseFloat(refundAmount)
        );
      } catch (revenueError) {
        console.error('Refund revenue distribution error:', revenueError);
        // Refund was processed, but revenue distribution failed
        // This should be handled by a background job in production
      }

      res.status(200).json({
        success: true,
        data: refundResult,
        message: 'Refund processed successfully'
      });
    } else {
      res.status(400).json({
        success: false,
        error: 'Refund processing failed'
      });
    }

  } catch (error) {
    console.error('Refund processing error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Refund processing failed'
    });
  }
});

/**
 * @route   GET /api/payments/history/:userId
 * @desc    Get payment history for a user
 * @access  Private (user's own history or admin)
 */
router.get('/history/:userId', authenticate, async (req, res) => {
  try {
    const userId = parseInt(req.params.userId);
    const limit = parseInt(req.query.limit) || 50;

    // Check authorization
    if (req.user.id !== userId && req.user.userType !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      });
    }

    // Get payment history
    const paymentHistory = PaymentProcessingService.getPaymentHistory(userId, limit);

    res.status(200).json({
      success: true,
      data: paymentHistory,
      count: paymentHistory.length
    });

  } catch (error) {
    console.error('Payment history error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to retrieve payment history'
    });
  }
});

/**
 * @route   GET /api/payments/history
 * @desc    Get current user's payment history
 * @access  Private (authenticated users)
 */
router.get('/history', authenticate, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;

    // Get payment history for current user
    const paymentHistory = PaymentProcessingService.getPaymentHistory(req.user.id, limit);

    res.status(200).json({
      success: true,
      data: paymentHistory,
      count: paymentHistory.length
    });

  } catch (error) {
    console.error('Payment history error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to retrieve payment history'
    });
  }
});

/**
 * @route   POST /api/payments/:id/retry
 * @desc    Retry failed payment
 * @access  Private (authenticated users)
 */
router.post('/:id/retry', authenticate, async (req, res) => {
  try {
    const transactionId = req.params.id;
    const { paymentData } = req.body;

    // Validate required fields
    if (!paymentData) {
      return res.status(400).json({
        success: false,
        error: 'Payment data is required'
      });
    }

    // Retry payment
    const result = await PaymentProcessingService.retryPayment(transactionId, paymentData);

    if (result.success) {
      // Distribute revenue after successful payment
      try {
        await RevenueManagementService.distributeRevenue(
          result.transaction.id,
          result.transaction.amount,
          result.transaction.hospitalId
        );
      } catch (revenueError) {
        console.error('Revenue distribution error:', revenueError);
      }

      res.status(200).json({
        success: true,
        data: {
          transaction: result.transaction,
          paymentResult: result.paymentResult
        },
        message: result.message
      });
    } else {
      res.status(402).json({
        success: false,
        data: {
          transaction: result.transaction
        },
        error: result.error,
        message: result.message
      });
    }

  } catch (error) {
    console.error('Payment retry error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Payment retry failed'
    });
  }
});

/**
 * @route   GET /api/payments/transaction/:transactionId
 * @desc    Get transaction details by transaction ID
 * @access  Private (authenticated users)
 */
router.get('/transaction/:transactionId', authenticate, async (req, res) => {
  try {
    const { transactionId } = req.params;

    // Get transaction details
    const transactionWithReceipt = PaymentProcessingService.getTransactionWithReceipt(transactionId);

    if (!transactionWithReceipt) {
      return res.status(404).json({
        success: false,
        error: 'Transaction not found'
      });
    }

    // Check authorization
    if (transactionWithReceipt.transaction.userId !== req.user.id &&
      req.user.userType !== 'admin' &&
      req.user.userType !== 'hospital-authority') {
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      });
    }

    res.status(200).json({
      success: true,
      data: transactionWithReceipt
    });

  } catch (error) {
    console.error('Transaction retrieval error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to retrieve transaction'
    });
  }
});

/**
 * @route   GET /api/payments/validate
 * @desc    Validate payment data
 * @access  Private (authenticated users)
 */
router.post('/validate', authenticate, async (req, res) => {
  try {
    const { paymentData } = req.body;

    if (!paymentData) {
      return res.status(400).json({
        success: false,
        error: 'Payment data is required'
      });
    }

    // Validate payment data
    const validation = PaymentProcessingService.validatePaymentData(paymentData);

    res.status(200).json({
      success: true,
      data: validation
    });

  } catch (error) {
    console.error('Payment validation error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Payment validation failed'
    });
  }
});

module.exports = router;