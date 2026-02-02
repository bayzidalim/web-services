const { formatTaka } = require('./currencyUtils');

/**
 * Comprehensive error handling utility with bKash-style error messages
 */
class ErrorHandler {
  /**
   * bKash payment error codes and messages
   */
  static BKASH_ERROR_CODES = {
    // Payment validation errors
    'INVALID_MOBILE': {
      code: 'BK001',
      message: 'অবৈধ মোবাইল নম্বর। দয়া করে সঠিক ১১ সংখ্যার মোবাইল নম্বর দিন।',
      messageEn: 'Invalid mobile number. Please enter a valid 11-digit mobile number.',
      severity: 'validation',
      retryable: true
    },
    'INVALID_PIN': {
      code: 'BK002',
      message: 'ভুল পিন নম্বর। দয়া করে সঠিক ৫ সংখ্যার পিন দিন।',
      messageEn: 'Invalid PIN. Please enter your correct 5-digit PIN.',
      severity: 'validation',
      retryable: true
    },
    'INSUFFICIENT_BALANCE': {
      code: 'BK003',
      message: 'অপর্যাপ্ত ব্যালেন্স। দয়া করে আপনার অ্যাকাউন্টে টাকা যোগ করুন।',
      messageEn: 'Insufficient balance. Please add money to your account.',
      severity: 'payment',
      retryable: true
    },
    'ACCOUNT_BLOCKED': {
      code: 'BK004',
      message: 'আপনার অ্যাকাউন্ট সাময়িকভাবে ব্লক করা হয়েছে। গ্রাহক সেবায় যোগাযোগ করুন।',
      messageEn: 'Your account is temporarily blocked. Please contact customer service.',
      severity: 'account',
      retryable: false
    },
    'TRANSACTION_LIMIT_EXCEEDED': {
      code: 'BK005',
      message: 'দৈনিক লেনদেনের সীমা অতিক্রম করেছে। আগামীকাল আবার চেষ্টা করুন।',
      messageEn: 'Daily transaction limit exceeded. Please try again tomorrow.',
      severity: 'limit',
      retryable: false
    },
    'NETWORK_ERROR': {
      code: 'BK006',
      message: 'নেটওয়ার্ক সমস্যা। দয়া করে আবার চেষ্টা করুন।',
      messageEn: 'Network error. Please try again.',
      severity: 'network',
      retryable: true
    },
    'SERVICE_UNAVAILABLE': {
      code: 'BK007',
      message: 'bKash সেবা সাময়িকভাবে বন্ধ। কিছুক্ষণ পর আবার চেষ্টা করুন।',
      messageEn: 'bKash service is temporarily unavailable. Please try again later.',
      severity: 'service',
      retryable: true
    },
    'INVALID_AMOUNT': {
      code: 'BK008',
      message: 'অবৈধ পরিমাণ। ন্যূনতম ৳১০ এবং সর্বোচ্চ ৳২৫,০০০ পর্যন্ত লেনদেন করা যাবে।',
      messageEn: 'Invalid amount. Minimum ৳10 and maximum ৳25,000 per transaction.',
      severity: 'validation',
      retryable: true
    },
    'DUPLICATE_TRANSACTION': {
      code: 'BK009',
      message: 'এই লেনদেনটি ইতিমধ্যে সম্পন্ন হয়েছে।',
      messageEn: 'This transaction has already been completed.',
      severity: 'duplicate',
      retryable: false
    },
    'TIMEOUT': {
      code: 'BK010',
      message: 'লেনদেনের সময় শেষ। দয়া করে আবার চেষ্টা করুন।',
      messageEn: 'Transaction timeout. Please try again.',
      severity: 'timeout',
      retryable: true
    }
  };

