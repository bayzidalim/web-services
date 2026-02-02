const db = require('../config/database');
const Hospital = require('../models/Hospital');

const ResourceAuditLog = require('../models/ResourceAuditLog');

/**
 * Analytics Service
 * 
 * Provides comprehensive analytics and reporting functionality for:
 * - Resource utilization calculations
 * - Booking history analytics with filtering and charts
 * - Resource usage pattern analysis and reporting
 * - Performance metrics for hospital authorities
 */
class AnalyticsService {
  /**
   * Get resource utilization analytics for a hospital
   * @param {number} hospitalId - Hospital ID
   * @param {Object} options - Query options
   * @param {Date} options.startDate - Start date for analysis
   * @param {Date} options.endDate - End date for analysis
   * @param {string} options.resourceType - Filter by resource type
   * @returns {Object} Resource utilization analytics
   */
  static getResourceUtilizationAnalytics(hospitalId, options = {}) {
    try {
      // Get current resource status
      const currentResources = Hospital.getResources(hospitalId);
      
      // Get resource audit logs for the period
      const auditLogs = ResourceAuditLog.getByHospital(hospitalId, {
        startDate: options.startDate,
        endDate: options.endDate,
        resourceType: options.resourceType
      });

      // Calculate utilization metrics
      const utilizationMetrics = this._calculateUtilizationMetrics(currentResources, auditLogs, options);
      
      // Get peak usage patterns
      const peakUsagePatterns = this._calculatePeakUsagePatterns(hospitalId, options);
      
      // Get resource efficiency metrics
      const efficiencyMetrics = this._calculateResourceEfficiency(hospitalId, options);

      return {
        hospitalId,
        period: {
          startDate: options.startDate,
          endDate: options.endDate
        },
        currentResources: currentResources.map(resource => ({
          ...resource,
          utilizationPercentage: resource.total > 0 ? 
            Math.round((resource.occupied / resource.total) * 100) : 0,
          availabilityPercentage: resource.total > 0 ? 
            Math.round((resource.available / resource.total) * 100) : 0
        })),
        utilizationMetrics,
        peakUsagePatterns,
        efficiencyMetrics,
        totalAuditEvents: auditLogs.length,
        generatedAt: new Date().toISOString()
      };
    } catch (error) {
      console.error('Resource utilization analytics error:', error);
      throw error;
    }
  }

  /**
   * Get booking history analytics with filtering and charts data
   * @param {number} hospitalId - Hospital ID
   * @param {Object} options - Query options
   * @returns {Object} Booking analytics with chart data
   */
  static getBookingHistoryAnalytics(hospitalId, options = {}) {
    try {
      // Get booking statistics
      const bookingStats = this._getBookingStatistics(hospitalId, options);
      
      // Get booking trends over time
      const bookingTrends = this._getBookingTrends(hospitalId, options);
      
      // Get resource demand patterns
      const resourceDemand = this._getResourceDemandPatterns(hospitalId, options);
      
      // Get approval metrics
      const approvalMetrics = this._getApprovalMetrics(hospitalId, options);
      
      // Get patient demographics
      const patientDemographics = this._getPatientDemographics(hospitalId, options);

      return {
        hospitalId,
        period: {
          startDate: options.startDate,
          endDate: options.endDate
        },
        bookingStats,
        bookingTrends,
        resourceDemand,
        approvalMetrics,
        patientDemographics,
        generatedAt: new Date().toISOString()
      };
    } catch (error) {
      console.error('Booking history analytics error:', error);
      throw error;
    }
  }

