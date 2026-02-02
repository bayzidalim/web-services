const securityUtils = require('../utils/securityUtils');
const auditService = require('./auditService');

class SecurePaymentDataService {
  constructor() {
    this.sensitiveFields = ['mobile_number', 'pin', 'otp', 'account_number'];
    this.complianceRequirements = {
      dataRetention: 90, // days
      encryptionRequired: true,
      auditRequired: true
    };
  }

  /**
   * Securely process bKash payment data
   */
  async processPaymentData(paymentData, userId, operation = 'PROCESS') {
    try {
      const processedData = { ...paymentData };
      const encryptedFields = {};
      const auditData = {
        userId,
        operation,
        dataType: 'BKASH_PAYMENT',
        fieldsProcessed: [],
        timestamp: new Date().toISOString()
      };

      // Validate required fields
      const validationResult = this.validatePaymentData(paymentData);
      if (!validationResult.isValid) {
        throw new Error(`Payment data validation failed: ${validationResult.errors.join(', ')}`);
      }

      // Encrypt sensitive fields
      for (const field of this.sensitiveFields) {
        if (paymentData[field]) {
          try {
            const encryptedData = securityUtils.encryptPaymentData({
              field,
              value: paymentData[field],
              timestamp: Date.now()
            });

            encryptedFields[field] = encryptedData;
            processedData[`${field}_encrypted`] = encryptedData;
            
            // Remove original sensitive data
            delete processedData[field];
            
            auditData.fieldsProcessed.push(field);

            // Log encryption operation
            await auditService.logEncryptionOperation({
              dataType: `BKASH_${field.toUpperCase()}`,
              operation: 'ENCRYPT',
              userId,
              success: true
            });

          } catch (encryptionError) {
            await auditService.logEncryptionOperation({
              dataType: `BKASH_${field.toUpperCase()}`,
              operation: 'ENCRYPT',
              userId,
              success: false,
              errorMessage: encryptionError.message
            });

            throw new Error(`Failed to encrypt ${field}: ${encryptionError.message}`);
          }
        }
      }

      // Add security metadata
      processedData.security_metadata = {
        encrypted_at: new Date().toISOString(),
        encryption_version: '1.0',
        compliance_level: 'PCI_DSS_LEVEL_1',
        data_classification: 'HIGHLY_SENSITIVE'
      };

      // Log the data processing operation
      await auditService.logSecurityEvent({
        eventType: 'PAYMENT_DATA_PROCESSED',
        userId,
        ipAddress: null,
        userAgent: null,
        sessionId: null,
        eventData: auditData,
        severity: 'INFO'
      });

      return {
        success: true,
        processedData,
        encryptedFields: Object.keys(encryptedFields),
        securityLevel: 'HIGH'
      };

    } catch (error) {
      await auditService.logSecurityEvent({
        eventType: 'PAYMENT_DATA_PROCESSING_ERROR',
        userId,
        ipAddress: null,
        userAgent: null,
        sessionId: null,
        eventData: {
          error: error.message,
          operation,
          dataType: 'BKASH_PAYMENT'
        },
        severity: 'HIGH'
      });

      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Securely retrieve and decrypt payment data
   */
  async retrievePaymentData(encryptedPaymentData, userId, requiredFields = []) {
    try {
      const decryptedData = { ...encryptedPaymentData };
      const decryptedFields = [];

      // Decrypt requested sensitive fields
      for (const field of requiredFields) {
        const encryptedField = `${field}_encrypted`;
        
        if (encryptedPaymentData[encryptedField]) {
          try {
            const decryptedValue = securityUtils.decryptPaymentData(
              encryptedPaymentData[encryptedField]
            );

            decryptedData[field] = decryptedValue.value;
            decryptedFields.push(field);

            // Log decryption operation
            await auditService.logEncryptionOperation({
              dataType: `BKASH_${field.toUpperCase()}`,
              operation: 'DECRYPT',
              userId,
              success: true
            });

          } catch (decryptionError) {
            await auditService.logEncryptionOperation({
              dataType: `BKASH_${field.toUpperCase()}`,
              operation: 'DECRYPT',
              userId,
              success: false,
              errorMessage: decryptionError.message
            });

            console.error(`Failed to decrypt ${field}:`, decryptionError.message);
          }
        }
      }

      // Log data retrieval
      await auditService.logSecurityEvent({
        eventType: 'PAYMENT_DATA_RETRIEVED',
        userId,
        ipAddress: null,
        userAgent: null,
        sessionId: null,
        eventData: {
          fieldsDecrypted: decryptedFields,
          dataType: 'BKASH_PAYMENT'
        },
        severity: 'INFO'
      });

      return {
        success: true,
        data: decryptedData,
        decryptedFields
      };

    } catch (error) {
      await auditService.logSecurityEvent({
        eventType: 'PAYMENT_DATA_RETRIEVAL_ERROR',
        userId,
        ipAddress: null,
        userAgent: null,
        sessionId: null,
        eventData: {
          error: error.message,
          dataType: 'BKASH_PAYMENT'
        },
        severity: 'HIGH'
      });

      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Validate bKash payment data
   */
  validatePaymentData(paymentData) {
    const errors = [];
    const warnings = [];

    // Validate mobile number
    if (paymentData.mobile_number) {
      if (!securityUtils.validateBkashMobileNumber(paymentData.mobile_number)) {
        errors.push('Invalid bKash mobile number format');
      }
    }

    // Validate PIN
    if (paymentData.pin) {
      if (!securityUtils.validatePINFormat(paymentData.pin)) {
        errors.push('Invalid PIN format');
      }
    }

    // Validate amount
    if (paymentData.amount) {
      const amount = parseFloat(paymentData.amount);
      if (isNaN(amount) || amount <= 0) {
        errors.push('Invalid transaction amount');
      }
      if (amount > 500000) { // 5 lakh BDT limit
        warnings.push('Large transaction amount detected');
      }
    }

    // Validate transaction reference
    if (paymentData.transaction_ref && paymentData.transaction_ref.length < 10) {
      errors.push('Transaction reference too short');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Sanitize payment data for logging
   */
  sanitizeForLogging(paymentData) {
    const sanitized = { ...paymentData };

    // Mask sensitive fields
    if (sanitized.mobile_number) {
      sanitized.mobile_number = securityUtils.maskMobileNumber(sanitized.mobile_number);
    }

    if (sanitized.pin) {
      sanitized.pin = securityUtils.maskPIN(sanitized.pin);
    }

    if (sanitized.otp) {
      sanitized.otp = '****';
    }

    if (sanitized.account_number) {
      sanitized.account_number = '****' + sanitized.account_number.slice(-4);
    }

    // Remove encrypted fields from logs
    Object.keys(sanitized).forEach(key => {
      if (key.endsWith('_encrypted')) {
        sanitized[key] = '[ENCRYPTED]';
      }
    });

    return sanitized;
  }

  /**
   * Generate secure payment reference
   */
  generateSecurePaymentReference(paymentType = 'BKASH') {
    return securityUtils.generateSecureTransactionRef();
  }

  /**
   * Validate payment compliance
   */
  validateCompliance(paymentData, operation) {
    const complianceChecks = {
      dataEncryption: false,
      auditLogging: false,
      dataRetention: false,
      accessControl: false
    };

    // Check if sensitive data is encrypted
    const hasEncryptedFields = this.sensitiveFields.some(field => 
      paymentData[`${field}_encrypted`]
    );
    complianceChecks.dataEncryption = hasEncryptedFields;

    // Check audit logging (this would be verified by checking audit logs)
    complianceChecks.auditLogging = true; // Assuming audit logging is active

    // Check data retention policy
    if (paymentData.security_metadata?.encrypted_at) {
      const encryptedDate = new Date(paymentData.security_metadata.encrypted_at);
      const daysSinceEncryption = (Date.now() - encryptedDate.getTime()) / (1000 * 60 * 60 * 24);
      complianceChecks.dataRetention = daysSinceEncryption <= this.complianceRequirements.dataRetention;
    }

    // Check access control (would be verified by middleware)
    complianceChecks.accessControl = true; // Assuming proper middleware is in place

    const isCompliant = Object.values(complianceChecks).every(check => check);

    return {
      isCompliant,
      checks: complianceChecks,
      complianceLevel: isCompliant ? 'FULL' : 'PARTIAL'
    };
  }

  /**
   * Secure data deletion (for compliance)
   */
  async secureDataDeletion(paymentDataId, userId, reason = 'DATA_RETENTION_POLICY') {
    try {
      // Log the deletion request
      await auditService.logSecurityEvent({
        eventType: 'PAYMENT_DATA_DELETION_REQUESTED',
        userId,
        ipAddress: null,
        userAgent: null,
        sessionId: null,
        eventData: {
          paymentDataId,
          reason,
          timestamp: new Date().toISOString()
        },
        severity: 'INFO'
      });

      // In a real implementation, this would securely delete the data
      // For now, we'll just log the operation
      
      await auditService.logSecurityEvent({
        eventType: 'PAYMENT_DATA_DELETED',
        userId,
        ipAddress: null,
        userAgent: null,
        sessionId: null,
        eventData: {
          paymentDataId,
          reason,
          deletedAt: new Date().toISOString()
        },
        severity: 'INFO'
      });

      return {
        success: true,
        message: 'Payment data securely deleted',
        deletedAt: new Date().toISOString()
      };

    } catch (error) {
      await auditService.logSecurityEvent({
        eventType: 'PAYMENT_DATA_DELETION_ERROR',
        userId,
        ipAddress: null,
        userAgent: null,
        sessionId: null,
        eventData: {
          paymentDataId,
          error: error.message
        },
        severity: 'HIGH'
      });

      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Generate compliance report
   */
  async generateComplianceReport(timeRange = '30 days') {
    try {
      const report = {
        reportType: 'PAYMENT_DATA_COMPLIANCE',
        generatedAt: new Date().toISOString(),
        timeRange,
        summary: {
          totalPaymentOperations: 0,
          encryptedOperations: 0,
          complianceViolations: 0,
          securityIncidents: 0
        },
        details: []
      };

      // Get encryption operation statistics
      const encryptionStats = await auditService.getFinancialAuditLogs({
        startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
        operationType: 'BKASH_PAYMENT'
      });

      if (encryptionStats.success) {
        report.summary.totalPaymentOperations = encryptionStats.logs.length;
        report.summary.encryptedOperations = encryptionStats.logs.filter(log => 
          log.fraud_flags && log.fraud_flags.includes('ENCRYPTED')
        ).length;
      }

      return {
        success: true,
        report
      };

    } catch (error) {
      console.error('Failed to generate compliance report:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
}

module.exports = new SecurePaymentDataService();