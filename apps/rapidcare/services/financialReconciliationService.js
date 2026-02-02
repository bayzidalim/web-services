const { formatTaka, parseTaka, isValidTakaAmount } = require('../utils/currencyUtils');
const ErrorHandler = require('../utils/errorHandler');

class FinancialReconciliationService {
  constructor(database) {
    this.db = database;
  }

  /**
   * Perform automated daily balance reconciliation for BDT amounts
   */
  async performDailyReconciliation(date = new Date()) {
    try {
      const reconciliationDate = new Date(date);
      reconciliationDate.setHours(0, 0, 0, 0);
      
      const nextDay = new Date(reconciliationDate);
      nextDay.setDate(nextDay.getDate() + 1);

      // Get all transactions for the day
      const transactions = await this.getTransactionsForDate(reconciliationDate, nextDay);
      
      // Calculate expected balances
      const expectedBalances = await this.calculateExpectedBalances(transactions);
      
      // Get actual balances from system
      const actualBalances = await this.getActualBalances();
      
      // Compare and identify discrepancies
      const discrepancies = this.identifyDiscrepancies(expectedBalances, actualBalances);
      
      // Create reconciliation record
      const reconciliationRecord = await this.createReconciliationRecord({
        date: reconciliationDate,
        expectedBalances,
        actualBalances,
        discrepancies,
        status: discrepancies.length > 0 ? 'DISCREPANCY_FOUND' : 'RECONCILED'
      });

      // Generate alerts if discrepancies found
      if (discrepancies.length > 0) {
        await this.generateDiscrepancyAlerts(discrepancies, reconciliationRecord.id);
      }

      return reconciliationRecord;
    } catch (error) {
      throw new Error('Failed to perform daily reconciliation: ' + error.message);
    }
  }

  /**
   * Verify transaction integrity and detect discrepancies
   */
  async verifyTransactionIntegrity(transactionId) {
    try {
      const transaction = await this.getTransactionById(transactionId);
      if (!transaction) {
        throw new Error('Transaction not found');
      }

      const integrityChecks = {
        amountValidation: this.validateTransactionAmount(transaction),
        currencyValidation: this.validateCurrencyFormat(transaction),
        balanceConsistency: await this.checkBalanceConsistency(transaction),
        auditTrailComplete: await this.verifyAuditTrail(transaction),
        duplicateCheck: await this.checkForDuplicates(transaction)
      };

      const hasIssues = Object.values(integrityChecks).some(check => !check.valid);
      
      return {
        transactionId,
        isValid: !hasIssues,
        checks: integrityChecks,
        issues: Object.entries(integrityChecks)
          .filter(([_, check]) => !check.valid)
          .map(([checkName, check]) => ({ check: checkName, issue: check.issue }))
      };
    } catch (error) {
      throw new Error('Failed to verify transaction integrity: ' + error.message);
    }
  }

  /**
   * Generate financial audit trail with Taka formatting
   */
  async generateAuditTrail(startDate, endDate, options = {}) {
    try {
      const auditTrail = {
        period: { startDate, endDate },
        generatedAt: new Date(),
        summary: {},
        transactions: [],
        reconciliations: [],
        discrepancies: []
      };

      // Get all transactions in period
      const transactions = await this.getTransactionsForPeriod(startDate, endDate);
      auditTrail.transactions = transactions.map(tx => this.formatTransactionForAudit(tx));

      // Get reconciliation records
      const reconciliations = await this.getReconciliationsForPeriod(startDate, endDate);
      auditTrail.reconciliations = reconciliations;

      // Get discrepancies
      const discrepancies = await this.getDiscrepanciesForPeriod(startDate, endDate);
      auditTrail.discrepancies = discrepancies.map(d => this.formatDiscrepancyForAudit(d));

      // Calculate summary
      auditTrail.summary = this.calculateAuditSummary(transactions, reconciliations, discrepancies);

      return auditTrail;
    } catch (error) {
      throw new Error('Failed to generate audit trail: ' + error.message);
    }
  }