  /**
   * Get resource usage pattern analysis
   * @param {number} hospitalId - Hospital ID
   * @param {Object} options - Query options
   * @returns {Object} Usage pattern analysis
   */
  static getResourceUsagePatterns(hospitalId, options = {}) {
    try {
      // Get hourly usage patterns
      const hourlyPatterns = this._getHourlyUsagePatterns(hospitalId, options);
      
      // Get daily usage patterns
      const dailyPatterns = this._getDailyUsagePatterns(hospitalId, options);
      
      // Get weekly usage patterns
      const weeklyPatterns = this._getWeeklyUsagePatterns(hospitalId, options);
      
      // Get seasonal patterns
      const seasonalPatterns = this._getSeasonalPatterns(hospitalId, options);
      
      // Get resource correlation analysis
      const correlationAnalysis = this._getResourceCorrelationAnalysis(hospitalId, options);

      return {
        hospitalId,
        period: {
          startDate: options.startDate,
          endDate: options.endDate
        },
        hourlyPatterns,
        dailyPatterns,
        weeklyPatterns,
        seasonalPatterns,
        correlationAnalysis,
        generatedAt: new Date().toISOString()
      };
    } catch (error) {
      console.error('Resource usage pattern analysis error:', error);
      throw error;
    }
  }

  /**
   * Get performance metrics dashboard data
   * @param {number} hospitalId - Hospital ID
   * @param {Object} options - Query options
   * @returns {Object} Performance metrics
   */
  static getPerformanceMetrics(hospitalId, options = {}) {
    try {
      // Get response time metrics
      const responseTimeMetrics = this._getResponseTimeMetrics(hospitalId, options);
      
      // Get resource turnover metrics
      const turnoverMetrics = this._getResourceTurnoverMetrics(hospitalId, options);
      
      // Get patient satisfaction indicators
      const satisfactionMetrics = this._getPatientSatisfactionMetrics(hospitalId, options);
      
      // Get operational efficiency metrics
      const efficiencyMetrics = this._getOperationalEfficiencyMetrics(hospitalId, options);
      
      // Get capacity planning recommendations
      const capacityRecommendations = this._getCapacityPlanningRecommendations(hospitalId, options);

      return {
        hospitalId,
        period: {
          startDate: options.startDate,
          endDate: options.endDate
        },
        responseTimeMetrics,
        turnoverMetrics,
        satisfactionMetrics,
        efficiencyMetrics,
        capacityRecommendations,
        generatedAt: new Date().toISOString()
      };
    } catch (error) {
      console.error('Performance metrics error:', error);
      throw error;
    }
  }

  /**
   * Get comprehensive analytics dashboard data
   * @param {number} hospitalId - Hospital ID
   * @param {Object} options - Query options
   * @returns {Object} Complete analytics dashboard data
   */
  static getAnalyticsDashboard(hospitalId, options = {}) {
    try {
      const resourceAnalytics = this.getResourceUtilizationAnalytics(hospitalId, options);
      const bookingAnalytics = this.getBookingHistoryAnalytics(hospitalId, options);
      const usagePatterns = this.getResourceUsagePatterns(hospitalId, options);
      const performanceMetrics = this.getPerformanceMetrics(hospitalId, options);

      return {
        hospitalId,
        period: {
          startDate: options.startDate,
          endDate: options.endDate
        },
        resourceUtilization: resourceAnalytics,
        bookingHistory: bookingAnalytics,
        usagePatterns,
        performance: performanceMetrics,
        generatedAt: new Date().toISOString()
      };
    } catch (error) {
      console.error('Analytics dashboard error:', error);
      throw error;
    }
  }

  // Private helper methods for calculations

  /**
   * Calculate utilization metrics from audit logs
   * @private
   */
  static _calculateUtilizationMetrics(currentResources, auditLogs) {
    const metrics = {};
    
    currentResources.forEach(resource => {
      const resourceLogs = auditLogs.filter(log => log.resourceType === resource.resourceType);
      
      metrics[resource.resourceType] = {
        currentUtilization: resource.total > 0 ? 
          Math.round((resource.occupied / resource.total) * 100) : 0,
        averageUtilization: this._calculateAverageUtilization(resourceLogs, resource),
        peakUtilization: this._calculatePeakUtilization(resourceLogs, resource),
        totalChanges: resourceLogs.length,
        manualUpdates: resourceLogs.filter(log => log.changeType === 'manual_update').length,
        bookingAllocations: resourceLogs.filter(log => log.changeType === 'booking_approved').length
      };
    });
    
    return metrics;
  }

