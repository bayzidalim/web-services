const db = require('../config/database');
const securityUtils = require('../utils/securityUtils');

class AuditService {
  constructor() {
    this.initializeAuditTables();
  }

  /**
   * Initialize audit tables if they don't exist
   */
  initializeAuditTables() {
    try {
      // Financial operations audit table
      db.exec(`
        CREATE TABLE IF NOT EXISTS financial_audit_log (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          transaction_id TEXT NOT NULL,
          user_id INTEGER,
          operation_type TEXT NOT NULL,
          amount_taka DECIMAL(10,2),
          currency TEXT DEFAULT 'BDT',
          payment_method TEXT,
          mobile_number_masked TEXT,
          status TEXT NOT NULL,
          ip_address TEXT,
          user_agent TEXT,
          session_id TEXT,
          risk_score INTEGER DEFAULT 0,
          fraud_flags TEXT,
          audit_hash TEXT NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users(id)
        )
      `);

      // Security events audit table
      db.exec(`
        CREATE TABLE IF NOT EXISTS security_audit_log (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          event_type TEXT NOT NULL,
          user_id INTEGER,
          ip_address TEXT,
          user_agent TEXT,
          session_id TEXT,
          event_data TEXT,
          severity TEXT DEFAULT 'INFO',
          audit_hash TEXT NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users(id)
        )
      `);

      // Payment data encryption log
      db.exec(`
        CREATE TABLE IF NOT EXISTS encryption_audit_log (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          data_type TEXT NOT NULL,
          operation TEXT NOT NULL,
          user_id INTEGER,
          success BOOLEAN NOT NULL,
          error_message TEXT,
          audit_hash TEXT NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users(id)
        )
      `);

    } catch (error) {
      console.error('Failed to initialize audit tables:', error);
    }
  }

