const db = require('../config/database');

/**
 * Hospital Pricing Model
 * Manages pricing for hospital resources with service charges
 */
class HospitalPricing {
  
  /**
   * Normalize resource type to handle different naming conventions
   * @param {string} resourceType - Resource type to normalize
   * @returns {string} Normalized resource type
   */
  static normalizeResourceType(resourceType) {
    const typeMap = {
      'bed': 'bed',
      'beds': 'bed',
      'icu': 'icu',
      'operationTheatres': 'operationTheatres',
      'operationTheaters': 'operationTheatres',
      'operation_theatres': 'operationTheatres',
      'rapid_collection': 'rapid_collection',
      'rapidCollection': 'rapid_collection',
      'rapidService': 'rapid_collection'
    };
    
    return typeMap[resourceType] || resourceType;
  }

  /**
   * Set pricing for a hospital resource
   * @param {number} hospitalId - Hospital ID
   * @param {string} resourceType - Resource type (bed, icu, operationTheatres)
   * @param {number} basePrice - Base price for the resource
   * @param {number} serviceChargePercentage - Service charge percentage (default 30%)
   * @returns {object} Pricing record
   */
  static setPricing(hospitalId, resourceType, basePrice, serviceChargePercentage = 10.00) {
    // Validate inputs
    if (!hospitalId || !resourceType || !basePrice) {
      throw new Error('Hospital ID, resource type, and base price are required');
    }
    
    // Normalize resource type
    const normalizedType = this.normalizeResourceType(resourceType);
    const validResourceTypes = ['bed', 'icu', 'operationTheatres', 'rapid_collection'];
    if (!validResourceTypes.includes(normalizedType)) {
      throw new Error(`Invalid resource type. Must be one of: ${validResourceTypes.join(', ')}`);
    }
    
    if (basePrice < 0) {
      throw new Error('Base price must be non-negative');
    }
    
    if (serviceChargePercentage < 0 || serviceChargePercentage > 100) {
      throw new Error('Service charge percentage must be between 0 and 100');
    }
    
    // Check if hospital exists
    const hospitalExists = db.prepare('SELECT id FROM hospitals WHERE id = ?').get(hospitalId);
    if (!hospitalExists) {
      throw new Error('Hospital not found');
    }
    
    // Insert or update pricing
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO simple_hospital_pricing 
      (hospital_id, resource_type, base_price, service_charge_percentage, updated_at) 
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
    `);
    
    stmt.run(hospitalId, normalizedType, basePrice, serviceChargePercentage);
    
    // Return the updated pricing record
    return this.getPricing(hospitalId, normalizedType);
  }
  
  /**
   * Get pricing for a hospital resource with calculated total
   * @param {number} hospitalId - Hospital ID
   * @param {string} resourceType - Resource type
   * @returns {object} Pricing information with calculations
   */
  static getPricing(hospitalId, resourceType) {
    // Normalize resource type (handle both 'bed'/'beds', etc.)
    const normalizedType = this.normalizeResourceType(resourceType);
    
    const stmt = db.prepare(`
      SELECT * FROM simple_hospital_pricing 
      WHERE hospital_id = ? AND resource_type = ?
    `);
    
    const pricing = stmt.get(hospitalId, normalizedType);
    
    if (!pricing) {
      // Return default pricing if not set (in Taka - BDT)
      const defaultPrices = {
        'bed': 120.00,
        'bed': 120.00,
        'icu': 600.00,
        'operationTheatres': 1200.00,
        'rapid_collection': 500.00
      };
      
      const basePrice = defaultPrices[resourceType] || 100.00;
      const serviceChargePercentage = 10.00;
      
      return {
        hospital_id: hospitalId,
        resource_type: resourceType,
        base_price: basePrice,
        service_charge_percentage: serviceChargePercentage,
        service_charge_amount: (basePrice * serviceChargePercentage) / 100,
        total_price: basePrice + ((basePrice * serviceChargePercentage) / 100),
        is_default: true
      };
    }
    
    // Calculate service charge and total
    const serviceChargeAmount = (pricing.base_price * pricing.service_charge_percentage) / 100;
    const totalPrice = pricing.base_price + serviceChargeAmount;
    
    return {
      ...pricing,
      service_charge_amount: parseFloat(serviceChargeAmount.toFixed(2)),
      total_price: parseFloat(totalPrice.toFixed(2)),
      is_default: false
    };
  }
  
  /**
   * Get all pricing for a hospital
   * @param {number} hospitalId - Hospital ID
   * @returns {array} Array of pricing records
   */
  static getHospitalPricing(hospitalId) {
    const resourceTypes = ['beds', 'icu', 'operationTheatres', 'rapid_collection'];
    return resourceTypes.map(resourceType => this.getPricing(hospitalId, resourceType));
  }
  
  /**
   * Calculate total cost for a booking
   * @param {number} hospitalId - Hospital ID
   * @param {string} resourceType - Resource type
   * @param {number} duration - Duration in hours
   * @returns {object} Cost breakdown
   */
  static calculateBookingCost(hospitalId, resourceType, duration = 24) {
    const pricing = this.getPricing(hospitalId, resourceType);
    
    // Calculate daily rate (24 hours = 1 day)
    const dailyRate = pricing.total_price;
    const days = duration / 24;
    const totalCost = dailyRate * days;
    
    const hospitalShare = pricing.base_price * days;
    const serviceChargeShare = pricing.service_charge_amount * days;
    
    return {
      base_price: pricing.base_price,
      service_charge_percentage: pricing.service_charge_percentage,
      service_charge_amount: pricing.service_charge_amount,
      daily_rate: dailyRate,
      duration_hours: duration,
      duration_days: parseFloat(days.toFixed(2)),
      hospital_share: parseFloat(hospitalShare.toFixed(2)),
      service_charge_share: parseFloat(serviceChargeShare.toFixed(2)),
      total_cost: parseFloat(totalCost.toFixed(2))
    };
  }
  
  /**
   * Update service charge percentage for a hospital resource
   * @param {number} hospitalId - Hospital ID
   * @param {string} resourceType - Resource type
   * @param {number} serviceChargePercentage - New service charge percentage
   * @returns {object} Updated pricing record
   */
  static updateServiceCharge(hospitalId, resourceType, serviceChargePercentage) {
    const currentPricing = this.getPricing(hospitalId, resourceType);
    return this.setPricing(hospitalId, resourceType, currentPricing.base_price, serviceChargePercentage);
  }
  
  /**
   * Get pricing statistics for admin dashboard
   * @returns {object} Pricing statistics
   */
  static getPricingStatistics() {
    const stats = db.prepare(`
      SELECT 
        resource_type,
        COUNT(*) as hospital_count,
        AVG(base_price) as avg_base_price,
        MIN(base_price) as min_base_price,
        MAX(base_price) as max_base_price,
        AVG(service_charge_percentage) as avg_service_charge
      FROM simple_hospital_pricing 
      GROUP BY resource_type
    `).all();
    
    return stats.map(stat => ({
      ...stat,
      avg_base_price: parseFloat(stat.avg_base_price.toFixed(2)),
      avg_service_charge: parseFloat(stat.avg_service_charge.toFixed(2))
    }));
  }
  
  /**
   * Validate pricing data
   * @param {object} pricingData - Pricing data to validate
   * @returns {object} Validation result
   */
  static validatePricingData(pricingData) {
    const errors = [];
    
    if (!pricingData.hospitalId) {
      errors.push('Hospital ID is required');
    }
    
    if (!pricingData.resourceType) {
      errors.push('Resource type is required');
    } else {
      const validTypes = ['bed', 'icu', 'operationTheatres', 'rapid_collection'];
      if (!validTypes.includes(pricingData.resourceType)) {
        errors.push(`Resource type must be one of: ${validTypes.join(', ')}`);
      }
    }
    
    if (pricingData.basePrice === undefined || pricingData.basePrice === null) {
      errors.push('Base price is required');
    } else if (pricingData.basePrice < 0) {
      errors.push('Base price must be non-negative');
    }
    
    if (pricingData.serviceChargePercentage !== undefined) {
      if (pricingData.serviceChargePercentage < 0 || pricingData.serviceChargePercentage > 100) {
        errors.push('Service charge percentage must be between 0 and 100');
      }
    }
    
    return {
      isValid: errors.length === 0,
      errors: errors
    };
  }
  
  /**
   * Delete pricing for a hospital resource
   * @param {number} hospitalId - Hospital ID
   * @param {string} resourceType - Resource type
   * @returns {boolean} Success status
   */
  static deletePricing(hospitalId, resourceType) {
    const stmt = db.prepare(`
      DELETE FROM simple_hospital_pricing 
      WHERE hospital_id = ? AND resource_type = ?
    `);
    
    const result = stmt.run(hospitalId, resourceType);
    return result.changes > 0;
  }
  
  /**
   * Get all hospitals with custom pricing
   * @returns {array} Hospitals with pricing information
   */
  static getHospitalsWithPricing() {
    const stmt = db.prepare(`
      SELECT DISTINCT 
        h.id, 
        h.name, 
        COUNT(p.id) as pricing_count
      FROM hospitals h
      LEFT JOIN simple_hospital_pricing p ON h.id = p.hospital_id
      GROUP BY h.id, h.name
      ORDER BY h.name
    `);
    
    return stmt.all();
  }
}

module.exports = HospitalPricing;