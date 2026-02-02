const db = require('./config/database');

/**
 * Update all hospital pricing to 5x the current values
 */

const updatePricing5x = () => {
  console.log('💰 Updating hospital pricing to 5x...');

  try {
    // Begin transaction
    db.exec('BEGIN TRANSACTION');

    // Update hospital_pricing table
    const currentPricing = db.prepare('SELECT * FROM hospital_pricing').all();
    
    if (currentPricing.length === 0) {
      console.log('⚠️  No pricing records found in hospital_pricing table.');
    } else {
      console.log(`📊 Found ${currentPricing.length} pricing records in hospital_pricing to update`);

    // Update each pricing record
    const updateStmt = db.prepare(`
      UPDATE hospital_pricing 
      SET baseRate = ?,
          hourlyRate = ?,
          minimumCharge = ?,
          maximumCharge = ?,
          updatedAt = CURRENT_TIMESTAMP
      WHERE id = ?
    `);

    let updatedCount = 0;
    currentPricing.forEach(pricing => {
      const newBaseRate = pricing.baseRate * 5;
      const newHourlyRate = pricing.hourlyRate ? pricing.hourlyRate * 5 : null;
      const newMinimumCharge = pricing.minimumCharge ? pricing.minimumCharge * 5 : null;
      const newMaximumCharge = pricing.maximumCharge ? pricing.maximumCharge * 5 : null;

      updateStmt.run(
        newBaseRate,
        newHourlyRate,
        newMinimumCharge,
        newMaximumCharge,
        pricing.id
      );

      console.log(`   ✓ Hospital ${pricing.hospitalId} - ${pricing.resourceType}:`);
      console.log(`     Base Rate: ${pricing.baseRate} → ${newBaseRate}`);
      if (newHourlyRate) {
        console.log(`     Hourly Rate: ${pricing.hourlyRate} → ${newHourlyRate}`);
      }
      
      updatedCount++;
    });
    }

    // Update simple_hospital_pricing table
    const simplePricing = db.prepare('SELECT * FROM simple_hospital_pricing').all();
    
    if (simplePricing.length > 0) {
      console.log(`\n📊 Found ${simplePricing.length} pricing records in simple_hospital_pricing to update`);
      
      const updateSimpleStmt = db.prepare(`
        UPDATE simple_hospital_pricing 
        SET base_price = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `);

      simplePricing.forEach(pricing => {
        const newBasePrice = pricing.base_price * 5;
        updateSimpleStmt.run(newBasePrice, pricing.id);
        console.log(`   ✓ Hospital ${pricing.hospital_id} - ${pricing.resource_type}: ${pricing.base_price} → ${newBasePrice}`);
      });
    }

    // Update payment config minimum booking amounts
    const paymentConfigs = db.prepare('SELECT * FROM payment_config').all();
    
    if (paymentConfigs.length > 0) {
      console.log(`\n⚙️  Updating ${paymentConfigs.length} payment configurations...`);
      
      const updateConfigStmt = db.prepare(`
        UPDATE payment_config 
        SET minimumBookingAmount = ?,
            updatedAt = CURRENT_TIMESTAMP
        WHERE id = ?
      `);

      paymentConfigs.forEach(config => {
        const newMinimum = config.minimumBookingAmount * 5;
        updateConfigStmt.run(newMinimum, config.id);
        console.log(`   ✓ Hospital ${config.hospitalId}: Minimum ${config.minimumBookingAmount} → ${newMinimum}`);
      });
    }

    // Commit transaction
    db.exec('COMMIT');

    console.log('\n✅ Pricing update completed successfully!');
    console.log(`   - Updated ${updatedCount} pricing records`);
    console.log(`   - All prices increased by 5x`);
    console.log(`   - Updated ${paymentConfigs.length} payment configurations`);

    // Show summary of new pricing
    console.log('\n📊 New Pricing Summary:');
    const summary = db.prepare(`
      SELECT 
        resourceType,
        AVG(baseRate) as avgBaseRate,
        MIN(baseRate) as minBaseRate,
        MAX(baseRate) as maxBaseRate
      FROM hospital_pricing
      GROUP BY resourceType
    `).all();

    summary.forEach(row => {
      console.log(`   ${row.resourceType}:`);
      console.log(`     Average: $${row.avgBaseRate.toFixed(2)}`);
      console.log(`     Range: $${row.minBaseRate.toFixed(2)} - $${row.maxBaseRate.toFixed(2)}`);
    });

  } catch (error) {
    db.exec('ROLLBACK');
    console.error('❌ Pricing update failed:', error.message);
    throw error;
  }
};

// Run update if called directly
if (require.main === module) {
  updatePricing5x();
  console.log('\n✨ Pricing update completed!');
}

module.exports = { updatePricing5x };
