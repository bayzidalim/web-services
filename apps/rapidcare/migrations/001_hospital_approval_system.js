const db = require('../config/database');

function up() {
  console.log('Starting hospital approval system migration...');

  try {
    // Begin transaction
    db.exec('BEGIN TRANSACTION');

    // Add approval columns to hospitals table
    const hospitalColumns = [
      'ALTER TABLE hospitals ADD COLUMN approval_status TEXT DEFAULT "pending"',
      'ALTER TABLE hospitals ADD COLUMN approved_by INTEGER',
      'ALTER TABLE hospitals ADD COLUMN approved_at DATETIME',
      'ALTER TABLE hospitals ADD COLUMN rejection_reason TEXT',
      'ALTER TABLE hospitals ADD COLUMN submitted_at DATETIME',
      'ALTER TABLE hospitals ADD COLUMN description TEXT',
      'ALTER TABLE hospitals ADD COLUMN type TEXT DEFAULT "General"',
      'ALTER TABLE hospitals ADD COLUMN total_beds INTEGER DEFAULT 0',
      'ALTER TABLE hospitals ADD COLUMN icu_beds INTEGER DEFAULT 0',
      'ALTER TABLE hospitals ADD COLUMN operation_theaters INTEGER DEFAULT 0'
    ];

    hospitalColumns.forEach(sql => {
      try {
        db.exec(sql);
        console.log(`✓ Executed: ${sql}`);
      } catch (error) {
        if (error.message.includes('duplicate column name')) {
          console.log(`⚠ Column already exists: ${sql}`);
        } else {
          throw error;
        }
      }
    });

    // Add hospital authority columns to users table
    const userColumns = [
      'ALTER TABLE users ADD COLUMN hospital_id INTEGER',
      'ALTER TABLE users ADD COLUMN can_add_hospital BOOLEAN DEFAULT 1'
    ];

    userColumns.forEach(sql => {
      try {
        db.exec(sql);
        console.log(`✓ Executed: ${sql}`);
      } catch (error) {
        if (error.message.includes('duplicate column name')) {
          console.log(`⚠ Column already exists: ${sql}`);
        } else {
          throw error;
        }
      }
    });

    // Update existing hospitals to approved status (for backward compatibility)
    const updateExistingHospitals = db.prepare(`
      UPDATE hospitals 
      SET approval_status = 'approved', 
          approved_at = CURRENT_TIMESTAMP,
          submitted_at = createdAt
      WHERE approval_status IS NULL OR approval_status = 'pending'
    `);
    
    const result = updateExistingHospitals.run();
    console.log(`✓ Updated ${result.changes} existing hospitals to approved status`);

    // Create index for better performance
    try {
      db.exec('CREATE INDEX IF NOT EXISTS idx_hospitals_approval_status ON hospitals(approval_status)');
      console.log('✓ Created index on approval_status');
    } catch (error) {
      console.log('⚠ Index already exists or error creating index:', error.message);
    }

    try {
      db.exec('CREATE INDEX IF NOT EXISTS idx_users_hospital_id ON users(hospital_id)');
      console.log('✓ Created index on hospital_id');
    } catch (error) {
      console.log('⚠ Index already exists or error creating index:', error.message);
    }

    // Commit transaction
    db.exec('COMMIT');
    console.log('✅ Hospital approval system migration completed successfully!');

  } catch (error) {
    // Rollback on error
    db.exec('ROLLBACK');
    console.error('❌ Migration failed:', error.message);
    throw error;
  }
}

function down() {
  console.log('Down migration for 001_hospital_approval_system not implemented');
}

module.exports = { up, down };