  /**
   * Calculate average utilization from audit logs
   * @private
   */
  static _calculateAverageUtilization(logs, resource) {
    if (logs.length === 0) return 0;
    
    // This is a simplified calculation - in a real scenario, you'd want to 
    // calculate time-weighted averages based on the duration of each state
    const utilizationSum = logs.reduce((sum, log) => {
      if (log.newValue !== null && resource.total > 0) {
        return sum + ((resource.total - log.newValue) / resource.total * 100);
      }
      return sum;
    }, 0);
    
    return Math.round(utilizationSum / logs.length);
  }

  /**
   * Calculate peak utilization
   * @private
   */
  static _calculatePeakUtilization(logs, resource) {
    if (logs.length === 0 || resource.total === 0) return 0;
    
    let maxOccupied = resource.occupied;
    logs.forEach(log => {
      if (log.newValue !== null) {
        const occupied = resource.total - log.newValue;
        if (occupied > maxOccupied) {
          maxOccupied = occupied;
        }
      }
    });
    
    return Math.round((maxOccupied / resource.total) * 100);
  }

  /**
   * Calculate peak usage patterns
   * @private
   */
  static _calculatePeakUsagePatterns(hospitalId, options) {
    const stmt = db.prepare(`
      SELECT 
        strftime('%H', b.createdAt) as hour,
        strftime('%w', b.createdAt) as dayOfWeek,
        b.resourceType,
        COUNT(*) as bookingCount
      FROM bookings b
      WHERE b.hospitalId = ? 
        AND b.status IN ('approved', 'completed')
        ${options.startDate ? 'AND b.createdAt >= ?' : ''}
        ${options.endDate ? 'AND b.createdAt <= ?' : ''}
      GROUP BY hour, dayOfWeek, resourceType
      ORDER BY bookingCount DESC
    `);
    
    const params = [hospitalId];
    if (options.startDate) params.push(options.startDate);
    if (options.endDate) params.push(options.endDate);
    
    const results = stmt.all(...params);
    
    return {
      peakHours: this._groupBy(results, 'hour'),
      peakDays: this._groupBy(results, 'dayOfWeek'),
      resourceDemand: this._groupBy(results, 'resourceType')
    };
  }

  /**
   * Calculate resource efficiency metrics
   * @private
   */
  static _calculateResourceEfficiency(hospitalId, options) {
    const stmt = db.prepare(`
      SELECT 
        b.resourceType,
        AVG(julianday(b.updatedAt) - julianday(b.createdAt)) as avgProcessingTime,
        COUNT(CASE WHEN b.status = 'approved' THEN 1 END) as approvedCount,
        COUNT(CASE WHEN b.status = 'declined' THEN 1 END) as declinedCount,
        COUNT(*) as totalRequests
      FROM bookings b
      WHERE b.hospitalId = ?
        ${options.startDate ? 'AND b.createdAt >= ?' : ''}
        ${options.endDate ? 'AND b.createdAt <= ?' : ''}
      GROUP BY b.resourceType
    `);
    
    const params = [hospitalId];
    if (options.startDate) params.push(options.startDate);
    if (options.endDate) params.push(options.endDate);
    
    const results = stmt.all(...params);
    
    return results.map(result => ({
      resourceType: result.resourceType,
      avgProcessingTime: Math.round(result.avgProcessingTime * 24 * 60), // Convert to minutes
      approvalRate: result.totalRequests > 0 ? 
        Math.round((result.approvedCount / result.totalRequests) * 100) : 0,
      declineRate: result.totalRequests > 0 ? 
        Math.round((result.declinedCount / result.totalRequests) * 100) : 0,
      totalRequests: result.totalRequests
    }));
  }

