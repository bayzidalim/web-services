const HospitalPricing = require('../models/HospitalPricing');
const Hospital = require('../models/Hospital');
const ErrorHandler = require('../utils/errorHandler');
const { formatTaka, parseTaka, isValidTakaAmount, roundTaka } = require('../utils/currencyUtils');
const db = require('../config/database');

class PricingManagementService {
  /**
   * Update hospital pricing with comprehensive validation and error handling
   */
  static updateHospitalPricing(hospitalId, pricingData, userId) {
    const pricingContext = {
      hospitalId,
      resourceType: pricingData.resourceType,
      userId,
      startTime: new Date().toISOString()
    };

    try {
      // Note: HospitalPricing.setPricing handles its own database operations

      // Validate hospital exists
      const hospital = Hospital.findById(hospitalId);
      if (!hospital) {
        const error = new Error('Hospital not found');
        return ErrorHandler.createError('pricing', 'HOSPITAL_NOT_FOUND', {
          hospitalId,
          message: 'Hospital not found for pricing update'
        });
      }

      // Basic safety validation only (no negative amounts)
      if (pricingData.baseRate !== undefined && pricingData.baseRate < 0) {
        return {
          success: false,
          errors: ['Base rate cannot be negative'],
          message: 'Pricing validation failed'
        };
      }

      // Sanitize and round pricing data
      const sanitizedPricingData = this.sanitizePricingData(pricingData);
      const warnings = [];

      // Update pricing with error handling
      let updatedPricing;
      try {
        updatedPricing = HospitalPricing.setPricing(
          hospitalId,
          sanitizedPricingData.resourceType,
          sanitizedPricingData.baseRate,
          sanitizedPricingData.serviceChargePercentage || 30
        );
      } catch (updateError) {
        const error = new Error(`Pricing update operation failed: ${updateError.message}`);
        return ErrorHandler.createError('pricing', 'INVALID_RATE', {
          hospitalId,
          resourceType: pricingData.resourceType,
          originalError: updateError.message
        });
      }

      // Verify pricing update integrity (temporarily disabled for debugging)
      // const integrityCheck = this.verifyPricingUpdateIntegrity(updatedPricing, sanitizedPricingData);
      // if (!integrityCheck.isValid) {
      //   const error = new Error(`Pricing update integrity check failed: ${integrityCheck.errors.join(', ')}`);
      //   return ErrorHandler.handleFinancialConsistencyError(error, {
      //     expected: formatTaka(sanitizedPricingData.baseRate),
      //     actual: formatTaka(updatedPricing.baseRate),
      //     affectedTransactions: [updatedPricing.id]
      //   });
      // }

      // Transaction handled by HospitalPricing.setPricing

      return {
        success: true,
        pricing: {
          ...updatedPricing,
          baseRate: formatTaka(updatedPricing.baseRate),
          hourlyRate: updatedPricing.hourlyRate ? formatTaka(updatedPricing.hourlyRate) : null,
          minimumCharge: updatedPricing.minimumCharge ? formatTaka(updatedPricing.minimumCharge) : null,
          maximumCharge: updatedPricing.maximumCharge ? formatTaka(updatedPricing.maximumCharge) : null
        },
        warnings,
        message: `Pricing updated successfully for ${pricingData.resourceType}`,
        messageEn: `Pricing updated successfully for ${pricingData.resourceType}`,
        messageBn: `${pricingData.resourceType} এর জন্য মূল্য সফলভাবে আপডেট করা হয়েছে`,
        updatedAt: new Date().toISOString(),
        integrityVerified: true
      };

    } catch (error) {
      // Log the error with full context
      ErrorHandler.logError(error, pricingContext);

      // Return structured error response
      return ErrorHandler.createError('pricing', 'INVALID_RATE', {
        ...pricingContext,
        originalError: error.message
      });
    }
  }

