

class CollectionAgent {
  constructor(database) {
    this.db = database;
  }

  /**
   * Create a new collection agent
   */
  create(agentData) {
    const {
      name,
      phone,
      hospitalId,
      specialization = 'Sample Collection Specialist'
    } = agentData;

    const stmt = this.db.prepare(`
      INSERT INTO collection_agents (name, phone, hospital_id, specialization)
      VALUES (?, ?, ?, ?)
    `);

    const result = stmt.run(name, phone, hospitalId, specialization);
    return this.getById(result.lastInsertRowid);
  }

  /**
   * Get agent by ID
   */
  getById(agentId) {
    const stmt = this.db.prepare(`
      SELECT 
        ca.*,
        h.name as hospital_name,
        h.address as hospital_address
      FROM collection_agents ca
      LEFT JOIN hospitals h ON ca.hospital_id = h.id
      WHERE ca.id = ?
    `);

    return stmt.get(agentId);
  }

  /**
   * Get all agents for a hospital
   */
  getByHospitalId(hospitalId) {
    const stmt = this.db.prepare(`
      SELECT * FROM collection_agents 
      WHERE hospital_id = ? AND is_active = 1
      ORDER BY name
    `);

    return stmt.all(hospitalId);
  }

  /**
   * Get available agent for assignment (simple round-robin for now)
   */
  getAvailableAgent(hospitalId) {
    // Get agent with least number of pending assignments
    const stmt = this.db.prepare(`
      SELECT 
        ca.*,
        COUNT(scr.id) as pending_assignments
      FROM collection_agents ca
      LEFT JOIN sample_collection_requests scr ON ca.id = scr.agent_id 
        AND scr.status IN ('assigned', 'pending')
      WHERE ca.hospital_id = ? AND ca.is_active = 1
      GROUP BY ca.id
      ORDER BY pending_assignments ASC, RANDOM()
      LIMIT 1
    `);

    return stmt.get(hospitalId);
  }

  /**
   * Update agent details
   */
  update(agentId, updateData) {
    const fields = [];
    const values = [];

    if (updateData.name) {
      fields.push('name = ?');
      values.push(updateData.name);
    }

    if (updateData.phone) {
      fields.push('phone = ?');
      values.push(updateData.phone);
    }

    if (updateData.specialization) {
      fields.push('specialization = ?');
      values.push(updateData.specialization);
    }

    if (typeof updateData.isActive !== 'undefined') {
      fields.push('is_active = ?');
      values.push(updateData.isActive ? 1 : 0);
    }

    if (fields.length === 0) {
      throw new Error('No fields to update');
    }

    fields.push('updated_at = CURRENT_TIMESTAMP');
    values.push(agentId);

    const stmt = this.db.prepare(`
      UPDATE collection_agents 
      SET ${fields.join(', ')}
      WHERE id = ?
    `);

    const result = stmt.run(...values);
    return result.changes > 0;
  }

  /**
   * Get agent's assignment statistics
   */
  getAgentStats(agentId) {
    const totalAssignmentsStmt = this.db.prepare(`
      SELECT COUNT(*) as count FROM sample_collection_requests 
      WHERE agent_id = ?
    `);

    const pendingAssignmentsStmt = this.db.prepare(`
      SELECT COUNT(*) as count FROM sample_collection_requests 
      WHERE agent_id = ? AND status IN ('assigned', 'pending')
    `);

    const completedAssignmentsStmt = this.db.prepare(`
      SELECT COUNT(*) as count FROM sample_collection_requests 
      WHERE agent_id = ? AND status = 'completed'
    `);

    const totalAssignments = totalAssignmentsStmt.get(agentId).count;
    const pendingAssignments = pendingAssignmentsStmt.get(agentId).count;
    const completedAssignments = completedAssignmentsStmt.get(agentId).count;

    return {
      totalAssignments,
      pendingAssignments,
      completedAssignments,
      completionRate: totalAssignments > 0 ? (completedAssignments / totalAssignments * 100).toFixed(1) : 0
    };
  }

  /**
   * Get agent's current assignments
   */
  getAgentAssignments(agentId, status = null, limit = 20, offset = 0) {
    let query = `
      SELECT 
        scr.*,
        u.name as user_name,
        u.phone as user_phone,
        h.name as hospital_name
      FROM sample_collection_requests scr
      LEFT JOIN users u ON scr.user_id = u.id
      LEFT JOIN hospitals h ON scr.hospital_id = h.id
      WHERE scr.agent_id = ?
    `;

    const params = [agentId];

    if (status) {
      query += ' AND scr.status = ?';
      params.push(status);
    }

    query += ' ORDER BY scr.created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const stmt = this.db.prepare(query);
    const assignments = stmt.all(...params);

    return assignments.map(assignment => {
      if (assignment.test_types) {
        assignment.test_types = JSON.parse(assignment.test_types);
      }
      return assignment;
    });
  }

  /**
   * Deactivate an agent
   */
  deactivate(agentId) {
    return this.update(agentId, { isActive: false });
  }

  /**
   * Reactivate an agent
   */
  reactivate(agentId) {
    return this.update(agentId, { isActive: true });
  }

  /**
   * Delete an agent (soft delete by deactivating)
   */
  delete(agentId) {
    return this.deactivate(agentId);
  }

  /**
   * Get all agents with their statistics
   */
  getAllWithStats(hospitalId = null) {
    let query = `
      SELECT 
        ca.*,
        h.name as hospital_name,
        COUNT(scr.id) as total_assignments,
        COUNT(CASE WHEN scr.status IN ('assigned', 'pending') THEN 1 END) as pending_assignments,
        COUNT(CASE WHEN scr.status = 'completed' THEN 1 END) as completed_assignments
      FROM collection_agents ca
      LEFT JOIN hospitals h ON ca.hospital_id = h.id
      LEFT JOIN sample_collection_requests scr ON ca.id = scr.agent_id
    `;

    const params = [];

    if (hospitalId) {
      query += ' WHERE ca.hospital_id = ?';
      params.push(hospitalId);
    }

    query += ' GROUP BY ca.id ORDER BY ca.name';

    const stmt = this.db.prepare(query);
    const agents = stmt.all(...params);

    return agents.map(agent => ({
      ...agent,
      completion_rate: agent.total_assignments > 0 
        ? (agent.completed_assignments / agent.total_assignments * 100).toFixed(1)
        : 0
    }));
  }
}

module.exports = CollectionAgent;