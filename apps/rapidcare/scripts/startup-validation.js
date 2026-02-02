#!/usr/bin/env node

const HospitalAuthorityValidationService = require('../services/hospitalAuthorityValidationService');

async function runStartupValidation() {
  console.log('🚀 Running startup validation for hospital authorities...');
  
  try {
    const results = HospitalAuthorityValidationService.validateAndFixAll();
    
    if (results.fixed > 0) {
      console.log(`✅ Fixed ${results.fixed} hospital authority linking issues`);
    }
    
    if (results.errors.length > 0) {
      console.log(`⚠️  ${results.errors.length} errors encountered during validation`);
      results.errors.forEach(error => console.log(`   - ${error}`));
    }
    
    // Check final status
    const finalStatus = HospitalAuthorityValidationService.getValidationStatus();
    const issues = finalStatus.filter(user => user.status !== 'OK');
    
    if (issues.length === 0) {
      console.log('✅ All hospital authority users are properly configured');
    } else {
      console.log(`⚠️  ${issues.length} hospital authority users still have issues:`);
      issues.forEach(user => {
        console.log(`   - ${user.email}: ${user.status}`);
      });
    }
    
    return issues.length === 0;
    
  } catch (error) {
    console.error('❌ Error during startup validation:', error);
    return false;
  }
}

// Run if called directly
if (require.main === module) {
  runStartupValidation().then(success => {
    process.exit(success ? 0 : 1);
  });
}

module.exports = runStartupValidation;
