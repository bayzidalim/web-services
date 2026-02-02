const db = require('../config/database');
const bcrypt = require('bcryptjs');

/**
 * Script to assign username and password for every hospital
 * Creates a hospital-authority user account for each hospital
 */

const assignHospitalCredentials = async () => {
  try {
    console.log('Starting hospital credential assignment...\n');

    // Get all hospitals
    const hospitals = db.prepare('SELECT id, name, email, phone FROM hospitals WHERE approval_status = ?').all('approved');
    
    if (hospitals.length === 0) {
      console.log('No approved hospitals found in the database.');
      return;
    }

    console.log(`Found ${hospitals.length} approved hospitals\n`);

    const results = [];

    for (const hospital of hospitals) {
      try {
        // Generate username from hospital name (lowercase, no spaces, add hospital id for uniqueness)
        const username = hospital.name
          .toLowerCase()
          .replace(/[^a-z0-9]/g, '')
          .substring(0, 20) + hospital.id;
        
        const email = hospital.email || `${username}@rapidcare.com`;
        const password = `Hospital@${hospital.id}${Math.random().toString(36).substring(2, 6)}`;
        const hashedPassword = await bcrypt.hash(password, 10);

        // Check if user already exists for this hospital
        const existingUser = db.prepare(
          'SELECT id FROM users WHERE hospital_id = ? AND userType = ?'
        ).get(hospital.id, 'hospital-authority');

        let userId;

        if (existingUser) {
          // Update existing user
          db.prepare(`
            UPDATE users 
            SET email = ?, password = ?, name = ?, phone = ?, updatedAt = CURRENT_TIMESTAMP
            WHERE id = ?
          `).run(email, hashedPassword, `${hospital.name} Admin`, hospital.phone, existingUser.id);
          
          userId = existingUser.id;
          console.log(`✓ Updated credentials for: ${hospital.name}`);
        } else {
          // Create new user
          const result = db.prepare(`
            INSERT INTO users (email, password, name, phone, userType, hospital_id, can_add_hospital, isActive)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            email,
            hashedPassword,
            `${hospital.name} Admin`,
            hospital.phone || '+880-1700-000000',
            'hospital-authority',
            hospital.id,
            1,
            1
          );

          userId = result.lastInsertRowid;
          console.log(`✓ Created new account for: ${hospital.name}`);
        }

        // Store credentials for output
        results.push({
          hospitalId: hospital.id,
          hospitalName: hospital.name,
          userId: userId,
          username: email,
          password: password,
          loginUrl: 'http://localhost:3000/login'
        });

      } catch (error) {
        console.error(`✗ Error processing ${hospital.name}:`, error.message);
      }
    }

    // Display all credentials
    console.log('\n' + '='.repeat(80));
    console.log('HOSPITAL LOGIN CREDENTIALS');
    console.log('='.repeat(80) + '\n');

    results.forEach((cred, index) => {
      console.log(`${index + 1}. ${cred.hospitalName}`);
      console.log(`   Hospital ID: ${cred.hospitalId}`);
      console.log(`   User ID: ${cred.userId}`);
      console.log(`   Username/Email: ${cred.username}`);
      console.log(`   Password: ${cred.password}`);
      console.log(`   Login URL: ${cred.loginUrl}`);
      console.log('');
    });

    console.log('='.repeat(80));
    console.log(`\nTotal: ${results.length} hospital accounts processed`);
    console.log('\n⚠️  IMPORTANT: Save these credentials securely!');
    console.log('These passwords are randomly generated and cannot be recovered.\n');

    // Optionally save to file
    const fs = require('fs');
    const credentialsFile = 'hospital_credentials.json';
    fs.writeFileSync(
      credentialsFile,
      JSON.stringify(results, null, 2)
    );
    console.log(`✓ Credentials saved to: ${credentialsFile}\n`);

    return results;

  } catch (error) {
    console.error('Error assigning hospital credentials:', error);
    throw error;
  }
};

// Run if called directly
if (require.main === module) {
  assignHospitalCredentials()
    .then(() => {
      console.log('Credential assignment completed successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Failed to assign credentials:', error);
      process.exit(1);
    });
}

module.exports = { assignHospitalCredentials };
