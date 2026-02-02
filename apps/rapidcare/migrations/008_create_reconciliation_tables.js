const db = require('../config/database');

function up() {
  // Reconciliation records table
  db.exec(`
    CREATE TABLE IF NOT EXISTS reconciliation_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date DATE NOT NULL,
      status VARCHAR(50) NOT NULL,
      expected_balances TEXT NOT NULL, -- JSON string
      actual_balances TEXT NOT NULL, -- JSON string
      discrepancies TEXT, -- JSON string
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Discrepancy alerts table
  db.exec(`
    CREATE TABLE IF NOT EXISTS discrepancy_alerts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      reconciliation_id INTEGER NOT NULL,
      account_id VARCHAR(100) NOT NULL,
      expected_amount DECIMAL(15,2) NOT NULL,
      actual_amount DECIMAL(15,2) NOT NULL,
      difference_amount DECIMAL(15,2) NOT NULL,
      severity VARCHAR(20) NOT NULL,
      status VARCHAR(50) DEFAULT 'OPEN',
      resolved_at DATETIME,
      resolved_by INTEGER,
      resolution_notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (reconciliation_id) REFERENCES reconciliation_records(id),
      FOREIGN KEY (resolved_by) REFERENCES users(id)
    )
  `);

  // Balance corrections table
  db.exec(`
    CREATE TABLE IF NOT EXISTS balance_corrections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      transaction_id VARCHAR(100) UNIQUE NOT NULL,
      account_id VARCHAR(100) NOT NULL,
      original_balance DECIMAL(15,2) NOT NULL,
      corrected_balance DECIMAL(15,2) NOT NULL,
      difference_amount DECIMAL(15,2) NOT NULL,
      correction_type VARCHAR(50) NOT NULL,
      reason TEXT NOT NULL,
      evidence TEXT,
      admin_user_id INTEGER NOT NULL,
      status VARCHAR(50) DEFAULT 'APPLIED',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (admin_user_id) REFERENCES users(id)
    )
  `);



  // Financial health monitoring table
  db.exec(`
    CREATE TABLE IF NOT EXISTS financial_health_checks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      check_date DATE NOT NULL,
      status VARCHAR(50) NOT NULL,
      metrics TEXT NOT NULL, -- JSON string
      alerts TEXT, -- JSON string
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Account balances table (if not exists)
  db.exec(`
    CREATE TABLE IF NOT EXISTS account_balances (
      account_id VARCHAR(100) PRIMARY KEY,
      balance DECIMAL(15,2) NOT NULL DEFAULT 0.00,
      currency VARCHAR(3) DEFAULT 'BDT',
      last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
      version INTEGER DEFAULT 1
    )
  `);

  // Create indexes for better performance
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_reconciliation_date ON reconciliation_records(date);
    CREATE INDEX IF NOT EXISTS idx_discrepancy_status ON discrepancy_alerts(status);
    CREATE INDEX IF NOT EXISTS idx_audit_trail_entity ON audit_trail(entity_type, entity_id);
    CREATE INDEX IF NOT EXISTS idx_audit_trail_date ON audit_trail(created_at);
    CREATE INDEX IF NOT EXISTS idx_health_checks_date ON financial_health_checks(check_date);
  `);

  console.log('Reconciliation tables created successfully');
}

function down() {
  console.log('Down migration for 008_create_reconciliation_tables not implemented');
}

module.exports = { up, down };