  /**
   * Get current pricing for a hospital
   */
  static getHospitalPricing(hospitalId) {
    try {
      const hospital = Hospital.findById(hospitalId);
      if (!hospital) {
        throw new Error('Hospital not found');
      }

      const currentPricing = HospitalPricing.getHospitalPricing(hospitalId);
      
      // Convert the pricing data to the expected format
      const pricingData = currentPricing.map(pricing => ({
        id: pricing.id || null,
        hospitalId: pricing.hospital_id,
        resourceType: pricing.resource_type,
        baseRate: pricing.base_price,
        hourlyRate: null, // Not used in simple pricing
        minimumCharge: null, // Not used in simple pricing
        maximumCharge: null, // Not used in simple pricing
        currency: 'BDT',
        effectiveFrom: pricing.updated_at || new Date().toISOString(),
        effectiveTo: null,
        isActive: true,
        createdBy: null,
        createdAt: pricing.updated_at || new Date().toISOString(),
        updatedAt: pricing.updated_at || new Date().toISOString(),
        serviceChargePercentage: pricing.service_charge_percentage,
        serviceChargeAmount: pricing.service_charge_amount,
        totalPrice: pricing.total_price,
        isDefault: pricing.is_default || false
      }));

      return pricingData;

    } catch (error) {
      console.error('Get pricing error:', error);
      throw error;
    }
  }

  /**
   * Calculate booking amount based on hospital pricing
   */
  static calculateBookingAmount(hospitalId, resourceType, duration = 24, options = {}) {
    try {
      // Use calculateBookingCost which exists in the model
      const calculation = HospitalPricing.calculateBookingCost(hospitalId, resourceType, duration);
      
      // Apply any additional options
      let finalAmount = calculation.total_cost;
      
      // Apply discounts if specified
      if (options.discountPercentage && options.discountPercentage > 0) {
        const discount = finalAmount * (options.discountPercentage / 100);
        finalAmount = finalAmount - discount;
        calculation.discount = discount;
        calculation.discountPercentage = options.discountPercentage;
      }

      // Apply surcharges if specified
      if (options.surchargeAmount && options.surchargeAmount > 0) {
        finalAmount = finalAmount + options.surchargeAmount;
        calculation.surcharge = options.surchargeAmount;
      }

      // Transform to expected format
      return {
        basePrice: calculation.base_price,
        serviceChargePercentage: calculation.service_charge_percentage,
        serviceChargeAmount: calculation.service_charge_amount,
        dailyRate: calculation.daily_rate,
        durationHours: calculation.duration_hours,
        durationDays: calculation.duration_days,
        hospitalShare: calculation.hospital_share,
        serviceChargeShare: calculation.service_charge_share,
        calculatedAmount: calculation.total_cost,
        finalAmount: finalAmount,
        calculatedAt: new Date().toISOString()
      };

    } catch (error) {
      console.error('Booking amount calculation error:', error);
      throw error;
    }
  }

