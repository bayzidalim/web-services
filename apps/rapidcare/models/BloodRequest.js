const db = require('../config/database');

class BloodRequest {
  static create(requestData) {
    const stmt = db.prepare(`
      INSERT INTO blood_requests (
        requesterId, requesterName, requesterPhone, bloodType, units,
        urgency, hospitalName, hospitalAddress, hospitalContact,
        patientName, patientAge, medicalCondition, requiredBy
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    const result = stmt.run(
      requestData.requesterId,
      requestData.requesterName,
      requestData.requesterPhone,
      requestData.bloodType,
      requestData.units,
      requestData.urgency,
      requestData.hospitalName,
      requestData.hospitalAddress,
      requestData.hospitalContact,
      requestData.patientName,
      requestData.patientAge,
      requestData.medicalCondition,
      requestData.requiredBy
    );
    
    return result.lastInsertRowid;
  }

  static findById(id) {
    const stmt = db.prepare(`
      SELECT br.*, u.name as requesterUserName
      FROM blood_requests br
      LEFT JOIN users u ON br.requesterId = u.id
      WHERE br.id = ?
    `);
    return stmt.get(id);
  }

  static findByRequesterId(requesterId) {
    const stmt = db.prepare(`
      SELECT * FROM blood_requests 
      WHERE requesterId = ?
      ORDER BY createdAt DESC
    `);
    return stmt.all(requesterId);
  }

  static getAll() {
    const stmt = db.prepare(`
      SELECT br.*, u.name as requesterUserName
      FROM blood_requests br
      LEFT JOIN users u ON br.requesterId = u.id
      ORDER BY br.createdAt DESC
    `);
    return stmt.all();
  }

  static search(searchTerm) {
    const stmt = db.prepare(`
      SELECT br.*, u.name as requesterUserName
      FROM blood_requests br
      LEFT JOIN users u ON br.requesterId = u.id
      WHERE (br.bloodType LIKE ? OR br.hospitalName LIKE ? OR br.patientName LIKE ?)
      ORDER BY br.createdAt DESC
    `);
    const searchPattern = `%${searchTerm}%`;
    return stmt.all(searchPattern, searchPattern, searchPattern);
  }

  static updateStatus(id, status) {
    const stmt = db.prepare(`
      UPDATE blood_requests 
      SET status = ?, updatedAt = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    return stmt.run(status, id);
  }

  static delete(id) {
    const stmt = db.prepare('DELETE FROM blood_requests WHERE id = ?');
    return stmt.run(id);
  }

  static getByStatus(status) {
    const stmt = db.prepare(`
      SELECT br.*, u.name as requesterUserName
      FROM blood_requests br
      LEFT JOIN users u ON br.requesterId = u.id
      WHERE br.status = ?
      ORDER BY br.createdAt DESC
    `);
    return stmt.all(status);
  }

  static getByBloodType(bloodType) {
    const stmt = db.prepare(`
      SELECT br.*, u.name as requesterUserName
      FROM blood_requests br
      LEFT JOIN users u ON br.requesterId = u.id
      WHERE br.bloodType = ? AND br.status = 'pending'
      ORDER BY br.urgency DESC, br.createdAt ASC
    `);
    return stmt.all(bloodType);
  }

  // Matched donors methods
  static addMatchedDonor(bloodRequestId, donorData) {
    const stmt = db.prepare(`
      INSERT INTO matched_donors (bloodRequestId, donorId, donorName, donorPhone)
      VALUES (?, ?, ?, ?)
    `);
    
    const result = stmt.run(
      bloodRequestId,
      donorData.donorId,
      donorData.donorName,
      donorData.donorPhone
    );
    
    return result.lastInsertRowid;
  }

  static getMatchedDonors(bloodRequestId) {
    const stmt = db.prepare(`
      SELECT md.*, u.name as donorUserName
      FROM matched_donors md
      LEFT JOIN users u ON md.donorId = u.id
      WHERE md.bloodRequestId = ?
      ORDER BY md.matchedAt DESC
    `);
    return stmt.all(bloodRequestId);
  }

  static updateMatchedDonorStatus(matchId, status) {
    const stmt = db.prepare(`
      UPDATE matched_donors 
      SET status = ?
      WHERE id = ?
    `);
    return stmt.run(status, matchId);
  }

  static count(options = {}) {
    let query = 'SELECT COUNT(*) as count FROM blood_requests';
    const params = [];
    if (options.where) {
      const conditions = [];
      Object.keys(options.where).forEach(key => {
        const value = options.where[key];
        if (
          typeof value === 'number' ||
          typeof value === 'string' ||
          typeof value === 'bigint' ||
          value === null
        ) {
          conditions.push(`${key} = ?`);
          params.push(value);
        }
      });
      if (conditions.length > 0) {
        query += ' WHERE ' + conditions.join(' AND ');
      }
    }
    const stmt = db.prepare(query);
    const result = stmt.get(...params);
    return result.count;
  }
}

module.exports = BloodRequest; 