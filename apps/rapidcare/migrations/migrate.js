const fs = require('fs');
const path = require('path');
const db = require('../config/database');

/**
 * Database Migration Runner
 * Manages and executes database migrations in order
 */

// Create migrations tracking table
const initMigrationsTable = () => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT UNIQUE NOT NULL,
      executed_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
};

// Get list of executed migrations
const getExecutedMigrations = () => {
  const stmt = db.prepare('SELECT filename FROM migrations ORDER BY id');
  return stmt.all().map(row => row.filename);
};

// Mark migration as executed
const markMigrationExecuted = (filename) => {
  const stmt = db.prepare('INSERT INTO migrations (filename) VALUES (?)');
  stmt.run(filename);
};

// Get all migration files
const getMigrationFiles = () => {
  const migrationsDir = __dirname;
  return fs.readdirSync(migrationsDir)
    .filter(file => file.match(/^\d+_.*\.js$/) && file !== 'migrate.js')
    .sort();
};

// Run pending migrations
const runMigrations = () => {
  console.log('🔄 Starting database migrations...');
  
  try {
    // Initialize migrations table
    initMigrationsTable();
    
    // Get executed and available migrations
    const executedMigrations = getExecutedMigrations();
    const migrationFiles = getMigrationFiles();
    
    // Find pending migrations
    const pendingMigrations = migrationFiles.filter(
      file => !executedMigrations.includes(file)
    );
    
    if (pendingMigrations.length === 0) {
      console.log('✅ No pending migrations found');
      return;
    }
    
    console.log(`📋 Found ${pendingMigrations.length} pending migration(s):`);
    pendingMigrations.forEach(file => console.log(`  - ${file}`));
    
    // Execute pending migrations
    for (const migrationFile of pendingMigrations) {
      console.log(`\n🔄 Executing migration: ${migrationFile}`);
      
      try {
        const migrationPath = path.join(__dirname, migrationFile);
        const migration = require(migrationPath);
        console.log(`  - Found functions: ${Object.keys(migration).join(', ')}`);
        
        // Execute the migration
        if (typeof migration.up === 'function') {
          // New migration format with up/down functions
          console.log('  - Calling up()');
          migration.up(db);
        } else if (typeof migration.addFinancialTables === 'function') {
          console.log('  - Calling addFinancialTables()');
          migration.addFinancialTables();
        } else if (typeof migration.addResourceBookingManagement === 'function') {
          console.log('  - Calling addResourceBookingManagement()');
          migration.addResourceBookingManagement();
        } else if (typeof migration.addNotificationSystem === 'function') {
          console.log('  - Calling addNotificationSystem()');
          migration.addNotificationSystem();
        } else if (typeof migration === 'function') {
          // Migration exports a default function
          console.log('  - Calling default migration function');
          migration();
        } else {
          console.warn(`⚠️  Migration ${migrationFile} does not export expected function`);
          continue;
        }
        
        // Mark as executed
        markMigrationExecuted(migrationFile);
        console.log(`✅ Migration ${migrationFile} completed successfully`);
        
      } catch (error) {
        console.error(`❌ Migration ${migrationFile} failed:`, error.message);
        throw error;
      }
    }
    
    console.log('\n🎉 All migrations completed successfully!');
    
  } catch (error) {
    console.error('💥 Migration process failed:', error.message);
    process.exit(1);
  }
};

// Rollback last migration (for development)
const rollbackLastMigration = () => {
  console.log('⚠️  Rollback functionality not implemented yet');
  console.log('For development, you can manually drop tables or restore from backup');
};

// CLI interface
if (require.main === module) {
  const command = process.argv[2];
  
  switch (command) {
    case 'up':
    case undefined:
      runMigrations();
      break;
    case 'rollback':
      rollbackLastMigration();
      break;
    case 'status': {
      initMigrationsTable();
      const executed = getExecutedMigrations();
      const available = getMigrationFiles();
      const pending = available.filter(file => !executed.includes(file));
      
      console.log('📊 Migration Status:');
      console.log(`  Executed: ${executed.length}`);
      console.log(`  Pending: ${pending.length}`);
      console.log(`  Total: ${available.length}`);
      
      if (pending.length > 0) {
        console.log('\n📋 Pending migrations:');
        pending.forEach(file => console.log(`  - ${file}`));
      }
      break;
    }
    default:
      console.log('Usage: node migrate.js [up|rollback|status]');
      console.log('  up (default): Run pending migrations');
      console.log('  rollback: Rollback last migration');
      console.log('  status: Show migration status');
  }
}

module.exports = {
  runMigrations,
  rollbackLastMigration,
  getExecutedMigrations,
  getMigrationFiles
};