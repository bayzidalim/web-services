const db = require('../config/database');

function up() {
  console.log('Running migration 012: Fix hospital authority constraints...');
  
  // Add a check constraint to ensure hospital_authorities.hospitalId is not null for hospital-authority users
  // Note: SQLite doesn't support CHECK constraints on existing tables, so we'll create a trigger instead
  
  // Create a trigger to ensure hospital_authorities.hospitalId is set when a hospital-authority user is created
  const createTrigger = `
    CREATE TRIGGER IF NOT EXISTS ensure_hospital_authority_linked
    AFTER INSERT ON users
    WHEN NEW.userType = 'hospital-authority'
    BEGIN
      -- Check if hospital_authorities record exists and hospitalId is null
      UPDATE hospital_authorities 
      SET hospitalId = (
        SELECT hospital_id 
        FROM users 
        WHERE id = NEW.id AND hospital_id IS NOT NULL
      )
      WHERE userId = NEW.id AND hospitalId IS NULL;
    END;
  `;
  
  db.exec(createTrigger);
  console.log('Created trigger to ensure hospital authority linking');
  
  // Create another trigger to ensure hospital_authorities.hospitalId is updated when users.hospital_id is updated
  const updateTrigger = `
    CREATE TRIGGER IF NOT EXISTS sync_hospital_authority_on_user_update
    AFTER UPDATE OF hospital_id ON users
    WHEN NEW.userType = 'hospital-authority' AND NEW.hospital_id IS NOT NULL
    BEGIN
      -- Update hospital_authorities table to match users.hospital_id
      UPDATE hospital_authorities 
      SET hospitalId = NEW.hospital_id
      WHERE userId = NEW.id;
    END;
  `;
  
  db.exec(updateTrigger);
  console.log('Created trigger to sync hospital authority on user update');
  
  // Create a view to easily identify hospital authority users without proper hospital linking
  const createView = `
    CREATE VIEW IF NOT EXISTS hospital_authority_validation AS
    SELECT 
      u.id as userId,
      u.email,
      u.userType,
      u.hospital_id as userHospitalId,
      ha.hospitalId as authorityHospitalId,
      CASE 
        WHEN u.hospital_id IS NULL THEN 'NO_HOSPITAL_IN_USER'
        WHEN ha.hospitalId IS NULL THEN 'NO_HOSPITAL_IN_AUTHORITY'
        WHEN u.hospital_id != ha.hospitalId THEN 'MISMATCH'
        ELSE 'OK'
      END as status
    FROM users u
    LEFT JOIN hospital_authorities ha ON u.id = ha.userId
    WHERE u.userType = 'hospital-authority';
  `;
  
  db.exec(createView);
  console.log('Created validation view for hospital authorities');
  
  console.log('Migration 012 completed successfully');
}

function down() {
  console.log('Rolling back migration 012...');
  
  // Drop the triggers
  db.exec('DROP TRIGGER IF EXISTS ensure_hospital_authority_linked');
  db.exec('DROP TRIGGER IF EXISTS sync_hospital_authority_on_user_update');
  
  // Drop the view
  db.exec('DROP VIEW IF EXISTS hospital_authority_validation');
  
  console.log('Migration 012 rolled back successfully');
}

module.exports = { up, down };
