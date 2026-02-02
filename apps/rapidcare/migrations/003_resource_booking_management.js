const db = require('../config/database');

/**
 * Migration: Resource Booking Management System
 * 
 * This migration adds the necessary database schema for:
 * - Enhanced resource management with audit logging
 * - Booking approval workflow
 * - Resource allocation tracking
 * - Booking status history
 */

const addResourceBookingManagement = () => {
  console.log('🔄 Adding resource booking management tables...');

  try {
    // Begin transaction for atomic migration
    db.exec('BEGIN TRANSACTION');

    // 1. Create resource audit log table
    console.log('  📝 Creating resource_audit_log table...');
    db.exec(`
      CREATE TABLE IF NOT EXISTS resource_audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        hospitalId INTEGER NOT NULL,
        resourceType TEXT NOT NULL CHECK(resourceType IN ('beds', 'icu', 'operationTheatres')),
        changeType TEXT NOT NULL CHECK(changeType IN ('manual_update', 'booking_approved', 'booking_completed', 'booking_cancelled', 'system_adjustment')),
        oldValue INTEGER,
        newValue INTEGER,
        quantity INTEGER,
        bookingId INTEGER,
        changedBy INTEGER NOT NULL,
        reason TEXT,
        notes TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (hospitalId) REFERENCES hospitals (id) ON DELETE CASCADE,
        FOREIGN KEY (bookingId) REFERENCES bookings (id) ON DELETE SET NULL,
        FOREIGN KEY (changedBy) REFERENCES users (id)
      )
    `);

    // 2. Create booking status history table
    console.log('  📝 Creating booking_status_history table...');
    db.exec(`
      CREATE TABLE IF NOT EXISTS booking_status_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        bookingId INTEGER NOT NULL,
        oldStatus TEXT,
        newStatus TEXT NOT NULL,
        changedBy INTEGER NOT NULL,
        reason TEXT,
        notes TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (bookingId) REFERENCES bookings (id) ON DELETE CASCADE,
        FOREIGN KEY (changedBy) REFERENCES users (id)
      )
    `);

    // 3. Add booking approval fields to existing bookings table
    console.log('  📝 Adding booking approval fields to bookings table...');
    
    // Check if columns already exist before adding them
    const tableInfo = db.prepare("PRAGMA table_info(bookings)").all();
    const existingColumns = tableInfo.map(col => col.name);

    if (!existingColumns.includes('approvedBy')) {
      db.exec('ALTER TABLE bookings ADD COLUMN approvedBy INTEGER REFERENCES users (id)');
    }

    if (!existingColumns.includes('approvedAt')) {
      db.exec('ALTER TABLE bookings ADD COLUMN approvedAt DATETIME');
    }

    if (!existingColumns.includes('declineReason')) {
      db.exec('ALTER TABLE bookings ADD COLUMN declineReason TEXT');
    }

    if (!existingColumns.includes('authorityNotes')) {
      db.exec('ALTER TABLE bookings ADD COLUMN authorityNotes TEXT');
    }

    if (!existingColumns.includes('resourcesAllocated')) {
      db.exec('ALTER TABLE bookings ADD COLUMN resourcesAllocated INTEGER DEFAULT 1');
    }

    if (!existingColumns.includes('expiresAt')) {
      db.exec('ALTER TABLE bookings ADD COLUMN expiresAt DATETIME');
    }

    if (!existingColumns.includes('priority')) {
      db.exec('ALTER TABLE bookings ADD COLUMN priority INTEGER DEFAULT 0');
    }

    // 4. Enhance hospital_resources table with additional fields
    console.log('  📝 Enhancing hospital_resources table...');
    
    const resourceTableInfo = db.prepare("PRAGMA table_info(hospital_resources)").all();
    const existingResourceColumns = resourceTableInfo.map(col => col.name);

    if (!existingResourceColumns.includes('reserved')) {
      db.exec('ALTER TABLE hospital_resources ADD COLUMN reserved INTEGER DEFAULT 0');
    }

    if (!existingResourceColumns.includes('maintenance')) {
      db.exec('ALTER TABLE hospital_resources ADD COLUMN maintenance INTEGER DEFAULT 0');
    }

    if (!existingResourceColumns.includes('lastUpdated')) {
      db.exec('ALTER TABLE hospital_resources ADD COLUMN lastUpdated DATETIME');
      // Update existing records with current timestamp
      db.exec("UPDATE hospital_resources SET lastUpdated = CURRENT_TIMESTAMP WHERE lastUpdated IS NULL");
    }

    if (!existingResourceColumns.includes('updatedBy')) {
      db.exec('ALTER TABLE hospital_resources ADD COLUMN updatedBy INTEGER REFERENCES users (id)');
    }

    // 5. Create indexes for better performance
    console.log('  📝 Creating performance indexes...');
    
    // Indexes for resource audit log
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_resource_audit_hospital_type 
      ON resource_audit_log (hospitalId, resourceType)
    `);
    
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_resource_audit_timestamp 
      ON resource_audit_log (timestamp DESC)
    `);

    // Indexes for booking status history
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_booking_status_history_booking 
      ON booking_status_history (bookingId)
    `);
    
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_booking_status_history_timestamp 
      ON booking_status_history (timestamp DESC)
    `);

    // Indexes for enhanced bookings table
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_bookings_hospital_status 
      ON bookings (hospitalId, status)
    `);
    
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_bookings_approved_by 
      ON bookings (approvedBy)
    `);

    // Indexes for hospital resources
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_hospital_resources_hospital_type 
      ON hospital_resources (hospitalId, resourceType)
    `);

    // 6. Create triggers for automatic audit logging
    console.log('  📝 Creating audit triggers...');
    
    // Trigger for resource updates
    db.exec(`
      CREATE TRIGGER IF NOT EXISTS trg_hospital_resources_audit
      AFTER UPDATE ON hospital_resources
      FOR EACH ROW
      WHEN OLD.available != NEW.available OR OLD.total != NEW.total
      BEGIN
        INSERT INTO resource_audit_log (
          hospitalId, resourceType, changeType, oldValue, newValue, 
          changedBy, reason, timestamp
        ) VALUES (
          NEW.hospitalId, NEW.resourceType, 'manual_update', 
          OLD.available, NEW.available, NEW.updatedBy, 
          'Resource quantity updated', CURRENT_TIMESTAMP
        );
      END
    `);

    // Trigger for booking status changes
    db.exec(`
      CREATE TRIGGER IF NOT EXISTS trg_booking_status_audit
      AFTER UPDATE ON bookings
      FOR EACH ROW
      WHEN OLD.status != NEW.status
      BEGIN
        INSERT INTO booking_status_history (
          bookingId, oldStatus, newStatus, changedBy, timestamp
        ) VALUES (
          NEW.id, OLD.status, NEW.status, NEW.approvedBy, CURRENT_TIMESTAMP
        );
      END
    `);

    // Commit transaction
    db.exec('COMMIT');
    
    console.log('✅ Resource booking management tables created successfully');

  } catch (error) {
    // Rollback on error
    db.exec('ROLLBACK');
    console.error('❌ Failed to create resource booking management tables:', error.message);
    throw error;
  }
};

// Rollback function for development
const rollbackResourceBookingManagement = () => {
  console.log('🔄 Rolling back resource booking management migration...');

  try {
    db.exec('BEGIN TRANSACTION');

    // Drop triggers
    db.exec('DROP TRIGGER IF EXISTS trg_hospital_resources_audit');
    db.exec('DROP TRIGGER IF EXISTS trg_booking_status_audit');

    // Drop indexes
    db.exec('DROP INDEX IF EXISTS idx_resource_audit_hospital_type');
    db.exec('DROP INDEX IF EXISTS idx_resource_audit_timestamp');
    db.exec('DROP INDEX IF EXISTS idx_booking_status_history_booking');
    db.exec('DROP INDEX IF EXISTS idx_booking_status_history_timestamp');
    db.exec('DROP INDEX IF EXISTS idx_bookings_hospital_status');
    db.exec('DROP INDEX IF EXISTS idx_bookings_approved_by');
    db.exec('DROP INDEX IF EXISTS idx_hospital_resources_hospital_type');

    // Drop tables
    db.exec('DROP TABLE IF EXISTS booking_status_history');
    db.exec('DROP TABLE IF EXISTS resource_audit_log');

    // Note: We don't remove columns from existing tables as SQLite doesn't support DROP COLUMN
    console.log('⚠️  Note: Added columns to existing tables cannot be removed in SQLite');

    db.exec('COMMIT');
    console.log('✅ Resource booking management migration rolled back');

  } catch (error) {
    db.exec('ROLLBACK');
    console.error('❌ Failed to rollback resource booking management migration:', error.message);
    throw error;
  }
};

module.exports = {
  addResourceBookingManagement,
  rollbackResourceBookingManagement
};