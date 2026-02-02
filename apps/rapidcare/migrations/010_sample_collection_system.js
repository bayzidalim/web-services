const db = require('../config/database');

function up() {
  console.log('Running migration: Sample Collection System...');

  // Create collection_agents table
  db.exec(`
    CREATE TABLE IF NOT EXISTS collection_agents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT NOT NULL,
      hospital_id INTEGER NOT NULL,
      specialization TEXT,
      is_active BOOLEAN DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (hospital_id) REFERENCES hospitals(id) ON DELETE CASCADE
    )
  `);

  // Create test_types table
  db.exec(`
    CREATE TABLE IF NOT EXISTS test_types (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      description TEXT,
      sample_type TEXT NOT NULL, -- blood, urine, stool, etc.
      price_range TEXT, -- "500-1000 BDT"
      preparation_instructions TEXT,
      is_active BOOLEAN DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Create sample_collection_requests table
  db.exec(`
    CREATE TABLE IF NOT EXISTS sample_collection_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      hospital_id INTEGER NOT NULL,
      agent_id INTEGER,
      test_types TEXT NOT NULL, -- JSON array of test type IDs
      patient_name TEXT NOT NULL,
      patient_phone TEXT NOT NULL,
      collection_address TEXT NOT NULL,
      preferred_time TEXT, -- morning, afternoon, evening
      special_instructions TEXT,
      status TEXT DEFAULT 'pending', -- pending, assigned, collected, completed, cancelled
      estimated_price TEXT,
      collection_date DATE,
      collection_time TIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (hospital_id) REFERENCES hospitals(id) ON DELETE CASCADE,
      FOREIGN KEY (agent_id) REFERENCES collection_agents(id) ON DELETE SET NULL
    )
  `);

  // Create hospital_test_services table (which tests each hospital offers)
  db.exec(`
    CREATE TABLE IF NOT EXISTS hospital_test_services (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      hospital_id INTEGER NOT NULL,
      test_type_id INTEGER NOT NULL,
      price DECIMAL(10,2),
      is_available BOOLEAN DEFAULT 1,
      home_collection_available BOOLEAN DEFAULT 1,
      home_collection_fee DECIMAL(10,2) DEFAULT 0,
      estimated_duration TEXT, -- "2-4 hours", "24 hours", etc.
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (hospital_id) REFERENCES hospitals(id) ON DELETE CASCADE,
      FOREIGN KEY (test_type_id) REFERENCES test_types(id) ON DELETE CASCADE,
      UNIQUE(hospital_id, test_type_id)
    )
  `);

  // Insert sample test types
  const testTypes = [
    {
      name: 'FBC (Full Blood Count)',
      description: 'Complete blood count including RBC, WBC, platelets, hemoglobin',
      sample_type: 'blood',
      price_range: '300-500 BDT',
      preparation_instructions: 'No special preparation required. Can be done anytime.'
    },
    {
      name: 'LFT (Liver Function Test)',
      description: 'Tests to check liver health including ALT, AST, bilirubin',
      sample_type: 'blood',
      price_range: '800-1200 BDT',
      preparation_instructions: 'Fasting for 8-12 hours recommended but not mandatory.'
    },
    {
      name: 'Blood Sugar Test',
      description: 'Fasting and random blood glucose levels',
      sample_type: 'blood',
      price_range: '200-400 BDT',
      preparation_instructions: 'For fasting blood sugar, fast for 8-12 hours. For random, no preparation needed.'
    },
    {
      name: 'Lipid Profile Test',
      description: 'Cholesterol, triglycerides, HDL, LDL levels',
      sample_type: 'blood',
      price_range: '600-900 BDT',
      preparation_instructions: 'Fasting for 9-12 hours required. Only water allowed during fasting.'
    },
    {
      name: 'HBsAg Test',
      description: 'Hepatitis B surface antigen test',
      sample_type: 'blood',
      price_range: '400-600 BDT',
      preparation_instructions: 'No special preparation required.'
    },
    {
      name: 'IgG Dengue Test',
      description: 'Dengue IgG antibody test for past dengue infection',
      sample_type: 'blood',
      price_range: '800-1200 BDT',
      preparation_instructions: 'No special preparation required.'
    }
  ];

  const insertTestType = db.prepare(`
    INSERT INTO test_types (name, description, sample_type, price_range, preparation_instructions)
    VALUES (?, ?, ?, ?, ?)
  `);

  for (const testType of testTypes) {
    try {
      insertTestType.run(
        testType.name,
        testType.description,
        testType.sample_type,
        testType.price_range,
        testType.preparation_instructions
      );
    } catch (error) {
      if (!error.message.includes('UNIQUE constraint failed')) {
        console.error('Error inserting test type:', error);
      }
    }
  }

  // Insert sample collection agents for existing hospitals
  const hospitals = db.prepare('SELECT id FROM hospitals LIMIT 10').all();
  
  const bangladeshiAgents = [
    { name: 'মোহাম্মদ হাসান', phone: '+8801712345678' },
    { name: 'আব্দুল রহমান', phone: '+8801823456789' },
    { name: 'মোহাম্মদ করিম', phone: '+8801934567890' },
    { name: 'আব্দুল আজিজ', phone: '+8801645678901' },
    { name: 'মোহাম্মদ রফিক', phone: '+8801756789012' },
    { name: 'নাসির উদ্দিন', phone: '+8801867890123' },
    { name: 'মোহাম্মদ শফিক', phone: '+8801978901234' },
    { name: 'আব্দুর রশিদ', phone: '+8801589012345' },
    { name: 'মোহাম্মদ জামিল', phone: '+8801690123456' },
    { name: 'ফারুক আহমেদ', phone: '+8801501234567' }
  ];

  const insertAgent = db.prepare(`
    INSERT INTO collection_agents (name, phone, hospital_id, specialization)
    VALUES (?, ?, ?, ?)
  `);

  hospitals.forEach((hospital, index) => {
    if (index < bangladeshiAgents.length) {
      const agent = bangladeshiAgents[index];
      try {
        insertAgent.run(
          agent.name,
          agent.phone,
          hospital.id,
          'Sample Collection Specialist'
        );
      } catch (error) {
        console.error('Error inserting collection agent:', error);
      }
    }
  });

  // Create indexes for better performance
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_sample_requests_user_id ON sample_collection_requests(user_id);
    CREATE INDEX IF NOT EXISTS idx_sample_requests_hospital_id ON sample_collection_requests(hospital_id);
    CREATE INDEX IF NOT EXISTS idx_sample_requests_status ON sample_collection_requests(status);
    CREATE INDEX IF NOT EXISTS idx_collection_agents_hospital_id ON collection_agents(hospital_id);
    CREATE INDEX IF NOT EXISTS idx_hospital_test_services_hospital_id ON hospital_test_services(hospital_id);
  `);

  console.log('✅ Sample Collection System migration completed successfully');
}

function down() {
  console.log('Down migration for 010_sample_collection_system not implemented');
}

module.exports = { up, down };