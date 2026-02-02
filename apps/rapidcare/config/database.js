const Database = require('better-sqlite3');
const path = require('path');

// Create database file in the project root
// Create database file in the project root or use environment variable
const dbPath = process.env.DATABASE_URL 
  ? (path.isAbsolute(process.env.DATABASE_URL) ? process.env.DATABASE_URL : path.join(process.cwd(), process.env.DATABASE_URL))
  : path.join(__dirname, '..', 'database.sqlite');

// Initialize database
const db = new Database(dbPath);

// Enable foreign keys
db.pragma('foreign_keys = ON');

// Create tables if they don't exist
const initDatabase = () => {
  // Users table
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      name TEXT NOT NULL,
      phone TEXT,
      userType TEXT NOT NULL CHECK(userType IN ('user', 'hospital-authority', 'admin')),
      hospital_id INTEGER,
      can_add_hospital BOOLEAN DEFAULT 1,
      isActive BOOLEAN DEFAULT 1,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (hospital_id) REFERENCES hospitals (id)
    )
  `);

  // Hospital authorities table (extends users)
  db.exec(`
    CREATE TABLE IF NOT EXISTS hospital_authorities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId INTEGER NOT NULL,
      hospitalId INTEGER,
      role TEXT NOT NULL CHECK(role IN ('admin', 'manager', 'staff')),
      permissions TEXT,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (userId) REFERENCES users (id) ON DELETE CASCADE,
      FOREIGN KEY (hospitalId) REFERENCES hospitals (id) ON DELETE CASCADE
    )
  `);

  // Hospitals table
  db.exec(`
    CREATE TABLE IF NOT EXISTS hospitals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      type TEXT DEFAULT 'General',
      street TEXT,
      city TEXT,
      state TEXT,
      zipCode TEXT,
      country TEXT,
      phone TEXT,
      email TEXT,
      emergency TEXT,
      total_beds INTEGER DEFAULT 0,
      icu_beds INTEGER DEFAULT 0,
      operation_theaters INTEGER DEFAULT 0,
      approval_status TEXT DEFAULT 'pending' CHECK(approval_status IN ('pending', 'approved', 'rejected')),
      approved_by INTEGER,
      approved_at DATETIME,
      rejection_reason TEXT,
      submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      rating REAL DEFAULT 0,
      isActive BOOLEAN DEFAULT 1,
      lastUpdated DATETIME DEFAULT CURRENT_TIMESTAMP,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (approved_by) REFERENCES users (id)
    )
  `);

  // Surgeons table
  db.exec(`
    CREATE TABLE IF NOT EXISTS surgeons (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      hospitalId INTEGER,
      name TEXT NOT NULL,
      specialization TEXT,
      available BOOLEAN DEFAULT 1,
      scheduleDays TEXT,
      scheduleHours TEXT,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (hospitalId) REFERENCES hospitals (id) ON DELETE CASCADE
    )
  `);

  // Hospital resources table
  db.exec(`
    CREATE TABLE IF NOT EXISTS hospital_resources (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      hospitalId INTEGER,
      resourceType TEXT NOT NULL,
      total INTEGER DEFAULT 0,
      available INTEGER DEFAULT 0,
      occupied INTEGER DEFAULT 0,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (hospitalId) REFERENCES hospitals (id) ON DELETE CASCADE,
      UNIQUE(hospitalId, resourceType)
    )
  `);

  // Hospital services table
  db.exec(`
    CREATE TABLE IF NOT EXISTS hospital_services (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      hospitalId INTEGER,
      service TEXT NOT NULL,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (hospitalId) REFERENCES hospitals (id) ON DELETE CASCADE
    )
  `);

  // Bookings table
  db.exec(`
    CREATE TABLE IF NOT EXISTS bookings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId INTEGER NOT NULL,
      hospitalId INTEGER,
      resourceType TEXT NOT NULL,
      patientName TEXT NOT NULL,
      patientAge INTEGER NOT NULL,
      patientGender TEXT NOT NULL,
      emergencyContactName TEXT,
      emergencyContactPhone TEXT,
      emergencyContactRelationship TEXT,
      medicalCondition TEXT NOT NULL,
      urgency TEXT DEFAULT 'medium',
      surgeonId INTEGER,
      scheduledDate DATETIME NOT NULL,
      estimatedDuration INTEGER DEFAULT 24,
      status TEXT DEFAULT 'pending',
      paymentAmount REAL NOT NULL,
      paymentStatus TEXT DEFAULT 'pending',
      paymentMethod TEXT,
      transactionId TEXT,
      notes TEXT,
      rapidAssistance BOOLEAN DEFAULT FALSE,
      rapidAssistantName TEXT,
      rapidAssistantPhone TEXT,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (userId) REFERENCES users (id),
      FOREIGN KEY (hospitalId) REFERENCES hospitals (id),
      FOREIGN KEY (surgeonId) REFERENCES surgeons (id)
    )
  `);

  // Blood requests table
  db.exec(`
    CREATE TABLE IF NOT EXISTS blood_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      requesterId INTEGER NOT NULL,
      requesterName TEXT NOT NULL,
      requesterPhone TEXT NOT NULL,
      bloodType TEXT NOT NULL,
      units INTEGER NOT NULL,
      urgency TEXT DEFAULT 'medium',
      hospitalName TEXT,
      hospitalAddress TEXT,
      hospitalContact TEXT,
      patientName TEXT,
      patientAge INTEGER,
      medicalCondition TEXT,
      requiredBy DATETIME NOT NULL,
      status TEXT DEFAULT 'pending',
      notes TEXT,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (requesterId) REFERENCES users (id)
    )
  `);

  // Matched donors table
  db.exec(`
    CREATE TABLE IF NOT EXISTS matched_donors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bloodRequestId INTEGER,
      donorId INTEGER NOT NULL,
      donorName TEXT NOT NULL,
      donorPhone TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      matchedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (bloodRequestId) REFERENCES blood_requests (id) ON DELETE CASCADE,
      FOREIGN KEY (donorId) REFERENCES users (id)
    )
  `);

  // Financial Tables

  // Transactions table for payment processing
  db.exec(`
    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bookingId INTEGER NOT NULL,
      userId INTEGER NOT NULL,
      hospitalId INTEGER NOT NULL,
      amount DECIMAL(10,2) NOT NULL,
      serviceCharge DECIMAL(10,2) NOT NULL,
      hospitalAmount DECIMAL(10,2) NOT NULL,
      paymentMethod TEXT NOT NULL,
      transactionId TEXT UNIQUE,
      status TEXT NOT NULL CHECK(status IN ('pending', 'completed', 'failed', 'refunded')),
      paymentData TEXT,
      processedAt DATETIME,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (bookingId) REFERENCES bookings (id),
      FOREIGN KEY (userId) REFERENCES users (id),
      FOREIGN KEY (hospitalId) REFERENCES hospitals (id)
    )
  `);

  // Hospital pricing table for resource rate management
  db.exec(`
    CREATE TABLE IF NOT EXISTS hospital_pricing (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      hospitalId INTEGER NOT NULL,
      resourceType TEXT NOT NULL CHECK(resourceType IN ('beds', 'icu', 'operationTheatres')),
      baseRate DECIMAL(10,2) NOT NULL,
      hourlyRate DECIMAL(10,2),
      minimumCharge DECIMAL(10,2),
      maximumCharge DECIMAL(10,2),
      currency TEXT DEFAULT 'USD',
      effectiveFrom DATETIME DEFAULT CURRENT_TIMESTAMP,
      effectiveTo DATETIME,
      isActive BOOLEAN DEFAULT 1,
      createdBy INTEGER NOT NULL,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (hospitalId) REFERENCES hospitals (id) ON DELETE CASCADE,
      FOREIGN KEY (createdBy) REFERENCES users (id),
      UNIQUE(hospitalId, resourceType, effectiveFrom)
    )
  `);

  // User balances table for revenue tracking
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_balances (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId INTEGER NOT NULL,
      userType TEXT NOT NULL CHECK(userType IN ('hospital-authority', 'admin')),
      hospitalId INTEGER,
      currentBalance DECIMAL(12,2) DEFAULT 0.00,
      totalEarnings DECIMAL(12,2) DEFAULT 0.00,
      totalWithdrawals DECIMAL(12,2) DEFAULT 0.00,
      pendingAmount DECIMAL(12,2) DEFAULT 0.00,
      lastTransactionAt DATETIME,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (userId) REFERENCES users (id) ON DELETE CASCADE,
      FOREIGN KEY (hospitalId) REFERENCES hospitals (id),
      UNIQUE(userId, hospitalId)
    )
  `);

  // Balance transactions table for audit trails
  db.exec(`
    CREATE TABLE IF NOT EXISTS balance_transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      balanceId INTEGER NOT NULL,
      transactionId INTEGER,
      transactionType TEXT NOT NULL CHECK(transactionType IN ('payment_received', 'service_charge', 'refund_processed', 'withdrawal', 'adjustment')),
      amount DECIMAL(10,2) NOT NULL,
      balanceBefore DECIMAL(12,2) NOT NULL,
      balanceAfter DECIMAL(12,2) NOT NULL,
      description TEXT,
      referenceId TEXT,
      processedBy INTEGER,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (balanceId) REFERENCES user_balances (id) ON DELETE CASCADE,
      FOREIGN KEY (transactionId) REFERENCES transactions (id),
      FOREIGN KEY (processedBy) REFERENCES users (id)
    )
  `);

  // Payment configuration table for hospital policies
  db.exec(`
    CREATE TABLE IF NOT EXISTS payment_config (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      hospitalId INTEGER,
      serviceChargeRate DECIMAL(5,4) DEFAULT 0.0500,
      cancellationWindow INTEGER DEFAULT 24,
      refundPercentage DECIMAL(5,4) DEFAULT 0.8000,
      minimumBookingAmount DECIMAL(10,2) DEFAULT 10.00,
      paymentMethods TEXT,
      cancellationPolicy TEXT,
      refundPolicy TEXT,
      isActive BOOLEAN DEFAULT 1,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (hospitalId) REFERENCES hospitals (id)
    )
  `);

  // Migrations tracking table
  db.exec(`
    CREATE TABLE IF NOT EXISTS migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT UNIQUE NOT NULL,
      executed_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  console.log('Database tables created successfully');
};

// Initialize database on module load
initDatabase();

module.exports = db;