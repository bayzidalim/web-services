const db = require('../config/database');

class SocialPost {
  static create(postData) {
    const stmt = db.prepare(`
      INSERT INTO social_posts (
        userId, hospitalId, postType, title, content
      ) VALUES (?, ?, ?, ?, ?)
    `);
    
    const result = stmt.run(
      postData.userId,
      postData.hospitalId,
      postData.postType,
      postData.title,
      postData.content
    );
    
    return this.findById(result.lastInsertRowid);
  }

  static findById(id) {
    const stmt = db.prepare(`
      SELECT 
        sp.*,
        u.name as userName,
        u.email as userEmail,
        h.name as hospitalName,
        h.city as hospitalCity,
        v.name as verifiedByName
      FROM social_posts sp
      LEFT JOIN users u ON sp.userId = u.id
      LEFT JOIN hospitals h ON sp.hospitalId = h.id
      LEFT JOIN users v ON sp.verifiedBy = v.id
      WHERE sp.id = ? AND sp.isActive = 1
    `);
    
    return stmt.get(id);
  }

  static findAll(filters = {}) {
    let query = `
      SELECT 
        sp.*,
        u.name as userName,
        u.email as userEmail,
        h.name as hospitalName,
        h.city as hospitalCity,
        v.name as verifiedByName
      FROM social_posts sp
      LEFT JOIN users u ON sp.userId = u.id
      LEFT JOIN hospitals h ON sp.hospitalId = h.id
      LEFT JOIN users v ON sp.verifiedBy = v.id
      WHERE sp.isActive = 1
    `;
    
    const params = [];
    
    if (filters.hospitalId) {
      query += ` AND sp.hospitalId = ?`;
      params.push(filters.hospitalId);
    }
    
    if (filters.postType) {
      query += ` AND sp.postType = ?`;
      params.push(filters.postType);
    }
    
    if (filters.isAdminVerified !== undefined) {
      query += ` AND sp.isAdminVerified = ?`;
      params.push(filters.isAdminVerified ? 1 : 0);
    }
    
    if (filters.userId) {
      query += ` AND sp.userId = ?`;
      params.push(filters.userId);
    }
    
    query += ` ORDER BY sp.createdAt DESC`;
    
    if (filters.limit) {
      query += ` LIMIT ?`;
      params.push(filters.limit);
    }
    
    if (filters.offset) {
      query += ` OFFSET ?`;
      params.push(filters.offset);
    }
    
    const stmt = db.prepare(query);
    return stmt.all(...params);
  }

  static update(id, updates) {
    const allowedFields = ['title', 'content', 'postType'];
    const fields = [];
    const values = [];
    
    Object.keys(updates).forEach(key => {
      if (allowedFields.includes(key)) {
        fields.push(`${key} = ?`);
        values.push(updates[key]);
      }
    });
    
    if (fields.length === 0) return this.findById(id);
    
    fields.push('updatedAt = CURRENT_TIMESTAMP');
    values.push(id);
    
    const stmt = db.prepare(`
      UPDATE social_posts 
      SET ${fields.join(', ')}
      WHERE id = ?
    `);
    
    stmt.run(...values);
    return this.findById(id);
  }

  static delete(id) {
    const stmt = db.prepare(`
      UPDATE social_posts 
      SET isActive = 0, updatedAt = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    
    return stmt.run(id);
  }

  static verifyPost(id, adminId) {
    const stmt = db.prepare(`
      UPDATE social_posts 
      SET isAdminVerified = 1, 
          verifiedBy = ?,
          verifiedAt = CURRENT_TIMESTAMP,
          updatedAt = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    
    stmt.run(adminId, id);
    return this.findById(id);
  }

  static unverifyPost(id) {
    const stmt = db.prepare(`
      UPDATE social_posts 
      SET isAdminVerified = 0, 
          verifiedBy = NULL,
          verifiedAt = NULL,
          updatedAt = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    
    stmt.run(id);
    return this.findById(id);
  }

  static incrementViews(id) {
    const stmt = db.prepare(`
      UPDATE social_posts 
      SET viewsCount = viewsCount + 1
      WHERE id = ?
    `);
    
    return stmt.run(id);
  }

  static likePost(postId, userId) {
    try {
      const stmt = db.prepare(`
        INSERT INTO social_post_likes (postId, userId)
        VALUES (?, ?)
      `);
      stmt.run(postId, userId);
      
      // Update likes count
      const updateStmt = db.prepare(`
        UPDATE social_posts 
        SET likesCount = likesCount + 1
        WHERE id = ?
      `);
      updateStmt.run(postId);
      
      return true;
    } catch (error) {
      if (error.message.includes('UNIQUE constraint failed')) {
        return false; // Already liked
      }
      throw error;
    }
  }

  static unlikePost(postId, userId) {
    const stmt = db.prepare(`
      DELETE FROM social_post_likes
      WHERE postId = ? AND userId = ?
    `);
    const result = stmt.run(postId, userId);
    
    if (result.changes > 0) {
      // Update likes count
      const updateStmt = db.prepare(`
        UPDATE social_posts 
        SET likesCount = CASE 
          WHEN likesCount > 0 THEN likesCount - 1 
          ELSE 0 
        END
        WHERE id = ?
      `);
      updateStmt.run(postId);
    }
    
    return result.changes > 0;
  }

  static hasUserLiked(postId, userId) {
    const stmt = db.prepare(`
      SELECT COUNT(*) as count
      FROM social_post_likes
      WHERE postId = ? AND userId = ?
    `);
    const result = stmt.get(postId, userId);
    return result.count > 0;
  }

  static getComments(postId) {
    const stmt = db.prepare(`
      SELECT 
        c.*,
        u.name as userName,
        u.email as userEmail
      FROM social_post_comments c
      LEFT JOIN users u ON c.userId = u.id
      WHERE c.postId = ? AND c.isActive = 1
      ORDER BY c.createdAt ASC
    `);
    
    return stmt.all(postId);
  }

  static addComment(postId, userId, content) {
    const stmt = db.prepare(`
      INSERT INTO social_post_comments (postId, userId, content)
      VALUES (?, ?, ?)
    `);
    const result = stmt.run(postId, userId, content);
    
    // Update comments count
    const updateStmt = db.prepare(`
      UPDATE social_posts 
      SET commentsCount = commentsCount + 1
      WHERE id = ?
    `);
    updateStmt.run(postId);
    
    return result.lastInsertRowid;
  }

  static deleteComment(commentId) {
    const stmt = db.prepare(`
      UPDATE social_post_comments 
      SET isActive = 0, updatedAt = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    
    return stmt.run(commentId);
  }

  static getStats() {
    const stmt = db.prepare(`
      SELECT 
        COUNT(*) as totalPosts,
        SUM(CASE WHEN isAdminVerified = 1 THEN 1 ELSE 0 END) as verifiedPosts,
        SUM(likesCount) as totalLikes,
        SUM(commentsCount) as totalComments,
        SUM(viewsCount) as totalViews
      FROM social_posts
      WHERE isActive = 1
    `);
    
    return stmt.get();
  }
}

module.exports = SocialPost;
