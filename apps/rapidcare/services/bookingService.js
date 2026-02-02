const db = require('../config/database');
const HospitalService = require('./hospitalService');
const ValidationService = require('./validationService');
const HospitalPricing = require('../models/HospitalPricing');

class BookingService {
  // Create new booking
  static create(bookingData) {
    // Check resource availability (only approved hospitals)
    const hospital = HospitalService.getById(bookingData.hospitalId, false);
    if (!hospital) {
      throw new Error('Hospital not found or not approved');
    }

    const resource = hospital.resources[bookingData.resourceType];
    if (!resource || resource.available < 1) {
      throw new Error(`${bookingData.resourceType} not available at this hospital`);
    }

    // Calculate payment amount using hospital pricing
    const costBreakdown = HospitalPricing.calculateBookingCost(
      bookingData.hospitalId,
      bookingData.resourceType,
      bookingData.estimatedDuration || 24
    );
    let totalAmount = costBreakdown.total_cost;

    let rapidAssistanceCharge = 0;
    let rapidAssistantName = null;
    let rapidAssistantPhone = null;

    if (bookingData.rapidAssistance) {
      // Validate rapid assistance eligibility
      const validation = ValidationService.validateRapidAssistanceEligibility(bookingData.patientAge, bookingData.rapidAssistance);
      if (!validation.isValid) {
        throw new Error(validation.errors[0]);
      }

      // Set rapid assistance charge
      rapidAssistanceCharge = ValidationService.calculateRapidAssistanceCharge(bookingData.rapidAssistance);
      totalAmount += rapidAssistanceCharge;

      // Assign random assistant
      const assistantInfo = this.assignRapidAssistant();
      rapidAssistantName = assistantInfo.name;
      rapidAssistantPhone = assistantInfo.phone;
    }

    const stmt = db.prepare(`
      INSERT INTO bookings (
        userId, hospitalId, resourceType, patientName, patientAge, patientGender,
        emergencyContactName, emergencyContactPhone, emergencyContactRelationship,
        medicalCondition, urgency, surgeonId, scheduledDate, estimatedDuration,
        status, paymentAmount, paymentStatus, notes, rapidAssistance, rapidAssistanceCharge,
        rapidAssistantName, rapidAssistantPhone
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      bookingData.userId,
      bookingData.hospitalId,
      bookingData.resourceType,
      bookingData.patientName,
      bookingData.patientAge,
      bookingData.patientGender,
      bookingData.emergencyContactName,
      bookingData.emergencyContactPhone,
      bookingData.emergencyContactRelationship,
      bookingData.medicalCondition,
      bookingData.urgency || 'medium',
      bookingData.surgeonId || null,
      bookingData.scheduledDate,
      bookingData.estimatedDuration || 24,
      'pending',
      totalAmount,
      'pending',
      bookingData.notes,
      bookingData.rapidAssistance ? 1 : 0,
      rapidAssistanceCharge,
      rapidAssistantName,
      rapidAssistantPhone
    );

    return this.getById(result.lastInsertRowid);
  }

  // Get booking by ID
  static getById(id) {
    const booking = db.prepare(`
      SELECT b.*, h.name as hospitalName, s.name as surgeonName
      FROM bookings b
      LEFT JOIN hospitals h ON b.hospitalId = h.id
      LEFT JOIN surgeons s ON b.surgeonId = s.id
      WHERE b.id = ?
    `).get(id);

    if (!booking) return null;

    return {
      ...booking,
      hospital: {
        id: booking.hospitalId,
        name: booking.hospitalName
      },
      surgeon: booking.surgeonId ? {
        id: booking.surgeonId,
        name: booking.surgeonName
      } : null
    };
  }

  // Get bookings by user ID
  static getByUserId(userId) {
    const bookings = db.prepare(`
      SELECT b.*, h.name as hospitalName, s.name as surgeonName
      FROM bookings b
      LEFT JOIN hospitals h ON b.hospitalId = h.id
      LEFT JOIN surgeons s ON b.surgeonId = s.id
      WHERE b.userId = ?
      ORDER BY b.createdAt DESC
    `).all(userId);

    return bookings.map(booking => ({
      ...booking,
      hospital: {
        id: booking.hospitalId,
        name: booking.hospitalName
      },
      surgeon: booking.surgeonId ? {
        id: booking.surgeonId,
        name: booking.surgeonName
      } : null
    }));
  }

  // Get bookings by hospital ID
  static getByHospitalId(hospitalId) {
    const bookings = db.prepare(`
      SELECT b.*, h.name as hospitalName, s.name as surgeonName, u.name as userName, u.email as userEmail
      FROM bookings b
      LEFT JOIN hospitals h ON b.hospitalId = h.id
      LEFT JOIN surgeons s ON b.surgeonId = s.id
      LEFT JOIN users u ON b.userId = u.id
      WHERE b.hospitalId = ?
      ORDER BY b.createdAt DESC
    `).all(hospitalId);

    return bookings.map(booking => ({
      ...booking,
      hospital: {
        id: booking.hospitalId,
        name: booking.hospitalName
      },
      surgeon: booking.surgeonId ? {
        id: booking.surgeonId,
        name: booking.surgeonName
      } : null,
      user: {
        id: booking.userId,
        name: booking.userName,
        email: booking.userEmail
      }
    }));
  }

  // Get all bookings (admin)
  static getAll() {
    const bookings = db.prepare(`
      SELECT b.*, h.name as hospitalName, s.name as surgeonName
      FROM bookings b
      LEFT JOIN hospitals h ON b.hospitalId = h.id
      LEFT JOIN surgeons s ON b.surgeonId = s.id
      ORDER BY b.createdAt DESC
    `).all();

    return bookings.map(booking => ({
      ...booking,
      hospital: {
        id: booking.hospitalId,
        name: booking.hospitalName
      },
      surgeon: booking.surgeonId ? {
        id: booking.surgeonId,
        name: booking.surgeonName
      } : null
    }));
  }

  // Update booking status
  static updateStatus(id, status) {
    const stmt = db.prepare(`
      UPDATE bookings 
      SET status = ?, updatedAt = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    
    return stmt.run(status, id);
  }

  // Update payment status
  static updatePaymentStatus(id, paymentStatus, paymentMethod = null, transactionId = null) {
    const stmt = db.prepare(`
      UPDATE bookings 
      SET paymentStatus = ?, paymentMethod = ?, transactionId = ?, updatedAt = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    
    return stmt.run(paymentStatus, paymentMethod, transactionId, id);
  }
      
      // Cancel booking
  static cancel(id) {
    const booking = this.getById(id);
    if (!booking) {
      throw new Error('Booking not found');
    }
    
    if (booking.status === 'cancelled') {
      throw new Error('Booking is already cancelled');
    }

    // Update booking status
    const stmt = db.prepare(`
      UPDATE bookings 
      SET status = 'cancelled', updatedAt = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    stmt.run(id);

    // Restore resource availability
    HospitalService.updateResourceAvailability(
      booking.hospitalId,
      booking.resourceType,
      1,
      booking.userId
    );

    return this.getById(id);
  }

  // Get booking statistics
  static getStats() {
    const stats = db.prepare(`
        SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN status = 'confirmed' THEN 1 END) as confirmed,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending,
        COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelled,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed,
        SUM(paymentAmount) as totalRevenue,
        AVG(paymentAmount) as averageAmount
        FROM bookings
    `).get();

    return {
      total: stats.total,
      confirmed: stats.confirmed,
      pending: stats.pending,
      cancelled: stats.cancelled,
      completed: stats.completed,
      totalRevenue: stats.totalRevenue || 0,
      averageAmount: stats.averageAmount || 0
    };
  }

  // Get base amount for resource type (deprecated - use HospitalPricing.calculateBookingCost instead)
  // Kept for backward compatibility
  static getBaseAmount(resourceType, duration = 24, hospitalId = null) {
    if (hospitalId) {
      const costBreakdown = HospitalPricing.calculateBookingCost(hospitalId, resourceType, duration);
      return costBreakdown.hospital_share; // Return base amount without service charge
    }
    
    // Fallback to default rates if no hospitalId provided
    const baseRates = {
      beds: 120, // ৳120 per day
      icu: 600,  // ৳600 per day
      operationTheatres: 1200 // ৳1200 per day
    };

    const baseRate = baseRates[resourceType] || 120;
    return baseRate * (duration / 24); // Convert hours to days
  }

  // Get available surgeons for hospital
  static getAvailableSurgeons(hospitalId, scheduledDate) {
    const surgeons = db.prepare(`
      SELECT id, name, specialization, available, scheduleDays, scheduleHours
      FROM surgeons
      WHERE hospitalId = ? AND available = 1
    `).all(hospitalId);

    return surgeons.map(surgeon => ({
      id: surgeon.id,
      name: surgeon.name,
      specialization: surgeon.specialization,
      available: surgeon.available === 1,
      schedule: {
        days: surgeon.scheduleDays ? JSON.parse(surgeon.scheduleDays) : [],
        hours: surgeon.scheduleHours
      }
    }));
  }

  // Update rapid assistance details for a booking
  static updateRapidAssistance(id, rapidAssistance, rapidAssistanceCharge = 0) {
    const booking = this.getById(id);
    if (!booking) {
      throw new Error('Booking not found');
    }

    let rapidAssistantName = null;
    let rapidAssistantPhone = null;

    if (rapidAssistance) {
      // Validate rapid assistance eligibility
      const validation = ValidationService.validateRapidAssistanceEligibility(booking.patientAge, rapidAssistance);
      if (!validation.isValid) {
        throw new Error(validation.errors[0]);
      }

      // Assign assistant if not already assigned
      if (!booking.rapidAssistantName) {
        const assistantInfo = this.assignRapidAssistant();
        rapidAssistantName = assistantInfo.name;
        rapidAssistantPhone = assistantInfo.phone;
      } else {
        rapidAssistantName = booking.rapidAssistantName;
        rapidAssistantPhone = booking.rapidAssistantPhone;
      }
    }

    const stmt = db.prepare(`
      UPDATE bookings 
      SET rapidAssistance = ?, rapidAssistanceCharge = ?, rapidAssistantName = ?, rapidAssistantPhone = ?, updatedAt = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    
    stmt.run(rapidAssistance ? 1 : 0, rapidAssistanceCharge, rapidAssistantName, rapidAssistantPhone, id);
    return this.getById(id);
  }

  // Generate random Bangladeshi assistant name and phone number
  static assignRapidAssistant() {
    // Random Bangladeshi first names
    const firstNames = [
      'Ahmed', 'Mohammad', 'Abdul', 'Md', 'Shah', 'Karim', 'Rahman', 'Hassan', 'Ali', 'Omar',
      'Fatima', 'Rashida', 'Nasreen', 'Salma', 'Rehana', 'Ruma', 'Shahida', 'Sultana', 'Bilkis', 'Rokeya',
      'Aminul', 'Rafiqul', 'Shamsul', 'Nurul', 'Mizanur', 'Abdur', 'Motiur', 'Shahjahan', 'Golam', 'Delwar'
    ];

    // Random Bangladeshi last names
    const lastNames = [
      'Islam', 'Rahman', 'Ahmed', 'Hassan', 'Ali', 'Khan', 'Hossain', 'Uddin', 'Alam', 'Sheikh',
      'Begum', 'Khatun', 'Akter', 'Parvin', 'Sultana', 'Bibi', 'Nessa', 'Banu', 'Yasmin', 'Rashid',
      'Miah', 'Sarkar', 'Mondal', 'Das', 'Roy', 'Chowdhury', 'Talukder', 'Bepari', 'Molla', 'Sikder'
    ];

    // Generate random name
    const firstName = firstNames[Math.floor(Math.random() * firstNames.length)];
    const lastName = lastNames[Math.floor(Math.random() * lastNames.length)];
    const fullName = `${firstName} ${lastName}`;

    // Generate random Bangladeshi phone number
    // Format: +880 1XXX-XXXXXX (Bangladesh mobile numbers start with +880 1)
    const operators = ['17', '19', '15', '18', '16', '13']; // Common BD mobile operators
    const operator = operators[Math.floor(Math.random() * operators.length)];
    const randomDigits = Math.floor(Math.random() * 100000000).toString().padStart(8, '0');
    const phoneNumber = `+880${operator}${randomDigits}`;

      return {
      name: fullName,
      phone: phoneNumber
    };
  }


}

module.exports = BookingService;