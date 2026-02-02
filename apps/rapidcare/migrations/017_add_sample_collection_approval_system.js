const db = require('../config/database');

function up() {
  console.log('Running migration: Add Sample Collection Approval System...');

  // Add approval-related columns to sample_collection_requests table
  db.exec(`
    ALTER TABLE sample_collection_requests 
    ADD COLUMN approval_status TEXT DEFAULT 'pending' 
    CHECK(approval_status IN ('pending', 'approved', 'rejected'));
  `);

  db.exec(`
    ALTER TABLE sample_collection_requests 
    ADD COLUMN approved_by INTEGER;
  `);

  db.exec(`
    ALTER TABLE sample_collection_requests 
    ADD COLUMN approved_at DATETIME;
  `);

  db.exec(`
    ALTER TABLE sample_collection_requests 
    ADD COLUMN rejection_reason TEXT;
  `);

  // Add foreign key constraint for approved_by
  // Note: SQLite doesn't support adding foreign keys to existing tables directly
  // So we'll handle this in the application logic

  // Create index for approval_status for faster queries
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_sample_requests_approval_status 
    ON sample_collection_requests(approval_status);
  `);

  // Update existing requests to have 'approved' status if they're not pending
  db.exec(`
    UPDATE sample_collection_requests 
    SET approval_status = 'approved' 
    WHERE status != 'pending';
  `);

  console.log('✅ Sample Collection Approval System migration completed successfully');
}

function down() {
  console.log('Running down migration: Remove Sample Collection Approval System...');
  
  // SQLite doesn't support DROP COLUMN, so we would need to recreate the table
  // For now, we'll just log that down migration is not fully implemented
  console.log('⚠️  Down migration not fully implemented for SQLite');
}

module.exports = { up, down };
