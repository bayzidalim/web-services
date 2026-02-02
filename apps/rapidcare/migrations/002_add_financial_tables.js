const db = require('../config/database');

/**
 * Migration: Add Financial Tables
 * Adds tables for payment processing, revenue management, and financial tracking
 */

const addFinancialTables = () => {
  console.log('Running migration: Add Financial Tables');

  try {
    // Begin transaction for atomic migration
    db.exec('BEGIN TRANSACTION');

    // Transactions table for payment processing
    db.exec(`
      CREATE TABLE IF NOT EXISTS transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        bookingId INTEGER NOT NULL,
        userId INTEGER NOT NULL,
        hospitalId INTEGER NOT NULL,
        amount DECIMAL(10,2) NOT NULL,
        serviceCharge DECIMAL(10,2) NOT NULL,
        hospitalAmount DECIMAL(10,2) NOT NULL,
        paymentMethod TEXT NOT NULL,
        transactionId TEXT UNIQUE,
        status TEXT NOT NULL CHECK(status IN ('pending', 'completed', 'failed', 'refunded')),
        paymentData TEXT,
        processedAt DATETIME,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (bookingId) REFERENCES bookings (id),
        FOREIGN KEY (userId) REFERENCES users (id),
        FOREIGN KEY (hospitalId) REFERENCES hospitals (id)
      )
    `);

    // Hospital pricing table for resource rate management
    db.exec(`
      CREATE TABLE IF NOT EXISTS hospital_pricing (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        hospitalId INTEGER NOT NULL,
        resourceType TEXT NOT NULL CHECK(resourceType IN ('beds', 'icu', 'operationTheatres')),
        baseRate DECIMAL(10,2) NOT NULL,
        hourlyRate DECIMAL(10,2),
        minimumCharge DECIMAL(10,2),
        maximumCharge DECIMAL(10,2),
        currency TEXT DEFAULT 'USD',
        effectiveFrom DATETIME DEFAULT CURRENT_TIMESTAMP,
        effectiveTo DATETIME,
        isActive BOOLEAN DEFAULT 1,
        createdBy INTEGER NOT NULL,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (hospitalId) REFERENCES hospitals (id) ON DELETE CASCADE,
        FOREIGN KEY (createdBy) REFERENCES users (id),
        UNIQUE(hospitalId, resourceType, effectiveFrom)
      )
    `);

    // User balances table for revenue tracking
    db.exec(`
      CREATE TABLE IF NOT EXISTS user_balances (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        userId INTEGER NOT NULL,
        userType TEXT NOT NULL CHECK(userType IN ('hospital-authority', 'admin')),
        hospitalId INTEGER,
        currentBalance DECIMAL(12,2) DEFAULT 0.00,
        totalEarnings DECIMAL(12,2) DEFAULT 0.00,
        totalWithdrawals DECIMAL(12,2) DEFAULT 0.00,
        pendingAmount DECIMAL(12,2) DEFAULT 0.00,
        lastTransactionAt DATETIME,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (userId) REFERENCES users (id) ON DELETE CASCADE,
        FOREIGN KEY (hospitalId) REFERENCES hospitals (id),
        UNIQUE(userId, hospitalId)
      )
    `);

    // Balance transactions table for audit trails
    db.exec(`
      CREATE TABLE IF NOT EXISTS balance_transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        balanceId INTEGER NOT NULL,
        transactionId INTEGER,
        transactionType TEXT NOT NULL CHECK(transactionType IN ('payment_received', 'service_charge', 'refund_processed', 'withdrawal', 'adjustment')),
        amount DECIMAL(10,2) NOT NULL,
        balanceBefore DECIMAL(12,2) NOT NULL,
        balanceAfter DECIMAL(12,2) NOT NULL,
        description TEXT,
        referenceId TEXT,
        processedBy INTEGER,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (balanceId) REFERENCES user_balances (id) ON DELETE CASCADE,
        FOREIGN KEY (transactionId) REFERENCES transactions (id),
        FOREIGN KEY (processedBy) REFERENCES users (id)
      )
    `);

    // Payment configuration table for hospital policies
    db.exec(`
      CREATE TABLE IF NOT EXISTS payment_config (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        hospitalId INTEGER,
        serviceChargeRate DECIMAL(5,4) DEFAULT 0.0500,
        cancellationWindow INTEGER DEFAULT 24,
        refundPercentage DECIMAL(5,4) DEFAULT 0.8000,
        minimumBookingAmount DECIMAL(10,2) DEFAULT 10.00,
        paymentMethods TEXT,
        cancellationPolicy TEXT,
        refundPolicy TEXT,
        isActive BOOLEAN DEFAULT 1,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (hospitalId) REFERENCES hospitals (id)
      )
    `);

    // Create indexes for better performance
    db.exec(`CREATE INDEX IF NOT EXISTS idx_transactions_booking ON transactions(bookingId)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_transactions_user ON transactions(userId)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_transactions_hospital ON transactions(hospitalId)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_transactions_status ON transactions(status)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_hospital_pricing_hospital ON hospital_pricing(hospitalId)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_hospital_pricing_resource ON hospital_pricing(resourceType)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_user_balances_user ON user_balances(userId)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_balance_transactions_balance ON balance_transactions(balanceId)`);

    // Insert default payment configuration for platform
    db.exec(`
      INSERT OR IGNORE INTO payment_config (hospitalId, serviceChargeRate, cancellationWindow, refundPercentage, minimumBookingAmount, paymentMethods, cancellationPolicy, refundPolicy)
      VALUES (
        NULL,
        0.0500,
        24,
        0.8000,
        10.00,
        '["credit_card", "debit_card", "bank_transfer", "digital_wallet"]',
        'Bookings can be cancelled up to 24 hours before the scheduled date for an 80% refund.',
        'Refunds will be processed within 3-5 business days to the original payment method.'
      )
    `);

    // Commit transaction
    db.exec('COMMIT');

    console.log('✅ Financial tables migration completed successfully');
    return true;

  } catch (error) {
    // Rollback on error
    db.exec('ROLLBACK');
    console.error('❌ Financial tables migration failed:', error.message);
    throw error;
  }
};

// Run migration if called directly
if (require.main === module) {
  addFinancialTables();
}

module.exports = { addFinancialTables };