  /**
   * Get booking statistics
   * @private
   */
  static _getBookingStatistics(hospitalId, options) {
    const stmt = db.prepare(`
      SELECT 
        status,
        resourceType,
        urgency,
        COUNT(*) as count,
        AVG(paymentAmount) as avgAmount,
        SUM(paymentAmount) as totalAmount
      FROM bookings
      WHERE hospitalId = ?
        ${options.startDate ? 'AND createdAt >= ?' : ''}
        ${options.endDate ? 'AND createdAt <= ?' : ''}
        ${options.status ? 'AND status = ?' : ''}
        ${options.resourceType ? 'AND resourceType = ?' : ''}
      GROUP BY status, resourceType, urgency
      ORDER BY count DESC
    `);
    
    const params = [hospitalId];
    if (options.startDate) params.push(options.startDate);
    if (options.endDate) params.push(options.endDate);
    if (options.status) params.push(options.status);
    if (options.resourceType) params.push(options.resourceType);
    
    return stmt.all(...params);
  }

  /**
   * Get booking trends over time
   * @private
   */
  static _getBookingTrends(hospitalId, options) {
    const stmt = db.prepare(`
      SELECT 
        DATE(createdAt) as date,
        status,
        resourceType,
        COUNT(*) as count
      FROM bookings
      WHERE hospitalId = ?
        ${options.startDate ? 'AND createdAt >= ?' : ''}
        ${options.endDate ? 'AND createdAt <= ?' : ''}
      GROUP BY DATE(createdAt), status, resourceType
      ORDER BY date DESC
    `);
    
    const params = [hospitalId];
    if (options.startDate) params.push(options.startDate);
    if (options.endDate) params.push(options.endDate);
    
    return stmt.all(...params);
  }

  /**
   * Get resource demand patterns
   * @private
   */
  static _getResourceDemandPatterns(hospitalId, options) {
    const stmt = db.prepare(`
      SELECT 
        resourceType,
        urgency,
        strftime('%H', createdAt) as hour,
        strftime('%w', createdAt) as dayOfWeek,
        COUNT(*) as demandCount
      FROM bookings
      WHERE hospitalId = ?
        ${options.startDate ? 'AND createdAt >= ?' : ''}
        ${options.endDate ? 'AND createdAt <= ?' : ''}
      GROUP BY resourceType, urgency, hour, dayOfWeek
      ORDER BY demandCount DESC
    `);
    
    const params = [hospitalId];
    if (options.startDate) params.push(options.startDate);
    if (options.endDate) params.push(options.endDate);
    
    return stmt.all(...params);
  }

  /**
   * Get approval metrics
   * @private
   */
  static _getApprovalMetrics(hospitalId, options) {
    const stmt = db.prepare(`
      SELECT 
        COUNT(*) as totalBookings,
        COUNT(CASE WHEN status = 'approved' THEN 1 END) as approvedBookings,
        COUNT(CASE WHEN status = 'declined' THEN 1 END) as declinedBookings,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pendingBookings,
        AVG(CASE 
          WHEN approvedAt IS NOT NULL 
          THEN julianday(approvedAt) - julianday(createdAt) 
        END) as avgApprovalTime
      FROM bookings
      WHERE hospitalId = ?
        ${options.startDate ? 'AND createdAt >= ?' : ''}
        ${options.endDate ? 'AND createdAt <= ?' : ''}
    `);
    
    const params = [hospitalId];
    if (options.startDate) params.push(options.startDate);
    if (options.endDate) params.push(options.endDate);
    
    const result = stmt.get(...params);
    
    return {
      ...result,
      approvalRate: result.totalBookings > 0 ? 
        Math.round((result.approvedBookings / result.totalBookings) * 100) : 0,
      declineRate: result.totalBookings > 0 ? 
        Math.round((result.declinedBookings / result.totalBookings) * 100) : 0,
      avgApprovalTimeHours: result.avgApprovalTime ? 
        Math.round(result.avgApprovalTime * 24 * 100) / 100 : 0
    };
  }

