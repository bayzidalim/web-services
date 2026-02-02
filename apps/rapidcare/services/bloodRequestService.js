const db = require('../config/database');

class BloodRequestService {
  // Create new blood request
  static create(requestData) {
    const stmt = db.prepare(`
      INSERT INTO blood_requests (
        requesterId, requesterName, requesterPhone, bloodType, units,
        urgency, hospitalName, hospitalAddress, hospitalContact,
        patientName, patientAge, medicalCondition, requiredBy, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      requestData.requesterId,
      requestData.requesterName,
      requestData.requesterPhone,
      requestData.bloodType,
      requestData.units,
      requestData.urgency || 'medium',
      requestData.hospitalName,
      requestData.hospitalAddress,
      requestData.hospitalContact,
      requestData.patientName,
      requestData.patientAge,
      requestData.medicalCondition,
      requestData.requiredBy,
      requestData.notes
    );

    return this.getById(result.lastInsertRowid);
  }

  // Get blood request by ID
  static getById(id) {
    const request = db.prepare(`
      SELECT * FROM blood_requests WHERE id = ?
    `).get(id);

    if (!request) return null;

    // Get matched donors
    const matchedDonors = db.prepare(`
      SELECT * FROM matched_donors WHERE bloodRequestId = ?
    `).all(id);

    return {
      ...request,
      matchedDonors
    };
  }

  // Get blood requests by requester ID
  static getByRequesterId(requesterId) {
    const requests = db.prepare(`
      SELECT * FROM blood_requests 
      WHERE requesterId = ?
      ORDER BY createdAt DESC
    `).all(requesterId);

    return requests.map(request => ({
      ...request,
      matchedDonors: this.getMatchedDonors(request.id)
    }));
  }

  // Get all blood requests
  static getAll() {
    const requests = db.prepare(`
      SELECT * FROM blood_requests 
      ORDER BY 
        CASE urgency 
          WHEN 'high' THEN 1 
          WHEN 'medium' THEN 2 
          WHEN 'low' THEN 3 
        END,
        createdAt DESC
    `).all();

    return requests.map(request => ({
      ...request,
      matchedDonors: this.getMatchedDonors(request.id)
    }));
  }

  // Get active blood requests
  static getActive() {
    const requests = db.prepare(`
      SELECT * FROM blood_requests 
      WHERE status = 'pending' OR status = 'matched'
      ORDER BY 
        CASE urgency 
          WHEN 'high' THEN 1 
          WHEN 'medium' THEN 2 
          WHEN 'low' THEN 3 
        END,
        createdAt DESC
    `).all();

    return requests.map(request => ({
      ...request,
      matchedDonors: this.getMatchedDonors(request.id)
    }));
  }

  // Update blood request status
  static updateStatus(id, status) {
    const stmt = db.prepare(`
      UPDATE blood_requests 
      SET status = ?, updatedAt = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    
    return stmt.run(status, id);
  }

  // Add matched donor
  static addMatchedDonor(bloodRequestId, donorData) {
    const stmt = db.prepare(`
      INSERT INTO matched_donors (
        bloodRequestId, donorId, donorName, donorPhone, status
      ) VALUES (?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      bloodRequestId,
      donorData.donorId,
      donorData.donorName,
      donorData.donorPhone,
      'pending'
    );

    // Update request status to matched
    this.updateStatus(bloodRequestId, 'matched');

    return {
      id: result.lastInsertRowid,
      bloodRequestId,
      ...donorData,
      status: 'pending',
      matchedAt: new Date().toISOString()
    };
  }

  // Update donor status
  static updateDonorStatus(bloodRequestId, donorId, status) {
    const stmt = db.prepare(`
      UPDATE matched_donors 
      SET status = ?
      WHERE bloodRequestId = ? AND donorId = ?
    `);
    
    return stmt.run(status, bloodRequestId, donorId);
  }

  // Get matched donors for a request
  static getMatchedDonors(bloodRequestId) {
    return db.prepare(`
      SELECT * FROM matched_donors 
      WHERE bloodRequestId = ?
      ORDER BY matchedAt DESC
    `).all(bloodRequestId);
  }

  // Search blood requests
  static search(params) {
    let query = `SELECT * FROM blood_requests WHERE 1=1`;
    const conditions = [];
    const queryParams = [];

    if (params.bloodType) {
      conditions.push(`bloodType = ?`);
      queryParams.push(params.bloodType);
    }

    if (params.urgency) {
      conditions.push(`urgency = ?`);
      queryParams.push(params.urgency);
    }

    if (params.status) {
      conditions.push(`status = ?`);
      queryParams.push(params.status);
    }

    if (params.city) {
      conditions.push(`hospitalAddress LIKE ?`);
      queryParams.push(`%${params.city}%`);
    }

    if (params.requesterId) {
      conditions.push(`requesterId = ?`);
      queryParams.push(params.requesterId);
    }

    if (conditions.length > 0) {
      query += ` AND (${conditions.join(' AND ')})`;
    }

    query += ` ORDER BY 
      CASE urgency 
        WHEN 'high' THEN 1 
        WHEN 'medium' THEN 2 
        WHEN 'low' THEN 3 
      END,
      createdAt DESC`;

    const requests = db.prepare(query).all(...queryParams);

    return requests.map(request => ({
      ...request,
      matchedDonors: this.getMatchedDonors(request.id)
    }));
  }

  // Get blood request statistics
  static getStats() {
    const stats = db.prepare(`
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending,
        COUNT(CASE WHEN status = 'matched' THEN 1 END) as matched,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed,
        COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelled,
        COUNT(CASE WHEN urgency = 'high' THEN 1 END) as highUrgency,
        COUNT(CASE WHEN urgency = 'medium' THEN 1 END) as mediumUrgency,
        COUNT(CASE WHEN urgency = 'low' THEN 1 END) as lowUrgency
      FROM blood_requests
    `).get();

    return {
      total: stats.total,
      pending: stats.pending,
      matched: stats.matched,
      completed: stats.completed,
      cancelled: stats.cancelled,
      highUrgency: stats.highUrgency,
      mediumUrgency: stats.mediumUrgency,
      lowUrgency: stats.lowUrgency
    };
  }

  // Get blood type statistics
  static getBloodTypeStats() {
    const stats = db.prepare(`
      SELECT 
        bloodType,
        COUNT(*) as count,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending,
        COUNT(CASE WHEN status = 'matched' THEN 1 END) as matched,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed
      FROM blood_requests
      GROUP BY bloodType
      ORDER BY count DESC
    `).all();

    return stats;
  }

  // Delete blood request
  static delete(id) {
    // Delete matched donors first
    db.prepare('DELETE FROM matched_donors WHERE bloodRequestId = ?').run(id);
    
    // Delete the request
    return db.prepare('DELETE FROM blood_requests WHERE id = ?').run(id);
  }
}

module.exports = BloodRequestService; 