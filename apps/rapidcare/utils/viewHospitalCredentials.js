const fs = require('fs');
const path = require('path');

/**
 * Script to view existing hospital credentials
 * Reads from the saved credentials file
 */

const viewHospitalCredentials = () => {
  try {
    const credentialsFile = path.join(__dirname, '..', 'hospital_credentials.json');
    
    if (!fs.existsSync(credentialsFile)) {
      console.log('❌ No credentials file found!');
      console.log('Run: npm run assign:credentials');
      return;
    }

    const credentials = JSON.parse(fs.readFileSync(credentialsFile, 'utf8'));

    console.log('\n' + '='.repeat(80));
    console.log('HOSPITAL LOGIN CREDENTIALS');
    console.log('='.repeat(80) + '\n');

    credentials.forEach((cred, index) => {
      console.log(`${index + 1}. ${cred.hospitalName}`);
      console.log(`   Hospital ID: ${cred.hospitalId}`);
      console.log(`   User ID: ${cred.userId}`);
      console.log(`   Username/Email: ${cred.username}`);
      console.log(`   Password: ${cred.password}`);
      console.log(`   Login URL: ${cred.loginUrl}`);
      console.log('');
    });

    console.log('='.repeat(80));
    console.log(`Total: ${credentials.length} hospital accounts\n`);

  } catch (error) {
    console.error('Error reading credentials:', error.message);
  }
};

// Run if called directly
if (require.main === module) {
  viewHospitalCredentials();
}

module.exports = { viewHospitalCredentials };
