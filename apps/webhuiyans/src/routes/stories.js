// Stories Routes
// Public: GET list and detail
// Admin: POST, PUT, DELETE (admin only)

const pool = require('../config/database');
const { requireAdmin, requireAuth } = require('../middleware/auth');
const { notifyStorySubmission } = require('../services/notifications');

async function storiesRoutes(fastify, options) {
  // Require Auth for all (Member Access)
  fastify.addHook('preHandler', requireAuth);

  // Public (Member) GET all published stories
  fastify.get('/', async (request, reply) => {
    const query = `
      SELECT id, title, LEFT(content, 200) AS excerpt, language, created_at, updated_at
      FROM stories
      WHERE published = true
      ORDER BY created_at DESC
    `;
    const client = await pool.connect();
    try {
      const { rows } = await client.query(query);
      return rows;
    } catch (err) {
      fastify.log.error(err);
      return reply.code(500).send({ error: 'Database error', details: err.message });
    } finally {
      client.release();
    }
  });

  // Public GET single story (only if published)
  fastify.get('/:id', async (request, reply) => {
    const { id } = request.params;
    const query = `
      SELECT * FROM stories WHERE id = $1 AND published = true
    `;
    const client = await pool.connect();
    try {
    const { rows } = await client.query(query, [id]);
      if (rows.length === 0) {
        return reply.code(404).send({ error: 'Story not found' });
      }
      const story = rows[0];
      // Fetch associated images
      const imgRes = await client.query('SELECT id, public_id, secure_url, width, height, caption FROM story_images WHERE story_id = $1', [id]);
      story.images = imgRes.rows;
      return story;
    } catch (err) {
      fastify.log.error(err);
      return reply.code(500).send({ error: 'Database error', details: err.message });
    } finally {
      client.release();
    }
  });

  // Apply admin middleware for write routes
  fastify.addHook('preHandler', requireAdmin);

  // Admin POST new story
  fastify.post('/', async (request, reply) => {
    const { title, content, language, published } = request.body;
    if (!title) {
      return reply.code(400).send({ error: 'title is required' });
    }
    const created_by = request.user.id;
    const query = `
      INSERT INTO stories (title, content, language, created_by, published)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `;
    const client = await pool.connect();
    try {
      const { rows } = await client.query(query, [title, content || null, language || null, created_by, published !== undefined ? published : true]);
      const story = rows[0];
      
      // Trigger notification (non-blocking)
      notifyStorySubmission(story).catch(() => {});
      
      return story;
    } catch (err) {
      fastify.log.error(err);
      return reply.code(500).send({ error: 'Database error', details: err.message });
    } finally {
      client.release();
    }
  });

  // Admin PUT update story
  fastify.put('/:id', async (request, reply) => {
    const { id } = request.params;
    const { title, content, language, published } = request.body;
    const query = `
      UPDATE stories
      SET title = COALESCE($1, title),
          content = COALESCE($2, content),
          language = COALESCE($3, language),
          published = COALESCE($4, published),
          updated_at = NOW()
      WHERE id = $5
      RETURNING *
    `;
    const client = await pool.connect();
    try {
      const { rows } = await client.query(query, [title, content, language, published, id]);
      if (rows.length === 0) {
        return reply.code(404).send({ error: 'Story not found' });
      }
      return rows[0];
    } catch (err) {
      fastify.log.error(err);
      return reply.code(500).send({ error: 'Database error', details: err.message });
    } finally {
      client.release();
    }
  });

  // Admin DELETE story
  fastify.delete('/:id', async (request, reply) => {
    const { id } = request.params;
    const query = `DELETE FROM stories WHERE id = $1 RETURNING id`;
    const client = await pool.connect();
    try {
      const { rows } = await client.query(query, [id]);
      if (rows.length === 0) {
        return reply.code(404).send({ error: 'Story not found' });
      }
      return { message: 'Story deleted', id: rows[0].id };
    } catch (err) {
      fastify.log.error(err);
      return reply.code(500).send({ error: 'Database error', details: err.message });
    } finally {
      client.release();
    }
  });
// Admin POST image to a story
  fastify.post('/:id/images', async (request, reply) => {
    const { id } = request.params;
    const { public_id, secure_url, width, height, caption } = request.body;
    if (!public_id || !secure_url || !width || !height) {
      return reply.code(400).send({ error: 'Missing required image fields' });
    }
    const client = await pool.connect();
    try {
      // Ensure story exists
      const storyRes = await client.query('SELECT id FROM stories WHERE id = $1', [id]);
      if (storyRes.rows.length === 0) {
        return reply.code(404).send({ error: 'Story not found' });
      }
      const insertQuery = `
        INSERT INTO story_images (story_id, public_id, secure_url, width, height, caption)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *
      `;
      const { rows } = await client.query(insertQuery, [id, public_id, secure_url, width, height, caption || null]);
      return rows[0];
    } catch (err) {
      fastify.log.error(err);
      return reply.code(500).send({ error: 'Database error', details: err.message });
    } finally {
      client.release();
    }
  });
}

module.exports = storiesRoutes;
