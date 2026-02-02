const db = require('../config/database');

class UserBalance {
  static create(balanceData) {
    const stmt = db.prepare(`
      INSERT INTO user_balances (
        userId, userType, hospitalId, currentBalance, totalEarnings, 
        totalWithdrawals, pendingAmount, lastTransactionAt
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    const result = stmt.run(
      balanceData.userId,
      balanceData.userType,
      balanceData.hospitalId || null,
      balanceData.currentBalance || 0.00,
      balanceData.totalEarnings || 0.00,
      balanceData.totalWithdrawals || 0.00,
      balanceData.pendingAmount || 0.00,
      balanceData.lastTransactionAt || null
    );
    
    return this.findById(result.lastInsertRowid);
  }

  static findById(id) {
    const stmt = db.prepare(`
      SELECT ub.*, 
             u.name as userName, u.email as userEmail,
             h.name as hospitalName
      FROM user_balances ub
      LEFT JOIN users u ON ub.userId = u.id
      LEFT JOIN hospitals h ON ub.hospitalId = h.id
      WHERE ub.id = ?
    `);
    
    return stmt.get(id);
  }

  static findByUserId(userId, hospitalId = null) {
    let query = `
      SELECT ub.*, 
             u.name as userName, u.email as userEmail,
             h.name as hospitalName
      FROM user_balances ub
      LEFT JOIN users u ON ub.userId = u.id
      LEFT JOIN hospitals h ON ub.hospitalId = h.id
      WHERE ub.userId = ?
    `;
    
    const params = [userId];
    
    if (hospitalId !== null) {
      query += ' AND ub.hospitalId = ?';
      params.push(hospitalId);
    }
    
    const stmt = db.prepare(query);
    return hospitalId !== null ? stmt.get(...params) : stmt.all(...params);
  }

  static findByHospitalId(hospitalId) {
    const stmt = db.prepare(`
      SELECT ub.*, 
             u.name as userName, u.email as userEmail
      FROM user_balances ub
      LEFT JOIN users u ON ub.userId = u.id
      WHERE ub.hospitalId = ? AND ub.userType = 'hospital-authority'
      ORDER BY ub.currentBalance DESC
    `);
    
    return stmt.all(hospitalId);
  }

  static getOrCreateBalance(userId, userType, hospitalId = null) {
    let balance = this.findByUserId(userId, hospitalId);
    
    if (!balance || (Array.isArray(balance) && balance.length === 0)) {
      balance = this.create({
        userId,
        userType,
        hospitalId,
        currentBalance: 0.00,
        totalEarnings: 0.00,
        totalWithdrawals: 0.00,
        pendingAmount: 0.00
      });
    } else if (Array.isArray(balance)) {
      balance = balance[0];
    }
    
    return balance;
  }

  static updateBalance(userId, hospitalId, amount, transactionType, transactionId = null, description = null) {
    const balance = this.getOrCreateBalance(userId, null, hospitalId);
    
    if (!balance) {
      throw new Error(`Balance not found for user ${userId}`);
    }

    const balanceBefore = parseFloat(balance.currentBalance);
    let balanceAfter = balanceBefore;
    let totalEarnings = parseFloat(balance.totalEarnings);
    let totalWithdrawals = parseFloat(balance.totalWithdrawals);

    // Calculate new balance based on transaction type
    switch (transactionType) {
      case 'payment_received':
      case 'service_charge':
        balanceAfter = balanceBefore + parseFloat(amount);
        totalEarnings += parseFloat(amount);
        break;
      case 'refund_processed':
      case 'withdrawal':
        balanceAfter = balanceBefore - parseFloat(amount);
        totalWithdrawals += parseFloat(amount);
        break;
      case 'adjustment':
        balanceAfter = balanceBefore + parseFloat(amount);
        if (amount > 0) {
          totalEarnings += parseFloat(amount);
        } else {
          totalWithdrawals += Math.abs(parseFloat(amount));
        }
        break;
      default:
        throw new Error(`Invalid transaction type: ${transactionType}`);
    }

    // Update balance
    const updateStmt = db.prepare(`
      UPDATE user_balances 
      SET currentBalance = ?, totalEarnings = ?, totalWithdrawals = ?, 
          lastTransactionAt = CURRENT_TIMESTAMP, updatedAt = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    
    updateStmt.run(balanceAfter, totalEarnings, totalWithdrawals, balance.id);

    // Log the balance transaction
    const BalanceTransaction = require('./BalanceTransaction');
    BalanceTransaction.create({
      balanceId: balance.id,
      transactionId,
      transactionType,
      amount: parseFloat(amount),
      balanceBefore,
      balanceAfter,
      description,
      processedBy: userId
    });

    return this.findById(balance.id);
  }

  static getBalanceHistory(userId, hospitalId = null, limit = 50) {
    const balance = this.findByUserId(userId, hospitalId);
    
    if (!balance || (Array.isArray(balance) && balance.length === 0)) {
      return [];
    }

    const balanceId = Array.isArray(balance) ? balance[0].id : balance.id;
    
    const stmt = db.prepare(`
      SELECT bt.*, 
             t.transactionId as paymentTransactionId,
             t.paymentMethod
      FROM balance_transactions bt
      LEFT JOIN transactions t ON bt.transactionId = t.id
      WHERE bt.balanceId = ?
      ORDER BY bt.createdAt DESC
      LIMIT ?
    `);
    
    return stmt.all(balanceId, limit);
  }

  static getAdminBalances() {
    const stmt = db.prepare(`
      SELECT ub.*, 
             u.name as userName, u.email as userEmail
      FROM user_balances ub
      LEFT JOIN users u ON ub.userId = u.id
      WHERE ub.userType = 'admin'
      ORDER BY ub.currentBalance DESC
    `);
    
    return stmt.all();
  }

  static getHospitalAuthorityBalances(hospitalId = null) {
    let query = `
      SELECT ub.*, 
             u.name as userName, u.email as userEmail,
             h.name as hospitalName
      FROM user_balances ub
      LEFT JOIN users u ON ub.userId = u.id
      LEFT JOIN hospitals h ON ub.hospitalId = h.id
      WHERE ub.userType = 'hospital-authority'
    `;
    
    const params = [];
    
    if (hospitalId) {
      query += ' AND ub.hospitalId = ?';
      params.push(hospitalId);
    }
    
    query += ' ORDER BY ub.currentBalance DESC';
    
    const stmt = db.prepare(query);
    return stmt.all(...params);
  }

  static getBalanceSummary(userType = null, hospitalId = null) {
    let query = `
      SELECT 
        COUNT(*) as totalAccounts,
        SUM(currentBalance) as totalCurrentBalance,
        SUM(totalEarnings) as totalEarnings,
        SUM(totalWithdrawals) as totalWithdrawals,
        AVG(currentBalance) as averageBalance,
        MAX(currentBalance) as maxBalance,
        MIN(currentBalance) as minBalance
      FROM user_balances
      WHERE 1=1
    `;
    
    const params = [];
    
    if (userType) {
      query += ' AND userType = ?';
      params.push(userType);
    }
    
    if (hospitalId) {
      query += ' AND hospitalId = ?';
      params.push(hospitalId);
    }
    
    const stmt = db.prepare(query);
    return stmt.get(...params);
  }

  static getLowBalanceAccounts(threshold = 100.00) {
    const stmt = db.prepare(`
      SELECT ub.*, 
             u.name as userName, u.email as userEmail,
             h.name as hospitalName
      FROM user_balances ub
      LEFT JOIN users u ON ub.userId = u.id
      LEFT JOIN hospitals h ON ub.hospitalId = h.id
      WHERE ub.currentBalance < ?
      ORDER BY ub.currentBalance ASC
    `);
    
    return stmt.all(threshold);
  }

  static updatePendingAmount(userId, hospitalId, amount) {
    const balance = this.findByUserId(userId, hospitalId);
    
    if (!balance || (Array.isArray(balance) && balance.length === 0)) {
      throw new Error(`Balance not found for user ${userId}`);
    }

    const balanceId = Array.isArray(balance) ? balance[0].id : balance.id;
    
    const stmt = db.prepare(`
      UPDATE user_balances 
      SET pendingAmount = ?, updatedAt = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    
    stmt.run(amount, balanceId);
    return this.findById(balanceId);
  }

  static delete(id) {
    const stmt = db.prepare('DELETE FROM user_balances WHERE id = ?');
    return stmt.run(id);
  }

  static count(options = {}) {
    let query = 'SELECT COUNT(*) as count FROM user_balances';
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
        query += ' WHERE ' + conditions.join(' AND ');
      }
    }
    
    const stmt = db.prepare(query);
    const result = stmt.get(...params);
    return result.count;
  }
}

module.exports = UserBalance;