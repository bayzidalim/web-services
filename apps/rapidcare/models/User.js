const db = require('../config/database');

class User {
  static create(userData) {
    const stmt = db.prepare(`
      INSERT INTO users (email, password, name, phone, userType, isActive, balance)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    
    const result = stmt.run(
      userData.email,
      userData.password,
      userData.name,
      userData.phone,
      userData.userType || 'user',
      userData.isActive !== undefined ? userData.isActive : 1,
      userData.balance !== undefined ? userData.balance : 10000.00 // Default 10,000 BDT
    );
    
    return result.lastInsertRowid;
  }

  static findByEmail(email) {
    const stmt = db.prepare('SELECT * FROM users WHERE email = ?');
    return stmt.get(email);
  }

  static findById(id) {
    const stmt = db.prepare('SELECT * FROM users WHERE id = ?');
    return stmt.get(id);
  }

  static update(id, updateData) {
    const stmt = db.prepare(`
      UPDATE users 
      SET name = ?, phone = ?, userType = ?, isActive = ?, updatedAt = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    
    return stmt.run(
      updateData.name, 
      updateData.phone, 
      updateData.userType,
      updateData.isActive !== undefined ? updateData.isActive : 1,
      id
    );
  }

  static delete(id) {
    const stmt = db.prepare('DELETE FROM users WHERE id = ?');
    return stmt.run(id);
  }

  static getAll() {
    const stmt = db.prepare('SELECT * FROM users ORDER BY createdAt DESC');
    return stmt.all();
  }

  // Sequelize-style methods for admin controller
  static async findAll(options = {}) {
    let query = 'SELECT * FROM users';
    const params = [];
    
    if (options.where) {
      const conditions = [];
      Object.keys(options.where).forEach(key => {
        conditions.push(`${key} = ?`);
        params.push(options.where[key]);
      });
      query += ' WHERE ' + conditions.join(' AND ');
    }
    
    if (options.attributes) {
      if (options.attributes.exclude) {
        const excludeFields = options.attributes.exclude;
        const allFields = ['id', 'name', 'email', 'phone', 'userType', 'isActive', 'createdAt', 'updatedAt'];
        const includeFields = allFields.filter(field => !excludeFields.includes(field));
        query = query.replace('*', includeFields.join(', '));
      }
    }
    
    query += ' ORDER BY createdAt DESC';
    
    const stmt = db.prepare(query);
    return stmt.all(...params);
  }

  static async findByPk(id, options = {}) {
    const user = this.findById(id);
    if (!user) return null;
    
    if (options.attributes && options.attributes.exclude) {
      const excludeFields = options.attributes.exclude;
      excludeFields.forEach(field => {
        delete user[field];
      });
    }
    
    return user;
  }

  static count(options = {}) {
    let query = 'SELECT COUNT(*) as count FROM users';
    const params = [];
    if (options.where) {
      const conditions = [];
      Object.keys(options.where).forEach(key => {
        const value = options.where[key];
        if (
          typeof value === 'number' ||
          typeof value === 'string' ||
          typeof value === 'bigint' ||
          value === null
        ) {
          conditions.push(`${key} = ?`);
          params.push(value);
        }
        // else skip unsupported types
      });
      if (conditions.length > 0) {
        query += ' WHERE ' + conditions.join(' AND ');
      }
    }
    const stmt = db.prepare(query);
    const result = stmt.get(...params);
    return result.count;
  }

  static async findOne(options = {}) {
    let query = 'SELECT * FROM users';
    const params = [];
    
    if (options.where) {
      const conditions = [];
      Object.keys(options.where).forEach(key => {
        conditions.push(`${key} = ?`);
        params.push(options.where[key]);
      });
      query += ' WHERE ' + conditions.join(' AND ');
    }
    
    query += ' LIMIT 1';
    
    const stmt = db.prepare(query);
    return stmt.get(...params);
  }

  // Balance Management Methods

  /**
   * Get user's current balance
   * @param {number} userId - User ID
   * @returns {number} Current balance
   */
  static getBalance(userId) {
    const stmt = db.prepare('SELECT balance FROM users WHERE id = ?');
    const result = stmt.get(userId);
    return result ? parseFloat(result.balance) : 0;
  }

  /**
   * Update user balance
   * @param {number} userId - User ID
   * @param {number} amount - Amount to add/subtract
   * @param {string} operation - 'add' or 'subtract'
   * @param {string} description - Transaction description
   * @returns {object} Updated balance info
   */
  static updateBalance(userId, amount, operation = 'subtract', description = '') {
    const currentBalance = this.getBalance(userId);
    
    if (operation === 'subtract' && currentBalance < amount) {
      throw new Error('Insufficient balance');
    }
    
    const newBalance = operation === 'add' 
      ? currentBalance + parseFloat(amount)
      : currentBalance - parseFloat(amount);
    
    // Update user balance
    const updateStmt = db.prepare(`
      UPDATE users 
      SET balance = ?, updatedAt = CURRENT_TIMESTAMP 
      WHERE id = ?
    `);
    updateStmt.run(newBalance, userId);
    
    // Log transaction
    const logStmt = db.prepare(`
      INSERT INTO simple_transactions 
      (user_id, amount, transaction_type, description, status) 
      VALUES (?, ?, ?, ?, 'completed')
    `);
    
    const transactionType = operation === 'add' ? 'refund' : 'payment';
    const transactionAmount = operation === 'add' ? amount : -amount;
    
    logStmt.run(userId, transactionAmount, transactionType, description);
    
    return {
      previousBalance: currentBalance,
      newBalance: newBalance,
      amount: amount,
      operation: operation
    };
  }

  /**
   * Check if user has sufficient balance
   * @param {number} userId - User ID
   * @param {number} amount - Amount to check
   * @returns {boolean} True if sufficient balance
   */
  static hasSufficientBalance(userId, amount) {
    const balance = this.getBalance(userId);
    return balance >= parseFloat(amount);
  }

  /**
   * Process payment (deduct balance)
   * @param {number} userId - User ID
   * @param {number} amount - Payment amount
   * @param {number} bookingId - Booking ID (optional)
   * @param {string} transactionId - Transaction ID (optional)
   * @param {object} costBreakdown - Cost breakdown with service charges (optional)
   * @returns {object} Payment result
   */
  static processPayment(userId, amount, bookingId = null, transactionId = null, costBreakdown = null) {
    if (!this.hasSufficientBalance(userId, amount)) {
      throw new Error('Insufficient balance for payment');
    }
    
    const balanceUpdate = this.updateBalance(
      userId, 
      amount, 
      'subtract', 
      `Payment for booking ${bookingId || 'N/A'}`
    );
    
    // Update transaction record with booking info and service charge breakdown if provided
    if (bookingId && costBreakdown) {
      const updateTransactionStmt = db.prepare(`
        UPDATE simple_transactions 
        SET booking_id = ?, transaction_id = ?, hospital_amount = ?, service_charge = ?, rapid_assistance_charge = ?
        WHERE user_id = ? AND amount = ? AND transaction_type = 'payment'
        AND id = (SELECT id FROM simple_transactions WHERE user_id = ? AND amount = ? AND transaction_type = 'payment' ORDER BY created_at DESC LIMIT 1)
      `);
      updateTransactionStmt.run(
        bookingId, 
        transactionId, 
        costBreakdown.hospital_share || 0, 
        costBreakdown.service_charge_share || 0,
        costBreakdown.rapid_assistance_charge || costBreakdown.rapid_assistance_share || 0,
        userId, 
        -amount, 
        userId, 
        -amount
      );
    } else if (bookingId) {
      const updateTransactionStmt = db.prepare(`
        UPDATE simple_transactions 
        SET booking_id = ?, transaction_id = ?
        WHERE user_id = ? AND amount = ? AND transaction_type = 'payment'
        AND id = (SELECT id FROM simple_transactions WHERE user_id = ? AND amount = ? AND transaction_type = 'payment' ORDER BY created_at DESC LIMIT 1)
      `);
      updateTransactionStmt.run(bookingId, transactionId, userId, -amount, userId, -amount);
    }
    
    return {
      success: true,
      ...balanceUpdate,
      transactionId: transactionId
    };
  }

  /**
   * Process refund (add balance)
   * @param {number} userId - User ID
   * @param {number} amount - Refund amount
   * @param {number} bookingId - Booking ID (optional)
   * @param {string} reason - Refund reason
   * @returns {object} Refund result
   */
  static processRefund(userId, amount, bookingId = null, reason = '') {
    const balanceUpdate = this.updateBalance(
      userId, 
      amount, 
      'add', 
      `Refund for booking ${bookingId || 'N/A'}: ${reason}`
    );
    
    return {
      success: true,
      ...balanceUpdate,
      reason: reason
    };
  }

  /**
   * Get user's transaction history
   * @param {number} userId - User ID
   * @param {number} limit - Number of transactions to return
   * @returns {array} Transaction history
   */
  static getTransactionHistory(userId, limit = 50) {
    const stmt = db.prepare(`
      SELECT * FROM simple_transactions 
      WHERE user_id = ? 
      ORDER BY created_at DESC 
      LIMIT ?
    `);
    return stmt.all(userId, limit);
  }
}

module.exports = User; 