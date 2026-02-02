const db = require('./config/database');

// Pricing ranges for different resource types (in BDT - Bangladeshi Taka)
const pricingRanges = {
  beds: {
    baseRate: { min: 500, max: 2000 },      // Daily rate for general beds
    hourlyRate: { min: 50, max: 150 },      // Hourly rate if applicable
    minimumCharge: { min: 500, max: 1000 }, // Minimum charge
    maximumCharge: { min: 5000, max: 15000 } // Maximum daily charge
  },
  icu: {
    baseRate: { min: 2000, max: 8000 },     // Daily rate for ICU beds
    hourlyRate: { min: 200, max: 500 },     // Hourly rate if applicable
    minimumCharge: { min: 2000, max: 4000 }, // Minimum charge
    maximumCharge: { min: 15000, max: 40000 } // Maximum daily charge
  },
  operationTheatres: {
    baseRate: { min: 5000, max: 25000 },    // Daily rate for operation theatres
    hourlyRate: { min: 1000, max: 4000 },   // Hourly rate
    minimumCharge: { min: 5000, max: 10000 }, // Minimum charge
    maximumCharge: { min: 25000, max: 100000 } // Maximum charge per procedure
  }
};

// Hospital tier multipliers (based on hospital type/quality)
const tierMultipliers = {
  'government': 0.7,    // Government hospitals - lower rates
  'private': 1.2,       // Private hospitals - higher rates
  'specialized': 1.5,   // Specialized hospitals - premium rates
  'default': 1.0        // Default multiplier
};

// Function to generate random price within range
const generatePrice = (min, max, multiplier = 1) => {
  const basePrice = Math.floor(Math.random() * (max - min + 1)) + min;
  return Math.floor(basePrice * multiplier);
};

// Function to determine hospital tier based on name/type
const getHospitalTier = (hospitalName) => {
  const name = hospitalName.toLowerCase();
  if (name.includes('medical college') || name.includes('government') || name.includes('district')) {
    return 'government';
  } else if (name.includes('specialized') || name.includes('cardiac') || name.includes('cancer') || name.includes('eye')) {
    return 'specialized';
  } else {
    return 'private';
  }
};

// Main seeding function
const seedPricingData = () => {
  try {
    console.log('🏥 Starting pricing data seeding...');

    // Get all hospitals
    const hospitals = db.prepare('SELECT id, name, type FROM hospitals').all();
    console.log(`📊 Found ${hospitals.length} hospitals`);

    // Check existing pricing data
    const existingPricing = db.prepare('SELECT DISTINCT hospitalId FROM hospital_pricing').all();
    const hospitalsWithPricing = new Set(existingPricing.map(p => p.hospitalId));
    
    console.log(`💰 ${hospitalsWithPricing.size} hospitals already have pricing data`);

    // Prepare insert statement
    const insertPricing = db.prepare(`
      INSERT INTO hospital_pricing (
        hospitalId, resourceType, baseRate, hourlyRate, 
        minimumCharge, maximumCharge, currency, 
        isActive, createdBy, createdAt, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `);

    let seedCount = 0;
    const resourceTypes = ['beds', 'icu', 'operationTheatres'];

    // Begin transaction for better performance
    const transaction = db.transaction(() => {
      hospitals.forEach(hospital => {
        // Skip if hospital already has pricing
        if (hospitalsWithPricing.has(hospital.id)) {
          return;
        }

        // Determine hospital tier and multiplier
        const tier = getHospitalTier(hospital.name);
        const multiplier = tierMultipliers[tier] || tierMultipliers.default;

        console.log(`🏥 Seeding pricing for: ${hospital.name} (${tier} tier, ${multiplier}x multiplier)`);

        // Generate pricing for each resource type
        resourceTypes.forEach(resourceType => {
          const ranges = pricingRanges[resourceType];
          
          const baseRate = generatePrice(ranges.baseRate.min, ranges.baseRate.max, multiplier);
          const hourlyRate = generatePrice(ranges.hourlyRate.min, ranges.hourlyRate.max, multiplier);
          const minimumCharge = generatePrice(ranges.minimumCharge.min, ranges.minimumCharge.max, multiplier);
          const maximumCharge = generatePrice(ranges.maximumCharge.min, ranges.maximumCharge.max, multiplier);

          insertPricing.run(
            hospital.id,        // hospitalId
            resourceType,       // resourceType
            baseRate,          // baseRate
            hourlyRate,        // hourlyRate
            minimumCharge,     // minimumCharge
            maximumCharge,     // maximumCharge
            'BDT',             // currency (Bangladeshi Taka)
            1,                 // isActive
            1                  // createdBy (system user)
          );

          seedCount++;
        });
      });
    });

    // Execute transaction
    transaction();

    console.log(`✅ Successfully seeded ${seedCount} pricing records`);
    
    // Verify the seeding
    const totalPricing = db.prepare('SELECT COUNT(*) as count FROM hospital_pricing').get();
    const hospitalCount = db.prepare('SELECT COUNT(DISTINCT hospitalId) as count FROM hospital_pricing').get();
    
    console.log(`📈 Total pricing records: ${totalPricing.count}`);
    console.log(`🏥 Hospitals with pricing: ${hospitalCount.count}`);
    
    // Show sample pricing data
    console.log('\n📋 Sample pricing data:');
    const samplePricing = db.prepare(`
      SELECT h.name, hp.resourceType, hp.baseRate, hp.hourlyRate, hp.currency
      FROM hospital_pricing hp
      JOIN hospitals h ON h.id = hp.hospitalId
      ORDER BY h.name, hp.resourceType
      LIMIT 9
    `).all();
    
    console.table(samplePricing);

  } catch (error) {
    console.error('❌ Error seeding pricing data:', error);
    throw error;
  }
};

// Run the seeder if called directly
if (require.main === module) {
  seedPricingData();
  console.log('🎉 Pricing data seeding completed!');
}

module.exports = { seedPricingData };
