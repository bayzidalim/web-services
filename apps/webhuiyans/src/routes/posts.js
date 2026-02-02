const pool = require('../config/database');

async function postRoutes(fastify, options) {
  
  /**
   * POST /api/posts/:postId/react
   * 
   * Add a reaction to a post.
   * Anonymous allowed.
   */
  fastify.post('/:postId/react', async (request, reply) => {
    const { postId } = request.params;
    const { type } = request.body;

    if (!['like', 'respect'].includes(type)) {
      return reply.code(400).send({ error: 'Invalid reaction type' });
    }

    const client = await pool.connect();
    try {
      // Basic check if post exists
      const postCheck = await client.query('SELECT id FROM member_posts WHERE id = $1', [postId]);
      if (postCheck.rows.length === 0) {
        return reply.code(404).send({ error: 'Post not found' });
      }

      const query = `
        INSERT INTO post_reactions (post_id, type)
        VALUES ($1, $2)
        RETURNING id
      `;
      const { rows } = await client.query(query, [postId, type]);
      
      return { success: true, reactionId: rows[0].id };
    } catch (err) {
      fastify.log.error('Error adding reaction:', err);
      return reply.code(500).send({ error: 'Internal server error' });
    } finally {
      client.release();
    }
  });

  /**
   * GET /api/posts/:postId/comments
   * 
   * Get all comments for a post.
   */
  fastify.get('/:postId/comments', async (request, reply) => {
    const { postId } = request.params;
    const client = await pool.connect();
    
    try {
      const query = `
        SELECT 
          pc.*,
          pm.full_name as member_full_name
        FROM post_comments pc
        LEFT JOIN platform_members pm ON pc.author_platform_member_id = pm.id
        WHERE pc.post_id = $1
        ORDER BY pc.created_at ASC
      `;
      const { rows } = await client.query(query, [postId]);
      return rows;
    } catch (err) {
      fastify.log.error('Error fetching comments:', err);
      return reply.code(500).send({ error: 'Internal server error' });
    } finally {
      client.release();
    }
  });

  /**
   * POST /api/posts/:postId/comments
   * 
   * Add a comment to a post.
   */
  fastify.post('/:postId/comments', async (request, reply) => {
    const { postId } = request.params;
    const { author_name, content, author_platform_member_id } = request.body;

    // Validation
    if (!author_name?.trim() || !content?.trim()) {
      return reply.code(400).send({ error: 'Author name and content are required' });
    }

    if (content.trim().length > 500) {
      return reply.code(400).send({ error: 'Comment must be 500 characters or less' });
    }

    const client = await pool.connect();
    try {
      // Check if post exists
      const postCheck = await client.query('SELECT id FROM member_posts WHERE id = $1', [postId]);
      if (postCheck.rows.length === 0) {
        return reply.code(404).send({ error: 'Post not found' });
      }

      const query = `
        INSERT INTO post_comments (post_id, author_name, content, author_platform_member_id)
        VALUES ($1, $2, $3, $4)
        RETURNING *
      `;
      const { rows } = await client.query(query, [
        postId,
        author_name.trim(),
        content.trim(),
        author_platform_member_id || null
      ]);

      
      return rows[0];
    } catch (err) {
      fastify.log.error('Error adding comment:', err);
      return reply.code(500).send({ error: 'Internal server error' });
    } finally {
      client.release();
    }
  });
}

module.exports = postRoutes;
