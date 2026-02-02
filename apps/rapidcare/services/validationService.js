const db = require('../config/database');

class ValidationService {
  // Validate hospital authority can only register one hospital
  static canUserAddHospital(userId) {
    const user = db.prepare(`
      SELECT hospital_id, can_add_hospital 
      FROM users 
      WHERE id = ? AND userType = 'hospital-authority'
    `).get(userId);

    if (!user) return false;
    
    // If user already has a hospital, they can't add another
    if (user.hospital_id) return false;
    
    // Check can_add_hospital flag
    return user.can_add_hospital === 1;
  }

  // Validate hospital data completeness
  static validateHospitalData(hospitalData) {
    const errors = [];

    // Required fields
    if (!hospitalData.name || hospitalData.name.trim().length < 2) {
      errors.push('Hospital name is required and must be at least 2 characters');
    }

    if (!hospitalData.address?.street) {
      errors.push('Street address is required');
    }

    if (!hospitalData.address?.city) {
      errors.push('City is required');
    }

    if (!hospitalData.address?.state) {
      errors.push('State is required');
    }

    if (!hospitalData.contact?.phone) {
      errors.push('Phone number is required');
    }

    if (!hospitalData.contact?.email) {
      errors.push('Email address is required');
    }

    if (!hospitalData.contact?.emergency) {
      errors.push('Emergency contact is required');
    }

    // Basic email validation
    if (hospitalData.contact?.email && !this.isValidEmail(hospitalData.contact.email)) {
      errors.push('Invalid email address format');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  // Check for duplicate hospital names in same city
  static checkDuplicateHospital(name, city, excludeId = null) {
    let query = `
      SELECT id FROM hospitals 
      WHERE LOWER(name) = LOWER(?) AND LOWER(city) = LOWER(?)
    `;
    const params = [name, city];

    if (excludeId) {
      query += ' AND id != ?';
      params.push(excludeId);
    }

    const existing = db.prepare(query).get(...params);
    return existing !== undefined;
  }

  // Validate approval status transitions
  static validateStatusTransition(currentStatus, newStatus, userType) {
    const validTransitions = {
      'pending': {
        'approved': ['admin'],
        'rejected': ['admin']
      },
      'rejected': {
        'pending': ['hospital-authority'] // resubmission
      },
      'approved': {
        'rejected': ['admin'], // can reject approved hospitals if needed
      }
    };

    const allowedTransitions = validTransitions[currentStatus];
    if (!allowedTransitions) return false;

    const allowedUsers = allowedTransitions[newStatus];
    if (!allowedUsers) return false;

    return allowedUsers.includes(userType);
  }

  // Basic email validation
  static isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  // Validate phone number format (basic)
  static isValidPhone(phone) {
    return true; // Phone validation rules removed
  }

  // Sanitize input data
  static sanitizeHospitalData(hospitalData) {
    return {
      name: hospitalData.name?.trim(),
      description: hospitalData.description?.trim() || '',
      type: hospitalData.type?.trim() || 'General',
      address: {
        street: hospitalData.address?.street?.trim(),
        city: hospitalData.address?.city?.trim(),
        state: hospitalData.address?.state?.trim(),
        zipCode: hospitalData.address?.zipCode?.trim(),
        country: hospitalData.address?.country?.trim() || 'Bangladesh'
      },
      contact: {
        phone: hospitalData.contact?.phone?.trim(),
        email: hospitalData.contact?.email?.trim().toLowerCase(),
        emergency: hospitalData.contact?.emergency?.trim()
      },
      services: Array.isArray(hospitalData.services) ? 
        hospitalData.services.map(s => s.trim()).filter(s => s) : [],
      capacity: {
        totalBeds: parseInt(hospitalData.capacity?.totalBeds) || 0,
        icuBeds: parseInt(hospitalData.capacity?.icuBeds) || 0,
        operationTheaters: parseInt(hospitalData.capacity?.operationTheaters) || 0
      }
    };
  }

  // Validate user permissions for hospital operations
  static validateHospitalAccess(userId, hospitalId, operation) {
    const user = db.prepare('SELECT userType, hospital_id FROM users WHERE id = ?').get(userId);
    if (!user) return false;

    // Admin can do everything
    if (user.userType === 'admin') return true;

    // Hospital authority can only access their own hospital
    if (user.userType === 'hospital-authority') {
      if (operation === 'create' && user.hospital_id) return false; // Already has hospital
      if (operation !== 'create' && user.hospital_id !== hospitalId) return false;
      return true;
    }

    return false;
  }

  // Check approval status integrity
  static validateApprovalIntegrity(hospitalId) {
    const hospital = db.prepare(`
      SELECT approval_status, approved_by, approved_at, rejection_reason
      FROM hospitals WHERE id = ?
    `).get(hospitalId);

    if (!hospital) return { isValid: false, errors: ['Hospital not found'] };

    const errors = [];

    // If approved, must have approved_by and approved_at
    if (hospital.approval_status === 'approved') {
      if (!hospital.approved_by) errors.push('Approved hospital missing approver information');
      if (!hospital.approved_at) errors.push('Approved hospital missing approval date');
    }

    // If rejected, must have rejection reason
    if (hospital.approval_status === 'rejected') {
      if (!hospital.rejection_reason) errors.push('Rejected hospital missing rejection reason');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  // Validate rapid assistance eligibility
  static validateRapidAssistanceEligibility(patientAge, rapidAssistance) {
    if (!rapidAssistance) {
      return { isValid: true, errors: [] };
    }

    const errors = [];

    // Check if patient age is provided and valid
    if (patientAge === undefined || patientAge === null) {
      errors.push('Patient age is required to determine Rapid Assistance eligibility');
    } else if (typeof patientAge !== 'number' || isNaN(patientAge)) {
      errors.push('Invalid patient age detected');
    } else if (patientAge < 60) {
      errors.push('Invalid Rapid Assistance selection detected. Please ensure you meet the age requirements. Note: Rapid Assistance is exclusively available for patients aged 60 and above to ensure appropriate care for senior citizens.');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  // Calculate rapid assistance charge
  static calculateRapidAssistanceCharge(rapidAssistance) {
    return rapidAssistance ? 200 : 0;
  }
}

module.exports = ValidationService;