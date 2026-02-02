const pool = require('../config/database');

/**
 * Ensures a user profile exists in the platform_members table.
 * If it exists, returns it.
 * If not, creates a new one with default 'member' role and 'active' status.
 * 
 * @param {Object} request - Fastify request object (must have request.user)
 * @returns {Promise<Object>} The member profile
 */
async function ensureUserProfile(request) {
  const user = request.user;
  
  if (!user) {
    throw new Error('ensureUserProfile called without authenticated user');
  }

  // 1. Optimization: If middleware already attached member, return it.
  if (request.member) {
    return request.member;
  }

  const client = await pool.connect();
  try {
    // 2. Try to select first
    const checkRes = await client.query(
      'SELECT * FROM platform_members WHERE auth_user_id = $1',
      [user.id]
    );

    if (checkRes.rows.length > 0) {
      const member = checkRes.rows[0];
      request.profile = member; // Standardize on request.profile as requested
      request.member = member;  // Keep request.member for backward compat if needed
      return member;
    }

    // 3. Create new profile (Idempotent)
    const email = user.email;
    const fullName = user.user_metadata?.full_name || user.user_metadata?.name || email.split('@')[0] || 'New Member';
    const avatarUrl = user.user_metadata?.avatar_url || null;

    // Use ON CONFLICT to handle race conditions safely
    const insertQuery = `
      INSERT INTO platform_members (auth_user_id, full_name, email, role, status, is_admin, created_at, updated_at)
      VALUES ($1, $2, $3, 'member', 'active', false, NOW(), NOW())
      ON CONFLICT (auth_user_id) DO UPDATE
      SET updated_at = NOW() -- Dummy update to return row
      RETURNING *
    `;

    const insertRes = await client.query(insertQuery, [user.id, fullName, email]);
    const newMember = insertRes.rows[0];

    // If we have an avatar, maybe we should sync it to member_profiles too?
    // Requirement says "Sign In button disappears... Avatar dropdown appears". 
    // The previous code didn't sync avatar to `member_profiles`.
    // But let's stick to the prompt's core requirement: "profile auto-creation".
    // I will log it.

    if (request.log) {
      request.log.info(`Ensured profile for user ${user.id}`);
    } else {
      console.log(`Ensured profile for user ${user.id}`);
    }

    // Attach to request
    request.profile = newMember;
    request.member = newMember;
    return newMember;

  } catch (err) {
    if (request.log) {
      request.log.error('Error in ensureUserProfile:', err);
    } else {
      console.error('Error in ensureUserProfile:', err);
    }
    // Don't throw if we can help it? 
    // If we fail to create a profile, the user really can't do much. 
    // Throwing so the caller handles it or 500s is probably correct for a DB error.
    throw err;
  } finally {
    client.release();
  }
}

module.exports = {
  ensureUserProfile
};
