const db = require('../config/database');

class PaymentConfig {
  static create(configData) {
    const stmt = db.prepare(`
      INSERT INTO payment_config (
        hospitalId, serviceChargeRate, cancellationWindow, refundPercentage,
        minimumBookingAmount, paymentMethods, cancellationPolicy, refundPolicy
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    const result = stmt.run(
      configData.hospitalId || null,
      configData.serviceChargeRate || 0.05,
      configData.cancellationWindow || 24,
      configData.refundPercentage || 0.80,
      configData.minimumBookingAmount || 10.00,
      configData.paymentMethods ? JSON.stringify(configData.paymentMethods) : null,
      configData.cancellationPolicy || null,
      configData.refundPolicy || null
    );
    
    return this.findById(result.lastInsertRowid);
  }

  static findById(id) {
    const stmt = db.prepare(`
      SELECT pc.*, 
             h.name as hospitalName
      FROM payment_config pc
      LEFT JOIN hospitals h ON pc.hospitalId = h.id
      WHERE pc.id = ?
    `);
    
    const config = stmt.get(id);
    if (config && config.paymentMethods) {
      config.paymentMethods = JSON.parse(config.paymentMethods);
    }
    return config;
  }

  static findByHospitalId(hospitalId) {
    const stmt = db.prepare(`
      SELECT pc.*, 
             h.name as hospitalName
      FROM payment_config pc
      LEFT JOIN hospitals h ON pc.hospitalId = h.id
      WHERE pc.hospitalId = ? AND pc.isActive = 1
      ORDER BY pc.createdAt DESC
      LIMIT 1
    `);
    
    const config = stmt.get(hospitalId);
    if (config && config.paymentMethods) {
      config.paymentMethods = JSON.parse(config.paymentMethods);
    }
    return config;
  }

  static getDefaultConfig() {
    const stmt = db.prepare(`
      SELECT * FROM payment_config 
      WHERE hospitalId IS NULL AND isActive = 1
      ORDER BY createdAt DESC
      LIMIT 1
    `);
    
    const config = stmt.get();
    if (config && config.paymentMethods) {
      config.paymentMethods = JSON.parse(config.paymentMethods);
    }
    return config;
  }

  static getConfigForHospital(hospitalId) {
    // First try to get hospital-specific config
    let config = this.findByHospitalId(hospitalId);
    
    // If no hospital-specific config, use default
    if (!config) {
      config = this.getDefaultConfig();
    }
    
    return config;
  }

  static updateConfig(hospitalId, configData) {
    // Deactivate existing config
    const deactivateStmt = db.prepare(`
      UPDATE payment_config 
      SET isActive = 0, updatedAt = CURRENT_TIMESTAMP
      WHERE hospitalId = ? AND isActive = 1
    `);
    deactivateStmt.run(hospitalId);

    // Create new config
    return this.create({
      hospitalId,
      serviceChargeRate: configData.serviceChargeRate,
      cancellationWindow: configData.cancellationWindow,
      refundPercentage: configData.refundPercentage,
      minimumBookingAmount: configData.minimumBookingAmount,
      paymentMethods: configData.paymentMethods,
      cancellationPolicy: configData.cancellationPolicy,
      refundPolicy: configData.refundPolicy
    });
  }

  static calculateServiceCharge(amount, hospitalId = null) {
    const config = this.getConfigForHospital(hospitalId);
    const rate = config ? config.serviceChargeRate : 0.05; // Default 5%
    return amount * rate;
  }

  static calculateRefundAmount(originalAmount, hospitalId = null) {
    const config = this.getConfigForHospital(hospitalId);
    const refundPercentage = config ? config.refundPercentage : 0.80; // Default 80%
    return originalAmount * refundPercentage;
  }

  static isWithinCancellationWindow(bookingDate, hospitalId = null) {
    const config = this.getConfigForHospital(hospitalId);
    const cancellationWindow = config ? config.cancellationWindow : 24; // Default 24 hours
    
    const bookingTime = new Date(bookingDate).getTime();
    const currentTime = new Date().getTime();
    const hoursUntilBooking = (bookingTime - currentTime) / (1000 * 60 * 60);
    
    return hoursUntilBooking >= cancellationWindow;
  }

  static validateBookingAmount(amount, hospitalId = null) {
    const config = this.getConfigForHospital(hospitalId);
    const minimumAmount = config ? config.minimumBookingAmount : 10.00;
    
    return {
      isValid: amount >= minimumAmount,
      minimumAmount,
      providedAmount: amount
    };
  }

  static getAvailablePaymentMethods(hospitalId = null) {
    const config = this.getConfigForHospital(hospitalId);
    
    if (config && config.paymentMethods) {
      return config.paymentMethods;
    }
    
    // Default payment methods
    return ['credit_card', 'debit_card', 'bank_transfer', 'digital_wallet'];
  }

  static getAllConfigs() {
    const stmt = db.prepare(`
      SELECT pc.*, 
             h.name as hospitalName
      FROM payment_config pc
      LEFT JOIN hospitals h ON pc.hospitalId = h.id
      WHERE pc.isActive = 1
      ORDER BY pc.hospitalId, pc.createdAt DESC
    `);
    
    const configs = stmt.all();
    return configs.map(config => {
      if (config.paymentMethods) {
        config.paymentMethods = JSON.parse(config.paymentMethods);
      }
      return config;
    });
  }

  static getConfigHistory(hospitalId, limit = 10) {
    const stmt = db.prepare(`
      SELECT pc.*, 
             h.name as hospitalName
      FROM payment_config pc
      LEFT JOIN hospitals h ON pc.hospitalId = h.id
      WHERE pc.hospitalId = ?
      ORDER BY pc.createdAt DESC
      LIMIT ?
    `);
    
    const configs = stmt.all(hospitalId, limit);
    return configs.map(config => {
      if (config.paymentMethods) {
        config.paymentMethods = JSON.parse(config.paymentMethods);
      }
      return config;
    });
  }

  static validateConfigData(configData) {
    const errors = [];
    
    if (configData.serviceChargeRate !== undefined) {
      if (configData.serviceChargeRate < 0 || configData.serviceChargeRate > 1) {
        errors.push('Service charge rate must be between 0 and 1 (0% to 100%)');
      }
    }
    
    if (configData.cancellationWindow !== undefined) {
      if (configData.cancellationWindow < 0) {
        errors.push('Cancellation window cannot be negative');
      }
    }
    
    if (configData.refundPercentage !== undefined) {
      if (configData.refundPercentage < 0 || configData.refundPercentage > 1) {
        errors.push('Refund percentage must be between 0 and 1 (0% to 100%)');
      }
    }
    
    if (configData.minimumBookingAmount !== undefined) {
      if (configData.minimumBookingAmount < 0) {
        errors.push('Minimum booking amount cannot be negative');
      }
    }
    
    if (configData.paymentMethods !== undefined) {
      if (!Array.isArray(configData.paymentMethods) || configData.paymentMethods.length === 0) {
        errors.push('Payment methods must be a non-empty array');
      }
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }

  static getServiceChargeAnalytics(dateRange = {}) {
    let query = `
      SELECT 
        pc.hospitalId,
        h.name as hospitalName,
        pc.serviceChargeRate,
        COUNT(t.id) as transactionCount,
        SUM(t.serviceCharge) as totalServiceCharge,
        AVG(t.serviceCharge) as averageServiceCharge
      FROM payment_config pc
      LEFT JOIN hospitals h ON pc.hospitalId = h.id
      LEFT JOIN transactions t ON t.hospitalId = pc.hospitalId AND t.status = 'completed'
      WHERE pc.isActive = 1
    `;
    
    const params = [];
    
    if (dateRange.startDate) {
      query += ' AND DATE(t.createdAt) >= ?';
      params.push(dateRange.startDate);
    }
    
    if (dateRange.endDate) {
      query += ' AND DATE(t.createdAt) <= ?';
      params.push(dateRange.endDate);
    }
    
    query += ' GROUP BY pc.hospitalId, pc.serviceChargeRate ORDER BY totalServiceCharge DESC';
    
    const stmt = db.prepare(query);
    return stmt.all(...params);
  }

  static delete(id) {
    const stmt = db.prepare('UPDATE payment_config SET isActive = 0 WHERE id = ?');
    return stmt.run(id);
  }

  static count(options = {}) {
    let query = 'SELECT COUNT(*) as count FROM payment_config WHERE isActive = 1';
    const params = [];
    
    if (options.where) {
      const conditions = [];
      Object.keys(options.where).forEach(key => {
        const value = options.where[key];
        if (typeof value === 'number' || typeof value === 'string' || value === null) {
          conditions.push(`${key} = ?`);
          params.push(value);
        }
      });
      if (conditions.length > 0) {
        query += ' AND ' + conditions.join(' AND ');
      }
    }
    
    const stmt = db.prepare(query);
    const result = stmt.get(...params);
    return result.count;
  }
}

module.exports = PaymentConfig;