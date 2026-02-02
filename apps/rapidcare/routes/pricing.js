const express = require('express');
const router = express.Router();
const PricingManagementService = require('../services/pricingManagementService');
const { authenticate, requireOwnHospital } = require('../middleware/auth');

/**
 * @route   GET /api/hospitals/:id/pricing
 * @desc    Get current pricing for a hospital
 * @access  Public (for viewing) / Private (for management)
 */
router.get('/hospitals/:id/pricing', async (req, res) => {
  try {
    const hospitalId = parseInt(req.params.id);

    if (isNaN(hospitalId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid hospital ID'
      });
    }

    const pricing = PricingManagementService.getHospitalPricing(hospitalId);

    res.status(200).json({
      success: true,
      data: pricing
    });

  } catch (error) {
    console.error('Get hospital pricing error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to retrieve hospital pricing'
    });
  }
});

/**
 * @route   PUT /api/hospitals/:id/pricing
 * @desc    Update hospital pricing
 * @access  Private (hospital authority for own hospital)
 */
router.put('/hospitals/:id/pricing', authenticate, requireOwnHospital, async (req, res) => {
  try {
    const hospitalId = parseInt(req.params.id);
    const pricingData = req.body;

    if (isNaN(hospitalId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid hospital ID'
      });
    }

    // Validate required fields
    if (!pricingData.resourceType || !pricingData.baseRate) {
      return res.status(400).json({
        success: false,
        error: 'Resource type and base rate are required'
      });
    }

    const result = PricingManagementService.updateHospitalPricing(
      hospitalId,
      pricingData,
      req.user.id
    );

    // Check if the result indicates failure
    if (result && result.success === false) {
      // Extract error information
      const errorMessage = result.error?.messageEn || result.error?.message || result.message || 'Failed to update pricing';
      const errorCode = result.error?.code || 'PRICING_UPDATE_FAILED';
      
      return res.status(400).json({
        success: false,
        error: errorMessage,
        errorCode: errorCode,
        errors: result.errors || [],
        warnings: result.warnings || []
      });
    }

    // Check if result is valid and successful
    if (!result || !result.success) {
      return res.status(400).json({
        success: false,
        error: result?.message || 'Failed to update pricing',
        errors: result?.errors || []
      });
    }

    res.status(200).json({
      success: true,
      data: result,
      message: result.message || 'Pricing updated successfully'
    });

  } catch (error) {
    console.error('Update hospital pricing error:', error);
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to update hospital pricing'
    });
  }
});

/**
 * @route   GET /api/hospitals/:id/pricing/history
 * @desc    Get pricing history for a hospital
 * @access  Private (hospital authority for own hospital or admin)
 */
router.get('/hospitals/:id/pricing/history', authenticate, requireOwnHospital, async (req, res) => {
  try {
    const hospitalId = parseInt(req.params.id);
    const resourceType = req.query.resourceType;
    const limit = parseInt(req.query.limit) || 10;

    if (isNaN(hospitalId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid hospital ID'
      });
    }

    const history = PricingManagementService.getPricingHistory(hospitalId, resourceType, limit);

    res.status(200).json({
      success: true,
      data: history
    });

  } catch (error) {
    console.error('Get pricing history error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to retrieve pricing history'
    });
  }
});

/**
 * @route   POST /api/pricing/calculate
 * @desc    Calculate booking amount based on hospital pricing
 * @access  Public
 */
router.post('/calculate', async (req, res) => {
  try {
    const { hospitalId, resourceType, duration, options } = req.body;

    // Validate required fields
    if (!hospitalId || !resourceType) {
      return res.status(400).json({
        success: false,
        error: 'Hospital ID and resource type are required'
      });
    }

    const calculation = PricingManagementService.calculateBookingAmount(
      parseInt(hospitalId),
      resourceType,
      duration || 24,
      options || {}
    );

    res.status(200).json({
      success: true,
      data: calculation
    });

  } catch (error) {
    console.error('Calculate booking amount error:', error);
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to calculate booking amount'
    });
  }
});

/**
 * @route   POST /api/hospitals/:id/pricing/bulk
 * @desc    Bulk update pricing for multiple resource types
 * @access  Private (hospital authority for own hospital)
 */
router.post('/hospitals/:id/pricing/bulk', authenticate, requireOwnHospital, async (req, res) => {
  try {
    const hospitalId = parseInt(req.params.id);
    const { pricingUpdates } = req.body;

    if (isNaN(hospitalId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid hospital ID'
      });
    }

    if (!Array.isArray(pricingUpdates) || pricingUpdates.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Pricing updates array is required'
      });
    }

    const result = PricingManagementService.bulkUpdatePricing(
      hospitalId,
      pricingUpdates,
      req.user.id
    );

    res.status(200).json({
      success: true,
      data: result,
      message: 'Bulk pricing update completed successfully'
    });

  } catch (error) {
    console.error('Bulk pricing update error:', error);
    res.status(400).json({
      success: false,
      error: error.message || 'Bulk pricing update failed'
    });
  }
});