  /**
   * Get patient demographics
   * @private
   */
  static _getPatientDemographics(hospitalId, options) {
    const stmt = db.prepare(`
      SELECT 
        patientGender,
        CASE 
          WHEN patientAge < 18 THEN 'Under 18'
          WHEN patientAge < 35 THEN '18-34'
          WHEN patientAge < 55 THEN '35-54'
          WHEN patientAge < 75 THEN '55-74'
          ELSE '75+'
        END as ageGroup,
        urgency,
        COUNT(*) as count
      FROM bookings
      WHERE hospitalId = ?
        ${options.startDate ? 'AND createdAt >= ?' : ''}
        ${options.endDate ? 'AND createdAt <= ?' : ''}
      GROUP BY patientGender, ageGroup, urgency
      ORDER BY count DESC
    `);
    
    const params = [hospitalId];
    if (options.startDate) params.push(options.startDate);
    if (options.endDate) params.push(options.endDate);
    
    return stmt.all(...params);
  }

  // Additional private helper methods would continue here...
  // For brevity, I'll include a few key ones:

  /**
   * Get hourly usage patterns
   * @private
   */
  static _getHourlyUsagePatterns(hospitalId, options) {
    const stmt = db.prepare(`
      SELECT 
        strftime('%H', createdAt) as hour,
        resourceType,
        COUNT(*) as bookingCount,
        AVG(CASE WHEN status = 'approved' THEN 1.0 ELSE 0.0 END) as approvalRate
      FROM bookings
      WHERE hospitalId = ?
        ${options.startDate ? 'AND createdAt >= ?' : ''}
        ${options.endDate ? 'AND createdAt <= ?' : ''}
      GROUP BY hour, resourceType
      ORDER BY hour
    `);
    
    const params = [hospitalId];
    if (options.startDate) params.push(options.startDate);
    if (options.endDate) params.push(options.endDate);
    
    return stmt.all(...params);
  }

  /**
   * Get daily usage patterns
   * @private
   */
  static _getDailyUsagePatterns(hospitalId, options) {
    const stmt = db.prepare(`
      SELECT 
        strftime('%w', createdAt) as dayOfWeek,
        resourceType,
        COUNT(*) as bookingCount,
        AVG(CASE WHEN status = 'approved' THEN 1.0 ELSE 0.0 END) as approvalRate
      FROM bookings
      WHERE hospitalId = ?
        ${options.startDate ? 'AND createdAt >= ?' : ''}
        ${options.endDate ? 'AND createdAt <= ?' : ''}
      GROUP BY dayOfWeek, resourceType
      ORDER BY dayOfWeek
    `);
    
    const params = [hospitalId];
    if (options.startDate) params.push(options.startDate);
    if (options.endDate) params.push(options.endDate);
    
    return stmt.all(...params);
  }

  /**
   * Get weekly usage patterns
   * @private
   */
  static _getWeeklyUsagePatterns(hospitalId, options) {
    const stmt = db.prepare(`
      SELECT 
        strftime('%Y-%W', createdAt) as week,
        resourceType,
        COUNT(*) as bookingCount,
        AVG(CASE WHEN status = 'approved' THEN 1.0 ELSE 0.0 END) as approvalRate
      FROM bookings
      WHERE hospitalId = ?
        ${options.startDate ? 'AND createdAt >= ?' : ''}
        ${options.endDate ? 'AND createdAt <= ?' : ''}
      GROUP BY week, resourceType
      ORDER BY week DESC
      LIMIT 12
    `);
    
    const params = [hospitalId];
    if (options.startDate) params.push(options.startDate);
    if (options.endDate) params.push(options.endDate);
    
    return stmt.all(...params);
  }

