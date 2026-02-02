/**
 * Public Media Routes
 * 
 * Read-only endpoints for the public gallery.
 * No authentication required.
 */

const pool = require('../config/database');

const { requireAuth } = require('../middleware/auth');

async function publicMediaRoutes(fastify, options) {
  // Require authentication for all media routes (Member Only)
  fastify.addHook('preHandler', requireAuth);


  // Get all albums (with cover photo)
  fastify.get('/albums', async (request, reply) => {
    const query = `
      SELECT 
        a.id, 
        a.title, 
        a.description, 
        a.created_at,
        p.secure_url as cover_url,
        p.width as cover_width,
        p.height as cover_height,
        (SELECT COUNT(*) FROM photos WHERE album_id = a.id) as photo_count
      FROM photo_albums a
      LEFT JOIN photos p ON p.id = a.cover_photo_id
      ORDER BY a.created_at DESC
    `;
    
    const client = await pool.connect();
    try {
      const { rows } = await client.query(query);
      return rows;
    } catch (err) {
      fastify.log.error(err);
      return reply.code(500).send({ error: 'Database error' });
    } finally {
      client.release();
    }
  });

  // Get single album with photos
  fastify.get('/albums/:id', async (request, reply) => {
    const { id } = request.params;
    const client = await pool.connect();
    try {
      // Fetch album details
      const albumQuery = `
        SELECT id, title, description, created_at
        FROM photo_albums
        WHERE id = $1
      `;
      
      // Fetch photos in album
      const photosQuery = `
        SELECT 
          id, public_id, secure_url, width, height, format, caption, tags, created_at
        FROM photos 
        WHERE album_id = $1
        ORDER BY created_at DESC
      `;
      
      const [albumRes, photosRes] = await Promise.all([
        client.query(albumQuery, [id]),
        client.query(photosQuery, [id])
      ]);

      if (albumRes.rows.length === 0) {
        return reply.code(404).send({ error: 'Album not found' });
      }

      return {
        ...albumRes.rows[0],
        photos: photosRes.rows
      };
    } catch (err) {
      fastify.log.error(err);
      return reply.code(500).send({ error: 'Database error' });
    } finally {
      client.release();
    }
  });

  // Get all photos (recent feed)
  fastify.get('/photos', async (request, reply) => {
    const { limit = 50, offset = 0 } = request.query;
    
    // Validate limit
    const safeLimit = Math.min(Math.max(parseInt(limit), 1), 100);
    const safeOffset = Math.max(parseInt(offset), 0);

    const query = `
      SELECT 
        p.id, p.public_id, p.secure_url, p.width, p.height, 
        p.format, p.caption, p.tags, p.created_at,
        a.id as album_id, a.title as album_title
      FROM photos p
      LEFT JOIN photo_albums a ON a.id = p.album_id
      ORDER BY p.created_at DESC
      LIMIT $1 OFFSET $2
    `;

    const client = await pool.connect();
    try {
      const { rows } = await client.query(query, [safeLimit, safeOffset]);
      return rows;
    } catch (err) {
      fastify.log.error(err);
      return reply.code(500).send({ error: 'Database error' });
    } finally {
      client.release();
    }
  });
}

module.exports = publicMediaRoutes;
