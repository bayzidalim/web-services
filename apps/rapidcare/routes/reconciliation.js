const express = require('express');
const router = express.Router();
const FinancialReconciliationService = require('../services/financialReconciliationService');
const { authenticate, requireAdmin } = require('../middleware/auth');
const ErrorHandler = require('../utils/errorHandler');
const { formatTaka, parseTaka, isValidTakaAmount } = require('../utils/currencyUtils');

// Initialize reconciliation service
let reconciliationService;

function initializeReconciliationService(database) {
  reconciliationService = new FinancialReconciliationService(database);
}

/**
 * GET /api/reconciliation/daily/:date
 * Get daily reconciliation record
 */
router.get('/daily/:date', authenticate, requireAdmin, async (req, res) => {
  try {
    const { date } = req.params;
    const reconciliationDate = new Date(date);

    if (isNaN(reconciliationDate.getTime())) {
      return res.status(400).json({ error: 'Invalid date format' });
    }

    const reconciliationRecord = await reconciliationService.getReconciliationByDate(reconciliationDate);

    if (!reconciliationRecord) {
      return res.status(404).json({ error: 'Reconciliation record not found for this date' });
    }

    res.json({
      success: true,
      data: reconciliationRecord
    });
  } catch (error) {
    const handledError = ErrorHandler.handleError(error, 'Failed to get daily reconciliation');
    res.status(500).json({ error: handledError.message });
  }
});

/**
 * POST /api/reconciliation/daily/trigger
 * Manually trigger daily reconciliation
 */
router.post('/daily/trigger', authenticate, requireAdmin, async (req, res) => {
  try {
    const { date } = req.body;
    const reconciliationDate = date ? new Date(date) : new Date();

    if (date && isNaN(reconciliationDate.getTime())) {
      return res.status(400).json({ error: 'Invalid date format' });
    }

    const result = await reconciliationService.performDailyReconciliation(reconciliationDate);

    res.json({
      success: true,
      message: 'Daily reconciliation completed',
      data: result
    });
  } catch (error) {
    const handledError = ErrorHandler.handleError(error, 'Failed to trigger daily reconciliation');
    res.status(500).json({ error: handledError.message });
  }
});

/**
 * GET /api/reconciliation/history
 * Get reconciliation history with pagination
 */
router.get('/history', authenticate, requireAdmin, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const status = req.query.status;
    const startDate = req.query.startDate ? new Date(req.query.startDate) : null;
    const endDate = req.query.endDate ? new Date(req.query.endDate) : null;

    const filters = {};
    if (status) filters.status = status;
    if (startDate) filters.startDate = startDate;
    if (endDate) filters.endDate = endDate;

    const result = await reconciliationService.getReconciliationHistory({
      page,
      limit,
      filters
    });

    res.json({
      success: true,
      data: result.records,
      pagination: result.pagination
    });
  } catch (error) {
    const handledError = ErrorHandler.handleError(error, 'Failed to get reconciliation history');
    res.status(500).json({ error: handledError.message });
  }
});

/**
 * GET /api/reconciliation/discrepancies
 * Get outstanding discrepancies
 */
router.get('/discrepancies', authenticate, requireAdmin, async (req, res) => {
  try {
    const severity = req.query.severity;
    const accountId = req.query.accountId;

    const filters = {};
    if (severity) filters.severity = severity;
    if (accountId) filters.accountId = accountId;

    const discrepancies = await reconciliationService.getOutstandingDiscrepancies(filters);

    // Format amounts for display
    const formattedDiscrepancies = discrepancies.map(discrepancy => ({
      ...discrepancy,
      expected_amount: formatTaka(discrepancy.expected_amount),
      actual_amount: formatTaka(discrepancy.actual_amount),
      difference_amount: formatTaka(discrepancy.difference_amount)
    }));

    res.json({
      success: true,
      data: formattedDiscrepancies
    });
  } catch (error) {
    const handledError = ErrorHandler.handleError(error, 'Failed to get discrepancies');
    res.status(500).json({ error: handledError.message });
  }
});

/**
 * PUT /api/reconciliation/discrepancies/:id/resolve
 * Resolve a discrepancy
 */
router.put('/discrepancies/:id/resolve', authenticate, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { resolutionNotes } = req.body;
    const userId = req.user.id;

    if (!resolutionNotes || resolutionNotes.trim().length === 0) {
      return res.status(400).json({ error: 'Resolution notes are required' });
    }

    const result = await reconciliationService.resolveDiscrepancy(
      parseInt(id),
      userId,
      resolutionNotes.trim()
    );

    res.json({
      success: true,
      message: 'Discrepancy resolved successfully',
      data: result
    });
  } catch (error) {
    const handledError = ErrorHandler.handleError(error, 'Failed to resolve discrepancy');
    res.status(500).json({ error: handledError.message });
  }
});

/**
 * POST /api/reconciliation/transaction/:id/verify
 * Verify transaction integrity
 */
router.post('/transaction/:id/verify', authenticate, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const verification = await reconciliationService.verifyTransactionIntegrity(id);

    res.json({
      success: true,
      data: verification
    });
  } catch (error) {
    const handledError = ErrorHandler.handleError(error, 'Failed to verify transaction integrity');
    res.status(500).json({ error: handledError.message });
  }
});

/**
 * POST /api/reconciliation/audit-trail
 * Generate audit trail report
 */