  /**
   * Correct balance discrepancies (admin only)
   */
  async correctBalance(correctionData, adminUserId) {
    try {
      const { accountId, currentBalance, correctBalance, reason, evidence } = correctionData;

      // Validate correction amount
      if (!isValidTakaAmount(correctBalance)) {
        throw new Error('Invalid correction amount format');
      }

      const difference = parseTaka(correctBalance) - parseTaka(currentBalance);
      
      // Create correction transaction
      const correctionTransaction = await this.createCorrectionTransaction({
        accountId,
        amount: Math.abs(difference),
        type: difference > 0 ? 'CREDIT_ADJUSTMENT' : 'DEBIT_ADJUSTMENT',
        reason,
        evidence,
        adminUserId,
        originalBalance: currentBalance,
        correctedBalance: correctBalance
      });

      // Update account balance
      await this.updateAccountBalance(accountId, correctBalance);

      // Log correction in audit trail
      await this.logBalanceCorrection({
        transactionId: correctionTransaction.id,
        adminUserId,
        accountId,
        correction: {
          from: formatTaka(currentBalance),
          to: formatTaka(correctBalance),
          difference: formatTaka(difference)
        },
        reason,
        timestamp: new Date()
      });

      return correctionTransaction;
    } catch (error) {
      throw new Error('Failed to correct balance: ' + error.message);
    }
  }

  /**
   * Monitor financial health and generate alerts
   */
  async monitorFinancialHealth() {
    try {
      const healthMetrics = {
        dailyReconciliationStatus: await this.checkDailyReconciliationStatus(),
        outstandingDiscrepancies: await this.getOutstandingDiscrepancies(),
        balanceAnomalies: await this.detectBalanceAnomalies(),
        transactionVolumeAnomalies: await this.detectVolumeAnomalies(),
        systemBalanceHealth: await this.checkSystemBalanceHealth()
      };

      const alerts = [];

      // Check for critical issues
      if (healthMetrics.outstandingDiscrepancies.length > 0) {
        alerts.push({
          level: 'HIGH',
          type: 'OUTSTANDING_DISCREPANCIES',
          message: `${healthMetrics.outstandingDiscrepancies.length} outstanding discrepancies found`,
          data: healthMetrics.outstandingDiscrepancies
        });
      }

      if (healthMetrics.balanceAnomalies.length > 0) {
        alerts.push({
          level: 'MEDIUM',
          type: 'BALANCE_ANOMALIES',
          message: `${healthMetrics.balanceAnomalies.length} balance anomalies detected`,
          data: healthMetrics.balanceAnomalies
        });
      }

      // Generate alerts if needed
      if (alerts.length > 0) {
        await this.generateHealthAlerts(alerts);
      }

      return {
        status: alerts.length === 0 ? 'HEALTHY' : 'ISSUES_DETECTED',
        metrics: healthMetrics,
        alerts,
        checkedAt: new Date()
      };
    } catch (error) {
      throw new Error('Failed to monitor financial health: ' + error.message);
    }
  }

  // Helper methods
  async getTransactionsForDate(startDate, endDate) {
    const query = `
      SELECT * FROM transactions 
      WHERE createdAt >= ? AND createdAt < ?
      ORDER BY createdAt ASC
    `;
    return this.db.prepare(query).all(startDate.toISOString(), endDate.toISOString());
  }

  async calculateExpectedBalances(transactions) {
    const balances = {};
    
    for (const transaction of transactions) {
      const accountId = transaction.account_id;
      if (!balances[accountId]) {
        balances[accountId] = await this.getAccountBalanceBeforeDate(accountId, transactions[0].created_at);
      }
      
      if (transaction.type === 'CREDIT') {
        balances[accountId] += parseTaka(transaction.amount);
      } else {
        balances[accountId] -= parseTaka(transaction.amount);
      }
    }
    
    return balances;
  }

