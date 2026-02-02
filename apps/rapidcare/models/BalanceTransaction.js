const db = require('../config/database');

class BalanceTransaction {
  static create(transactionData) {
    const stmt = db.prepare(`
      INSERT INTO balance_transactions (
        balanceId, transactionId, transactionType, amount, balanceBefore, 
        balanceAfter, description, referenceId, processedBy
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    const result = stmt.run(
      transactionData.balanceId,
      transactionData.transactionId || null,
      transactionData.transactionType,
      transactionData.amount,
      transactionData.balanceBefore,
      transactionData.balanceAfter,
      transactionData.description || null,
      transactionData.referenceId || null,
      transactionData.processedBy || null
    );
    
    return this.findById(result.lastInsertRowid);
  }

  static findById(id) {
    const stmt = db.prepare(`
      SELECT bt.*, 
             ub.userId, ub.userType, ub.hospitalId,
             u.name as userName,
             h.name as hospitalName,
             p.name as processedByName,
             t.transactionId as paymentTransactionId
      FROM balance_transactions bt
      LEFT JOIN user_balances ub ON bt.balanceId = ub.id
      LEFT JOIN users u ON ub.userId = u.id
      LEFT JOIN hospitals h ON ub.hospitalId = h.id
      LEFT JOIN users p ON bt.processedBy = p.id
      LEFT JOIN transactions t ON bt.transactionId = t.id
      WHERE bt.id = ?
    `);
    
    return stmt.get(id);
  }

  static findByBalanceId(balanceId, limit = 50) {
    const stmt = db.prepare(`
      SELECT bt.*, 
             u.name as processedByName,
             t.transactionId as paymentTransactionId,
             t.paymentMethod
      FROM balance_transactions bt
      LEFT JOIN users u ON bt.processedBy = u.id
      LEFT JOIN transactions t ON bt.transactionId = t.id
      WHERE bt.balanceId = ?
      ORDER BY bt.createdAt DESC
      LIMIT ?
    `);
    
    return stmt.all(balanceId, limit);
  }

  static findByUserId(userId, hospitalId = null, limit = 50) {
    let query = `
      SELECT bt.*, 
             ub.userType, ub.hospitalId,
             u.name as processedByName,
             h.name as hospitalName,
             t.transactionId as paymentTransactionId,
             t.paymentMethod
      FROM balance_transactions bt
      LEFT JOIN user_balances ub ON bt.balanceId = ub.id
      LEFT JOIN users u ON bt.processedBy = u.id
      LEFT JOIN hospitals h ON ub.hospitalId = h.id
      LEFT JOIN transactions t ON bt.transactionId = t.id
      WHERE ub.userId = ?
    `;
    
    const params = [userId];
    
    if (hospitalId !== null) {
      query += ' AND ub.hospitalId = ?';
      params.push(hospitalId);
    }
    
    query += ' ORDER BY bt.createdAt DESC LIMIT ?';
    params.push(limit);
    
    const stmt = db.prepare(query);
    return stmt.all(...params);
  }

  static findByTransactionType(transactionType, limit = 100) {
    const stmt = db.prepare(`
      SELECT bt.*, 
             ub.userId, ub.userType, ub.hospitalId,
             u.name as userName,
             h.name as hospitalName,
             p.name as processedByName
      FROM balance_transactions bt
      LEFT JOIN user_balances ub ON bt.balanceId = ub.id
      LEFT JOIN users u ON ub.userId = u.id
      LEFT JOIN hospitals h ON ub.hospitalId = h.id
      LEFT JOIN users p ON bt.processedBy = p.id
      WHERE bt.transactionType = ?
      ORDER BY bt.createdAt DESC
      LIMIT ?
    `);
    
    return stmt.all(transactionType, limit);
  }

  static getAuditTrail(options = {}) {
    let query = `
      SELECT bt.*, 
             ub.userId, ub.userType, ub.hospitalId,
             u.name as userName,
             h.name as hospitalName,
             p.name as processedByName,
             t.transactionId as paymentTransactionId
      FROM balance_transactions bt
      LEFT JOIN user_balances ub ON bt.balanceId = ub.id
      LEFT JOIN users u ON ub.userId = u.id
      LEFT JOIN hospitals h ON ub.hospitalId = h.id
      LEFT JOIN users p ON bt.processedBy = p.id
      LEFT JOIN transactions t ON bt.transactionId = t.id
      WHERE 1=1
    `;
    
    const params = [];
    
    if (options.userId) {
      query += ' AND ub.userId = ?';
      params.push(options.userId);
    }
    
    if (options.hospitalId) {
      query += ' AND ub.hospitalId = ?';
      params.push(options.hospitalId);
    }
    
    if (options.transactionType) {
      query += ' AND bt.transactionType = ?';
      params.push(options.transactionType);
    }
    
    if (options.startDate) {
      query += ' AND DATE(bt.createdAt) >= ?';
      params.push(options.startDate);
    }
    
    if (options.endDate) {
      query += ' AND DATE(bt.createdAt) <= ?';
      params.push(options.endDate);
    }
    
    if (options.minAmount) {
      query += ' AND ABS(bt.amount) >= ?';
      params.push(options.minAmount);
    }
    
    query += ' ORDER BY bt.createdAt DESC';
    
    if (options.limit) {
      query += ' LIMIT ?';
      params.push(options.limit);
    }
    
    const stmt = db.prepare(query);
    return stmt.all(...params);
  }

  static getTransactionSummary(options = {}) {
    let query = `
      SELECT 
        bt.transactionType,
        COUNT(*) as transactionCount,
        SUM(bt.amount) as totalAmount,
        AVG(bt.amount) as averageAmount,
        MAX(bt.amount) as maxAmount,
        MIN(bt.amount) as minAmount
      FROM balance_transactions bt
      LEFT JOIN user_balances ub ON bt.balanceId = ub.id
      WHERE 1=1
    `;
    
    const params = [];
    
    if (options.userId) {
      query += ' AND ub.userId = ?';
      params.push(options.userId);
    }
    
    if (options.hospitalId) {
      query += ' AND ub.hospitalId = ?';
      params.push(options.hospitalId);
    }
    
    if (options.userType) {
      query += ' AND ub.userType = ?';
      params.push(options.userType);
    }
    
    if (options.startDate) {
      query += ' AND DATE(bt.createdAt) >= ?';
      params.push(options.startDate);
    }
    
    if (options.endDate) {
      query += ' AND DATE(bt.createdAt) <= ?';
      params.push(options.endDate);
    }
    
    query += ' GROUP BY bt.transactionType ORDER BY totalAmount DESC';
    
    const stmt = db.prepare(query);
    return stmt.all(...params);
  }

  static getBalanceReconciliation(balanceId) {
    const stmt = db.prepare(`
      SELECT 
        COUNT(*) as totalTransactions,
        SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END) as totalCredits,
        SUM(CASE WHEN amount < 0 THEN ABS(amount) ELSE 0 END) as totalDebits,
        SUM(amount) as netAmount,
        MIN(balanceBefore) as initialBalance,
        MAX(balanceAfter) as finalBalance
      FROM balance_transactions
      WHERE balanceId = ?
      ORDER BY createdAt
    `);
    
    return stmt.get(balanceId);
  }

  static findDiscrepancies(threshold = 0.01) {
    const stmt = db.prepare(`
      SELECT bt.*, 
             ub.userId, ub.userType, ub.currentBalance,
             u.name as userName
      FROM balance_transactions bt
      LEFT JOIN user_balances ub ON bt.balanceId = ub.id
      LEFT JOIN users u ON ub.userId = u.id
      WHERE ABS(bt.balanceAfter - (bt.balanceBefore + bt.amount)) > ?
      ORDER BY bt.createdAt DESC
    `);
    
    return stmt.all(threshold);
  }

  static getTransactionsByDateRange(startDate, endDate, options = {}) {
    let query = `
      SELECT bt.*, 
             ub.userId, ub.userType, ub.hospitalId,
             u.name as userName,
             h.name as hospitalName
      FROM balance_transactions bt
      LEFT JOIN user_balances ub ON bt.balanceId = ub.id
      LEFT JOIN users u ON ub.userId = u.id
      LEFT JOIN hospitals h ON ub.hospitalId = h.id
      WHERE DATE(bt.createdAt) BETWEEN ? AND ?
    `;
    
    const params = [startDate, endDate];
    
    if (options.transactionType) {
      query += ' AND bt.transactionType = ?';
      params.push(options.transactionType);
    }
    
    if (options.hospitalId) {
      query += ' AND ub.hospitalId = ?';
      params.push(options.hospitalId);
    }
    
    query += ' ORDER BY bt.createdAt DESC';
    
    if (options.limit) {
      query += ' LIMIT ?';
      params.push(options.limit);
    }
    
    const stmt = db.prepare(query);
    return stmt.all(...params);
  }

  static delete(id) {
    const stmt = db.prepare('DELETE FROM balance_transactions WHERE id = ?');
    return stmt.run(id);
  }

  static count(options = {}) {
    let query = 'SELECT COUNT(*) as count FROM balance_transactions bt';
    const params = [];
    
    if (options.where) {
      query += ' LEFT JOIN user_balances ub ON bt.balanceId = ub.id WHERE 1=1';
      
      Object.keys(options.where).forEach(key => {
        const value = options.where[key];
        if (typeof value === 'number' || typeof value === 'string' || value === null) {
          if (key.startsWith('ub.')) {
            query += ` AND ${key} = ?`;
          } else {
            query += ` AND bt.${key} = ?`;
          }
          params.push(value);
        }
      });
    }
    
    const stmt = db.prepare(query);
    const result = stmt.get(...params);
    return result.count;
  }
}

module.exports = BalanceTransaction;