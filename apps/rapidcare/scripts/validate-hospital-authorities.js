#!/usr/bin/env node

const HospitalAuthorityValidationService = require('../services/hospitalAuthorityValidationService');
const db = require('../config/database');

async function main() {
  console.log('🏥 Hospital Authority Validation Script');
  console.log('=====================================\n');
  
  try {
    // Get current validation status
    console.log('📊 Current Status:');
    const status = HospitalAuthorityValidationService.getValidationStatus();
    
    if (status.length === 0) {
      console.log('No hospital authority users found.');
      return;
    }
    
    // Display current status
    status.forEach(user => {
      const statusIcon = user.status === 'OK' ? '✅' : '❌';
      console.log(`${statusIcon} ${user.email}: ${user.status}`);
      if (user.status !== 'OK') {
        console.log(`   User Hospital ID: ${user.userHospitalId}`);
        console.log(`   Authority Hospital ID: ${user.authorityHospitalId}`);
      }
    });
    
    // Count issues
    const issues = status.filter(user => user.status !== 'OK');
    console.log(`\n📈 Summary: ${issues.length}/${status.length} users have issues`);
    
    if (issues.length === 0) {
      console.log('🎉 All hospital authority users are properly configured!');
      return;
    }
    
    // Ask for confirmation to fix
    console.log('\n🔧 Issues found. Running automatic fixes...');
    
    // Run validation and fixes
    const results = HospitalAuthorityValidationService.validateAndFixAll();
    
    console.log('\n📋 Fix Results:');
    console.log(`Total users: ${results.total}`);
    console.log(`Users fixed: ${results.fixed}`);
    console.log(`Errors: ${results.errors.length}`);
    
    if (results.errors.length > 0) {
      console.log('\n❌ Errors encountered:');
      results.errors.forEach(error => console.log(`  - ${error}`));
    }
    
    // Show detailed results
    console.log('\n📝 Detailed Results:');
    results.details.forEach(detail => {
      const icon = detail.fixed ? '✅' : detail.error ? '❌' : 'ℹ️';
      console.log(`${icon} ${detail.email}: ${detail.status}`);
      if (detail.error) {
        console.log(`   Error: ${detail.error}`);
      }
    });
    
    // Final validation
    console.log('\n🔍 Final Validation:');
    const finalStatus = HospitalAuthorityValidationService.getValidationStatus();
    const finalIssues = finalStatus.filter(user => user.status !== 'OK');
    
    if (finalIssues.length === 0) {
      console.log('🎉 All hospital authority users are now properly configured!');
    } else {
      console.log(`⚠️  ${finalIssues.length} users still have issues:`);
      finalIssues.forEach(user => {
        console.log(`  - ${user.email}: ${user.status}`);
      });
    }
    
  } catch (error) {
    console.error('❌ Error running validation:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main().then(() => {
    console.log('\n✅ Validation script completed');
    process.exit(0);
  }).catch(error => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });
}

module.exports = main;
