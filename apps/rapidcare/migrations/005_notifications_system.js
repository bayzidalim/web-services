const db = require('../config/database');

function up() {
  console.log('Creating notifications table...');
  
  // Create notifications table
  db.exec(`
    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId INTEGER NOT NULL,
      type VARCHAR(50) NOT NULL,
      title VARCHAR(255) NOT NULL,
      message TEXT NOT NULL,
      data TEXT, -- JSON data
      isRead BOOLEAN DEFAULT 0,
      createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // Create index for faster queries
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_notifications_user_read 
    ON notifications(userId, isRead, createdAt DESC)
  `);

  console.log('Notifications table created successfully');
}

function down() {
  console.log('Dropping notifications table...');
  db.exec('DROP TABLE IF EXISTS notifications');
  console.log('Notifications table dropped');
}

module.exports = { up, down };