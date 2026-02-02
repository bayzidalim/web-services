const db = require('../config/database');

function up() {
  console.log('Creating audit_trail table...');
  
  // Create audit_trail table
  db.exec(`
    CREATE TABLE IF NOT EXISTS audit_trail (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entity_type VARCHAR(50) NOT NULL,
      entity_id INTEGER NOT NULL,
      event_type VARCHAR(100) NOT NULL,
      user_id INTEGER,
      user_type VARCHAR(50),
      old_data TEXT,
      new_data TEXT,
      changes TEXT, -- JSON string of changes
      metadata TEXT, -- JSON string of additional data
      ip_address VARCHAR(45),
      user_agent TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    )
  `);

  // Create indexes for faster queries
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_audit_entity 
    ON audit_trail(entity_type, entity_id, created_at DESC)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_audit_user 
    ON audit_trail(user_id, created_at DESC)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_audit_action 
    ON audit_trail(event_type, created_at DESC)
  `);

  console.log('Audit trail table created successfully');
}

function down() {
  console.log('Dropping audit_trail table...');
  db.exec('DROP TABLE IF EXISTS audit_trail');
  console.log('Audit trail table dropped');
}

module.exports = { up, down };