const db = require('../config/database');

function up() {
  console.log('Running migration: Allow NULL user_id in sample collection requests...');

  try {
    // SQLite doesn't support ALTER COLUMN directly, so we need to recreate the table
    // 1. Create a backup table with the same structure but allowing NULL user_id
    db.exec(`
      CREATE TABLE sample_collection_requests_backup AS 
      SELECT * FROM sample_collection_requests
    `);

    // 2. Drop the original table
    db.exec('DROP TABLE sample_collection_requests');

    // 3. Recreate the table with user_id allowing NULL
    db.exec(`
      CREATE TABLE sample_collection_requests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER, -- Removed NOT NULL constraint
        hospital_id INTEGER NOT NULL,
        agent_id INTEGER,
        test_types TEXT NOT NULL, -- JSON array of test type IDs
        patient_name TEXT NOT NULL,
        patient_phone TEXT NOT NULL,
        collection_address TEXT NOT NULL,
        preferred_time TEXT, -- morning, afternoon, evening
        special_instructions TEXT,
        status TEXT DEFAULT 'pending', -- pending, assigned, collected, completed, cancelled
        estimated_price TEXT,
        collection_date DATE,
        collection_time TIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
        FOREIGN KEY (hospital_id) REFERENCES hospitals(id) ON DELETE CASCADE,
        FOREIGN KEY (agent_id) REFERENCES collection_agents(id) ON DELETE SET NULL
      )
    `);

    // 4. Restore data from backup
    db.exec(`
      INSERT INTO sample_collection_requests 
      SELECT * FROM sample_collection_requests_backup
    `);

    // 5. Drop the backup table
    db.exec('DROP TABLE sample_collection_requests_backup');

    // 6. Recreate indexes
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_sample_requests_user_id ON sample_collection_requests(user_id);
      CREATE INDEX IF NOT EXISTS idx_sample_requests_hospital_id ON sample_collection_requests(hospital_id);
      CREATE INDEX IF NOT EXISTS idx_sample_requests_status ON sample_collection_requests(status);
    `);

    console.log('✅ Successfully updated sample_collection_requests to allow NULL user_id');

  } catch (error) {
    console.error('❌ Migration failed:', error);
    
    // Attempt to rollback by restoring from backup if it exists
    try {
      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='sample_collection_requests_backup'").all();
      if (tables.length > 0) {
        console.log('Attempting to rollback...');
        db.exec('DROP TABLE IF EXISTS sample_collection_requests');
        db.exec('ALTER TABLE sample_collection_requests_backup RENAME TO sample_collection_requests');
        console.log('✅ Rollback completed');
      }
    } catch (rollbackError) {
      console.error('❌ Rollback failed:', rollbackError);
    }
    
    throw error;
  }

  console.log('✅ Migration 011: Allow NULL user_id in sample collection requests completed');
}

function down() {
  console.log('Down migration for 011_allow_null_user_id_sample_requests not implemented');
}

module.exports = { up, down };