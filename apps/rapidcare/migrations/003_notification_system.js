const db = require('../config/database');

/**
 * Migration: Notification System Tables
 * 
 * Creates tables for:
 * - notification_queue: Queue for pending notifications
 * - notification_delivery_log: Log of delivered notifications
 */

const addNotificationSystem = () => {
  console.log('🔄 Creating notification system tables...');

  try {
    // Begin transaction for atomic migration
    db.exec('BEGIN TRANSACTION');

    // Create notification_queue table
    console.log('  📝 Creating notification_queue table...');
    db.exec(`
      CREATE TABLE IF NOT EXISTS notification_queue (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        recipientId INTEGER NOT NULL,
        type TEXT NOT NULL CHECK(type IN (
          'booking_approved', 'booking_declined', 'booking_completed', 
          'booking_cancelled', 'resource_threshold', 'system_alert',
          'payment_confirmed', 'revenue_received', 'financial_anomaly',
          'balance_threshold', 'payment_receipt'
        )),
        channel TEXT NOT NULL CHECK(channel IN ('email', 'sms', 'push')),
        priority TEXT NOT NULL DEFAULT 'medium' CHECK(priority IN ('low', 'medium', 'high', 'urgent')),
        content TEXT NOT NULL,
        metadata TEXT,
        status TEXT NOT NULL DEFAULT 'queued' CHECK(status IN (
          'queued', 'processing', 'delivered', 'failed', 'cancelled'
        )),
        retryCount INTEGER DEFAULT 0,
        maxRetries INTEGER DEFAULT 3,
        scheduledAt DATETIME NOT NULL,
        lastError TEXT,
        deliveryDetails TEXT,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (recipientId) REFERENCES users (id) ON DELETE CASCADE
      )
    `);

    // Create notification_delivery_log table
    console.log('  📝 Creating notification_delivery_log table...');
    db.exec(`
      CREATE TABLE IF NOT EXISTS notification_delivery_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        notificationId INTEGER NOT NULL,
        channel TEXT NOT NULL,
        deliveryDetails TEXT NOT NULL,
        deliveredAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (notificationId) REFERENCES notification_queue (id) ON DELETE CASCADE
      )
    `);

    // Create indexes for better performance
    console.log('  📝 Creating performance indexes...');
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_notification_queue_recipient 
      ON notification_queue (recipientId);
    `);

    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_notification_queue_status_scheduled 
      ON notification_queue (status, scheduledAt);
    `);

    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_notification_queue_type_created 
      ON notification_queue (type, createdAt);
    `);

    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_notification_delivery_log_notification 
      ON notification_delivery_log (notificationId);
    `);

    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_notification_delivery_log_delivered 
      ON notification_delivery_log (deliveredAt);
    `);

    // Commit transaction
    db.exec('COMMIT');
    console.log('✅ Notification system tables created successfully');

  } catch (error) {
    // Rollback on error
    db.exec('ROLLBACK');
    console.error('❌ Failed to create notification system tables:', error.message);
    throw error;
  }
};

const rollbackNotificationSystem = () => {
  console.log('🔄 Rolling back notification system migration...');

  try {
    db.exec('BEGIN TRANSACTION');

    // Drop indexes first
    db.exec('DROP INDEX IF EXISTS idx_notification_delivery_log_delivered');
    db.exec('DROP INDEX IF EXISTS idx_notification_delivery_log_notification');
    db.exec('DROP INDEX IF EXISTS idx_notification_queue_type_created');
    db.exec('DROP INDEX IF EXISTS idx_notification_queue_status_scheduled');
    db.exec('DROP INDEX IF EXISTS idx_notification_queue_recipient');

    // Drop tables
    db.exec('DROP TABLE IF EXISTS notification_delivery_log');
    db.exec('DROP TABLE IF EXISTS notification_queue');

    db.exec('COMMIT');
    console.log('✅ Notification system tables dropped successfully');

  } catch (error) {
    db.exec('ROLLBACK');
    console.error('❌ Failed to rollback notification system migration:', error.message);
    throw error;
  }
};

module.exports = { addNotificationSystem, rollbackNotificationSystem };