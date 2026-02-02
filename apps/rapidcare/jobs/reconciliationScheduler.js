const cron = require('node-cron');
const FinancialReconciliationService = require('../services/financialReconciliationService');
const ErrorHandler = require('../utils/errorHandler');

class ReconciliationScheduler {
  constructor(database) {
    this.reconciliationService = new FinancialReconciliationService(database);
    this.jobs = new Map();
  }

  /**
   * Start automated daily reconciliation at 2 AM every day
   */
  startDailyReconciliation() {
    const job = cron.schedule('0 2 * * *', async () => {
      try {
        console.log('Starting automated daily reconciliation...');
        const result = await this.reconciliationService.performDailyReconciliation();
        console.log('Daily reconciliation completed:', result.status);
        
        if (result.status === 'DISCREPANCY_FOUND') {
          console.warn(`Discrepancies found: ${result.discrepancies.length} issues detected`);
        }
      } catch (error) {
        const handledError = ErrorHandler.createGenericError(`Automated daily reconciliation failed: ${error.message}`);
        console.error('Daily reconciliation error:', handledError.error.message);
        ErrorHandler.logError(handledError, { context: 'automated_daily_reconciliation' });
      }
    }, {
      scheduled: false,
      timezone: 'Asia/Dhaka'
    });

    this.jobs.set('dailyReconciliation', job);
    job.start();
    console.log('Daily reconciliation scheduler started (2 AM daily)');
  }

  /**
   * Start financial health monitoring every 4 hours
   */
  startHealthMonitoring() {
    const job = cron.schedule('0 */4 * * *', async () => {
      try {
        console.log('Running financial health check...');
        const healthStatus = await this.reconciliationService.monitorFinancialHealth();
        
        if (healthStatus.status === 'ISSUES_DETECTED') {
          console.warn(`Financial health issues detected: ${healthStatus.alerts.length} alerts`);
          
          // Log high-priority alerts
          const highPriorityAlerts = healthStatus.alerts.filter(alert => alert.level === 'HIGH');
          if (highPriorityAlerts.length > 0) {
            console.error('HIGH PRIORITY ALERTS:', highPriorityAlerts.map(alert => alert.message));
          }
        } else {
          console.log('Financial health check passed');
        }
      } catch (error) {
        const handledError = ErrorHandler.createGenericError(`Financial health monitoring failed: ${error.message}`);
        console.error('Health monitoring error:', handledError.error.message);
        ErrorHandler.logError(handledError, { context: 'financial_health_monitoring' });
      }
    }, {
      scheduled: false,
      timezone: 'Asia/Dhaka'
    });

    this.jobs.set('healthMonitoring', job);
    job.start();
    console.log('Financial health monitoring started (every 4 hours)');
  }

  /**
   * Start transaction integrity verification for recent transactions
   */
  startIntegrityVerification() {
    const job = cron.schedule('*/30 * * * *', async () => {
      try {
        console.log('Running transaction integrity verification...');
        
        // Get transactions from the last 30 minutes
        const recentTransactions = await this.getRecentTransactions(30);
        let issuesFound = 0;
        
        for (const transaction of recentTransactions) {
          try {
            const verification = await this.reconciliationService.verifyTransactionIntegrity(transaction.id);
            if (!verification.isValid) {
              issuesFound++;
              console.warn(`Transaction integrity issue found: ${transaction.id}`, verification.issues);
            }
          } catch (error) {
            console.error(`Failed to verify transaction ${transaction.id}:`, error.message);
          }
        }
        
        if (issuesFound === 0) {
          console.log(`Transaction integrity verification completed: ${recentTransactions.length} transactions verified`);
        } else {
          console.warn(`Transaction integrity issues found: ${issuesFound} out of ${recentTransactions.length} transactions`);
        }
      } catch (error) {
        const handledError = ErrorHandler.createGenericError(`Transaction integrity verification failed: ${error.message}`);
        console.error('Integrity verification error:', handledError.error.message);
        ErrorHandler.logError(handledError, { context: 'transaction_integrity_verification' });
      }
    }, {
      scheduled: false,
      timezone: 'Asia/Dhaka'
    });

    this.jobs.set('integrityVerification', job);
    job.start();
    console.log('Transaction integrity verification started (every 30 minutes)');
  }

  /**
   * Start all scheduled jobs
   */
  startAll() {
    this.startDailyReconciliation();
    this.startHealthMonitoring();
    this.startIntegrityVerification();
    console.log('All reconciliation schedulers started');
  }

  /**
   * Stop a specific job
   */
  stopJob(jobName) {
    const job = this.jobs.get(jobName);
    if (job) {
      job.stop();
      this.jobs.delete(jobName);
      console.log(`Stopped job: ${jobName}`);
    }
  }

  /**
   * Stop all jobs
   */
  stopAll() {
    for (const [jobName, job] of this.jobs) {
      job.stop();
      console.log(`Stopped job: ${jobName}`);
    }
    this.jobs.clear();
    console.log('All reconciliation schedulers stopped');
  }

  /**
   * Get job status
   */
  getJobStatus() {
    const status = {};
    for (const [jobName, job] of this.jobs) {
      status[jobName] = {
        running: job.running,
        scheduled: job.scheduled
      };
    }
    return status;
  }

  /**
   * Helper method to get recent transactions
   */
  async getRecentTransactions(minutes) {
    const cutoffTime = new Date();
    cutoffTime.setMinutes(cutoffTime.getMinutes() - minutes);
    
    const query = `
      SELECT * FROM transactions 
      WHERE createdAt >= ? 
      ORDER BY createdAt DESC
    `;
    return this.reconciliationService.db.prepare(query).all(cutoffTime.toISOString());
  }

  /**
   * Manual trigger for daily reconciliation (for testing)
   */
  async triggerDailyReconciliation(date) {
    try {
      console.log('Manually triggering daily reconciliation...');
      const result = await this.reconciliationService.performDailyReconciliation(date);
      console.log('Manual reconciliation completed:', result);
      return result;
    } catch (error) {
      const handledError = ErrorHandler.createGenericError(`Manual reconciliation failed: ${error.message}`);
      console.error('Manual reconciliation error:', handledError.error.message);
      ErrorHandler.logError(handledError, { context: 'manual_daily_reconciliation' });
      throw handledError;
    }
  }

  /**
   * Manual trigger for health monitoring (for testing)
   */
  async triggerHealthMonitoring() {
    try {
      console.log('Manually triggering health monitoring...');
      const result = await this.reconciliationService.monitorFinancialHealth();
      console.log('Manual health monitoring completed:', result);
      return result;
    } catch (error) {
      const handledError = ErrorHandler.createGenericError(`Manual health monitoring failed: ${error.message}`);
      console.error('Manual health monitoring error:', handledError.error.message);
      ErrorHandler.logError(handledError, { context: 'manual_health_monitoring' });
      throw handledError;
    }
  }
}

module.exports = ReconciliationScheduler;