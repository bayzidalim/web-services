const Database = require('better-sqlite3');
const path = require('path');

function addRapidAssistanceToTransactions() {
  const dbPath = path.join(__dirname, '..', 'database.sqlite');
  const db = new Database(dbPath);

  try {
    console.log('🔄 Adding rapid assistance tracking to transactions table...');

    // Check if rapid_assistance_charge column already exists
    const columns = db.prepare("PRAGMA table_info(simple_transactions)").all();
    const hasRapidAssistanceColumn = columns.some(col => col.name === 'rapid_assistance_charge');
    
    if (!hasRapidAssistanceColumn) {
      // Add rapid_assistance_charge column to simple_transactions table
      db.exec(`
        ALTER TABLE simple_transactions 
        ADD COLUMN rapid_assistance_charge DECIMAL(10,2) DEFAULT 0.00
      `);

      console.log('  ✅ Added rapid_assistance_charge column to simple_transactions table');

      // Update existing transactions to set rapid_assistance_charge to 0
      const updateStmt = db.prepare(`
        UPDATE simple_transactions 
        SET rapid_assistance_charge = 0.00 
        WHERE rapid_assistance_charge IS NULL
      `);
      
      const result = updateStmt.run();
      console.log(`  ✅ Updated ${result.changes} existing transactions with default rapid assistance charge`);
    } else {
      console.log('  ⚠️  rapid_assistance_charge column already exists, skipping...');
    }

    console.log('✅ Rapid assistance transaction tracking migration completed successfully');

  } catch (error) {
    console.error('❌ Error in rapid assistance transaction migration:', error);
    throw error;
  } finally {
    db.close();
  }
}

module.exports = { addRapidAssistanceToTransactions };

// Run migration if called directly
if (require.main === module) {
  addRapidAssistanceToTransactions();
}