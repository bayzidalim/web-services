/** Unified Search Route (read‑only) */
const pool = require('../config/database');

async function searchRoutes(fastify, options) {
  // Public GET /search?q=term
  fastify.get('/', async (request, reply) => {
    const { q = '' } = request.query;
    if (!q.trim()) {
      return { members: [], stories: [], photos: [] };
    }

    // Build tsquery (simple config works for Bangla + English)
    const tsQuery = `plainto_tsquery('simple', $1)`;

    const client = await pool.connect();
    try {
      // ---------- Family Tree People (Historical) ----------
      const treeRes = await client.query(
        `SELECT id, full_name, birth_year, death_year
         FROM family_members
         WHERE search_vector @@ ${tsQuery}
         ORDER BY ts_rank_cd(search_vector, ${tsQuery}) DESC
         LIMIT 10`,
        [q]
      );

      // ---------- Social Platform Members ----------
      const platformRes = await client.query(
        `SELECT id, full_name, role
         FROM platform_members
         WHERE full_name ILIKE $1 OR email ILIKE $1
         LIMIT 10`,
        [`%${q}%`]
      );

      // ---------- Stories ----------
      const storiesRes = await client.query(
        `SELECT id, title, LEFT(content, 200) AS excerpt, language, created_at, updated_at
         FROM stories
         WHERE published = true AND search_vector @@ ${tsQuery}
         ORDER BY ts_rank_cd(search_vector, ${tsQuery}) DESC
         LIMIT 10`,
        [q]
      );

      // ---------- Photos (captions) ----------
      const photosRes = await client.query(
        `SELECT id, public_id, secure_url, width, height, caption, created_at
         FROM photos
         WHERE search_vector @@ ${tsQuery}
         ORDER BY ts_rank_cd(search_vector, ${tsQuery}) DESC
         LIMIT 10`,
        [q]
      );

      return {
        tree_people: treeRes.rows,
        social_members: platformRes.rows,
        stories: storiesRes.rows,
        photos: photosRes.rows,
      };

    } catch (err) {
      fastify.log.error(err);
      return reply.code(500).send({ error: 'Search error', details: err.message });
    } finally {
      client.release();
    }
  });
}

module.exports = searchRoutes;
