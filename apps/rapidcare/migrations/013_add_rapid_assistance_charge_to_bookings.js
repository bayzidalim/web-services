const db = require('../config/database');

function up() {
  try {
    db.exec(`
      ALTER TABLE bookings 
      ADD COLUMN rapidAssistanceCharge DECIMAL(10, 2) DEFAULT 0
    `);
  } catch {
    console.log('Column rapidAssistanceCharge may already exist, skipping...');
  }

  console.log('Migration 013_add_rapid_assistance_charge_to_bookings completed successfully');
}

function down() {
  console.log('Down migration not implemented for SQLite (columns cannot be dropped directly)');
}

module.exports = { up, down };