  async getActualBalances() {
    const query = `SELECT account_id, balance FROM account_balances`;
    const results = this.db.prepare(query).all();
    
    const balances = {};
    results.forEach(row => {
      balances[row.account_id] = parseTaka(row.balance);
    });
    
    return balances;
  }

  identifyDiscrepancies(expected, actual) {
    const discrepancies = [];
    
    const allAccountIds = new Set([...Object.keys(expected), ...Object.keys(actual)]);
    
    for (const accountId of allAccountIds) {
      const expectedAmount = expected[accountId] || 0;
      const actualAmount = actual[accountId] || 0;
      const difference = actualAmount - expectedAmount;
      
      if (Math.abs(difference) > 0.01) { // Allow for minor rounding differences
        discrepancies.push({
          accountId,
          expected: formatTaka(expectedAmount),
          actual: formatTaka(actualAmount),
          difference: formatTaka(difference),
          severity: Math.abs(difference) > 1000 ? 'HIGH' : 'MEDIUM'
        });
      }
    }
    
    return discrepancies;
  }

  validateTransactionAmount(transaction) {
    try {
      const isValid = isValidTakaAmount(transaction.amount);
      return {
        valid: isValid,
        issue: isValid ? null : 'Invalid amount format'
      };
    } catch (error) {
      return {
        valid: false,
        issue: 'Amount validation failed'
      };
    }
  }

  validateCurrencyFormat(transaction) {
    try {
      const amount = parseTaka(transaction.amount);
      const formatted = formatTaka(amount);
      return {
        valid: true,
        issue: null
      };
    } catch (error) {
      return {
        valid: false,
        issue: 'Invalid currency format'
      };
    }
  }

  formatTransactionForAudit(transaction) {
    return {
      id: transaction.id,
      type: transaction.type,
      amount: formatTaka(transaction.amount),
      accountId: transaction.account_id,
      timestamp: transaction.createdAt,
      reference: transaction.reference,
      status: transaction.status
    };
  }

  formatDiscrepancyForAudit(discrepancy) {
    return {
      ...discrepancy,
      expected: formatTaka(discrepancy.expected),
      actual: formatTaka(discrepancy.actual),
      difference: formatTaka(discrepancy.difference)
    };
  }

  async getTransactionById(transactionId) {
    const query = `SELECT * FROM transactions WHERE id = ?`;
    return this.db.prepare(query).get(transactionId);
  }

  async getAccountBalanceBeforeDate(accountId, date) {
    const query = `
      SELECT balance FROM account_balances 
      WHERE account_id = ? AND last_updated < ?
      ORDER BY updatedAt DESC LIMIT 1
    `;
    const result = this.db.prepare(query).get(accountId, date);
    return result ? parseTaka(result.balance) : 0;
  }

  async checkBalanceConsistency(transaction) {
    try {
      const accountBalance = await this.getAccountBalance(transaction.account_id);
      const transactionAmount = parseTaka(transaction.amount);
      
      // Check if balance change is consistent with transaction
      const expectedBalance = transaction.type === 'CREDIT' 
        ? accountBalance - transactionAmount 
        : accountBalance + transactionAmount;
        
      const balanceHistory = await this.getBalanceHistory(transaction.account_id, transaction.createdAt);
      const actualPreviousBalance = balanceHistory.length > 0 ? parseTaka(balanceHistory[0].balance) : 0;
      
      const isConsistent = Math.abs(expectedBalance - actualPreviousBalance) < 0.01;
      
      return {
        valid: isConsistent,
        issue: isConsistent ? null : 'Balance inconsistency detected'
      };
    } catch (error) {
      return {
        valid: false,
        issue: 'Failed to check balance consistency'
      };
    }
  }

  async verifyAuditTrail(transaction) {
    try {
      const auditEntries = await this.getAuditEntriesForTransaction(transaction.id);
      const hasCompleteTrail = auditEntries.length > 0;
      
      return {
        valid: hasCompleteTrail,
        issue: hasCompleteTrail ? null : 'Incomplete audit trail'
      };
    } catch (error) {
      return {
        valid: false,
        issue: 'Failed to verify audit trail'
      };
    }
  }

