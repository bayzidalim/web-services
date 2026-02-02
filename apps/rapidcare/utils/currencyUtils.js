/**
 * Currency utilities for Taka (BDT) formatting and validation
 */
class CurrencyUtils {
  /**
   * Format amount as Taka currency
   */
  static formatTaka(amount, options = {}) {
    if (amount === null || amount === undefined || isNaN(amount)) {
      return '৳0.00';
    }

    const numericAmount = parseFloat(amount);
    const showSymbol = options.showSymbol !== false;
    const decimalPlaces = options.decimalPlaces !== undefined ? options.decimalPlaces : 2;
    
    // Format with comma separators for Bangladeshi numbering system
    const formatted = numericAmount.toLocaleString('en-BD', {
      minimumFractionDigits: decimalPlaces,
      maximumFractionDigits: decimalPlaces
    });

    return showSymbol ? `৳${formatted}` : formatted;
  }

  /**
   * Parse Taka string to numeric value
   */
  static parseTaka(takaString) {
    if (!takaString) return 0;
    
    // Remove Taka symbol and commas
    const cleanString = takaString.toString().replace(/[৳,]/g, '').trim();
    const parsed = parseFloat(cleanString);
    
    return isNaN(parsed) ? 0 : parsed;
  }

  /**
   * Parse Taka string to numeric value (strict version for validation)
   */
  static parseTakaStrict(takaString) {
    if (!takaString) return NaN;
    
    // Remove Taka symbol and commas
    const cleanString = takaString.toString().replace(/[৳,]/g, '').trim();
    return parseFloat(cleanString);
  }

  /**
   * Validate Taka amount
   */
  static isValidTakaAmount(amount, options = {}) {
    // Handle null/undefined/invalid inputs
    if (amount === null || amount === undefined) {
      return false;
    }

    const numericAmount = typeof amount === 'string' ? this.parseTakaStrict(amount) : amount;
    
    if (isNaN(numericAmount) || numericAmount < 0) {
      return false;
    }

    const minAmount = options.minAmount || 0;
    const maxAmount = options.maxAmount || Number.MAX_SAFE_INTEGER;

    return numericAmount >= minAmount && numericAmount <= maxAmount;
  }

  /**
   * Round to Taka precision (2 decimal places)
   */
  static roundTaka(amount) {
    return Math.round(parseFloat(amount) * 100) / 100;
  }

  /**
   * Convert amount to paisa (smallest unit)
   */
  static toPaisa(takaAmount) {
    return Math.round(parseFloat(takaAmount) * 100);
  }

  /**
   * Convert paisa to Taka
   */
  static fromPaisa(paisaAmount) {
    return parseFloat(paisaAmount) / 100;
  }

  /**
   * Format amount for display in different contexts
   */
  static formatForDisplay(amount, context = 'default') {
    const contexts = {
      'receipt': { showSymbol: true, decimalPlaces: 2 },
      'dashboard': { showSymbol: true, decimalPlaces: 0 },
      'input': { showSymbol: false, decimalPlaces: 2 },
      'api': { showSymbol: false, decimalPlaces: 2 },
      'default': { showSymbol: true, decimalPlaces: 2 }
    };

    const options = contexts[context] || contexts['default'];
    return this.formatTaka(amount, options);
  }

  /**
   * Calculate percentage of amount
   */
  static calculatePercentage(amount, percentage) {
    const numericAmount = typeof amount === 'string' ? this.parseTaka(amount) : amount;
    const result = (numericAmount * percentage) / 100;
    return this.roundTaka(result);
  }

  /**
   * Add amounts with proper precision
   */
  static addAmounts(...amounts) {
    const total = amounts.reduce((sum, amount) => {
      const numericAmount = typeof amount === 'string' ? this.parseTaka(amount) : amount;
      return sum + (isNaN(numericAmount) ? 0 : numericAmount);
    }, 0);

    return this.roundTaka(total);
  }

  /**
   * Subtract amounts with proper precision
   */
  static subtractAmounts(minuend, subtrahend) {
    const numericMinuend = typeof minuend === 'string' ? this.parseTaka(minuend) : minuend;
    const numericSubtrahend = typeof subtrahend === 'string' ? this.parseTaka(subtrahend) : subtrahend;
    
    const result = numericMinuend - numericSubtrahend;
    return this.roundTaka(result);
  }

