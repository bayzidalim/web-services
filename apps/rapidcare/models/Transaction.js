const db = require('../config/database');

class Transaction {
  static create(transactionData) {
    const stmt = db.prepare(`
      INSERT INTO transactions (
        bookingId, userId, hospitalId, amount, serviceCharge, hospitalAmount,
        paymentMethod, transactionId, status, paymentData, processedAt
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    const result = stmt.run(
      transactionData.bookingId,
      transactionData.userId,
      transactionData.hospitalId,
      transactionData.amount,
      transactionData.serviceCharge,
      transactionData.hospitalAmount,
      transactionData.paymentMethod,
      transactionData.transactionId,
      transactionData.status || 'pending',
      transactionData.paymentData ? JSON.stringify(transactionData.paymentData) : null,
      transactionData.processedAt
    );
    
    return this.findById(result.lastInsertRowid);
  }

  static findById(id) {
    const stmt = db.prepare(`
      SELECT t.*, 
             b.patientName, b.resourceType, b.scheduledDate,
             h.name as hospitalName,
             u.name as userName, u.email as userEmail
      FROM transactions t
      LEFT JOIN bookings b ON t.bookingId = b.id
      LEFT JOIN hospitals h ON t.hospitalId = h.id
      LEFT JOIN users u ON t.userId = u.id
      WHERE t.id = ?
    `);
    
    const transaction = stmt.get(id);
    if (transaction && transaction.paymentData) {
      transaction.paymentData = JSON.parse(transaction.paymentData);
    }
    return transaction;
  }

  static findByBookingId(bookingId) {
    const stmt = db.prepare(`
      SELECT t.*, 
             h.name as hospitalName,
             u.name as userName
      FROM transactions t
      LEFT JOIN hospitals h ON t.hospitalId = h.id
      LEFT JOIN users u ON t.userId = u.id
      WHERE t.bookingId = ?
      ORDER BY t.createdAt DESC
    `);
    
    const transactions = stmt.all(bookingId);
    return transactions.map(transaction => {
      if (transaction.paymentData) {
        transaction.paymentData = JSON.parse(transaction.paymentData);
      }
      return transaction;
    });
  }

  static findByUserId(userId) {
    const stmt = db.prepare(`
      SELECT t.*, 
             b.patientName, b.resourceType, b.scheduledDate,
             h.name as hospitalName
      FROM transactions t
      LEFT JOIN bookings b ON t.bookingId = b.id
      LEFT JOIN hospitals h ON t.hospitalId = h.id
      WHERE t.userId = ?
      ORDER BY t.createdAt DESC
    `);
    
    const transactions = stmt.all(userId);
    return transactions.map(transaction => {
      if (transaction.paymentData) {
        transaction.paymentData = JSON.parse(transaction.paymentData);
      }
      return transaction;
    });
  }

  static findByHospitalId(hospitalId) {
    const stmt = db.prepare(`
      SELECT t.*, 
             b.patientName, b.resourceType, b.scheduledDate,
             u.name as userName, u.email as userEmail
      FROM transactions t
      LEFT JOIN bookings b ON t.bookingId = b.id
      LEFT JOIN users u ON t.userId = u.id
      WHERE t.hospitalId = ?
      ORDER BY t.createdAt DESC
    `);
    
    const transactions = stmt.all(hospitalId);
    return transactions.map(transaction => {
      if (transaction.paymentData) {
        transaction.paymentData = JSON.parse(transaction.paymentData);
      }
      return transaction;
    });
  }

  static updateStatus(id, status, processedAt = null) {
    const stmt = db.prepare(`
      UPDATE transactions 
      SET status = ?, processedAt = ?, updatedAt = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    
    const result = stmt.run(status, processedAt || new Date().toISOString(), id);
    return result.changes > 0 ? this.findById(id) : null;
  }

  static getByStatus(status) {
    const stmt = db.prepare(`
      SELECT t.*, 
             b.patientName, b.resourceType, b.scheduledDate,
             h.name as hospitalName,
             u.name as userName
      FROM transactions t
      LEFT JOIN bookings b ON t.bookingId = b.id
      LEFT JOIN hospitals h ON t.hospitalId = h.id
      LEFT JOIN users u ON t.userId = u.id
      WHERE t.status = ?
      ORDER BY t.createdAt DESC
    `);
    
    const transactions = stmt.all(status);
    return transactions.map(transaction => {
      if (transaction.paymentData) {
        transaction.paymentData = JSON.parse(transaction.paymentData);
      }
      return transaction;
    });
  }

  static getRevenueAnalytics(hospitalId = null, dateRange = {}) {
    let query = `
      SELECT 
        DATE(t.createdAt) as date,
        COUNT(*) as transactionCount,
        SUM(t.amount) as totalAmount,
        SUM(t.serviceCharge) as totalServiceCharge,
        SUM(t.hospitalAmount) as totalHospitalAmount,
        AVG(t.amount) as averageAmount
      FROM transactions t
      WHERE t.status = 'completed'
    `;
    
    const params = [];
    
    if (hospitalId) {
      query += ' AND t.hospitalId = ?';
      params.push(hospitalId);
    }
    
    if (dateRange.startDate) {
      query += ' AND DATE(t.createdAt) >= ?';
      params.push(dateRange.startDate);
    }
    
    if (dateRange.endDate) {
      query += ' AND DATE(t.createdAt) <= ?';
      params.push(dateRange.endDate);
    }
    
    query += ' GROUP BY DATE(t.createdAt) ORDER BY date DESC';
    
    const stmt = db.prepare(query);
    return stmt.all(...params);
  }

  static getTotalRevenue(hospitalId = null, dateRange = {}) {
    let query = `
      SELECT 
        COUNT(*) as totalTransactions,
        SUM(t.amount) as totalRevenue,
        SUM(t.serviceCharge) as totalServiceCharge,
        SUM(t.hospitalAmount) as totalHospitalRevenue,
        AVG(t.amount) as averageTransactionAmount
      FROM transactions t
      WHERE t.status = 'completed'
    `;
    
    const params = [];
    
    if (hospitalId) {
      query += ' AND t.hospitalId = ?';
      params.push(hospitalId);
    }
    
    if (dateRange.startDate) {
      query += ' AND DATE(t.createdAt) >= ?';
      params.push(dateRange.startDate);
    }
    
    if (dateRange.endDate) {
      query += ' AND DATE(t.createdAt) <= ?';
      params.push(dateRange.endDate);
    }
    
    const stmt = db.prepare(query);
    return stmt.get(...params);
  }

  static findByTransactionId(transactionId) {
    const stmt = db.prepare(`
      SELECT t.*, 
             b.patientName, b.resourceType, b.scheduledDate,
             h.name as hospitalName,
             u.name as userName, u.email as userEmail
      FROM transactions t
      LEFT JOIN bookings b ON t.bookingId = b.id
      LEFT JOIN hospitals h ON t.hospitalId = h.id
      LEFT JOIN users u ON t.userId = u.id
      WHERE t.transactionId = ?
    `);
    
    const transaction = stmt.get(transactionId);
    if (transaction && transaction.paymentData) {
      transaction.paymentData = JSON.parse(transaction.paymentData);
    }
    return transaction;
  }

  static delete(id) {
    const stmt = db.prepare('DELETE FROM transactions WHERE id = ?');
    return stmt.run(id);
  }

  static count(options = {}) {
    let query = 'SELECT COUNT(*) as count FROM transactions';
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

module.exports = Transaction;