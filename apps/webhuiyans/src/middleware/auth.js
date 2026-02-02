const supabase = require('../config/supabase');
const pool = require('../config/database');
const { ensureUserProfile } = require('../services/userService');

/**
 * 1. requireAuth (Authentication ONLY)
 * Validates Supabase token.
 * Attaches request.user
 */
async function requireAuth(request, reply) {
  if (request.method === 'OPTIONS') {
    reply.code(204).send();
    return;
  }
  if (request.user) return; // Skip if already done

  try {
    const authHeader = request.headers.authorization;
    if (!authHeader) {
      reply.code(401).send({ error: 'Missing authorization header' });
      return;
    }

    const token = authHeader.replace('Bearer ', '').trim();
    if (!token) {
      reply.code(401).send({ error: 'Invalid authorization token' });
      return;
    }

    // Verify token with Supabase
    const { data, error } = await supabase.auth.getUser(token);
    
    if (error || !data?.user) {
      if (request.log) request.log.error(`Auth failed for token: ${error?.message || 'No user found'}`);
      reply.code(401).send({ error: 'Invalid or expired token', details: error?.message });
      return;
    }

    request.user = data.user;
    return;
  } catch (err) {
    if (request.log) request.log.error('Auth check error:', err);
    reply.code(500).send({ error: 'Authentication failed' });
    return;
  }
}

/**
 * 2. requireProfile (Authentication + Profile Existence)
 * Ensures profile exists. Auto-creates if missing.
 * Attaches request.profile
 */
async function requireProfile(request, reply) {
  await requireAuth(request, reply);
  if (reply.sent) return;

  try {
    const profile = await ensureUserProfile(request);
    // ensureUserProfile already attaches to request.profile and request.member
    if (!profile) {
       // specific safeguard, though ensureUserProfile should throw or return profile
       reply.code(500).send({ error: 'Failed to resolve profile' });
       return;
    }
    return;
  } catch (err) {
    request.log.error('Profile ensurance error:', err);
    reply.code(500).send({ error: 'Failed to load user profile' });
    return;
  }
}

/**
 * 3. requireAdmin (Authorization)
 * Checks profile.role === 'admin'
 */
async function requireAdmin(request, reply) {
  // 1. Ensure profile is loaded
  await requireProfile(request, reply);
  if (reply.sent) return;

  const profile = request.profile;
  const email = profile?.email || 'unknown';
  const role = profile?.role;
  const isAdmin = profile?.is_admin;

  // 2. Log Check
  if (request.log) {
    request.log.info(`[ADMIN CHECK] email=${email} role=${role} is_admin=${isAdmin}`);
  } else {
    console.log(`[ADMIN CHECK] email=${email} role=${role} is_admin=${isAdmin}`);
  }

  // 3. Verify
  if (!profile || (role !== 'admin' && isAdmin !== true)) {
    if (request.log) request.log.warn(`[ADMIN CHECK] DENIED for ${email}`);
    reply.code(403).send({ error: 'Admins only' });
    return;
  }

  if (request.log) request.log.info(`[ADMIN CHECK] ALLOWED for ${email}`);
}

module.exports = {
  requireAuth,
  requireProfile,
  requireAdmin
};