  async checkForDuplicates(transaction) {
    try {
      const query = `
        SELECT COUNT(*) as count FROM transactions 
        WHERE reference = ? AND id != ? AND createdAt BETWEEN ? AND ?
      `;
      const startTime = new Date(transaction.createdAt);
      startTime.setMinutes(startTime.getMinutes() - 5);
      const endTime = new Date(transaction.createdAt);
      endTime.setMinutes(endTime.getMinutes() + 5);
      
      const result = this.db.prepare(query).get(
        transaction.reference, 
        transaction.id, 
        startTime.toISOString(), 
        endTime.toISOString()
      );
      
      const hasDuplicates = result.count > 0;
      
      return {
        valid: !hasDuplicates,
        issue: hasDuplicates ? 'Potential duplicate transaction detected' : null
      };
    } catch (error) {
      return {
        valid: false,
        issue: 'Failed to check for duplicates'
      };
    }
  }

  async getTransactionsForPeriod(startDate, endDate) {
    const query = `
      SELECT * FROM transactions 
      WHERE createdAt >= ? AND createdAt <= ?
      ORDER BY createdAt ASC
    `;
    return this.db.prepare(query).all(startDate.toISOString(), endDate.toISOString());
  }

  async getReconciliationsForPeriod(startDate, endDate) {
    const query = `
      SELECT * FROM reconciliation_records 
      WHERE date >= ? AND date <= ?
      ORDER BY date ASC
    `;
    return this.db.prepare(query).all(startDate.toISOString(), endDate.toISOString());
  }

  async getDiscrepanciesForPeriod(startDate, endDate) {
    const query = `
      SELECT da.*, rr.date as reconciliation_date 
      FROM discrepancy_alerts da
      JOIN reconciliation_records rr ON da.reconciliation_id = rr.id
      WHERE rr.date >= ? AND rr.date <= ?
      ORDER BY da.created_at ASC
    `;
    return this.db.prepare(query).all(startDate.toISOString(), endDate.toISOString());
  }

  calculateAuditSummary(transactions, reconciliations, discrepancies) {
    const totalTransactions = transactions.length;
    const totalAmount = transactions.reduce((sum, tx) => sum + parseTaka(tx.amount), 0);
    const totalReconciliations = reconciliations.length;
    const totalDiscrepancies = discrepancies.length;
    const resolvedDiscrepancies = discrepancies.filter(d => d.status === 'RESOLVED').length;
    
    return {
      totalTransactions,
      totalAmount: formatTaka(totalAmount),
      totalReconciliations,
      totalDiscrepancies,
      resolvedDiscrepancies,
      outstandingDiscrepancies: totalDiscrepancies - resolvedDiscrepancies,
      reconciliationRate: totalReconciliations > 0 ? ((totalReconciliations - totalDiscrepancies) / totalReconciliations * 100).toFixed(2) + '%' : '0%'
    };
  }

  async createReconciliationRecord(data) {
    const query = `
      INSERT INTO reconciliation_records (date, status, expected_balances, actual_balances, discrepancies)
      VALUES (?, ?, ?, ?, ?)
    `;
    const result = this.db.prepare(query).run(
      data.date.toISOString(),
      data.status,
      JSON.stringify(data.expectedBalances),
      JSON.stringify(data.actualBalances),
      JSON.stringify(data.discrepancies)
    );
    
    return { id: result.lastInsertRowid, ...data };
  }

  async generateDiscrepancyAlerts(discrepancies, reconciliationId) {
    const query = `
      INSERT INTO discrepancy_alerts 
      (reconciliation_id, account_id, expected_amount, actual_amount, difference_amount, severity)
      VALUES (?, ?, ?, ?, ?, ?)
    `;
    const stmt = this.db.prepare(query);
    
    for (const discrepancy of discrepancies) {
      stmt.run(
        reconciliationId,
        discrepancy.accountId,
        parseTaka(discrepancy.expected),
        parseTaka(discrepancy.actual),
        parseTaka(discrepancy.difference),
        discrepancy.severity
      );
    }
  }

