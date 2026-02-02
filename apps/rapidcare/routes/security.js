const express = require('express');
const router = express.Router();
const auditService = require('../services/auditService');
const fraudDetectionService = require('../services/fraudDetectionService');
const securePaymentDataService = require('../services/securePaymentDataService');
const financialAuth = require('../middleware/financialAuth');

/**
 * Get financial audit logs (Admin only)
 */
router.get('/audit/financial', 
  financialAuth.requireAdminAccess(),
  async (req, res) => {
    try {
      const filters = {
        userId: req.query.userId ? parseInt(req.query.userId) : undefined,
        transactionId: req.query.transactionId,
        operationType: req.query.operationType,
        startDate: req.query.startDate,
        endDate: req.query.endDate,
        minAmount: req.query.minAmount ? parseFloat(req.query.minAmount) : undefined,
        maxAmount: req.query.maxAmount ? parseFloat(req.query.maxAmount) : undefined,
        limit: req.query.limit ? parseInt(req.query.limit) : 100
      };

      const result = auditService.getFinancialAuditLogs(filters);

      if (result.success) {
        res.json({
          success: true,
          logs: result.logs,
          filters,
          count: result.logs.length
        });
      } else {
        res.status(500).json({
          success: false,
          error: result.error
        });
      }
    } catch (error) {
      console.error('Error fetching financial audit logs:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch audit logs'
      });
    }
  }
);

/**
 * Verify audit log integrity (Admin only)
 */
router.post('/audit/verify/:logId',
  financialAuth.requireAdminAccess(),
  async (req, res) => {
    try {
      const { logId } = req.params;
      const { logType = 'financial' } = req.body;

      const result = auditService.verifyAuditIntegrity(parseInt(logId), logType);

      if (result.success) {
        res.json({
          success: true,
          verification: {
            logId: parseInt(logId),
            logType,
            isValid: result.isValid,
            storedHash: result.storedHash,
            calculatedHash: result.calculatedHash,
            verifiedAt: new Date().toISOString()
          }
        });
      } else {
        res.status(400).json({
          success: false,
          error: result.error
        });
      }
    } catch (error) {
      console.error('Error verifying audit integrity:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to verify audit integrity'
      });
    }
  }
);

/**
 * Generate audit report (Admin only)
 */
router.post('/audit/report',
  financialAuth.requireAdminAccess(),
  async (req, res) => {
    try {
      const { reportType, filters = {} } = req.body;

      if (!reportType) {
        return res.status(400).json({
          success: false,
          error: 'Report type is required'
        });
      }

      const validReportTypes = ['financial_summary', 'security_events', 'fraud_analysis'];
      if (!validReportTypes.includes(reportType)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid report type',
          validTypes: validReportTypes
        });
      }

      const result = auditService.generateAuditReport(reportType, filters);

      if (result.success) {
        res.json({
          success: true,
          report: result.report
        });
      } else {
        res.status(500).json({
          success: false,
          error: result.error
        });
      }
    } catch (error) {
      console.error('Error generating audit report:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to generate audit report'
      });
    }
  }
);

/**
 * Get fraud statistics (Admin only)
 */
router.get('/fraud/statistics',
  financialAuth.requireAdminAccess(),
  async (req, res) => {
    try {
      const timeRange = req.query.timeRange || '30 days';
      const result = fraudDetectionService.getFraudStatistics(timeRange);

      if (result.success) {
        res.json({
          success: true,
          statistics: result.statistics,
          timeRange,
          generatedAt: new Date().toISOString()
        });
      } else {
        res.status(500).json({
          success: false,
          error: result.error
        });
      }
    } catch (error) {
      console.error('Error fetching fraud statistics:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch fraud statistics'
      });
    }
  }
);

/**
 * Update fraud detection rules (Admin only)
 */
router.put('/fraud/rules',
  financialAuth.requireAdminAccess(),
  async (req, res) => {
    try {
      const { rules } = req.body;

      if (!rules || typeof rules !== 'object') {
        return res.status(400).json({
          success: false,
          error: 'Rules object is required'
        });
      }

      const result = fraudDetectionService.updateFraudRules(rules);

      if (result.success) {
        res.json({
          success: true,
          message: 'Fraud detection rules updated successfully',
          updatedAt: new Date().toISOString()
        });
      } else {
        res.status(500).json({
          success: false,
          error: result.error
        });
      }
    } catch (error) {
      console.error('Error updating fraud rules:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to update fraud rules'
      });
    }
  }
);