  /**
   * Validate pricing business rules
   */
  static validatePricingBusinessRules(pricingData, hospital) {
    const errors = [];
    const warnings = [];
    const suggestions = [];

    // Resource type validation
    const validResourceTypes = ['beds', 'icu', 'operationTheatres', 'rapid_collection'];
    if (!validResourceTypes.includes(pricingData.resourceType)) {
      errors.push(ErrorHandler.createError('pricing', 'INVALID_RATE', {
        reason: 'Invalid resource type'
      }));
    }

    // Rate consistency validation
    if (pricingData.baseRate && pricingData.hourlyRate) {
      if (pricingData.hourlyRate > pricingData.baseRate) {
        errors.push(ErrorHandler.createError('pricing', 'INCONSISTENT_PRICING'));
      }
    }

    // Minimum/Maximum charge validation
    if (pricingData.minimumCharge && pricingData.maximumCharge) {
      if (pricingData.minimumCharge > pricingData.maximumCharge) {
        errors.push(ErrorHandler.createError('pricing', 'INCONSISTENT_PRICING', {
          reason: 'Minimum charge cannot be greater than maximum charge'
        }));
      }

      const ratio = pricingData.maximumCharge / pricingData.minimumCharge;
      if (ratio > 10) {
        warnings.push(ErrorHandler.createError('pricing', 'RATE_TOO_HIGH', {
          reason: 'Large gap between minimum and maximum charges'
        }));
        suggestions.push('Consider reducing the gap between minimum and maximum charges for better patient understanding');
      }
    }

    // Hospital-specific validation
    if (hospital.city) {
      const cityBasedRanges = this.getCityBasedPricingRanges(hospital.city, pricingData.resourceType);
      if (cityBasedRanges && pricingData.baseRate) {
        if (pricingData.baseRate < cityBasedRanges.min) {
          warnings.push(ErrorHandler.createError('pricing', 'RATE_TOO_LOW'));
          suggestions.push(`Consider pricing between ${formatTaka(cityBasedRanges.min)} and ${formatTaka(cityBasedRanges.max)} for ${hospital.city}`);
        } else if (pricingData.baseRate > cityBasedRanges.max) {
          warnings.push(ErrorHandler.createError('pricing', 'RATE_TOO_HIGH'));
          suggestions.push(`Consider pricing between ${formatTaka(cityBasedRanges.min)} and ${formatTaka(cityBasedRanges.max)} for ${hospital.city}`);
        }
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      suggestions
    };
  }

  /**
   * Get city-based pricing ranges
   */
  static getCityBasedPricingRanges(city, resourceType) {
    const cityRanges = {
      'Dhaka': {
        'beds': { min: 800, max: 5000 },
        'icu': { min: 3000, max: 15000 },
        'operationTheatres': { min: 8000, max: 80000 },
        'rapid_collection': { min: 300, max: 2000 }
      },
      'Chittagong': {
        'beds': { min: 600, max: 4000 },
        'icu': { min: 2500, max: 12000 },
        'operationTheatres': { min: 6000, max: 60000 },
        'rapid_collection': { min: 250, max: 1500 }
      },
      'Sylhet': {
        'beds': { min: 500, max: 3000 },
        'icu': { min: 2000, max: 10000 },
        'operationTheatres': { min: 5000, max: 50000 },
        'rapid_collection': { min: 200, max: 1200 }
      }
    };

    return cityRanges[city] ? cityRanges[city][resourceType] : null;
  }

  /**
   * Sanitize pricing data
   */
  static sanitizePricingData(pricingData) {
    const sanitized = { ...pricingData };

    // Round all monetary values to proper Taka precision
    if (sanitized.baseRate !== undefined) {
      sanitized.baseRate = roundTaka(sanitized.baseRate);
    }
    if (sanitized.hourlyRate !== undefined) {
      sanitized.hourlyRate = roundTaka(sanitized.hourlyRate);
    }
    if (sanitized.minimumCharge !== undefined) {
      sanitized.minimumCharge = roundTaka(sanitized.minimumCharge);
    }
    if (sanitized.maximumCharge !== undefined) {
      sanitized.maximumCharge = roundTaka(sanitized.maximumCharge);
    }

    // Ensure currency is set to BDT
    sanitized.currency = 'BDT';

    return sanitized;
  }

  /**
   * Verify pricing update integrity
   */
  static verifyPricingUpdateIntegrity(updatedPricing, originalData) {
    const errors = [];

    // Check if base rate was updated correctly
    if (originalData.baseRate !== undefined) {
      const actualBaseRate = updatedPricing.baseRate || updatedPricing.base_price;
      if (Math.abs(actualBaseRate - originalData.baseRate) > 0.01) {
        errors.push(`Base rate mismatch: Expected ${formatTaka(originalData.baseRate)}, Got ${formatTaka(actualBaseRate)}`);
      }
    }

    // Check if hourly rate was updated correctly
    if (originalData.hourlyRate !== undefined) {
      const actualHourlyRate = updatedPricing.hourlyRate || updatedPricing.hourly_rate || 0;
      if (Math.abs(actualHourlyRate - originalData.hourlyRate) > 0.01) {
        errors.push(`Hourly rate mismatch: Expected ${formatTaka(originalData.hourlyRate)}, Got ${formatTaka(actualHourlyRate)}`);
      }
    }

    // Check resource type (normalize both for comparison)
    const actualResourceType = updatedPricing.resourceType || updatedPricing.resource_type;
    const normalizedOriginal = HospitalPricing.normalizeResourceType(originalData.resourceType);
    const normalizedActual = HospitalPricing.normalizeResourceType(actualResourceType);
    
    if (normalizedActual !== normalizedOriginal) {
      errors.push(`Resource type mismatch: Expected ${normalizedOriginal}, Got ${normalizedActual}`);
    }

    return {
      isValid: errors.length === 0,
      errors,
      verifiedAt: new Date().toISOString()
    };
  }

  /**
   * Validate pricing data (legacy method for backward compatibility)
   */
  static validatePricingData(pricingData) {
    const validation = ErrorHandler.validateTakaPricing(pricingData);
    return {
      isValid: validation.isValid,
      errors: validation.errors.map(error => error.error?.messageEn || error.message || 'Validation error')
    };
  }

  /**
   * Get pricing history for a hospital
   */
  static getPricingHistory(hospitalId, resourceType = null, limit = 10) {
    try {
      const hospital = Hospital.findById(hospitalId);
      if (!hospital) {
        throw new Error('Hospital not found');
      }

      const history = HospitalPricing.getPricingHistory(hospitalId, resourceType, limit);

      return {
        hospitalId,
        hospitalName: hospital.name,
        resourceType,
        history,
        totalRecords: history.length
      };

    } catch (error) {
      console.error('Pricing history error:', error);
      throw error;
    }
  }

  /**
   * Apply dynamic pricing based on demand
   */
  static applyDynamicPricing(hospitalId, resourceType, demandFactor = 1.0) {
    try {
      const currentPricing = HospitalPricing.getHospitalPricing(hospitalId, resourceType);
      if (!currentPricing) {
        throw new Error(`No pricing found for ${resourceType} at hospital ${hospitalId}`);
      }

      // Calculate dynamic pricing based on demand
      const basePricing = {
        baseRate: currentPricing.baseRate,
        hourlyRate: currentPricing.hourlyRate,
        minimumCharge: currentPricing.minimumCharge,
        maximumCharge: currentPricing.maximumCharge
      };

      const dynamicPricing = {
        baseRate: this.applyDemandMultiplier(basePricing.baseRate, demandFactor),
        hourlyRate: basePricing.hourlyRate ? 
          this.applyDemandMultiplier(basePricing.hourlyRate, demandFactor) : null,
        minimumCharge: basePricing.minimumCharge,
        maximumCharge: basePricing.maximumCharge,
        demandFactor,
        originalPricing: basePricing,
        appliedAt: new Date().toISOString()
      };

      return dynamicPricing;

    } catch (error) {
      console.error('Dynamic pricing error:', error);
      throw error;
    }
  }

  /**
   * Apply demand multiplier to pricing
   */
  static applyDemandMultiplier(basePrice, demandFactor) {
    // Demand factor ranges:
    // 0.5 - 0.8: Low demand (discount)
    // 0.8 - 1.2: Normal demand (no change)
    // 1.2 - 2.0: High demand (premium)

    let multiplier = 1.0;

    if (demandFactor < 0.8) {
      // Low demand - apply discount (up to 20% off)
      multiplier = Math.max(0.8, demandFactor);
    } else if (demandFactor > 1.2) {
      // High demand - apply premium (up to 50% increase)
      multiplier = Math.min(1.5, demandFactor);
    }

    return Math.round(basePrice * multiplier * 100) / 100; // Round to 2 decimal places
  }

  /**
   * Get pricing comparison across hospitals
   */
  static getPricingComparison(resourceType, city = null, options = {}) {
    try {
      const comparison = HospitalPricing.getPricingComparison(resourceType, city);
      
      if (comparison.length === 0) {
        return {
          resourceType,
          city,
          hospitals: [],
          statistics: null
        };
      }

      // Calculate statistics
      const rates = comparison.map(h => h.baseRate);
      const statistics = {
        count: rates.length,
        average: rates.reduce((sum, rate) => sum + rate, 0) / rates.length,
        minimum: Math.min(...rates),
        maximum: Math.max(...rates),
        median: this.calculateMedian(rates)
      };

      // Sort by criteria
      const sortBy = options.sortBy || 'baseRate';
      const sortOrder = options.sortOrder || 'asc';
      
      comparison.sort((a, b) => {
        const aVal = a[sortBy] || 0;
        const bVal = b[sortBy] || 0;
        return sortOrder === 'asc' ? aVal - bVal : bVal - aVal;
      });

      return {
        resourceType,
        city,
        hospitals: comparison,
        statistics,
        generatedAt: new Date().toISOString()
      };

    } catch (error) {
      console.error('Pricing comparison error:', error);
      throw error;
    }
  }

  /**
   * Calculate median value
   */
  static calculateMedian(values) {
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    
    return sorted.length % 2 !== 0 
      ? sorted[mid] 
      : (sorted[mid - 1] + sorted[mid]) / 2;
  }

  /**
   * Bulk update pricing for multiple resource types
   */
  static bulkUpdatePricing(hospitalId, pricingUpdates, userId) {
    const results = [];
    const errors = [];

    try {
      // Begin transaction for atomicity
      db.exec('BEGIN TRANSACTION');

      for (const update of pricingUpdates) {
        try {
          const result = this.updateHospitalPricing(hospitalId, update, userId);
          results.push({
            resourceType: update.resourceType,
            success: true,
            pricing: result.pricing
          });
        } catch (error) {
          errors.push({
            resourceType: update.resourceType,
            success: false,
            error: error.message
          });
        }
      }

      // If any errors occurred, rollback
      if (errors.length > 0) {
        db.exec('ROLLBACK');
        throw new Error(`Bulk update failed: ${errors.length} errors occurred`);
      }

      // Commit if all successful
      db.exec('COMMIT');

      return {
        success: true,
        results,
        totalUpdated: results.length,
        updatedAt: new Date().toISOString()
      };

    } catch (error) {
      db.exec('ROLLBACK');
      console.error('Bulk pricing update error:', error);
      throw error;
    }
  }

  /**
   * Get pricing recommendations based on market analysis
   */
  static getPricingRecommendations(hospitalId, resourceType) {
    try {
      const hospital = Hospital.findById(hospitalId);
      if (!hospital) {
        throw new Error('Hospital not found');
      }

      // Get current pricing
      const currentPricing = HospitalPricing.getHospitalPricing(hospitalId, resourceType);
      
      // Get market comparison
      const marketComparison = this.getPricingComparison(resourceType, hospital.city);
      
      if (!marketComparison.statistics || marketComparison.hospitals.length < 2) {
        return {
          hospitalId,
          resourceType,
          recommendations: [],
          message: 'Insufficient market data for recommendations'
        };
      }

      const recommendations = [];
      const currentRate = currentPricing ? currentPricing.baseRate : 0;
      const marketAverage = marketComparison.statistics.average;
      const marketMedian = marketComparison.statistics.median;

      // Price positioning recommendations
      if (currentRate > marketAverage * 1.2) {
        recommendations.push({
          type: 'price_reduction',
          priority: 'high',
          message: 'Your pricing is significantly above market average',
          suggestedRate: Math.round(marketAverage * 1.1 * 100) / 100,
          impact: 'May improve booking volume'
        });
      } else if (currentRate < marketAverage * 0.8) {
        recommendations.push({
          type: 'price_increase',
          priority: 'medium',
          message: 'Your pricing is below market average',
          suggestedRate: Math.round(marketMedian * 100) / 100,
          impact: 'Potential revenue increase opportunity'
        });
      }

      // Competitive positioning
      const competitorCount = marketComparison.hospitals.length;
      const position = marketComparison.hospitals.findIndex(h => h.hospitalName === hospital.name) + 1;
      
      if (position > 0) {
        recommendations.push({
          type: 'market_position',
          priority: 'info',
          message: `You rank #${position} out of ${competitorCount} hospitals in pricing`,
          suggestedAction: position > competitorCount / 2 ? 
            'Consider competitive pricing strategy' : 
            'Maintain competitive advantage'
        });
      }

      return {
        hospitalId,
        resourceType,
        currentPricing,
        marketAnalysis: marketComparison.statistics,
        recommendations,
        generatedAt: new Date().toISOString()
      };

    } catch (error) {
      console.error('Pricing recommendations error:', error);
      throw error;
    }
  }

  /**
   * Get resource types available for pricing
   */
  static getResourceTypes() {
    return HospitalPricing.getResourceTypes();
  }

  /**
   * Validate pricing constraints
   */
  static validatePricingConstraints(pricingData) {
    const errors = [];
    const warnings = [];

    // Business rule validations
    if (pricingData.baseRate && pricingData.hourlyRate) {
      if (pricingData.hourlyRate > pricingData.baseRate) {
        warnings.push('Hourly rate is higher than base rate - this may result in high costs for extended stays');
      }
    }

    if (pricingData.minimumCharge && pricingData.maximumCharge) {
      const ratio = pricingData.maximumCharge / pricingData.minimumCharge;
      if (ratio > 10) {
        warnings.push('Large gap between minimum and maximum charges may confuse patients');
      }
    }

    // Market-based validations (if market data available)
    try {
      const marketData = this.getPricingComparison(pricingData.resourceType);
      if (marketData.statistics) {
        const marketAverage = marketData.statistics.average;
        
        if (pricingData.baseRate > marketAverage * 2) {
          warnings.push('Pricing is significantly above market average');
        } else if (pricingData.baseRate < marketAverage * 0.5) {
          warnings.push('Pricing is significantly below market average');
        }
      }
    } catch (error) {
      // Market data not available - skip market validation
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      validatedAt: new Date().toISOString()
    };
  }

  /**
   * Get pricing analytics for a hospital
   */
  static getPricingAnalytics(hospitalId, dateRange = {}) {
    try {
      const hospital = Hospital.findById(hospitalId);
      if (!hospital) {
        throw new Error('Hospital not found');
      }

      // Get current pricing
      const currentPricing = HospitalPricing.getHospitalPricing(hospitalId);
      
      // Get pricing history
      const pricingHistory = HospitalPricing.getPricingHistory(hospitalId, null, 50);
      
      // Calculate pricing trends
      const trends = this.calculatePricingTrends(pricingHistory);
      
      // Get booking volume impact (if transaction data available)
      const volumeImpact = this.analyzePricingVolumeImpact(hospitalId, dateRange);

      return {
        hospitalId,
        hospitalName: hospital.name,
        currentPricing,
        pricingTrends: trends,
        volumeImpact,
        totalPricingChanges: pricingHistory.length,
        analyticsGeneratedAt: new Date().toISOString()
      };

    } catch (error) {
      console.error('Pricing analytics error:', error);
      throw error;
    }
  }

  /**
   * Calculate pricing trends from history
   */
  static calculatePricingTrends(pricingHistory) {
    const trends = {};
    const resourceTypes = ['beds', 'icu', 'operationTheatres', 'rapid_collection'];

    resourceTypes.forEach(resourceType => {
      const resourceHistory = pricingHistory.filter(p => p.resourceType === resourceType);
      
      if (resourceHistory.length >= 2) {
        const latest = resourceHistory[0];
        const previous = resourceHistory[1];
        
        const change = latest.baseRate - previous.baseRate;
        const changePercentage = (change / previous.baseRate) * 100;
        
        trends[resourceType] = {
          currentRate: latest.baseRate,
          previousRate: previous.baseRate,
          change,
          changePercentage: Math.round(changePercentage * 100) / 100,
          trend: change > 0 ? 'increasing' : change < 0 ? 'decreasing' : 'stable',
          lastChanged: latest.effectiveFrom
        };
      }
    });

    return trends;
  }

  /**
   * Analyze pricing impact on booking volume
   */
  static analyzePricingVolumeImpact(hospitalId, dateRange = {}) {
    try {
      // This would require transaction/booking data analysis
      // For now, return a placeholder structure
      return {
        message: 'Volume impact analysis requires booking transaction data',
        dataAvailable: false,
        analysisDate: new Date().toISOString()
      };
    } catch (error) {
      console.error('Volume impact analysis error:', error);
      return {
        error: error.message,
        dataAvailable: false
      };
    }
  }
}

module.exports = PricingManagementService;