  /**
   * Compare two amounts
   */
  static compareAmounts(amount1, amount2) {
    const numeric1 = typeof amount1 === 'string' ? this.parseTaka(amount1) : amount1;
    const numeric2 = typeof amount2 === 'string' ? this.parseTaka(amount2) : amount2;
    
    if (numeric1 > numeric2) return 1;
    if (numeric1 < numeric2) return -1;
    return 0;
  }

  /**
   * Check if amounts are equal (with floating point tolerance)
   */
  static areAmountsEqual(amount1, amount2, tolerance = 0.01) {
    const numeric1 = typeof amount1 === 'string' ? this.parseTaka(amount1) : amount1;
    const numeric2 = typeof amount2 === 'string' ? this.parseTaka(amount2) : amount2;
    
    return Math.abs(numeric1 - numeric2) <= tolerance;
  }

  /**
   * Get amount in words (Bengali)
   */
  static amountInWords(amount, language = 'bn') {
    const numericAmount = typeof amount === 'string' ? this.parseTaka(amount) : amount;
    
    if (language === 'bn') {
      return this.amountInWordsBengali(numericAmount);
    } else {
      return this.amountInWordsEnglish(numericAmount);
    }
  }

  /**
   * Convert amount to Bengali words
   */
  static amountInWordsBengali(amount) {
    // Simplified implementation - in production, use a proper number-to-words library
    const integerPart = Math.floor(amount);
    const decimalPart = Math.round((amount - integerPart) * 100);
    
    if (integerPart === 0 && decimalPart === 0) {
      return 'শূন্য টাকা';
    }

    let words = '';
    
    if (integerPart > 0) {
      words += `${integerPart} টাকা`;
    }
    
    if (decimalPart > 0) {
      words += ` ${decimalPart} পয়সা`;
    }
    
    return words.trim();
  }

  /**
   * Convert amount to English words
   */
  static amountInWordsEnglish(amount) {
    // Simplified implementation
    const integerPart = Math.floor(amount);
    const decimalPart = Math.round((amount - integerPart) * 100);
    
    if (integerPart === 0 && decimalPart === 0) {
      return 'Zero Taka';
    }

    let words = '';
    
    if (integerPart > 0) {
      words += `${integerPart} Taka`;
    }
    
    if (decimalPart > 0) {
      words += ` ${decimalPart} Paisa`;
    }
    
    return words.trim();
  }

  /**
   * Validate currency format
   */
  static validateCurrencyFormat(input) {
    if (!input) return false;
    
    const inputStr = input.toString().trim();
    
    // Allow formats: 1000, 1,000, ৳1000, ৳1,000, 1000.50, etc.
    // Handle Bengali Taka symbol separately due to Unicode issues
    const withoutSymbol = inputStr.replace(/^৳\s*/, '');
    
    // Validate the numeric part
    const numericRegex = /^\d{1,3}(,\d{3})*(\.\d{1,2})?$|^\d+(\.\d{1,2})?$/;
    return numericRegex.test(withoutSymbol);
  }

  /**
   * Get currency symbol
   */
  static getCurrencySymbol() {
    return '৳';
  }

  /**
   * Get currency code
   */
  static getCurrencyCode() {
    return 'BDT';
  }

  /**
   * Get currency name
   */
  static getCurrencyName(language = 'bn') {
    return language === 'bn' ? 'বাংলাদেশী টাকা' : 'Bangladeshi Taka';
  }
}

// Export both the class and individual functions for convenience
module.exports = CurrencyUtils;
module.exports.formatTaka = CurrencyUtils.formatTaka.bind(CurrencyUtils);
module.exports.parseTaka = CurrencyUtils.parseTaka.bind(CurrencyUtils);
module.exports.isValidTakaAmount = CurrencyUtils.isValidTakaAmount.bind(CurrencyUtils);
module.exports.roundTaka = CurrencyUtils.roundTaka.bind(CurrencyUtils);