  async createCorrectionTransaction(data) {
    const transactionId = `CORR_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Insert into transactions table
    const transactionQuery = `
      INSERT INTO transactions (id, account_id, amount, type, reference, status, created_at)
      VALUES (?, ?, ?, ?, ?, 'COMPLETED', ?)
    `;
    this.db.prepare(transactionQuery).run(
      transactionId,
      data.accountId,
      data.amount,
      data.type,
      `Balance correction: ${data.reason}`,
      new Date().toISOString()
    );
    
    // Insert into balance_corrections table
    const correctionQuery = `
      INSERT INTO balance_corrections 
      (transaction_id, account_id, original_balance, corrected_balance, difference_amount, correction_type, reason, evidence, admin_user_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    this.db.prepare(correctionQuery).run(
      transactionId,
      data.accountId,
      parseTaka(data.originalBalance),
      parseTaka(data.correctedBalance),
      data.amount,
      data.type,
      data.reason,
      data.evidence,
      data.adminUserId
    );
    
    return { id: transactionId, ...data };
  }

  async updateAccountBalance(accountId, newBalance) {
    const query = `
      INSERT OR REPLACE INTO account_balances (account_id, balance, last_updated, version)
      VALUES (?, ?, ?, COALESCE((SELECT version FROM account_balances WHERE account_id = ?), 0) + 1)
    `;
    this.db.prepare(query).run(accountId, newBalance, new Date().toISOString(), accountId);
  }

  async logBalanceCorrection(data) {
    const query = `
      INSERT INTO audit_trail (event_type, entity_type, entity_id, user_id, changes, metadata)
      VALUES ('BALANCE_CORRECTION', 'ACCOUNT', ?, ?, ?, ?)
    `;
    this.db.prepare(query).run(
      data.accountId,
      data.adminUserId,
      JSON.stringify(data.correction),
      JSON.stringify({ reason: data.reason, transactionId: data.transactionId, timestamp: data.timestamp })
    );
  }

  async checkDailyReconciliationStatus() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const query = `
      SELECT status FROM reconciliation_records 
      WHERE date = ? 
      ORDER BY createdAt DESC LIMIT 1
    `;
    const result = this.db.prepare(query).get(today.toISOString());
    
    return {
      date: today,
      completed: !!result,
      status: result ? result.status : 'PENDING',
      lastRun: result ? result.created_at : null
    };
  }

  async getOutstandingDiscrepancies(filters = {}) {
    let query = `
      SELECT da.*, rr.date as reconciliation_date 
      FROM discrepancy_alerts da
      JOIN reconciliation_records rr ON da.reconciliation_id = rr.id
      WHERE da.status = 'OPEN'
    `;
    const params = [];
    
    if (filters.severity) {
      query += ` AND da.severity = ?`;
      params.push(filters.severity);
    }
    
    if (filters.accountId) {
      query += ` AND da.account_id = ?`;
      params.push(filters.accountId);
    }
    
    query += ` ORDER BY da.created_at DESC`;
    
    return this.db.prepare(query).all(...params);
  }

  async detectBalanceAnomalies() {
    const query = `
      SELECT account_id, balance, last_updated
      FROM account_balances
      WHERE balance < 0 OR balance > 1000000 -- Configurable thresholds
    `;
    return this.db.prepare(query).all();
  }

  async detectVolumeAnomalies() {
    const query = `
      SELECT DATE(created_at) as date, COUNT(*) as transaction_count, SUM(amount) as total_amount
      FROM transactions
      WHERE createdAt >= date('now', '-7 days')
      GROUP BY DATE(createdAt)
      HAVING transaction_count > 1000 OR total_amount > 500000 -- Configurable thresholds
    `;
    return this.db.prepare(query).all();
  }

