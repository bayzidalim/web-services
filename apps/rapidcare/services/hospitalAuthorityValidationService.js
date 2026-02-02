const db = require('../config/database');

class HospitalAuthorityValidationService {
  /**
   * Validate all hospital authority users and fix any linking issues
   * @returns {Object} Validation results with fixes applied
   */
  static validateAndFixAll() {
    try {
      console.log('Starting hospital authority validation...');
      
      // Get all hospital authority users with their linking status
      const query = `
        SELECT 
          u.id as userId,
          u.email,
          u.userType,
          u.hospital_id as userHospitalId,
          ha.hospitalId as authorityHospitalId,
          ha.id as authorityId
        FROM users u
        LEFT JOIN hospital_authorities ha ON u.id = ha.userId
        WHERE u.userType = 'hospital-authority'
      `;
      
      const users = db.prepare(query).all();
      const results = {
        total: users.length,
        fixed: 0,
        errors: [],
        details: []
      };
      
      for (const user of users) {
        const userResult = this.validateAndFixUser(user);
        results.details.push(userResult);
        
        if (userResult.fixed) {
          results.fixed++;
        }
        
        if (userResult.error) {
          results.errors.push(userResult.error);
        }
      }
      
      console.log(`Validation completed: ${results.fixed}/${results.total} users fixed`);
      return results;
      
    } catch (error) {
      console.error('Error during hospital authority validation:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
  
  /**
   * Validate and fix a single hospital authority user
   * @param {Object} user - User data from database
   * @returns {Object} Validation result for this user
   */
  static validateAndFixUser(user) {
    const result = {
      userId: user.userId,
      email: user.email,
      status: 'OK',
      fixed: false,
      error: null
    };
    
    try {
      // Case 1: User has no hospital_authorities record
      if (!user.authorityId) {
        console.log(`Creating hospital_authorities record for user ${user.email}`);
        
        const stmt = db.prepare(`
          INSERT INTO hospital_authorities (userId, hospitalId, role, permissions, createdAt, updatedAt)
          VALUES (?, ?, ?, ?, ?, ?)
        `);
        
        stmt.run(
          user.userId,
          user.userHospitalId,
          'staff',
          JSON.stringify(['view_hospital', 'update_resources']),
          new Date().toISOString(),
          new Date().toISOString()
        );
        
        result.status = 'CREATED_AUTHORITY_RECORD';
        result.fixed = true;
        return result;
      }
      
      // Case 2: hospital_authorities.hospitalId is null but users.hospital_id is not
      if (user.authorityHospitalId === null && user.userHospitalId !== null) {
        console.log(`Fixing null hospitalId for user ${user.email}`);
        
        const stmt = db.prepare(`
          UPDATE hospital_authorities 
          SET hospitalId = ?
          WHERE userId = ?
        `);
        
        stmt.run(user.userHospitalId, user.userId);
        
        result.status = 'FIXED_NULL_HOSPITAL_ID';
        result.fixed = true;
        return result;
      }
      
      // Case 3: Mismatch between users.hospital_id and hospital_authorities.hospitalId
      if (user.userHospitalId !== user.authorityHospitalId) {
        console.log(`Fixing mismatch for user ${user.email}: user=${user.userHospitalId}, authority=${user.authorityHospitalId}`);
        
        // Use the users.hospital_id as the source of truth
        const stmt = db.prepare(`
          UPDATE hospital_authorities 
          SET hospitalId = ?
          WHERE userId = ?
        `);
        
        stmt.run(user.userHospitalId, user.userId);
        
        result.status = 'FIXED_MISMATCH';
        result.fixed = true;
        return result;
      }
      
      // Case 4: Both are null - this is a problem
      if (user.userHospitalId === null && user.authorityHospitalId === null) {
        result.status = 'NO_HOSPITAL_ASSIGNED';
        result.error = `User ${user.email} has no hospital assigned`;
        return result;
      }
      
      // Case 5: Everything is OK
      result.status = 'OK';
      return result;
      
    } catch (error) {
      result.error = `Error fixing user ${user.email}: ${error.message}`;
      return result;
    }
  }
  
  /**
   * Get validation status for all hospital authority users
   * @returns {Array} Array of validation status objects
   */
  static getValidationStatus() {
    try {
      const query = `
        SELECT 
          u.id as userId,
          u.email,
          u.userType,
          u.hospital_id as userHospitalId,
          ha.hospitalId as authorityHospitalId,
          CASE 
            WHEN u.hospital_id IS NULL THEN 'NO_HOSPITAL_IN_USER'
            WHEN ha.hospitalId IS NULL THEN 'NO_HOSPITAL_IN_AUTHORITY'
            WHEN u.hospital_id != ha.hospitalId THEN 'MISMATCH'
            ELSE 'OK'
          END as status
        FROM users u
        LEFT JOIN hospital_authorities ha ON u.id = ha.userId
        WHERE u.userType = 'hospital-authority'
      `;
      
      return db.prepare(query).all();
      
    } catch (error) {
      console.error('Error getting validation status:', error);
      return [];
    }
  }
  
  /**
   * Check if a specific user has proper hospital linking
   * @param {number} userId - User ID to check
   * @returns {Object} Validation result
   */
  static validateUser(userId) {
    try {
      const query = `
        SELECT 
          u.id as userId,
          u.email,
          u.userType,
          u.hospital_id as userHospitalId,
          ha.hospitalId as authorityHospitalId
        FROM users u
        LEFT JOIN hospital_authorities ha ON u.id = ha.userId
        WHERE u.id = ? AND u.userType = 'hospital-authority'
      `;
      
      const user = db.prepare(query).get(userId);
      
      if (!user) {
        return {
          valid: false,
          error: 'User not found or not a hospital authority'
        };
      }
      
      const isValid = user.userHospitalId !== null && 
                     user.authorityHospitalId !== null && 
                     user.userHospitalId === user.authorityHospitalId;
      
      return {
        valid: isValid,
        user: user,
        status: isValid ? 'OK' : 'INVALID'
      };
      
    } catch (error) {
      return {
        valid: false,
        error: error.message
      };
    }
  }
}

module.exports = HospitalAuthorityValidationService;
