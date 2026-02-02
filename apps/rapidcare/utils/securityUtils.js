const crypto = require('crypto');

class SecurityUtils {
  constructor() {
    this.algorithm = 'aes-256-gcm';
    this.keyLength = 32;
    this.ivLength = 16;
    this.tagLength = 16;
    this.saltLength = 32;
    
    // Use environment variable or generate a secure key
    this.encryptionKey = process.env.ENCRYPTION_KEY || this.generateSecureKey();
  }

  /**
   * Generate a secure encryption key
   */
  generateSecureKey() {
    return crypto.randomBytes(this.keyLength);
  }

  /**
   * Encrypt sensitive payment data (mobile numbers, PINs)
   */
  encryptPaymentData(data) {
    try {
      const iv = crypto.randomBytes(this.ivLength);
      const cipher = crypto.createCipher(this.algorithm, this.encryptionKey, iv);
      
      let encrypted = cipher.update(JSON.stringify(data), 'utf8', 'hex');
      encrypted += cipher.final('hex');
      
      const tag = cipher.getAuthTag();
      
      return {
        encrypted,
        iv: iv.toString('hex'),
        tag: tag.toString('hex')
      };
    } catch (error) {
      throw new Error(`Encryption failed: ${error.message}`);
    }
  }

  /**
   * Decrypt sensitive payment data
   */
  decryptPaymentData(encryptedData) {
    try {
      const { encrypted, iv, tag } = encryptedData;
      const decipher = crypto.createDecipher(this.algorithm, this.encryptionKey, Buffer.from(iv, 'hex'));
      
      decipher.setAuthTag(Buffer.from(tag, 'hex'));
      
      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      
      return JSON.parse(decrypted);
    } catch (error) {
      throw new Error(`Decryption failed: ${error.message}`);
    }
  }

  /**
   * Hash sensitive data for storage (one-way)
   */
  hashSensitiveData(data, salt = null) {
    const actualSalt = salt || crypto.randomBytes(this.saltLength);
    const hash = crypto.pbkdf2Sync(data, actualSalt, 100000, 64, 'sha512');
    
    return {
      hash: hash.toString('hex'),
      salt: actualSalt.toString('hex')
    };
  }

  /**
   * Verify hashed data
   */
  verifyHashedData(data, storedHash, salt) {
    const { hash } = this.hashSensitiveData(data, Buffer.from(salt, 'hex'));
    return hash === storedHash;
  }

  /**
   * Mask sensitive data for logging (show only partial information)
   */
  maskMobileNumber(mobileNumber) {
    if (!mobileNumber || mobileNumber.length < 4) return '****';
    return mobileNumber.substring(0, 3) + '*'.repeat(mobileNumber.length - 6) + mobileNumber.substring(mobileNumber.length - 3);
  }

  /**
   * Mask PIN for logging
   */
  maskPIN(pin) {
    return '*'.repeat(pin ? pin.length : 4);
  }

  /**
   * Generate secure transaction reference
   */
  generateSecureTransactionRef() {
    const timestamp = Date.now().toString();
    const randomBytes = crypto.randomBytes(8).toString('hex');
    return `BKS${timestamp}${randomBytes}`.toUpperCase();
  }

  /**
   * Validate mobile number format for bKash
   */
  validateBkashMobileNumber(mobileNumber) {
    // Bangladesh mobile number format: +880XXXXXXXXX or 01XXXXXXXXX
    const bdMobileRegex = /^(\+880|880|0)?1[3-9]\d{8}$/;
    return bdMobileRegex.test(mobileNumber);
  }

  /**
   * Validate PIN format
   */
  validatePINFormat(pin) {
    // bKash PIN is typically 4-6 digits
    const pinRegex = /^\d{4,6}$/;
    return pinRegex.test(pin);
  }

  /**
   * Generate audit trail hash for integrity verification
   */
  generateAuditHash(auditData) {
    const dataString = JSON.stringify(auditData, Object.keys(auditData).sort());
    return crypto.createHash('sha256').update(dataString).digest('hex');
  }

  /**
   * Verify audit trail integrity
   */
  verifyAuditIntegrity(auditData, storedHash) {
    const calculatedHash = this.generateAuditHash(auditData);
    return calculatedHash === storedHash;
  }
}

module.exports = new SecurityUtils();