  /**
   * Revenue distribution error codes
   */
  static REVENUE_ERROR_CODES = {
    'BALANCE_UPDATE_FAILED': {
      code: 'REV001',
      message: 'ব্যালেন্স আপডেট করতে ব্যর্থ। অনুগ্রহ করে প্রশাসনের সাথে যোগাযোগ করুন।',
      messageEn: 'Failed to update balance. Please contact administration.',
      severity: 'critical',
      retryable: true
    },
    'INVALID_TRANSACTION': {
      code: 'REV002',
      message: 'অবৈধ লেনদেন। রাজস্ব বিতরণ করা যায়নি।',
      messageEn: 'Invalid transaction. Revenue distribution failed.',
      severity: 'validation',
      retryable: false
    },
    'SERVICE_CHARGE_ERROR': {
      code: 'REV003',
      message: 'সেবা চার্জ গণনায় ত্রুটি। ডিফল্ট রেট প্রয়োগ করা হয়েছে।',
      messageEn: 'Service charge calculation error. Default rate applied.',
      severity: 'warning',
      retryable: false
    },
    'HOSPITAL_NOT_FOUND': {
      code: 'REV004',
      message: 'হাসপাতালের তথ্য পাওয়া যায়নি। রাজস্ব বিতরণ স্থগিত।',
      messageEn: 'Hospital information not found. Revenue distribution suspended.',
      severity: 'error',
      retryable: true
    },
    'BALANCE_RECONCILIATION_FAILED': {
      code: 'REV005',
      message: 'ব্যালেন্স সমন্বয়ে ব্যর্থতা। আর্থিক তথ্য যাচাই করুন।',
      messageEn: 'Balance reconciliation failed. Please verify financial data.',
      severity: 'critical',
      retryable: true
    }
  };

  /**
   * Pricing validation error codes
   */
  static PRICING_ERROR_CODES = {
    'INVALID_RATE': {
      code: 'PRC001',
      message: 'অবৈধ মূল্য। দয়া করে ৳১০ থেকে ৳১০০,০০০ এর মধ্যে মূল্য নির্ধারণ করুন।',
      messageEn: 'Invalid rate. Please set price between ৳10 and ৳100,000.',
      severity: 'validation',
      retryable: true,
      suggestion: 'সাধারণত বেড: ৳৫০০-৩০০০, আইসিইউ: ৳২০০০-১০০০০, অপারেশন থিয়েটার: ৳৫০০০-৫০০০০'
    },
    'NEGATIVE_AMOUNT': {
      code: 'PRC002',
      message: 'ঋণাত্মক পরিমাণ গ্রহণযোগ্য নয়। দয়া করে ধনাত্মক সংখ্যা দিন।',
      messageEn: 'Negative amounts are not allowed. Please enter positive numbers.',
      severity: 'validation',
      retryable: true,
      suggestion: 'সর্বনিম্ন মূল্য ৳১০ হতে হবে'
    },
    'RATE_TOO_HIGH': {
      code: 'PRC003',
      message: 'মূল্য অত্যধিক বেশি। বাজার গড়ের চেয়ে ২০০% বেশি মূল্য নির্ধারণ করা যাবে না।',
      messageEn: 'Price too high. Cannot set price more than 200% above market average.',
      severity: 'business',
      retryable: true,
      suggestion: 'প্রতিযোগী হাসপাতালের মূল্য দেখুন এবং যুক্তিসঙ্গত মূল্য নির্ধারণ করুন'
    },
    'RATE_TOO_LOW': {
      code: 'PRC004',
      message: 'মূল্য অত্যধিক কম। বাজার গড়ের চেয়ে ৫০% কম মূল্য নির্ধারণ করা যাবে না।',
      messageEn: 'Price too low. Cannot set price more than 50% below market average.',
      severity: 'business',
      retryable: true,
      suggestion: 'কম মূল্য আপনার সেবার মান নিয়ে প্রশ্ন তুলতে পারে'
    },
    'INCONSISTENT_PRICING': {
      code: 'PRC005',
      message: 'অসামঞ্জস্যপূর্ণ মূল্য। ঘণ্টার হার বেস রেটের চেয়ে বেশি হতে পারে না।',
      messageEn: 'Inconsistent pricing. Hourly rate cannot be higher than base rate.',
      severity: 'validation',
      retryable: true,
      suggestion: 'বেস রেট দৈনিক চার্জ এবং ঘণ্টার হার প্রতি ঘণ্টার চার্জ হওয়া উচিত'
    }
  };

