const db = require('../config/database');

function up() {
  // Add Rapid Assistance columns to bookings table
  try {
    db.exec(`
      ALTER TABLE bookings 
      ADD COLUMN rapidAssistance BOOLEAN DEFAULT FALSE
    `);
  } catch {
    // Column might already exist, ignore error
    console.log('Column rapidAssistance may already exist, skipping...');
  }

  try {
    db.exec(`
      ALTER TABLE bookings 
      ADD COLUMN rapidAssistantName TEXT
    `);
  } catch {
    // Column might already exist, ignore error
    console.log('Column rapidAssistantName may already exist, skipping...');
  }

  try {
    db.exec(`
      ALTER TABLE bookings 
      ADD COLUMN rapidAssistantPhone TEXT
    `);
  } catch {
    // Column might already exist, ignore error
    console.log('Column rapidAssistantPhone may already exist, skipping...');
  }

  console.log('Migration 012_add_rapid_assistance_fields completed successfully');
}

function down() {
  // Note: SQLite doesn't support dropping columns directly
  // In a production environment, you would need to:
  // 1. Create a new table without the columns
  // 2. Copy data from the old table
  // 3. Drop the old table
  // 4. Rename the new table
  console.log('Down migration not implemented for SQLite (columns cannot be dropped directly)');
}

module.exports = { up, down };