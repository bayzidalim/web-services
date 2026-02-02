const { getRow, runQuery, getAll } = require('../db/connection');

class Task {
  static async create(userId, taskData) {
    try {
      const { title, description, status = 'todo', priority = 'low', dueDate } = taskData;
      const result = await runQuery(
        `INSERT INTO tasks (user_id, title, description, status, priority, due_date) 
         VALUES (?, ?, ?, ?, ?, ?)`,
        [userId, title, description, status, priority, dueDate]
      );
      
      return await this.findById(result.id);
    } catch (error) {
      throw error;
    }
  }

  static async findById(id) {
    try {
      const task = await getRow('SELECT * FROM tasks WHERE id = ?', [id]);
      return task;
    } catch (error) {
      throw error;
    }
  }

  static async findByUserId(userId) {
    try {
      const tasks = await getAll(
        'SELECT * FROM tasks WHERE user_id = ? ORDER BY created_at DESC',
        [userId]
      );
      return tasks;
    } catch (error) {
      throw error;
    }
  }

  static async update(id, updates) {
    try {
      const allowedFields = ['title', 'description', 'status', 'priority', 'due_date'];
      const updateFields = [];
      const updateValues = [];

      for (const [key, value] of Object.entries(updates)) {
        if (allowedFields.includes(key)) {
          updateFields.push(`${key} = ?`);
          updateValues.push(value);
        }
      }

      if (updateFields.length === 0) {
        throw new Error('No valid fields to update');
      }

      updateFields.push('updated_at = CURRENT_TIMESTAMP');
      updateValues.push(id);

      await runQuery(
        `UPDATE tasks SET ${updateFields.join(', ')} WHERE id = ?`,
        updateValues
      );

      return await this.findById(id);
    } catch (error) {
      throw error;
    }
  }

  static async delete(id) {
    try {
      await runQuery('DELETE FROM tasks WHERE id = ?', [id]);
      return true;
    } catch (error) {
      throw error;
    }
  }

  static async deleteByUserId(userId) {
    try {
      await runQuery('DELETE FROM tasks WHERE user_id = ?', [userId]);
      return true;
    } catch (error) {
      throw error;
    }
  }

  static async findByStatus(userId, status) {
    try {
      const tasks = await getAll(
        'SELECT * FROM tasks WHERE user_id = ? AND status = ? ORDER BY created_at DESC',
        [userId, status]
      );
      return tasks;
    } catch (error) {
      throw error;
    }
  }
}

module.exports = Task;