  /**
   * Financial data consistency error codes
   */
  static FINANCIAL_ERROR_CODES = {
    'BALANCE_MISMATCH': {
      code: 'FIN001',
      message: 'ব্যালেন্স অমিল। প্রত্যাশিত: {expected}, প্রকৃত: {actual}',
      messageEn: 'Balance mismatch. Expected: {expected}, Actual: {actual}',
      severity: 'critical',
      retryable: true
    },
    'TRANSACTION_INTEGRITY_ERROR': {
      code: 'FIN002',
      message: 'লেনদেনের অখণ্ডতা ত্রুটি। ডেটা সামঞ্জস্য পরীক্ষা করুন।',
      messageEn: 'Transaction integrity error. Please check data consistency.',
      severity: 'critical',
      retryable: false
    },
    'CURRENCY_CONVERSION_ERROR': {
      code: 'FIN003',
      message: 'মুদ্রা রূপান্তরে ত্রুটি। টাকার পরিমাণ যাচাই করুন।',
      messageEn: 'Currency conversion error. Please verify Taka amounts.',
      severity: 'error',
      retryable: true
    },
    'AUDIT_TRAIL_MISSING': {
      code: 'FIN004',
      message: 'অডিট ট্রেইল অনুপস্থিত। লেনদেনের ইতিহাস সংরক্ষণ করা যায়নি।',
      messageEn: 'Audit trail missing. Transaction history could not be saved.',
      severity: 'warning',
      retryable: true
    }
  };

  /**
   * Create a standardized error response
   */
  static createError(errorType, errorCode, customData = {}) {
    const errorCategories = {
      'bkash': this.BKASH_ERROR_CODES,
      'revenue': this.REVENUE_ERROR_CODES,
      'pricing': this.PRICING_ERROR_CODES,
      'financial': this.FINANCIAL_ERROR_CODES
    };

    const errorCategory = errorCategories[errorType];
    if (!errorCategory || !errorCategory[errorCode]) {
      return this.createGenericError('Unknown error occurred', customData);
    }

    const errorInfo = errorCategory[errorCode];
    
    // Replace placeholders in error messages
    let message = errorInfo.message;
    let messageEn = errorInfo.messageEn;
    
    Object.keys(customData).forEach(key => {
      const placeholder = `{${key}}`;
      if (message.includes(placeholder)) {
        message = message.replace(placeholder, customData[key]);
      }
      if (messageEn.includes(placeholder)) {
        messageEn = messageEn.replace(placeholder, customData[key]);
      }
    });

    return {
      success: false,
      error: {
        code: errorInfo.code,
        type: errorType,
        severity: errorInfo.severity,
        message,
        messageEn,
        suggestion: errorInfo.suggestion || null,
        retryable: errorInfo.retryable,
        timestamp: new Date().toISOString(),
        ...customData
      }
    };
  }

  /**
   * Create generic error response
   */
  static createGenericError(message, customData = {}) {
    return {
      success: false,
      error: {
        code: 'GEN001',
        type: 'generic',
        severity: 'error',
        message: message || 'একটি অপ্রত্যাশিত ত্রুটি ঘটেছে।',
        messageEn: message || 'An unexpected error occurred.',
        retryable: true,
        timestamp: new Date().toISOString(),
        ...customData
      }
    };
  }

