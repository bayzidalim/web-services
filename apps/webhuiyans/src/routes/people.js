const pool = require('../config/database');
const { requireAuth } = require('../middleware/auth');

async function peopleRoutes(fastify, options) {
  fastify.addHook('preHandler', requireAuth);
  
  // Get person details
  fastify.get('/:id', async (request, reply) => {
    const { id } = request.params;
    const client = await pool.connect();
    try {
      const { rows } = await client.query('SELECT * FROM family_members WHERE id = $1', [id]);
      if (rows.length === 0) {
        return reply.code(404).send({ error: 'Person not found' });
      }
      return rows[0];
    } finally {
      client.release();
    }
  });

  // Get parents
  fastify.get('/:id/parents', async (request, reply) => {
    const { id } = request.params;
    const query = `
      SELECT p.* 
      FROM family_members fm
      JOIN family_members p ON p.id = fm.father_id OR p.id = fm.mother_id
      WHERE fm.id = $1
    `;
    const client = await pool.connect();
    try {
      const { rows } = await client.query(query, [id]);
      return rows;
    } finally {
      client.release();
    }
  });

  // Get children
  fastify.get('/:id/children', async (request, reply) => {
    const { id } = request.params;
    const query = `
      SELECT * 
      FROM family_members 
      WHERE father_id = $1 OR mother_id = $1
    `;
    const client = await pool.connect();
    try {
      const { rows } = await client.query(query, [id]);
      return rows;
    } finally {
      client.release();
    }
  });

  // Get spouses
  fastify.get('/:id/spouses', async (request, reply) => {
    const { id } = request.params;
    // Spouses are in marriages table. Could be husband or wife.
    const query = `
      SELECT fm.*, m.marriage_year, m.id as marriage_id
      FROM marriages m
      JOIN family_members fm ON (m.husband_id = fm.id OR m.wife_id = fm.id)
      WHERE (m.husband_id = $1 OR m.wife_id = $1)
      AND fm.id != $1
    `;
    const client = await pool.connect();
    try {
      const { rows } = await client.query(query, [id]);
      return rows;
    } finally {
      client.release();
    }
  });

  // Get full family tree (Descendants CTE)
  fastify.get('/:id/tree', async (request, reply) => {
    const { id } = request.params;
    
    // Recursive CTE to get all descendants
    const query = `
      WITH RECURSIVE descendants AS (
        SELECT *, 1 as generation 
        FROM family_members 
        WHERE id = $1
        
        UNION ALL
        
        SELECT child.*, p.generation + 1
        FROM family_members child
        INNER JOIN descendants p ON child.father_id = p.id OR child.mother_id = p.id
      )
      SELECT * FROM descendants ORDER BY generation, birth_year;
    `;
    
    const client = await pool.connect();
    try {
      const { rows } = await client.query(query, [id]);
      return rows;
    } finally {
      client.release();
    }
  });
}

module.exports = peopleRoutes;