/**
 * @route   GET /api/pricing/comparison
 * @desc    Get pricing comparison across hospitals
 * @access  Public
 */
router.get('/comparison', async (req, res) => {
  try {
    const { resourceType, city, sortBy, sortOrder } = req.query;

    if (!resourceType) {
      return res.status(400).json({
        success: false,
        error: 'Resource type is required'
      });
    }

    const options = {
      sortBy: sortBy || 'baseRate',
      sortOrder: sortOrder || 'asc'
    };

    const comparison = PricingManagementService.getPricingComparison(
      resourceType,
      city,
      options
    );

    res.status(200).json({
      success: true,
      data: comparison
    });

  } catch (error) {
    console.error('Pricing comparison error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to retrieve pricing comparison'
    });
  }
});

/**
 * @route   GET /api/hospitals/:id/pricing/recommendations
 * @desc    Get pricing recommendations for a hospital
 * @access  Private (hospital authority for own hospital)
 */
router.get('/hospitals/:id/pricing/recommendations', authenticate, requireOwnHospital, async (req, res) => {
  try {
    const hospitalId = parseInt(req.params.id);
    const { resourceType } = req.query;

    if (isNaN(hospitalId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid hospital ID'
      });
    }

    if (!resourceType) {
      return res.status(400).json({
        success: false,
        error: 'Resource type is required'
      });
    }

    const recommendations = PricingManagementService.getPricingRecommendations(
      hospitalId,
      resourceType
    );

    res.status(200).json({
      success: true,
      data: recommendations
    });

  } catch (error) {
    console.error('Pricing recommendations error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to retrieve pricing recommendations'
    });
  }
});

/**
 * @route   GET /api/hospitals/:id/pricing/analytics
 * @desc    Get pricing analytics for a hospital
 * @access  Private (hospital authority for own hospital)
 */
router.get('/hospitals/:id/pricing/analytics', authenticate, requireOwnHospital, async (req, res) => {
  try {
    const hospitalId = parseInt(req.params.id);
    const { startDate, endDate } = req.query;

    if (isNaN(hospitalId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid hospital ID'
      });
    }

    const dateRange = {};
    if (startDate) dateRange.startDate = startDate;
    if (endDate) dateRange.endDate = endDate;

    const analytics = PricingManagementService.getPricingAnalytics(hospitalId, dateRange);

    res.status(200).json({
      success: true,
      data: analytics
    });

  } catch (error) {
    console.error('Pricing analytics error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to retrieve pricing analytics'
    });
  }
});

/**
 * @route   POST /api/pricing/validate
 * @desc    Validate pricing data
 * @access  Private (authenticated users)
 */
router.post('/validate', authenticate, async (req, res) => {
  try {
    const { pricingData } = req.body;

    if (!pricingData) {
      return res.status(400).json({
        success: false,
        error: 'Pricing data is required'
      });
    }

    // Basic validation only - no business rules enforcement
    const errors = [];
    if (pricingData.baseRate !== undefined && pricingData.baseRate < 0) {
      errors.push('Base rate cannot be negative');
    }

    res.status(200).json({
      success: true,
      data: {
        validation: {
          isValid: errors.length === 0,
          errors
        },
        constraints: {
          isValid: true,
          errors: [],
          warnings: []
        }
      }
    });

  } catch (error) {
    console.error('Pricing validation error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Pricing validation failed'
    });
  }
});

/**
 * @route   POST /api/hospitals/:id/pricing/dynamic
 * @desc    Apply dynamic pricing based on demand
 * @access  Private (hospital authority for own hospital)
 */
router.post('/hospitals/:id/pricing/dynamic', authenticate, requireOwnHospital, async (req, res) => {
  try {
    const hospitalId = parseInt(req.params.id);
    const { resourceType, demandFactor } = req.body;

    if (isNaN(hospitalId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid hospital ID'
      });
    }

    if (!resourceType || demandFactor === undefined) {
      return res.status(400).json({
        success: false,
        error: 'Resource type and demand factor are required'
      });
    }

    const dynamicPricing = PricingManagementService.applyDynamicPricing(
      hospitalId,
      resourceType,
      parseFloat(demandFactor)
    );

    res.status(200).json({
      success: true,
      data: dynamicPricing,
      message: 'Dynamic pricing applied successfully'
    });

  } catch (error) {
    console.error('Dynamic pricing error:', error);
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to apply dynamic pricing'
    });
  }
});

/**
 * @route   GET /api/pricing/resource-types
 * @desc    Get available resource types for pricing
 * @access  Public
 */
router.get('/resource-types', async (req, res) => {
  try {
    const resourceTypes = PricingManagementService.getResourceTypes();

    res.status(200).json({
      success: true,
      data: resourceTypes
    });

  } catch (error) {
    console.error('Get resource types error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to retrieve resource types'
    });
  }
});

module.exports = router;