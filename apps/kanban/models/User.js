const { getRow, runQuery } = require('../db/connection');
const bcrypt = require('bcryptjs');

class User {
  static async create(email, password) {
    try {
      const hashedPassword = await bcrypt.hash(password, 10);
      const result = await runQuery(
        'INSERT INTO users (email, password) VALUES (?, ?)',
        [email, hashedPassword]
      );
      return { id: result.id, email };
    } catch (error) {
      throw error;
    }
  }

  static async findByEmail(email) {
    try {
      const user = await getRow('SELECT * FROM users WHERE email = ?', [email]);
      return user;
    } catch (error) {
      throw error;
    }
  }

  static async findById(id) {
    try {
      const user = await getRow('SELECT * FROM users WHERE id = ?', [id]);
      return user;
    } catch (error) {
      throw error;
    }
  }

  static async updatePassword(id, newPassword) {
    try {
      const hashedPassword = await bcrypt.hash(newPassword, 10);
      await runQuery(
        'UPDATE users SET password = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [hashedPassword, id]
      );
      return true;
    } catch (error) {
      throw error;
    }
  }

  static async delete(id) {
    try {
      await runQuery('DELETE FROM users WHERE id = ?', [id]);
      return true;
    } catch (error) {
      throw error;
    }
  }
}

module.exports = User;
