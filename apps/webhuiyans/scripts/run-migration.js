#!/usr/bin/env node
/**
 * Database Migration Runner
 * 
 * Runs SQL migration files against Supabase PostgreSQL.
 * 
 * Usage:
 *   node scripts/run-migration.js [migration_file]
 * 
 * Examples:
 *   node scripts/run-migration.js                           # Run all migrations
 *   node scripts/run-migration.js 001_create_media_tables   # Run specific migration
 * 
 * Environment:
 *   DATABASE_URL - Supabase PostgreSQL connection string
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const pool = require('../src/config/database');

const MIGRATIONS_DIR = path.join(__dirname, '../migrations');

/**
 * Get list of migration files in order
 */
function getMigrationFiles() {
    const files = fs.readdirSync(MIGRATIONS_DIR)
        .filter(f => f.endsWith('.sql'))
        .filter(f => !f.startsWith('all_')) // Exclude combined file
        .sort();
    return files;
}

/**
 * Run a single migration file
 */
async function runMigration(filename) {
    const filepath = path.join(MIGRATIONS_DIR, filename);
    
    if (!fs.existsSync(filepath)) {
        throw new Error(`Migration file not found: ${filepath}`);
    }

    const sql = fs.readFileSync(filepath, 'utf8');
    
    console.log(`\n📄 Running migration: ${filename}`);
    console.log('─'.repeat(50));

    const client = await pool.connect();
    try {
        await client.query(sql);
        console.log(`✅ Migration completed: ${filename}`);
        return true;
    } catch (error) {
        console.error(`❌ Migration failed: ${filename}`);
        console.error(`   Error: ${error.message}`);
        throw error;
    } finally {
        client.release();
    }
}

/**
 * Run all migrations in order
 */
async function runAllMigrations() {
    const files = getMigrationFiles();
    console.log('\n🚀 Running all migrations...');
    console.log(`   Found ${files.length} migration files\n`);

    for (const file of files) {
        await runMigration(file);
    }

    console.log('\n✅ All migrations completed successfully!\n');
}

/**
 * Run the combined migration file
 */
async function runCombinedMigration() {
    const combinedFile = 'all_media_migrations.sql';
    const filepath = path.join(MIGRATIONS_DIR, combinedFile);
    
    if (!fs.existsSync(filepath)) {
        throw new Error(`Combined migration file not found: ${filepath}`);
    }

    console.log('\n🚀 Running combined migration...\n');
    await runMigration(combinedFile);
}

/**
 * Main entry point
 */
async function main() {
    const args = process.argv.slice(2);
    
    console.log('═'.repeat(50));
    console.log('  We Bhuiyans Database Migration Runner');
    console.log('═'.repeat(50));

    try {
        if (args.length === 0) {
            // No argument: run combined migration
            await runCombinedMigration();
        } else if (args[0] === '--all' || args[0] === '-a') {
            // --all: run individual migration files in order
            await runAllMigrations();
        } else {
            // Specific migration file
            let filename = args[0];
            if (!filename.endsWith('.sql')) {
                filename += '.sql';
            }
            await runMigration(filename);
        }
    } catch (error) {
        console.error('\n❌ Migration failed:', error.message);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

main();
