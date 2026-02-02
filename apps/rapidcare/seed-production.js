#!/usr/bin/env node
/**
 * Production Database Seeder
 * Run this once to populate your production database with initial data
 * Usage: node seed-production.js
 */

const { seedDatabase } = require('./utils/seeder');

console.log('🌱 Starting production database seeding...');
console.log('⚠️  This will add sample hospitals and users to your database');

seedDatabase()
  .then(() => {
    console.log('✅ Production database seeded successfully!');
    console.log('📋 Sample users created:');
    console.log('   - User: user@example.com / password123');
    console.log('   - Hospital Authority: hospital@example.com / password123');
    console.log('   - Admin: admin@example.com / password123');
    console.log('🏥 Sample hospitals added:');
    console.log('   - Dhaka Medical College Hospital');
    console.log('   - Chittagong Medical College Hospital');
    console.log('   - Rajshahi Medical College Hospital');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Error seeding production database:', error);
    process.exit(1);
  });