router.post('/audit-trail', authenticate, requireAdmin, async (req, res) => {
  try {
    const { startDate, endDate, format = 'json' } = req.body;

    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'Start date and end date are required' });
    }

    const start = new Date(startDate);
    const end = new Date(endDate);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return res.status(400).json({ error: 'Invalid date format' });
    }

    if (start >= end) {
      return res.status(400).json({ error: 'Start date must be before end date' });
    }

    const auditTrail = await reconciliationService.generateAuditTrail(start, end);

    if (format === 'csv') {
      // Convert to CSV format
      const csv = convertAuditTrailToCSV(auditTrail);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="audit-trail-${startDate}-${endDate}.csv"`);
      res.send(csv);
    } else {
      res.json({
        success: true,
        data: auditTrail
      });
    }
  } catch (error) {
    const handledError = ErrorHandler.handleError(error, 'Failed to generate audit trail');
    res.status(500).json({ error: handledError.message });
  }
});

/**
 * POST /api/reconciliation/balance/correct
 * Correct account balance (admin only)
 */
router.post('/balance/correct', authenticate, requireAdmin, async (req, res) => {
  try {
    const { accountId, currentBalance, correctBalance, reason, evidence } = req.body;
    const adminUserId = req.user.id;

    // Validate required fields
    if (!accountId || !currentBalance || !correctBalance || !reason) {
      return res.status(400).json({
        error: 'Account ID, current balance, correct balance, and reason are required'
      });
    }

    // Validate Taka amounts
    if (!isValidTakaAmount(currentBalance) || !isValidTakaAmount(correctBalance)) {
      return res.status(400).json({ error: 'Invalid Taka amount format' });
    }

    const correctionData = {
      accountId,
      currentBalance,
      correctBalance,
      reason: reason.trim(),
      evidence: evidence ? evidence.trim() : null
    };

    const result = await reconciliationService.correctBalance(correctionData, adminUserId);

    res.json({
      success: true,
      message: 'Balance correction applied successfully',
      data: {
        transactionId: result.id,
        correction: {
          from: formatTaka(currentBalance),
          to: formatTaka(correctBalance),
          difference: formatTaka(parseTaka(correctBalance) - parseTaka(currentBalance))
        }
      }
    });
  } catch (error) {
    const handledError = ErrorHandler.handleError(error, 'Failed to correct balance');
    res.status(500).json({ error: handledError.message });
  }
});

/**
 * GET /api/reconciliation/health
 * Get financial health status
 */
router.get('/health', authenticate, requireAdmin, async (req, res) => {
  try {
    const healthStatus = await reconciliationService.monitorFinancialHealth();

    res.json({
      success: true,
      data: healthStatus
    });
  } catch (error) {
    const handledError = ErrorHandler.handleError(error, 'Failed to get financial health status');
    res.status(500).json({ error: handledError.message });
  }
});

/**
 * GET /api/reconciliation/health/history
 * Get financial health check history
 */
router.get('/health/history', authenticate, requireAdmin, async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const query = `
      SELECT * FROM financial_health_checks 
      WHERE check_date >= ? 
      ORDER BY check_date DESC
    `;
    const healthHistory = reconciliationService.db.prepare(query).all(startDate.toISOString());

    // Parse JSON fields
    const formattedHistory = healthHistory.map(record => ({
      ...record,
      metrics: JSON.parse(record.metrics),
      alerts: JSON.parse(record.alerts)
    }));

    res.json({
      success: true,
      data: formattedHistory
    });
  } catch (error) {
    const handledError = ErrorHandler.handleError(error, 'Failed to get health history');
    res.status(500).json({ error: handledError.message });
  }
});

/**
 * GET /api/reconciliation/corrections/history
 * Get balance correction history
 */
router.get('/corrections/history', authenticate, requireAdmin, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;

    const query = `
      SELECT bc.*, u.name as admin_name
      FROM balance_corrections bc
      LEFT JOIN users u ON bc.admin_user_id = u.id
      ORDER BY bc.created_at DESC
      LIMIT ? OFFSET ?
    `;
    const corrections = reconciliationService.db.prepare(query).all(limit, offset);

    // Get total count
    const countQuery = `SELECT COUNT(*) as total FROM balance_corrections`;
    const { total } = reconciliationService.db.prepare(countQuery).get();

    // Format amounts
    const formattedCorrections = corrections.map(correction => ({
      ...correction,
      original_balance: formatTaka(correction.original_balance),
      corrected_balance: formatTaka(correction.corrected_balance),
      difference_amount: formatTaka(correction.difference_amount)
    }));

    res.json({
      success: true,
      data: formattedCorrections,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    const handledError = ErrorHandler.handleError(error, 'Failed to get correction history');
    res.status(500).json({ error: handledError.message });
  }
});

// Helper function to convert audit trail to CSV
function convertAuditTrailToCSV(auditTrail) {
  const headers = [
    'Transaction ID',
    'Type',
    'Amount (Taka)',
    'Account ID',
    'Timestamp',
    'Reference',
    'Status'
  ];

  let csv = headers.join(',') + '\n';

  auditTrail.transactions.forEach(transaction => {
    const row = [
      transaction.id,
      transaction.type,
      transaction.amount,
      transaction.accountId,
      transaction.timestamp,
      transaction.reference || '',
      transaction.status
    ];
    csv += row.map(field => `"${field}"`).join(',') + '\n';
  });

  return csv;
}

// Add method to get reconciliation by date
FinancialReconciliationService.prototype.getReconciliationByDate = function (date) {
  const query = `
    SELECT * FROM reconciliation_records 
    WHERE date = ? 
    ORDER BY created_at DESC 
    LIMIT 1
  `;
  const record = this.db.prepare(query).get(date.toISOString().split('T')[0]);

  if (record) {
    return {
      ...record,
      expected_balances: JSON.parse(record.expected_balances),
      actual_balances: JSON.parse(record.actual_balances),
      discrepancies: JSON.parse(record.discrepancies || '[]')
    };
  }

  return null;
};

module.exports = { router, initializeReconciliationService };