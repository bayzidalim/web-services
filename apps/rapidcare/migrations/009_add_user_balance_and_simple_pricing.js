const db = require('../config/database');

function up() {
  console.log('🔄 Adding user balance and simplified pricing system...');

  try {
    // Start transaction
    db.exec('BEGIN TRANSACTION');

    // 1. Add balance field to users table with default 10,000 BDT
    console.log('  📝 Adding balance field to users table...');
    
    // Check if balance column already exists
    const userTableInfo = db.prepare("PRAGMA table_info(users)").all();
    const hasBalanceColumn = userTableInfo.some(column => column.name === 'balance');
    
    if (!hasBalanceColumn) {
      db.exec(`
        ALTER TABLE users 
        ADD COLUMN balance DECIMAL(10,2) DEFAULT 10000.00
      `);
      
      // Update existing users to have 10,000 BDT balance
      db.exec(`
        UPDATE users 
        SET balance = 10000.00 
        WHERE balance IS NULL
      `);
      
      console.log('  ✅ Balance field added to users table');
    } else {
      console.log('  ℹ️  Balance field already exists in users table');
    }

    // 2. Create simplified hospital_pricing table (different from existing complex one)
    console.log('  📝 Creating simplified hospital pricing table...');
    
    db.exec(`
      CREATE TABLE IF NOT EXISTS simple_hospital_pricing (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        hospital_id INTEGER NOT NULL,
        resource_type TEXT NOT NULL CHECK(resource_type IN ('bed', 'icu', 'operationTheatres')),
        base_price DECIMAL(10,2) NOT NULL DEFAULT 100.00,
        service_charge_percentage DECIMAL(5,2) DEFAULT 30.00,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (hospital_id) REFERENCES hospitals(id) ON DELETE CASCADE,
        UNIQUE(hospital_id, resource_type)
      )
    `);
    
    console.log('  ✅ Simple hospital pricing table created');

    // 3. Create simple transactions table for payment tracking
    console.log('  📝 Creating simple transactions table...');
    
    db.exec(`
      CREATE TABLE IF NOT EXISTS simple_transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        booking_id INTEGER,
        amount DECIMAL(10,2) NOT NULL,
        hospital_amount DECIMAL(10,2) DEFAULT 0.00,
        service_charge DECIMAL(10,2) DEFAULT 0.00,
        transaction_type TEXT NOT NULL CHECK(transaction_type IN ('payment', 'refund')),
        status TEXT DEFAULT 'completed' CHECK(status IN ('pending', 'completed', 'failed')),
        transaction_id TEXT,
        description TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE SET NULL
      )
    `);
    
    console.log('  ✅ Simple transactions table created');

    // 4. Insert default pricing for existing hospitals
    console.log('  📝 Setting up default pricing for existing hospitals...');
    
    const hospitals = db.prepare('SELECT id FROM hospitals').all();
    const insertPricing = db.prepare(`
      INSERT OR IGNORE INTO simple_hospital_pricing 
      (hospital_id, resource_type, base_price, service_charge_percentage) 
      VALUES (?, ?, ?, ?)
    `);
    
    const defaultPrices = {
      'bed': 120.00,
      'icu': 600.00,
      'operationTheatres': 1200.00
    };
    
    for (const hospital of hospitals) {
      for (const [resourceType, price] of Object.entries(defaultPrices)) {
        insertPricing.run(hospital.id, resourceType, price, 30.00);
      }
    }
    
    console.log(`  ✅ Default pricing set for ${hospitals.length} hospitals`);

    // Commit transaction
    db.exec('COMMIT');
    
    console.log('✅ User balance and simplified pricing system migration completed successfully');

  } catch (error) {
    // Rollback on error
    db.exec('ROLLBACK');
    console.error('❌ Migration failed:', error.message);
    throw error;
  }
}

function down() {
  console.log('Down migration for 009_add_user_balance_and_simple_pricing not implemented');
}

module.exports = { up, down };