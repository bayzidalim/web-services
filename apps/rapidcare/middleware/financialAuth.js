const jwt = require('jsonwebtoken');
const auditService = require('../services/auditService');
const fraudDetectionService = require('../services/fraudDetectionService');

/**
 * Financial operation authorization middleware with role-based access control
 */
const financialAuth = {
  /**
   * Verify user has permission for financial operations
   */
  requireFinancialAccess: (requiredRoles = []) => {
    return async (req, res, next) => {
      try {
        // Extract token from header
        const token = req.header('Authorization')?.replace('Bearer ', '');
        
        if (!token) {
          await auditService.logSecurityEvent({
            eventType: 'UNAUTHORIZED_FINANCIAL_ACCESS',
            userId: null,
            ipAddress: req.ip,
            userAgent: req.get('User-Agent'),
            sessionId: req.sessionID,
            eventData: { endpoint: req.path, method: req.method },
            severity: 'HIGH'
          });

          return res.status(401).json({
            success: false,
            error: 'Access denied. Authentication token required for financial operations.'
          });
        }

        // Verify token
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded;

        // Check if user role is authorized for financial operations
        const userRole = decoded.role || 'user';
        const authorizedRoles = requiredRoles.length > 0 ? requiredRoles : ['user', 'hospital-authority', 'admin'];

        if (!authorizedRoles.includes(userRole)) {
          await auditService.logSecurityEvent({
            eventType: 'INSUFFICIENT_FINANCIAL_PRIVILEGES',
            userId: decoded.id,
            ipAddress: req.ip,
            userAgent: req.get('User-Agent'),
            sessionId: req.sessionID,
            eventData: { 
              userRole, 
              requiredRoles: authorizedRoles,
              endpoint: req.path 
            },
            severity: 'HIGH'
          });

          return res.status(403).json({
            success: false,
            error: 'Insufficient privileges for financial operations.'
          });
        }

        // Log successful authorization
        await auditService.logSecurityEvent({
          eventType: 'FINANCIAL_ACCESS_GRANTED',
          userId: decoded.id,
          ipAddress: req.ip,
          userAgent: req.get('User-Agent'),
          sessionId: req.sessionID,
          eventData: { 
            userRole,
            endpoint: req.path,
            method: req.method
          },
          severity: 'INFO'
        });

        next();
      } catch (error) {
        await auditService.logSecurityEvent({
          eventType: 'FINANCIAL_AUTH_ERROR',
          userId: null,
          ipAddress: req.ip,
          userAgent: req.get('User-Agent'),
          sessionId: req.sessionID,
          eventData: { 
            error: error.message,
            endpoint: req.path 
          },
          severity: 'HIGH'
        });

        return res.status(401).json({
          success: false,
          error: 'Invalid authentication token.'
        });
      }
    };
  },

  /**
   * Require admin role for sensitive financial operations
   */
  requireAdminAccess: () => {
    return financialAuth.requireFinancialAccess(['admin']);
  },

  /**
   * Require hospital authority or admin for hospital financial operations
   */
  requireHospitalFinancialAccess: () => {
    return financialAuth.requireFinancialAccess(['hospital-authority', 'admin']);
  },

  /**
   * Fraud detection middleware for transactions
   */
  fraudDetection: async (req, res, next) => {
    try {
      const { amount, mobile_number } = req.body;
      const userId = req.user?.id;

      if (!amount || !userId) {
        return next(); // Skip fraud detection if required data is missing
      }

      // Analyze transaction for fraud risk
      const fraudAnalysis = await fraudDetectionService.analyzeTransaction({
        userId,
        amountTaka: parseFloat(amount),
        mobileNumber: mobile_number,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        sessionId: req.sessionID
      });

      if (!fraudAnalysis.success) {
        console.error('Fraud analysis failed:', fraudAnalysis.error);
        return next(); // Continue with transaction if fraud analysis fails
      }

      const { analysis } = fraudAnalysis;
      req.fraudAnalysis = analysis;

      // Handle fraud detection results
      switch (analysis.recommendation.action) {
        case 'BLOCK':
          await auditService.logSecurityEvent({
            eventType: 'TRANSACTION_BLOCKED_FRAUD',
            userId,
            ipAddress: req.ip,
            userAgent: req.get('User-Agent'),
            sessionId: req.sessionID,
            eventData: {
              riskScore: analysis.riskScore,
              fraudFlags: analysis.fraudFlags,
              amount: amount
            },
            severity: 'CRITICAL'
          });

          return res.status(403).json({
            success: false,
            error: 'Transaction blocked due to security concerns. Please contact support.',
            errorCode: 'FRAUD_DETECTED',
            riskLevel: analysis.riskLevel
          });

        case 'CHALLENGE':
          // Set flag for additional verification
          req.requiresAdditionalVerification = true;
          req.fraudRiskLevel = analysis.riskLevel;
          break;

        case 'MONITOR':
        case 'ALLOW':
        default:
          // Continue with normal processing
          break;
      }

      next();
    } catch (error) {
      console.error('Fraud detection middleware error:', error);
      
      await auditService.logSecurityEvent({
        eventType: 'FRAUD_DETECTION_ERROR',
        userId: req.user?.id,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        sessionId: req.sessionID,
        eventData: { error: error.message },
        severity: 'HIGH'
      });

      // Continue with transaction if fraud detection fails
      next();
    }
  },

  /**
   * Rate limiting for financial operations
   */
  rateLimitFinancial: (maxRequests = 10, windowMinutes = 15) => {
    const requests = new Map();

    return async (req, res, next) => {
      try {
        const userId = req.user?.id;
        const key = `${userId}_${req.ip}`;
        const now = Date.now();
        const windowMs = windowMinutes * 60 * 1000;

        // Clean old entries
        for (const [k, data] of requests.entries()) {
          if (now - data.firstRequest > windowMs) {
            requests.delete(k);
          }
        }

        // Check current user's requests
        const userRequests = requests.get(key);
        
        if (!userRequests) {
          requests.set(key, {
            count: 1,
            firstRequest: now
          });
        } else if (now - userRequests.firstRequest > windowMs) {
          // Reset window
          requests.set(key, {
            count: 1,
            firstRequest: now
          });
        } else {
          userRequests.count++;
          
          if (userRequests.count > maxRequests) {
            await auditService.logSecurityEvent({
              eventType: 'FINANCIAL_RATE_LIMIT_EXCEEDED',
              userId,
              ipAddress: req.ip,
              userAgent: req.get('User-Agent'),
              sessionId: req.sessionID,
              eventData: {
                requestCount: userRequests.count,
                maxRequests,
                windowMinutes
              },
              severity: 'HIGH'
            });

            return res.status(429).json({
              success: false,
              error: `Too many financial operations. Maximum ${maxRequests} requests per ${windowMinutes} minutes.`,
              retryAfter: Math.ceil((windowMs - (now - userRequests.firstRequest)) / 1000)
            });
          }
        }

        next();
      } catch (error) {
        console.error('Rate limiting error:', error);
        next(); // Continue if rate limiting fails
      }
    };
  },

  /**
   * Validate transaction amount limits
   */
  validateTransactionLimits: (dailyLimit = 100000, singleLimit = 50000) => {
    return async (req, res, next) => {
      try {
        const { amount } = req.body;
        const userId = req.user?.id;
        const amountTaka = parseFloat(amount);

        if (!amountTaka || !userId) {
          return next();
        }

        // Check single transaction limit
        if (amountTaka > singleLimit) {
          await auditService.logSecurityEvent({
            eventType: 'TRANSACTION_LIMIT_EXCEEDED',
            userId,
            ipAddress: req.ip,
            userAgent: req.get('User-Agent'),
            sessionId: req.sessionID,
            eventData: {
              amount: amountTaka,
              singleLimit,
              limitType: 'SINGLE_TRANSACTION'
            },
            severity: 'HIGH'
          });

          return res.status(400).json({
            success: false,
            error: `Transaction amount exceeds single transaction limit of ${singleLimit} BDT.`,
            errorCode: 'AMOUNT_LIMIT_EXCEEDED'
          });
        }

        // Check daily limit
        const today = new Date().toISOString().split('T')[0];
        const dailyTotal = await this.getDailyTransactionTotal(userId, today);
        
        if (dailyTotal + amountTaka > dailyLimit) {
          await auditService.logSecurityEvent({
            eventType: 'DAILY_LIMIT_EXCEEDED',
            userId,
            ipAddress: req.ip,
            userAgent: req.get('User-Agent'),
            sessionId: req.sessionID,
            eventData: {
              amount: amountTaka,
              dailyTotal,
              dailyLimit,
              limitType: 'DAILY_LIMIT'
            },
            severity: 'HIGH'
          });

          return res.status(400).json({
            success: false,
            error: `Transaction would exceed daily limit of ${dailyLimit} BDT. Current daily total: ${dailyTotal} BDT.`,
            errorCode: 'DAILY_LIMIT_EXCEEDED'
          });
        }

        next();
      } catch (error) {
        console.error('Transaction limit validation error:', error);
        next(); // Continue if validation fails
      }
    };
  },

  /**
   * Get daily transaction total for a user
   */
  async getDailyTransactionTotal(userId, date) {
    try {
      const db = require('../config/database');
      const stmt = db.prepare(`
        SELECT COALESCE(SUM(amount_taka), 0) as total
        FROM financial_audit_log 
        WHERE user_id = ? 
        AND DATE(created_at) = ?
        AND status = 'completed'
      `);
      
      const result = stmt.get(userId, date);
      return result ? result.total : 0;
    } catch (error) {
      console.error('Failed to get daily transaction total:', error);
      return 0;
    }
  }
};

module.exports = financialAuth;