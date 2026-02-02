const FinancialReconciliationService = require('../services/financialReconciliationService');
const ErrorHandler = require('../utils/errorHandler');


class ReconciliationController {
  constructor(database) {
    this.reconciliationService = new FinancialReconciliationService(database);
  }

  /**
   * Trigger daily reconciliation process
   */
  async performDailyReconciliation(req, res) {
    try {
      const { date } = req.query;
      const reconciliationDate = date ? new Date(date) : new Date();
      
      const result = await this.reconciliationService.performDailyReconciliation(reconciliationDate);
      
      res.json({
        success: true,
        data: result,
        message: 'Daily reconciliation completed successfully'
      });
    } catch (error) {
      const handledError = ErrorHandler.handleError(error, 'Failed to perform daily reconciliation');
      res.status(handledError.statusCode || 500).json({
        success: false,
        error: handledError.message
      });
    }
  }

  /**
   * Verify transaction integrity
   */
  async verifyTransactionIntegrity(req, res) {
    try {
      const { transactionId } = req.params;
      
      if (!transactionId) {
        throw ErrorHandler.createError('Transaction ID is required', 400);
      }

      const result = await this.reconciliationService.verifyTransactionIntegrity(transactionId);
      
      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      const handledError = ErrorHandler.handleError(error, 'Failed to verify transaction integrity');
      res.status(handledError.statusCode || 500).json({
        success: false,
        error: handledError.message
      });
    }
  }

  /**
   * Generate audit trail report
   */
  async generateAuditTrail(req, res) {
    try {
      const { startDate, endDate, format = 'json' } = req.query;
      
      if (!startDate || !endDate) {
        throw ErrorHandler.createError('Start date and end date are required', 400);
      }

      const start = new Date(startDate);
      const end = new Date(endDate);
      
      if (start >= end) {
        throw ErrorHandler.createError('Start date must be before end date', 400);
      }

      const auditTrail = await this.reconciliationService.generateAuditTrail(start, end);
      
      if (format === 'csv') {
        const csv = this.convertAuditTrailToCSV(auditTrail);
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
      res.status(handledError.statusCode || 500).json({
        success: false,
        error: handledError.message
      });
    }
  }

  /**
   * Correct account balance (admin only)
   */
  async correctBalance(req, res) {
    try {
      // Check if user is admin
      if (req.user.role !== 'admin') {
        throw ErrorHandler.createError('Insufficient permissions', 403);
      }

      const { accountId, currentBalance, correctBalance, reason, evidence } = req.body;
      
      if (!accountId || !currentBalance || !correctBalance || !reason) {
        throw ErrorHandler.createError('Missing required fields', 400);
      }

      const result = await this.reconciliationService.correctBalance({
        accountId,
        currentBalance,
        correctBalance,
        reason,
        evidence
      }, req.user.id);
      
      res.json({
        success: true,
        data: result,
        message: 'Balance correction applied successfully'
      });
    } catch (error) {
      const handledError = ErrorHandler.handleError(error, 'Failed to correct balance');
      res.status(handledError.statusCode || 500).json({
        success: false,
        error: handledError.message
      });
    }
  }

  /**
   * Get financial health status
   */
  async getFinancialHealth(req, res) {
    try {
      const healthStatus = await this.reconciliationService.monitorFinancialHealth();
      
      res.json({
        success: true,
        data: healthStatus
      });
    } catch (error) {
      const handledError = ErrorHandler.handleError(error, 'Failed to get financial health status');
      res.status(handledError.statusCode || 500).json({
        success: false,
        error: handledError.message
      });
    }
  }

  /**
   * Get reconciliation history
   */
  async getReconciliationHistory(req, res) {
    try {
      const { page = 1, limit = 20, status, startDate, endDate } = req.query;
      
      const filters = {};
      if (status) filters.status = status;
      if (startDate) filters.startDate = new Date(startDate);
      if (endDate) filters.endDate = new Date(endDate);
      
      const history = await this.reconciliationService.getReconciliationHistory({
        page: parseInt(page),
        limit: parseInt(limit),
        filters
      });
      
      res.json({
        success: true,
        data: history
      });
    } catch (error) {
      const handledError = ErrorHandler.handleError(error, 'Failed to get reconciliation history');
      res.status(handledError.statusCode || 500).json({
        success: false,
        error: handledError.message
      });
    }
  }

  /**
   * Get outstanding discrepancies
   */
  async getOutstandingDiscrepancies(req, res) {
    try {
      const { severity, accountId } = req.query;
      
      const filters = {};
      if (severity) filters.severity = severity;
      if (accountId) filters.accountId = accountId;
      
      const discrepancies = await this.reconciliationService.getOutstandingDiscrepancies(filters);
      
      res.json({
        success: true,
        data: discrepancies
      });
    } catch (error) {
      const handledError = ErrorHandler.handleError(error, 'Failed to get outstanding discrepancies');
      res.status(handledError.statusCode || 500).json({
        success: false,
        error: handledError.message
      });
    }
  }

  /**
   * Resolve discrepancy
   */
  async resolveDiscrepancy(req, res) {
    try {
      const { discrepancyId } = req.params;
      const { resolutionNotes } = req.body;
      
      if (!discrepancyId) {
        throw ErrorHandler.createError('Discrepancy ID is required', 400);
      }

      const result = await this.reconciliationService.resolveDiscrepancy(
        discrepancyId,
        req.user.id,
        resolutionNotes
      );
      
      res.json({
        success: true,
        data: result,
        message: 'Discrepancy resolved successfully'
      });
    } catch (error) {
      const handledError = ErrorHandler.handleError(error, 'Failed to resolve discrepancy');
      res.status(handledError.statusCode || 500).json({
        success: false,
        error: handledError.message
      });
    }
  }

  // Helper method to convert audit trail to CSV
  convertAuditTrailToCSV(auditTrail) {
    const headers = ['Date', 'Transaction ID', 'Type', 'Amount (BDT)', 'Account ID', 'Status', 'Reference'];
    const rows = [headers.join(',')];
    
    auditTrail.transactions.forEach(tx => {
      const row = [
        tx.timestamp,
        tx.id,
        tx.type,
        tx.amount,
        tx.accountId,
        tx.status,
        tx.reference || ''
      ];
      rows.push(row.map(field => `"${field}"`).join(','));
    });
    
    return rows.join('\n');
  }
}

module.exports = ReconciliationController;