  async checkSystemBalanceHealth() {
    const query = `
      SELECT 
        SUM(CASE WHEN balance >= 0 THEN balance ELSE 0 END) as total_positive_balance,
        SUM(CASE WHEN balance < 0 THEN balance ELSE 0 END) as total_negative_balance,
        COUNT(*) as total_accounts,
        COUNT(CASE WHEN balance < 0 THEN 1 END) as negative_balance_accounts
      FROM account_balances
    `;
    const result = this.db.prepare(query).get();
    
    return {
      totalPositiveBalance: formatTaka(result.total_positive_balance || 0),
      totalNegativeBalance: formatTaka(result.total_negative_balance || 0),
      totalAccounts: result.total_accounts,
      negativeBalanceAccounts: result.negative_balance_accounts,
      healthScore: result.negative_balance_accounts === 0 ? 100 : Math.max(0, 100 - (result.negative_balance_accounts / result.total_accounts * 100))
    };
  }

  async generateHealthAlerts(alerts) {
    const query = `
      INSERT INTO financial_health_checks (check_date, status, metrics, alerts)
      VALUES (?, ?, ?, ?)
    `;
    this.db.prepare(query).run(
      new Date().toISOString(),
      'ISSUES_DETECTED',
      JSON.stringify({}),
      JSON.stringify(alerts)
    );
  }

  async getAccountBalance(accountId) {
    const query = `SELECT balance FROM account_balances WHERE account_id = ?`;
    const result = this.db.prepare(query).get(accountId);
    return result ? parseTaka(result.balance) : 0;
  }

  async getBalanceHistory(accountId, beforeDate) {
    const query = `
      SELECT balance, last_updated FROM account_balances 
      WHERE account_id = ? AND last_updated < ?
      ORDER BY updatedAt DESC LIMIT 10
    `;
    return this.db.prepare(query).all(accountId, beforeDate);
  }

  async getAuditEntriesForTransaction(transactionId) {
    const query = `
      SELECT * FROM audit_trail 
      WHERE entity_type = 'TRANSACTION' AND entity_id = ?
    `;
    return this.db.prepare(query).all(transactionId);
  }

  async getReconciliationHistory(options) {
    const { page, limit, filters } = options;
    const offset = (page - 1) * limit;
    
    let query = `SELECT * FROM reconciliation_records WHERE 1=1`;
    const params = [];
    
    if (filters.status) {
      query += ` AND status = ?`;
      params.push(filters.status);
    }
    
    if (filters.startDate) {
      query += ` AND date >= ?`;
      params.push(filters.startDate.toISOString());
    }
    
    if (filters.endDate) {
      query += ` AND date <= ?`;
      params.push(filters.endDate.toISOString());
    }
    
    query += ` ORDER BY date DESC LIMIT ? OFFSET ?`;
    params.push(limit, offset);
    
    const records = this.db.prepare(query).all(...params);
    
    // Get total count
    let countQuery = `SELECT COUNT(*) as total FROM reconciliation_records WHERE 1=1`;
    const countParams = [];
    
    if (filters.status) {
      countQuery += ` AND status = ?`;
      countParams.push(filters.status);
    }
    
    if (filters.startDate) {
      countQuery += ` AND date >= ?`;
      countParams.push(filters.startDate.toISOString());
    }
    
    if (filters.endDate) {
      countQuery += ` AND date <= ?`;
      countParams.push(filters.endDate.toISOString());
    }
    
    const { total } = this.db.prepare(countQuery).get(...countParams);
    
    return {
      records,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  async resolveDiscrepancy(discrepancyId, userId, resolutionNotes) {
    const query = `
      UPDATE discrepancy_alerts 
      SET status = 'RESOLVED', resolvedAt = ?, resolvedBy = ?, resolutionNotes = ?
      WHERE id = ?
    `;
    const result = this.db.prepare(query).run(
      new Date().toISOString(),
      userId,
      resolutionNotes,
      discrepancyId
    );
    
    if (result.changes === 0) {
      throw new Error('Discrepancy not found');
    }
    
    return { id: discrepancyId, resolved: true };
  }
}

module.exports = FinancialReconciliationService;