  /**
   * Get seasonal patterns
   * @private
   */
  static _getSeasonalPatterns(hospitalId, options) {
    const stmt = db.prepare(`
      SELECT 
        strftime('%m', createdAt) as month,
        resourceType,
        COUNT(*) as bookingCount,
        AVG(CASE WHEN status = 'approved' THEN 1.0 ELSE 0.0 END) as approvalRate
      FROM bookings
      WHERE hospitalId = ?
        ${options.startDate ? 'AND createdAt >= ?' : ''}
        ${options.endDate ? 'AND createdAt <= ?' : ''}
      GROUP BY month, resourceType
      ORDER BY month
    `);
    
    const params = [hospitalId];
    if (options.startDate) params.push(options.startDate);
    if (options.endDate) params.push(options.endDate);
    
    return stmt.all(...params);
  }

  /**
   * Get resource correlation analysis
   * @private
   */
  static _getResourceCorrelationAnalysis(hospitalId, options) {
    // This is a simplified correlation analysis
    // In a real implementation, you might want more sophisticated statistical analysis
    const stmt = db.prepare(`
      SELECT 
        DATE(createdAt) as date,
        resourceType,
        COUNT(*) as dailyDemand
      FROM bookings
      WHERE hospitalId = ?
        ${options.startDate ? 'AND createdAt >= ?' : ''}
        ${options.endDate ? 'AND createdAt <= ?' : ''}
      GROUP BY DATE(createdAt), resourceType
      ORDER BY date
    `);
    
    const params = [hospitalId];
    if (options.startDate) params.push(options.startDate);
    if (options.endDate) params.push(options.endDate);
    
    return stmt.all(...params);
  }

  /**
   * Get response time metrics
   * @private
   */
  static _getResponseTimeMetrics(hospitalId, options) {
    const stmt = db.prepare(`
      SELECT 
        resourceType,
        AVG(julianday(COALESCE(approvedAt, updatedAt)) - julianday(createdAt)) * 24 * 60 as avgResponseMinutes,
        MIN(julianday(COALESCE(approvedAt, updatedAt)) - julianday(createdAt)) * 24 * 60 as minResponseMinutes,
        MAX(julianday(COALESCE(approvedAt, updatedAt)) - julianday(createdAt)) * 24 * 60 as maxResponseMinutes,
        COUNT(*) as totalProcessed
      FROM bookings
      WHERE hospitalId = ? 
        AND status IN ('approved', 'declined')
        ${options.startDate ? 'AND createdAt >= ?' : ''}
        ${options.endDate ? 'AND createdAt <= ?' : ''}
      GROUP BY resourceType
    `);
    
    const params = [hospitalId];
    if (options.startDate) params.push(options.startDate);
    if (options.endDate) params.push(options.endDate);
    
    return stmt.all(...params);
  }

  /**
   * Get resource turnover metrics
   * @private
   */
  static _getResourceTurnoverMetrics(hospitalId, options) {
    const stmt = db.prepare(`
      SELECT 
        resourceType,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as completedBookings,
        AVG(CASE 
          WHEN status = 'completed' AND estimatedDuration IS NOT NULL 
          THEN estimatedDuration 
        END) as avgDuration,
        COUNT(*) as totalBookings
      FROM bookings
      WHERE hospitalId = ?
        ${options.startDate ? 'AND createdAt >= ?' : ''}
        ${options.endDate ? 'AND createdAt <= ?' : ''}
      GROUP BY resourceType
    `);
    
    const params = [hospitalId];
    if (options.startDate) params.push(options.startDate);
    if (options.endDate) params.push(options.endDate);
    
    return stmt.all(...params);
  }

