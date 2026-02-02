const fastify = require('fastify');
const pool = require('../config/database');
const supabase = require('../config/supabase');

async function authRoutes(fastify, options) {

const { requireProfile } = require('../middleware/auth');

  // --- GET /api/auth/me (Sync & Retrieve User) ---
  // Returns: { id, name, email, role, avatar_url }
  fastify.get('/me', { preHandler: requireProfile }, async (request, reply) => {
    try {
      const { user, profile } = request;
      
      // Standardize response structure as requested
      // profile has full_name, user has user_metadata.avatar_url
      return {
        id: profile.id,
        name: profile.full_name, // Legacy support
        display_name: profile.full_name, // Standardized display name
        email: profile.email,
        role: profile.role,
        is_admin: profile.is_admin,
        avatar_url: user.user_metadata?.avatar_url || null,
        status: profile.status,
        auth_user_id: profile.auth_user_id,
        created_at: profile.created_at,
        full_name: profile.full_name 
      };

    } catch (err) {
      request.log.error('Auth sync error:', err);
      return reply.code(500).send({ error: 'Internal Server Error' });
    }
  });

}

module.exports = authRoutes;
