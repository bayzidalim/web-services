const db = require('../config/database');

class Review {
  static create(reviewData) {
    const stmt = db.prepare(`
      INSERT INTO reviews (
        userId, hospitalId, bookingId, rating, title, comment, 
        isVerified, isAnonymous, isActive
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    const result = stmt.run(
      reviewData.userId,
      reviewData.hospitalId,
      reviewData.bookingId || null,
      reviewData.rating,
      reviewData.title || null,
      reviewData.comment || null,
      reviewData.isVerified || 0,
      reviewData.isAnonymous || 0,
      reviewData.isActive !== undefined ? reviewData.isActive : 1
    );
    
    return result.lastInsertRowid;
  }

  static findById(id) {
    const stmt = db.prepare(`
      SELECT r.*, u.name as userName, u.email as userEmail
      FROM reviews r
      LEFT JOIN users u ON r.userId = u.id
      WHERE r.id = ? AND r.isActive = 1
    `);
    
    return stmt.get(id);
  }

  static findByHospitalId(hospitalId, options = {}) {
    const { limit = 10, offset = 0, rating = null, sortBy = 'createdAt', sortOrder = 'DESC' } = options;
    
    let query = `
      SELECT r.*, u.name as userName, u.email as userEmail,
             COUNT(rhv.id) as helpfulCount
      FROM reviews r
      LEFT JOIN users u ON r.userId = u.id
      LEFT JOIN review_helpful_votes rhv ON r.id = rhv.reviewId AND rhv.isHelpful = 1
      WHERE r.hospitalId = ? AND r.isActive = 1
    `;
    
    const params = [hospitalId];
    
    if (rating) {
      query += ' AND r.rating = ?';
      params.push(rating);
    }
    
    query += ` GROUP BY r.id ORDER BY r.${sortBy} ${sortOrder} LIMIT ? OFFSET ?`;
    params.push(limit, offset);
    
    const stmt = db.prepare(query);
    return stmt.all(...params);
  }

  static findByUserId(userId, options = {}) {
    const { limit = 10, offset = 0 } = options;
    
    const stmt = db.prepare(`
      SELECT r.*, h.name as hospitalName, h.city as hospitalCity
      FROM reviews r
      LEFT JOIN hospitals h ON r.hospitalId = h.id
      WHERE r.userId = ? AND r.isActive = 1
      ORDER BY r.createdAt DESC
      LIMIT ? OFFSET ?
    `);
    
    return stmt.all(userId, limit, offset);
  }

  static getHospitalStats(hospitalId) {
    const stmt = db.prepare(`
      SELECT 
        COUNT(*) as totalReviews,
        AVG(rating) as averageRating,
        COUNT(CASE WHEN rating = 5 THEN 1 END) as fiveStar,
        COUNT(CASE WHEN rating = 4 THEN 1 END) as fourStar,
        COUNT(CASE WHEN rating = 3 THEN 1 END) as threeStar,
        COUNT(CASE WHEN rating = 2 THEN 1 END) as twoStar,
        COUNT(CASE WHEN rating = 1 THEN 1 END) as oneStar
      FROM reviews 
      WHERE hospitalId = ? AND isActive = 1
    `);
    
    return stmt.get(hospitalId);
  }

  static update(id, updateData) {
    const allowedFields = ['rating', 'title', 'comment', 'isAnonymous', 'isActive'];
    const updates = [];
    const values = [];
    
    Object.keys(updateData).forEach(key => {
      if (allowedFields.includes(key) && updateData[key] !== undefined) {
        updates.push(`${key} = ?`);
        values.push(updateData[key]);
      }
    });
    
    if (updates.length === 0) return false;
    
    values.push(id);
    
    const stmt = db.prepare(`
      UPDATE reviews 
      SET ${updates.join(', ')}, updatedAt = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    
    const result = stmt.run(...values);
    return result.changes > 0;
  }

  static delete(id) {
    const stmt = db.prepare('UPDATE reviews SET isActive = 0 WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  }

  static addHelpfulVote(reviewId, userId, isHelpful) {
    try {
      const stmt = db.prepare(`
        INSERT OR REPLACE INTO review_helpful_votes (reviewId, userId, isHelpful)
        VALUES (?, ?, ?)
      `);
      
      const result = stmt.run(reviewId, userId, isHelpful);
      
      // Update helpful count in reviews table
      const updateStmt = db.prepare(`
        UPDATE reviews 
        SET helpfulCount = (
          SELECT COUNT(*) FROM review_helpful_votes 
          WHERE reviewId = ? AND isHelpful = 1
        )
        WHERE id = ?
      `);
      
      updateStmt.run(reviewId, reviewId);
      
      return result.changes > 0;
    } catch (error) {
      console.error('Error adding helpful vote:', error);
      return false;
    }
  }

  static canUserReview(userId, hospitalId, bookingId = null) {
    // Check if user has already reviewed this hospital
    const existingReview = db.prepare(`
      SELECT id FROM reviews 
      WHERE userId = ? AND hospitalId = ? AND isActive = 1
    `).get(userId, hospitalId);
    
    if (existingReview) {
      return { canReview: false, reason: 'User has already reviewed this hospital' };
    }
    
    // If bookingId is provided, verify the booking exists and belongs to user
    if (bookingId) {
      const booking = db.prepare(`
        SELECT id, status FROM bookings 
        WHERE id = ? AND userId = ? AND status IN ('completed', 'confirmed')
      `).get(bookingId, userId);
      
      if (!booking) {
        return { canReview: false, reason: 'Invalid or incomplete booking' };
      }
    }
    
    return { canReview: true };
  }

  static getAll(options = {}) {
    const { limit = 50, offset = 0, hospitalId = null, userId = null, rating = null } = options;
    
    let query = `
      SELECT r.*, u.name as userName, h.name as hospitalName, h.city as hospitalCity
      FROM reviews r
      LEFT JOIN users u ON r.userId = u.id
      LEFT JOIN hospitals h ON r.hospitalId = h.id
      WHERE r.isActive = 1
    `;
    
    const params = [];
    
    if (hospitalId) {
      query += ' AND r.hospitalId = ?';
      params.push(hospitalId);
    }
    
    if (userId) {
      query += ' AND r.userId = ?';
      params.push(userId);
    }
    
    if (rating) {
      query += ' AND r.rating = ?';
      params.push(rating);
    }
    
    query += ' ORDER BY r.createdAt DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);
    
    const stmt = db.prepare(query);
    return stmt.all(...params);
  }
}

module.exports = Review;