  /**
   * Get patient satisfaction metrics (simplified)
   * @private
   */
  static _getPatientSatisfactionMetrics(hospitalId, options) {
    // This is a simplified implementation
    // In a real system, you'd have patient feedback data
    const stmt = db.prepare(`
      SELECT 
        resourceType,
        COUNT(CASE WHEN status = 'approved' THEN 1 END) as approvedCount,
        COUNT(CASE WHEN status = 'declined' THEN 1 END) as declinedCount,
        AVG(julianday(COALESCE(approvedAt, updatedAt)) - julianday(createdAt)) * 24 as avgResponseHours,
        COUNT(*) as totalRequests
      FROM bookings
      WHERE hospitalId = ?
        ${options.startDate ? 'AND createdAt >= ?' : ''}
        ${options.endDate ? 'AND createdAt <= ?' : ''}
      GROUP BY resourceType
    `);
    
    const params = [hospitalId];
    if (options.startDate) params.push(options.startDate);
    if (options.endDate) params.push(options.endDate);
    
    const results = stmt.all(...params);
    
    return results.map(result => ({
      ...result,
      satisfactionScore: this._calculateSatisfactionScore(result),
      approvalRate: result.totalRequests > 0 ? 
        Math.round((result.approvedCount / result.totalRequests) * 100) : 0
    }));
  }

  /**
   * Calculate satisfaction score based on approval rate and response time
   * @private
   */
  static _calculateSatisfactionScore(metrics) {
    const approvalRate = metrics.totalRequests > 0 ? 
      (metrics.approvedCount / metrics.totalRequests) : 0;
    const responseTimeFactor = Math.max(0, 1 - (metrics.avgResponseHours / 24)); // Penalty for slow response
    
    return Math.round((approvalRate * 0.7 + responseTimeFactor * 0.3) * 100);
  }

  /**
   * Get operational efficiency metrics
   * @private
   */
  static _getOperationalEfficiencyMetrics(hospitalId, options) {
    const resourceUtilization = Hospital.getResourceUtilization(hospitalId);
    const auditStats = ResourceAuditLog.getChangeStatistics(hospitalId, options);
    
    return {
      resourceUtilization,
      auditStats,
      efficiencyScore: this._calculateEfficiencyScore(resourceUtilization, auditStats)
    };
  }

  /**
   * Calculate efficiency score
   * @private
   */
  static _calculateEfficiencyScore(utilization, auditStats) {
    // Simplified efficiency calculation
    const avgUtilization = utilization.reduce((sum, resource) => 
      sum + resource.utilizationPercentage, 0) / utilization.length;
    
    const totalChanges = auditStats.reduce((sum, stat) => sum + stat.changeCount, 0);
    const changeFrequency = totalChanges / Math.max(utilization.length, 1);
    
    // Higher utilization is better, but too many changes might indicate instability
    const utilizationScore = Math.min(avgUtilization, 85); // Cap at 85% for optimal efficiency
    const stabilityScore = Math.max(0, 100 - changeFrequency * 2);
    
    return Math.round((utilizationScore * 0.6 + stabilityScore * 0.4));
  }

  /**
   * Get capacity planning recommendations
   * @private
   */
  static _getCapacityPlanningRecommendations(hospitalId, options) {
    const utilization = Hospital.getResourceUtilization(hospitalId);

    
    const recommendations = [];
    
    utilization.forEach(resource => {
      if (resource.utilizationPercentage > 90) {
        recommendations.push({
          resourceType: resource.resourceType,
          type: 'increase_capacity',
          priority: 'high',
          message: `${resource.resourceType} utilization is ${resource.utilizationPercentage}%. Consider increasing capacity.`,
          suggestedIncrease: Math.ceil(resource.total * 0.2)
        });
      } else if (resource.utilizationPercentage < 30) {
        recommendations.push({
          resourceType: resource.resourceType,
          type: 'optimize_capacity',
          priority: 'medium',
          message: `${resource.resourceType} utilization is only ${resource.utilizationPercentage}%. Consider optimizing allocation.`,
          potentialReduction: Math.floor(resource.total * 0.1)
        });
      }
    });
    
    return recommendations;
  }

  /**
   * Group array by key
   * @private
   */
  static _groupBy(array, key) {
    return array.reduce((groups, item) => {
      const group = item[key];
      groups[group] = groups[group] || [];
      groups[group].push(item);
      return groups;
    }, {});
  }
}

module.exports = AnalyticsService;