  /**
   * Validate bKash payment data and return appropriate errors
   */
  static validateBkashPaymentData(paymentData) {
    const errors = [];

    // Mobile number validation
    if (!paymentData.mobileNumber) {
      errors.push(this.createError('bkash', 'INVALID_MOBILE'));
    } else {
      const mobileRegex = /^01[3-9]\d{8}$/;
      if (!mobileRegex.test(paymentData.mobileNumber)) {
        errors.push(this.createError('bkash', 'INVALID_MOBILE'));
      }
    }

    // PIN validation
    if (!paymentData.pin) {
      errors.push(this.createError('bkash', 'INVALID_PIN'));
    } else if (paymentData.pin.length !== 5 || !/^\d{5}$/.test(paymentData.pin)) {
      errors.push(this.createError('bkash', 'INVALID_PIN'));
    }

    // Amount validation
    if (!paymentData.amount || paymentData.amount <= 0) {
      errors.push(this.createError('bkash', 'INVALID_AMOUNT'));
    } else if (paymentData.amount < 10 || paymentData.amount > 25000) {
      errors.push(this.createError('bkash', 'INVALID_AMOUNT'));
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Validate Taka pricing data
   */
  static validateTakaPricing(pricingData) {
    const errors = [];
    const warnings = [];

    // Basic validation
    if (pricingData.baseRate !== undefined) {
      if (pricingData.baseRate < 0) {
        errors.push(this.createError('pricing', 'NEGATIVE_AMOUNT'));
      } else if (pricingData.baseRate < 10) {
        errors.push(this.createError('pricing', 'INVALID_RATE'));
      } else if (pricingData.baseRate > 100000) {
        errors.push(this.createError('pricing', 'INVALID_RATE'));
      }
    }

    // Hourly rate validation
    if (pricingData.hourlyRate !== undefined && pricingData.baseRate !== undefined) {
      if (pricingData.hourlyRate > pricingData.baseRate) {
        errors.push(this.createError('pricing', 'INCONSISTENT_PRICING'));
      }
    }

    // Market-based validation (simplified)
    const marketRanges = {
      'beds': { min: 500, max: 3000, typical: 1500 },
      'icu': { min: 2000, max: 10000, typical: 5000 },
      'operationTheatres': { min: 5000, max: 50000, typical: 15000 }
    };

    const resourceType = pricingData.resourceType;
    if (resourceType && marketRanges[resourceType] && pricingData.baseRate) {
      const range = marketRanges[resourceType];
      
      if (pricingData.baseRate > range.typical * 2) {
        warnings.push(this.createError('pricing', 'RATE_TOO_HIGH'));
      } else if (pricingData.baseRate < range.typical * 0.5) {
        warnings.push(this.createError('pricing', 'RATE_TOO_LOW'));
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Handle bKash payment processing errors with retry logic
   */
  static handleBkashPaymentError(error, attemptCount = 1) {
    const maxRetries = 3;
    const retryableErrors = ['NETWORK_ERROR', 'SERVICE_UNAVAILABLE', 'TIMEOUT'];
    
    // Determine error type based on error message or code
    let errorCode = 'NETWORK_ERROR'; // Default
    
    if (error.message.includes('insufficient')) {
      errorCode = 'INSUFFICIENT_BALANCE';
    } else if (error.message.includes('blocked')) {
      errorCode = 'ACCOUNT_BLOCKED';
    } else if (error.message.includes('limit')) {
      errorCode = 'TRANSACTION_LIMIT_EXCEEDED';
    } else if (error.message.includes('timeout')) {
      errorCode = 'TIMEOUT';
    } else if (error.message.includes('duplicate')) {
      errorCode = 'DUPLICATE_TRANSACTION';
    }

    const errorResponse = this.createError('bkash', errorCode, {
      attemptCount,
      maxRetries,
      originalError: error.message
    });

    // Add retry information
    if (retryableErrors.includes(errorCode) && attemptCount < maxRetries) {
      errorResponse.error.canRetry = true;
      errorResponse.error.retryAfter = Math.min(1000 * Math.pow(2, attemptCount), 10000); // Exponential backoff
      errorResponse.error.nextRetryMessage = `${attemptCount + 1} নম্বর চেষ্টা ${Math.ceil(errorResponse.error.retryAfter / 1000)} সেকেন্ড পর...`;
      errorResponse.error.nextRetryMessageEn = `Retry attempt ${attemptCount + 1} in ${Math.ceil(errorResponse.error.retryAfter / 1000)} seconds...`;
    } else {
      errorResponse.error.canRetry = false;
      errorResponse.error.finalAttempt = true;
    }

    return errorResponse;
  }

  /**
   * Handle revenue distribution errors with transaction rollback
   */
  static handleRevenueDistributionError(error, transactionData = {}) {
    let errorCode = 'BALANCE_UPDATE_FAILED'; // Default

    if (error.message.includes('transaction not found')) {
      errorCode = 'INVALID_TRANSACTION';
    } else if (error.message.includes('hospital not found')) {
      errorCode = 'HOSPITAL_NOT_FOUND';
    } else if (error.message.includes('service charge')) {
      errorCode = 'SERVICE_CHARGE_ERROR';
    } else if (error.message.includes('reconciliation')) {
      errorCode = 'BALANCE_RECONCILIATION_FAILED';
    }

    const errorResponse = this.createError('revenue', errorCode, {
      transactionId: transactionData.transactionId,
      hospitalId: transactionData.hospitalId,
      amount: transactionData.amount ? formatTaka(transactionData.amount) : null,
      originalError: error.message,
      rollbackRequired: true
    });

    // Add recovery instructions
    errorResponse.error.recoveryInstructions = {
      bn: 'লেনদেনটি রোলব্যাক করা হবে। অনুগ্রহ করে কিছুক্ষণ পর আবার চেষ্টা করুন।',
      en: 'Transaction will be rolled back. Please try again after some time.',
      adminAction: 'Check database consistency and verify balance calculations'
    };

    return errorResponse;
  }

  /**
   * Handle financial data consistency errors
   */
  static handleFinancialConsistencyError(error, financialData = {}) {
    let errorCode = 'BALANCE_MISMATCH'; // Default

    if (error.message.includes('integrity')) {
      errorCode = 'TRANSACTION_INTEGRITY_ERROR';
    } else if (error.message.includes('currency')) {
      errorCode = 'CURRENCY_CONVERSION_ERROR';
    } else if (error.message.includes('audit')) {
      errorCode = 'AUDIT_TRAIL_MISSING';
    }

    const errorResponse = this.createError('financial', errorCode, {
      expected: financialData.expected ? formatTaka(financialData.expected) : null,
      actual: financialData.actual ? formatTaka(financialData.actual) : null,
      difference: financialData.difference ? formatTaka(financialData.difference) : null,
      affectedTransactions: financialData.affectedTransactions || [],
      originalError: error.message
    });

    // Add correction instructions
    errorResponse.error.correctionInstructions = {
      bn: 'আর্থিক তথ্য সংশোধনের জন্য প্রশাসনের সাথে যোগাযোগ করুন।',
      en: 'Contact administration for financial data correction.',
      adminAction: 'Run financial reconciliation and correct discrepancies'
    };

    return errorResponse;
  }

  /**
   * Create user-friendly error message for frontend display
   */
  static formatErrorForDisplay(error, language = 'bn') {
    if (!error || !error.error) {
      return {
        title: language === 'bn' ? 'ত্রুটি' : 'Error',
        message: language === 'bn' ? 'একটি অপ্রত্যাশিত ত্রুটি ঘটেছে।' : 'An unexpected error occurred.',
        type: 'error'
      };
    }

    const errorInfo = error.error;
    const message = language === 'bn' ? errorInfo.message : errorInfo.messageEn;
    
    return {
      title: this.getErrorTitle(errorInfo.type, language),
      message,
      suggestion: errorInfo.suggestion,
      code: errorInfo.code,
      type: errorInfo.severity,
      retryable: errorInfo.retryable,
      canRetry: errorInfo.canRetry,
      retryAfter: errorInfo.retryAfter,
      nextRetryMessage: language === 'bn' ? errorInfo.nextRetryMessage : errorInfo.nextRetryMessageEn
    };
  }

  /**
   * Get error title based on type and language
   */
  static getErrorTitle(errorType, language = 'bn') {
    const titles = {
      'bkash': {
        bn: 'bKash পেমেন্ট ত্রুটি',
        en: 'bKash Payment Error'
      },
      'revenue': {
        bn: 'রাজস্ব বিতরণ ত্রুটি',
        en: 'Revenue Distribution Error'
      },
      'pricing': {
        bn: 'মূল্য নির্ধারণ ত্রুটি',
        en: 'Pricing Error'
      },
      'financial': {
        bn: 'আর্থিক তথ্য ত্রুটি',
        en: 'Financial Data Error'
      },
      'generic': {
        bn: 'সিস্টেম ত্রুটি',
        en: 'System Error'
      }
    };

    return titles[errorType] ? titles[errorType][language] : titles['generic'][language];
  }

  /**
   * Log error with appropriate severity
   */
  static logError(error, context = {}) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      error: error.error || error,
      context,
      severity: error.error?.severity || 'error',
      type: error.error?.type || 'unknown'
    };

    // In production, this would integrate with proper logging service
    console.error('Error logged:', JSON.stringify(logEntry, null, 2));

    // For critical errors, additional alerting could be implemented
    if (logEntry.severity === 'critical') {
      this.sendCriticalErrorAlert(logEntry);
    }

    return logEntry;
  }

  /**
   * Send critical error alert (placeholder for actual implementation)
   */
  static sendCriticalErrorAlert(logEntry) {
    // This would integrate with alerting service (email, SMS, Slack, etc.)
    console.error('CRITICAL ERROR ALERT:', logEntry);
  }

  /**
   * Simple error handler for backward compatibility
   * Returns error object with statusCode and message properties
   */
  static handleError(error, customMessage = null) {
    const message = customMessage || error.message || 'An unexpected error occurred';
    const statusCode = error.statusCode || error.status || 500;
    
    return {
      message,
      statusCode,
      originalError: error.message,
      timestamp: new Date().toISOString()
    };
  }



  /**
   * Validate and sanitize Taka amounts
   */
  static validateTakaAmount(amount, context = {}) {
    const errors = [];

    if (amount === null || amount === undefined) {
      errors.push(this.createError('financial', 'CURRENCY_CONVERSION_ERROR', {
        context: 'Amount is required'
      }));
      return { isValid: false, errors, sanitizedAmount: null };
    }

    // Convert to number if string
    let numericAmount = typeof amount === 'string' ? parseFloat(amount) : amount;

    if (isNaN(numericAmount)) {
      errors.push(this.createError('financial', 'CURRENCY_CONVERSION_ERROR', {
        context: 'Invalid numeric value'
      }));
      return { isValid: false, errors, sanitizedAmount: null };
    }

    // Check for negative amounts
    if (numericAmount < 0) {
      errors.push(this.createError('pricing', 'NEGATIVE_AMOUNT'));
      return { isValid: false, errors, sanitizedAmount: null };
    }

    // Round to 2 decimal places for Taka
    const sanitizedAmount = Math.round(numericAmount * 100) / 100;

    // Check minimum amount
    const minAmount = context.minAmount || 1;
    if (sanitizedAmount < minAmount) {
      errors.push(this.createError('bkash', 'INVALID_AMOUNT', {
        minAmount: formatTaka(minAmount)
      }));
    }

    // Check maximum amount
    const maxAmount = context.maxAmount || 1000000; // 10 lakh default max
    if (sanitizedAmount > maxAmount) {
      errors.push(this.createError('bkash', 'INVALID_AMOUNT', {
        maxAmount: formatTaka(maxAmount)
      }));
    }

    return {
      isValid: errors.length === 0,
      errors,
      sanitizedAmount
    };
  }
}

module.exports = ErrorHandler;