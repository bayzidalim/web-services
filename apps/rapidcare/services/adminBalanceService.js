const db = require('../config/database');
const UserBalance = require('../models/UserBalance');
const ErrorHandler = require('../utils/errorHandler');

/**
 * Admin Balance Service
 * Handles admin balance initialization, management, and service charge distribution
 */
class AdminBalanceService {
  /**
   * Initialize admin balance if it doesn't exist
   * @returns {Object} Admin balance initialization result
   */
  static async initializeAdminBalance() {
    try {
      // Find admin user
      const admin = db.prepare(`
        SELECT id, email, name FROM users 
        WHERE userType = 'admin' 
        LIMIT 1
      `).get();

      if (!admin) {
        throw new Error('No admin user found in the system');
      }

      // Check if admin already has a balance record
      const existingBalance = db.prepare(`
        SELECT * FROM user_balances 
        WHERE userId = ? AND userType = 'admin'
      `).get(admin.id);

      if (existingBalance) {
        return {
          success: true,
          message: 'Admin balance already exists',
          balance: existingBalance,
          admin: admin
        };
      }

      // Create admin balance record
      const balanceData = {
        userId: admin.id,
        userType: 'admin',
        hospitalId: null, // Admin balance is not hospital-specific
        currentBalance: 0.00,
        totalEarnings: 0.00,
        totalWithdrawals: 0.00,
        pendingAmount: 0.00
      };

      const newBalance = UserBalance.create(balanceData);

      console.log(`✅ Admin balance initialized for user: ${admin.email} (ID: ${admin.id})`);

      return {
        success: true,
        message: 'Admin balance initialized successfully',
        balance: newBalance,
        admin: admin
      };

    } catch (error) {
      console.error('❌ Error initializing admin balance:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get admin balance information
   * @returns {Object} Admin balance data
   */
  static getAdminBalance() {
    try {
      // Find admin user
      const admin = db.prepare(`
        SELECT id, email, name FROM users 
        WHERE userType = 'admin' 
        LIMIT 1
      `).get();

      if (!admin) {
        throw new Error('No admin user found in the system');
      }

      // Get admin balance
      const balance = db.prepare(`
        SELECT * FROM user_balances 
        WHERE userId = ? AND userType = 'admin'
      `).get(admin.id);

      if (!balance) {
        // Initialize balance if it doesn't exist
        const initResult = this.initializeAdminBalance();
        if (!initResult.success) {
          throw new Error(initResult.error);
        }
        return initResult.balance;
      }

      return balance;

    } catch (error) {
      console.error('Error getting admin balance:', error);
      throw error;
    }
  }

  /**
   * Add service charge to admin balance
   * @param {number} amount - Service charge amount
   * @param {string} transactionId - Transaction ID
   * @param {string} description - Transaction description
   * @returns {Object} Update result
   */
  static async addServiceCharge(amount, transactionId, description = null) {
    try {
      // Get admin balance
      const adminBalance = this.getAdminBalance();
      
      if (!adminBalance) {
        throw new Error('Admin balance not found');
      }

      // Update admin balance with service charge
      const updatedBalance = UserBalance.updateBalance(
        adminBalance.userId,
        null, // Admin balance is not hospital-specific
        amount,
        'service_charge',
        transactionId,
        description || `Service charge from transaction ${transactionId} - Amount: ৳${amount.toFixed(2)}`
      );

      console.log(`✅ Service charge of ৳${amount.toFixed(2)} added to admin balance`);

      return {
        success: true,
        balance: updatedBalance,
        message: `Service charge of ৳${amount.toFixed(2)} added to admin balance`
      };

    } catch (error) {
      console.error('Error adding service charge to admin balance:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get admin balance transaction history
   * @param {Object} options - Query options
   * @returns {Array} Transaction history
   */
  static getAdminTransactionHistory(options = {}) {
    try {
      const adminBalance = this.getAdminBalance();
      
      if (!adminBalance) {
        return [];
      }

      let query = `
        SELECT 
          bt.*,
          u.name as processedByName,
          u.email as processedByEmail
        FROM balance_transactions bt
        LEFT JOIN users u ON bt.processedBy = u.id
        WHERE bt.balanceId = ?
      `;

      const params = [adminBalance.id];

      // Add date range filter if provided
      if (options.startDate && options.endDate) {
        query += ` AND DATE(bt.createdAt) BETWEEN ? AND ?`;
        params.push(options.startDate, options.endDate);
      }

      // Add transaction type filter if provided
      if (options.transactionType) {
        query += ` AND bt.transactionType = ?`;
        params.push(options.transactionType);
      }

      query += ` ORDER BY bt.createdAt DESC`;

      // Add limit if provided
      if (options.limit) {
        query += ` LIMIT ?`;
        params.push(options.limit);
      }

      const transactions = db.prepare(query).all(...params);

      return transactions;

    } catch (error) {
      console.error('Error getting admin transaction history:', error);
      return [];
    }
  }

  /**
   * Get admin financial summary
   * @param {Object} options - Query options
   * @returns {Object} Financial summary
   */
  static getAdminFinancialSummary(options = {}) {
    try {
      const adminBalance = this.getAdminBalance();
      
      if (!adminBalance) {
        return {
          currentBalance: 0,
          totalEarnings: 0,
          totalWithdrawals: 0,
          pendingAmount: 0,
          transactionCount: 0,
          averageTransactionAmount: 0
        };
      }

      // Get transaction statistics
      let statsQuery = `
        SELECT 
          COUNT(*) as transactionCount,
          COALESCE(SUM(amount), 0) as totalAmount,
          COALESCE(AVG(amount), 0) as averageAmount
        FROM balance_transactions 
        WHERE balanceId = ?
      `;

      const statsParams = [adminBalance.id];

      // Add date range filter if provided
      if (options.startDate && options.endDate) {
        statsQuery += ` AND DATE(createdAt) BETWEEN ? AND ?`;
        statsParams.push(options.startDate, options.endDate);
      }

      const stats = db.prepare(statsQuery).get(...statsParams);

      // Get service charge earnings
      let serviceChargeQuery = `
        SELECT 
          COUNT(*) as serviceChargeCount,
          COALESCE(SUM(amount), 0) as totalServiceCharges
        FROM balance_transactions 
        WHERE balanceId = ? AND transactionType = 'service_charge'
      `;

      const serviceChargeParams = [adminBalance.id];

      if (options.startDate && options.endDate) {
        serviceChargeQuery += ` AND DATE(createdAt) BETWEEN ? AND ?`;
        serviceChargeParams.push(options.startDate, options.endDate);
      }

      const serviceChargeStats = db.prepare(serviceChargeQuery).get(...serviceChargeParams);

      return {
        currentBalance: adminBalance.currentBalance,
        totalEarnings: adminBalance.totalEarnings,
        totalWithdrawals: adminBalance.totalWithdrawals,
        pendingAmount: adminBalance.pendingAmount,
        transactionCount: stats.transactionCount,
        averageTransactionAmount: stats.averageAmount,
        serviceChargeCount: serviceChargeStats.serviceChargeCount,
        totalServiceCharges: serviceChargeStats.totalServiceCharges,
        lastTransactionAt: adminBalance.lastTransactionAt
      };

    } catch (error) {
      console.error('Error getting admin financial summary:', error);
      return {
        currentBalance: 0,
        totalEarnings: 0,
        totalWithdrawals: 0,
        pendingAmount: 0,
        transactionCount: 0,
        averageTransactionAmount: 0,
        serviceChargeCount: 0,
        totalServiceCharges: 0
      };
    }
  }

  /**
   * Process admin withdrawal
   * @param {number} amount - Withdrawal amount
   * @param {string} description - Withdrawal description
   * @param {number} processedBy - Admin user ID who processed the withdrawal
   * @returns {Object} Withdrawal result
   */
  static async processWithdrawal(amount, description, processedBy) {
    try {
      const adminBalance = this.getAdminBalance();
      
      if (!adminBalance) {
        throw new Error('Admin balance not found');
      }

      // Check if sufficient balance
      if (adminBalance.currentBalance < amount) {
        throw new Error('Insufficient balance for withdrawal');
      }

      // Process withdrawal
      const updatedBalance = UserBalance.updateBalance(
        adminBalance.userId,
        null,
        amount,
        'withdrawal',
        null,
        description || `Admin withdrawal - Amount: ৳${amount.toFixed(2)}`
      );

      console.log(`✅ Admin withdrawal of ৳${amount.toFixed(2)} processed`);

      return {
        success: true,
        balance: updatedBalance,
        message: `Withdrawal of ৳${amount.toFixed(2)} processed successfully`
      };

    } catch (error) {
      console.error('Error processing admin withdrawal:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
}

module.exports = AdminBalanceService;
