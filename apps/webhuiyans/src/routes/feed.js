const pool = require('../config/database');
const { requireProfile } = require('../middleware/auth');

async function feedRoutes(fastify, options) {
  fastify.addHook('preHandler', requireProfile);
  
  /**
   * GET /api/feed
   * 
   * Returns a unified activity feed from multiple sources:
   * - New family members
   * - Timeline posts
   * - Media uploads
   */
  fastify.get('/', async (request, reply) => {
    // Middleware handled auth & profile
    const { limit = 20, offset = 0 } = request.query;
    const client = await pool.connect();
    
    try {
      // Aggregate activities from multiple tables
      const query = `
        WITH activities AS (
          -- New Family Tree People (Historical)
          SELECT 
            fm.id,
            'tree_person' as type,
            fm.created_at,
            jsonb_build_object(
              'person_id', fm.id,
              'full_name', fm.full_name,
              'birth_year', fm.birth_year,
              'gender', fm.gender
            ) as data
          FROM family_members fm
          WHERE fm.created_at > NOW() - INTERVAL '90 days'
          
          UNION ALL

          -- New Platform Members (Social Users)
          SELECT 
            pm.id,
            'platform_member' as type,
            pm.created_at,
            jsonb_build_object(
              'member_id', pm.id,
              'full_name', pm.full_name,
              'role', pm.role
            ) as data
          FROM platform_members pm
          WHERE pm.created_at > NOW() - INTERVAL '90 days'
          
          UNION ALL
          
          -- Social Posts
          SELECT 
            mp.id,
            'post' as type,
            mp.created_at,
            jsonb_build_object(
              'post_id', mp.id,
              'member_id', mp.platform_member_id,
              'member_name', pm.full_name,
              'content', LEFT(mp.content, 200),
              'post_type', mp.post_type,
              'media_count', jsonb_array_length(COALESCE(mp.media_urls, '[]'::jsonb))
            ) as data
          FROM member_posts mp
          JOIN platform_members pm ON mp.platform_member_id = pm.id
          WHERE mp.created_at > NOW() - INTERVAL '90 days'
          
          UNION ALL
          
          -- Media Uploads
          SELECT 
            p.id,
            'media' as type,
            p.created_at,
            jsonb_build_object(
              'photo_id', p.id,
              'secure_url', p.secure_url,
              'caption', p.caption,
              'album_id', p.album_id,
              'album_title', pa.title
            ) as data
          FROM photos p
          LEFT JOIN photo_albums pa ON p.album_id = pa.id
          WHERE p.created_at > NOW() - INTERVAL '90 days'
        )
        SELECT * FROM activities
        ORDER BY created_at DESC
        LIMIT $1 OFFSET $2
      `;
      
      const { rows } = await client.query(query, [limit, offset]);
      return rows;
    } catch (err) {
      fastify.log.error('Error fetching feed:', err);
      return reply.code(500).send({ error: 'Internal server error' });
    } finally {
      client.release();
    }
  });
}

module.exports = feedRoutes;