  /**
   * Log financial operations with comprehensive audit trail
   */
  logFinancialOperation(operationData) {
    try {
      const {
        transactionId,
        userId,
        operationType,
        amountTaka,
        currency = 'BDT',
        paymentMethod,
        mobileNumber,
        status,
        ipAddress,
        userAgent,
        sessionId,
        riskScore = 0,
        fraudFlags = []
      } = operationData;

      // Mask sensitive data
      const maskedMobileNumber = mobileNumber ? securityUtils.maskMobileNumber(mobileNumber) : null;
      
      const auditData = {
        transaction_id: transactionId,
        user_id: userId,
        operation_type: operationType,
        amount_taka: amountTaka,
        currency,
        payment_method: paymentMethod,
        mobile_number_masked: maskedMobileNumber,
        status,
        ip_address: ipAddress,
        user_agent: userAgent,
        session_id: sessionId,
        risk_score: riskScore,
        fraud_flags: JSON.stringify(fraudFlags)
      };

      // Generate audit hash for integrity
      const auditHash = securityUtils.generateAuditHash(auditData);
      auditData.audit_hash = auditHash;

      const stmt = db.prepare(`
        INSERT INTO financial_audit_log (
          transaction_id, user_id, operation_type, amount_taka, currency,
          payment_method, mobile_number_masked, status, ip_address,
          user_agent, session_id, risk_score, fraud_flags, audit_hash
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      // Handle case where user_id might not exist in users table
      let validUserId = auditData.user_id;
      if (validUserId) {
        try {
          const userCheck = db.prepare('SELECT id FROM users WHERE id = ?').get(validUserId);
          if (!userCheck) {
            validUserId = null; // Set to null if user doesn't exist
          }
        } catch {
          validUserId = null; // Set to null if users table doesn't exist or other error
        }
      }

      const result = stmt.run(
        auditData.transaction_id,
        validUserId,
        auditData.operation_type,
        auditData.amount_taka,
        auditData.currency,
        auditData.payment_method,
        auditData.mobile_number_masked,
        auditData.status,
        auditData.ip_address,
        auditData.user_agent,
        auditData.session_id,
        auditData.risk_score,
        auditData.fraud_flags,
        auditData.audit_hash
      );

      return { success: true, auditId: result.lastInsertRowid };
    } catch (error) {
      console.error('Failed to log financial operation:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Log security events
   */
  logSecurityEvent(eventData) {
    try {
      const {
        eventType,
        userId,
        ipAddress,
        userAgent,
        sessionId,
        eventData: data,
        severity = 'INFO'
      } = eventData;

      const auditData = {
        event_type: eventType,
        user_id: userId,
        ip_address: ipAddress,
        user_agent: userAgent,
        session_id: sessionId,
        event_data: JSON.stringify(data),
        severity
      };

      const auditHash = securityUtils.generateAuditHash(auditData);
      auditData.audit_hash = auditHash;

      const stmt = db.prepare(`
        INSERT INTO security_audit_log (
          event_type, user_id, ip_address, user_agent,
          session_id, event_data, severity, audit_hash
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);

      // Handle case where user_id might not exist in users table
      let validUserId2 = auditData.user_id;
      if (validUserId2) {
        try {
          const userCheck = db.prepare('SELECT id FROM users WHERE id = ?').get(validUserId2);
          if (!userCheck) {
            validUserId2 = null; // Set to null if user doesn't exist
          }
        } catch (error) {
          validUserId2 = null; // Set to null if users table doesn't exist or other error
        }
      }

      const result = stmt.run(
        auditData.event_type,
        validUserId2,
        auditData.ip_address,
        auditData.user_agent,
        auditData.session_id,
        auditData.event_data,
        auditData.severity,
        auditData.audit_hash
      );

      return { success: true, auditId: result.lastInsertRowid };
    } catch (error) {
      console.error('Failed to log security event:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Log encryption/decryption operations
   */
  logEncryptionOperation(operationData) {
    try {
      const {
        dataType,
        operation,
        userId,
        success,
        errorMessage = null
      } = operationData;

      const auditData = {
        data_type: dataType,
        operation,
        user_id: userId,
        success,
        error_message: errorMessage
      };

      const auditHash = securityUtils.generateAuditHash(auditData);
      auditData.audit_hash = auditHash;

      const stmt = db.prepare(`
        INSERT INTO encryption_audit_log (
          data_type, operation, user_id, success, error_message, audit_hash
        ) VALUES (?, ?, ?, ?, ?, ?)
      `);

      // Handle case where user_id might not exist in users table
      let validUserId3 = auditData.user_id;
      if (validUserId3) {
        try {
          const userCheck = db.prepare('SELECT id FROM users WHERE id = ?').get(validUserId3);
          if (!userCheck) {
            validUserId3 = null; // Set to null if user doesn't exist
          }
        } catch (error) {
          validUserId3 = null; // Set to null if users table doesn't exist or other error
        }
      }

      const result = stmt.run(
        auditData.data_type,
        auditData.operation,
        validUserId3,
        auditData.success,
        auditData.error_message,
        auditData.audit_hash
      );

      return { success: true, auditId: result.lastInsertRowid };
    } catch (error) {
      console.error('Failed to log encryption operation:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get financial audit logs with filtering
   */
  getFinancialAuditLogs(filters = {}) {
    try {
      let query = 'SELECT * FROM financial_audit_log WHERE 1=1';
      const params = [];

      if (filters.userId) {
        query += ' AND user_id = ?';
        params.push(filters.userId);
      }

      if (filters.transactionId) {
        query += ' AND transaction_id = ?';
        params.push(filters.transactionId);
      }

      if (filters.operationType) {
        query += ' AND operation_type = ?';
        params.push(filters.operationType);
      }

      if (filters.startDate) {
        query += ' AND created_at >= ?';
        params.push(filters.startDate);
      }

      if (filters.endDate) {
        query += ' AND created_at <= ?';
        params.push(filters.endDate);
      }

      if (filters.minAmount) {
        query += ' AND amount_taka >= ?';
        params.push(filters.minAmount);
      }

      if (filters.maxAmount) {
        query += ' AND amount_taka <= ?';
        params.push(filters.maxAmount);
      }

      query += ' ORDER BY created_at DESC';

      if (filters.limit) {
        query += ' LIMIT ?';
        params.push(filters.limit);
      }

      const stmt = db.prepare(query);
      const logs = stmt.all(...params);

      return { success: true, logs };
    } catch (error) {
      console.error('Failed to get financial audit logs:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Verify audit log integrity
   */
  verifyAuditIntegrity(logId, logType = 'financial') {
    try {
      let tableName;
      switch (logType) {
        case 'financial':
          tableName = 'financial_audit_log';
          break;
        case 'security':
          tableName = 'security_audit_log';
          break;
        case 'encryption':
          tableName = 'encryption_audit_log';
          break;
        default:
          throw new Error('Invalid log type');
      }

      const stmt = db.prepare(`SELECT * FROM ${tableName} WHERE id = ?`);
      const log = stmt.get(logId);

      if (!log) {
        return { success: false, error: 'Log not found' };
      }

      const storedHash = log.audit_hash;
      delete log.audit_hash;
      delete log.id;
      delete log.created_at;

      const calculatedHash = securityUtils.generateAuditHash(log);
      const isValid = calculatedHash === storedHash;

      return {
        success: true,
        isValid,
        storedHash,
        calculatedHash
      };
    } catch (error) {
      console.error('Failed to verify audit integrity:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Generate audit report
   */
  generateAuditReport(reportType, filters = {}) {
    try {
      const report = {
        reportType,
        generatedAt: new Date().toISOString(),
        filters,
        summary: {},
        details: []
      };

      switch (reportType) {
        case 'financial_summary':
          report.details = this.getFinancialSummaryReport(filters);
          break;
        case 'security_events':
          report.details = this.getSecurityEventsReport(filters);
          break;
        case 'fraud_analysis':
          report.details = this.getFraudAnalysisReport(filters);
          break;
        default:
          throw new Error('Invalid report type');
      }

      return { success: true, report };
    } catch (error) {
      console.error('Failed to generate audit report:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get financial summary report
   */
  getFinancialSummaryReport(filters) {
    const stmt = db.prepare(`
      SELECT 
        operation_type,
        payment_method,
        COUNT(*) as transaction_count,
        SUM(amount_taka) as total_amount,
        AVG(amount_taka) as average_amount,
        MIN(amount_taka) as min_amount,
        MAX(amount_taka) as max_amount,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as successful_transactions,
        COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_transactions
      FROM financial_audit_log 
      WHERE created_at >= COALESCE(?, '1970-01-01')
        AND created_at <= COALESCE(?, '2099-12-31')
      GROUP BY operation_type, payment_method
      ORDER BY total_amount DESC
    `);

    return stmt.all(filters.startDate, filters.endDate);
  }

  /**
   * Get security events report
   */
  getSecurityEventsReport(filters) {
    const stmt = db.prepare(`
      SELECT 
        event_type,
        severity,
        COUNT(*) as event_count,
        COUNT(DISTINCT user_id) as affected_users,
        COUNT(DISTINCT ip_address) as unique_ips
      FROM security_audit_log 
      WHERE created_at >= COALESCE(?, '1970-01-01')
        AND created_at <= COALESCE(?, '2099-12-31')
      GROUP BY event_type, severity
      ORDER BY event_count DESC
    `);

    return stmt.all(filters.startDate, filters.endDate);
  }

  /**
   * Get fraud analysis report
   */
  getFraudAnalysisReport(filters) {
    const stmt = db.prepare(`
      SELECT 
        risk_score,
        COUNT(*) as transaction_count,
        AVG(amount_taka) as average_amount,
        fraud_flags
      FROM financial_audit_log 
      WHERE risk_score > 0
        AND created_at >= COALESCE(?, '1970-01-01')
        AND created_at <= COALESCE(?, '2099-12-31')
      GROUP BY risk_score, fraud_flags
      ORDER BY risk_score DESC
    `);

    return stmt.all(filters.startDate, filters.endDate);
  }
}

module.exports = new AuditService();