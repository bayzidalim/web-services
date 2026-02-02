/**
 * Notification Routes
 * 
 * Admin-only endpoints for managing in-app notifications.
 * 
 * Endpoints:
 * - GET /api/admin/notifications - List all notifications (paginated)
 * - POST /api/admin/notifications/:id/read - Mark single as read
 * - POST /api/admin/notifications/read-all - Mark all as read
 */

const pool = require('../config/database');
const { requireAdmin } = require('../middleware/auth');

async function notificationRoutes(fastify, options) {
  // Apply admin middleware to all routes
  fastify.addHook('preHandler', requireAdmin);

  /**
   * GET /api/admin/notifications
   * 
   * Fetch notifications with pagination.
   * Query params:
   * - limit: number of notifications (default 20, max 100)
   * - offset: pagination offset (default 0)
   * - unread_only: if 'true', only return unread notifications
   */
  fastify.get('/', async (request, reply) => {
    const { limit = 20, offset = 0, unread_only } = request.query;
    const parsedLimit = Math.min(parseInt(limit) || 20, 100);
    const parsedOffset = parseInt(offset) || 0;

    let client;
    try {
      client = await pool.connect();
    } catch (err) {
      fastify.log.error('DB connection failed:', err);
      return reply.code(503).send({ error: 'Database unavailable' });
    }
    try {
      // Build query with optional unread filter
      let whereClause = '';
      const params = [];

      if (unread_only === 'true') {
        whereClause = 'WHERE is_read = FALSE';
      }

      // Get notifications
      const query = `
        SELECT id, type, title, message, metadata, is_read, created_at
        FROM public.notifications
        ${whereClause}
        ORDER BY created_at DESC
        LIMIT $1 OFFSET $2
      `;
      params.push(parsedLimit, parsedOffset);

      const { rows } = await client.query(query, params);

      // Get counts
      const countQuery = `
        SELECT 
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE is_read = FALSE) as unread
        FROM public.notifications
      `;
      const countRes = await client.query(countQuery);
      const { total, unread } = countRes.rows[0];

      return {
        notifications: rows,
        pagination: {
          total: parseInt(total),
          unread: parseInt(unread),
          limit: parsedLimit,
          offset: parsedOffset,
        },
      };
    } catch (err) {
      fastify.log.error(err);
      return reply.code(500).send({ error: 'Failed to load notifications', code: err.code });
    } finally {
      client.release();
    }
  });

  /**
   * POST /api/admin/notifications/:id/read
   * 
   * Mark a single notification as read.
   * Idempotent - marking already-read notification returns success.
   */
  fastify.post('/:id/read', async (request, reply) => {
    const { id } = request.params;

    let client;
    try {
      client = await pool.connect();
    } catch (err) {
      fastify.log.error('DB connection failed:', err);
      return reply.code(503).send({ error: 'Database unavailable' });
    }
    try {
      const query = `
        UPDATE public.notifications
        SET is_read = TRUE
        WHERE id = $1
        RETURNING id, is_read
      `;
      const { rows } = await client.query(query, [id]);

      if (rows.length === 0) {
        return reply.code(404).send({ error: 'Notification not found' });
      }

      return { success: true, notification: rows[0] };
    } catch (err) {
      fastify.log.error(err);
      return reply.code(500).send({ error: 'Failed to mark notification as read', code: err.code });
    } finally {
      client.release();
    }
  });

  /**
   * POST /api/admin/notifications/read-all
   * 
   * Mark all unread notifications as read.
   * Returns count of updated notifications.
   */
  fastify.post('/read-all', async (request, reply) => {
    let client;
    try {
      client = await pool.connect();
    } catch (err) {
      fastify.log.error('DB connection failed:', err);
      return reply.code(503).send({ error: 'Database unavailable' });
    }
    try {
      const query = `
        UPDATE public.notifications
        SET is_read = TRUE
        WHERE is_read = FALSE
        RETURNING id
      `;
      const { rows } = await client.query(query);

      return {
        success: true,
        updated: rows.length,
        message: rows.length > 0
          ? `Marked ${rows.length} notification(s) as read`
          : 'No unread notifications',
      };
    } catch (err) {
      fastify.log.error(err);
      return reply.code(500).send({ error: 'Failed to mark all notifications as read', code: err.code });
    } finally {
      client.release();
    }
  });
}

module.exports = notificationRoutes;
