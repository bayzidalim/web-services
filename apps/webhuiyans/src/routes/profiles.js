const pool = require('../config/database');
const supabase = require('../config/supabase');

async function profileRoutes(fastify, options) {
  
  /**
   * GET /api/profile/:memberId
   * 
   * Returns social platform member info + profile data.
   * Respects visibility rules.
   */
  fastify.get('/:memberId', async (request, reply) => {
    const { memberId } = request.params;
    const client = await pool.connect();
    
    try {
      const query = `
        SELECT 
          pm.id, 
          pm.full_name, 
          pm.email,
          pm.role,
          pm.claimed_tree_person_id,
          fm.full_name as tree_person_name,
          mp.bio, 
          mp.avatar_url, 
          mp.cover_url, 
          COALESCE(mp.visibility, 'family') as visibility
        FROM platform_members pm
        LEFT JOIN member_profiles mp ON pm.id = mp.platform_member_id
        LEFT JOIN family_members fm ON pm.claimed_tree_person_id = fm.id
        WHERE pm.id = $1
      `;
      
      const { rows } = await client.query(query, [memberId]);
      
      if (rows.length === 0) {
        return reply.code(404).send({ error: 'Member not found' });
      }

      const profile = rows[0];

      // Visibility Rules
      if (profile.visibility === 'family') {
        const authHeader = request.headers.authorization;
        if (!authHeader) {
          return reply.code(403).send({ error: 'Access denied. This profile is private to family members.' });
        }
        
        const token = authHeader.replace('Bearer ', '').trim();
        if (!token) {
           return reply.code(403).send({ error: 'Access denied. This profile is private to family members.' });
        }

        const { data, error } = await supabase.auth.getUser(token);
        
        if (error || !data?.user) {
          return reply.code(403).send({ error: 'Access denied. This profile is private to family members.' });
        }
      }

      return profile;
    } catch (err) {
      fastify.log.error('Error fetching profile:', err);
      return reply.code(500).send({ error: 'Internal server error' });
    } finally {
      client.release();
    }
  });

  /**
   * GET /api/profile/:memberId/posts
   * 
   * Returns timeline posts for a platform member.
   */
  fastify.get('/:memberId/posts', async (request, reply) => {
    const { memberId } = request.params;
    const { limit = 20, offset = 0 } = request.query;

    const client = await pool.connect();
    
    try {
      // 1. Check visibility of the platform member profile
      const profileQuery = `
        SELECT visibility FROM member_profiles WHERE platform_member_id = $1
      `;
      const profileRes = await client.query(profileQuery, [memberId]);
      const visibility = profileRes.rows[0]?.visibility || 'family';

      if (visibility === 'family') {
        const authHeader = request.headers.authorization;
        if (!authHeader) {
          return reply.code(403).send({ error: 'Access denied. This timeline is private home.' });
        }
        
        const token = authHeader.replace('Bearer ', '').trim();
        const { data, error } = await supabase.auth.getUser(token);
        
        if (error || !data?.user) {
          return reply.code(403).send({ error: 'Access denied. This timeline is private.' });
        }
      }

      // 2. Fetch posts with pagination and reaction counts
      const postsQuery = `
        SELECT 
          mp.*,
          COALESCE(counts.likes, 0) as reaction_like,
          COALESCE(counts.respects, 0) as reaction_respect
        FROM member_posts mp
        LEFT JOIN (
          SELECT 
            post_id,
            COUNT(*) FILTER (WHERE type = 'like') as likes,
            COUNT(*) FILTER (WHERE type = 'respect') as respects
          FROM post_reactions
          GROUP BY post_id
        ) counts ON mp.id = counts.post_id
        WHERE mp.platform_member_id = $1 
        ORDER BY mp.created_at DESC
        LIMIT $2 OFFSET $3
      `;
      const { rows } = await client.query(postsQuery, [memberId, limit, offset]);
      
      return rows.map(row => ({
        ...row,
        reaction_like: parseInt(row.reaction_like, 10),
        reaction_respect: parseInt(row.reaction_respect, 10)
      }));

    } catch (err) {
      fastify.log.error('Error fetching posts:', err);
      return reply.code(500).send({ error: 'Internal server error' });
    } finally {
      client.release();
    }
  });



}

module.exports = profileRoutes;