/**
 * Analyze transaction for fraud (Admin/Hospital Authority)
 */
router.post('/fraud/analyze',
  financialAuth.requireFinancialAccess(['admin', 'hospital-authority']),
  async (req, res) => {
    try {
      const {
        userId,
        amountTaka,
        mobileNumber,
        transactionTime
      } = req.body;

      if (!userId || !amountTaka) {
        return res.status(400).json({
          success: false,
          error: 'userId and amountTaka are required'
        });
      }

      const transactionData = {
        userId: parseInt(userId),
        amountTaka: parseFloat(amountTaka),
        mobileNumber,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        sessionId: req.sessionID,
        transactionTime: transactionTime ? new Date(transactionTime) : new Date()
      };

      const result = await fraudDetectionService.analyzeTransaction(transactionData);

      if (result.success) {
        res.json({
          success: true,
          analysis: result.analysis
        });
      } else {
        res.status(500).json({
          success: false,
          error: result.error
        });
      }
    } catch (error) {
      console.error('Error analyzing transaction for fraud:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to analyze transaction'
      });
    }
  }
);

/**
 * Generate compliance report (Admin only)
 */
router.get('/compliance/report',
  financialAuth.requireAdminAccess(),
  async (req, res) => {
    try {
      const timeRange = req.query.timeRange || '30 days';
      const result = await securePaymentDataService.generateComplianceReport(timeRange);

      if (result.success) {
        res.json({
          success: true,
          report: result.report
        });
      } else {
        res.status(500).json({
          success: false,
          error: result.error
        });
      }
    } catch (error) {
      console.error('Error generating compliance report:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to generate compliance report'
      });
    }
  }
);

/**
 * Get security events (Admin only)
 */
router.get('/events',
  financialAuth.requireAdminAccess(),
  async (req, res) => {
    try {
      const filters = {
        startDate: req.query.startDate,
        endDate: req.query.endDate,
        severity: req.query.severity,
        eventType: req.query.eventType,
        userId: req.query.userId ? parseInt(req.query.userId) : undefined,
        limit: req.query.limit ? parseInt(req.query.limit) : 100
      };

      // This would need to be implemented in auditService
      // For now, return a placeholder response
      res.json({
        success: true,
        events: [],
        message: 'Security events endpoint - implementation pending',
        filters
      });
    } catch (error) {
      console.error('Error fetching security events:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch security events'
      });
    }
  }
);

/**
 * Test fraud detection with sample data (Admin only - for testing)
 */
router.post('/fraud/test',
  financialAuth.requireAdminAccess(),
  async (req, res) => {
    try {
      const testScenarios = [
        {
          name: 'Low Risk Transaction',
          data: {
            userId: 1,
            amountTaka: 1000,
            mobileNumber: '01712345678',
            ipAddress: '192.168.1.1',
            userAgent: 'Mozilla/5.0',
            sessionId: 'test-session-1'
          }
        },
        {
          name: 'High Risk Transaction',
          data: {
            userId: 1,
            amountTaka: 100000,
            mobileNumber: '01712345678',
            ipAddress: '10.0.0.1',
            userAgent: 'Unknown',
            sessionId: 'test-session-2'
          }
        },
        {
          name: 'Suspicious Pattern',
          data: {
            userId: 2,
            amountTaka: 50000,
            mobileNumber: '01812345678',
            ipAddress: '127.0.0.1',
            userAgent: 'Bot/1.0',
            sessionId: 'test-session-3'
          }
        }
      ];

      const results = [];

      for (const scenario of testScenarios) {
        const analysis = await fraudDetectionService.analyzeTransaction(scenario.data);
        results.push({
          scenario: scenario.name,
          analysis: analysis.success ? analysis.analysis : { error: analysis.error }
        });
      }

      res.json({
        success: true,
        testResults: results,
        testedAt: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error running fraud detection tests:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to run fraud detection tests'
      });
    }
  }
);

module.exports = router;