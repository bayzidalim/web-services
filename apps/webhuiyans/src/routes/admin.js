const pool = require('../config/database');
const { requireAdmin } = require('../middleware/auth');
const { exportFamilyTree } = require('../../scripts/export-family-tree');
const { notifyMediaUpload } = require('../services/notifications');

async function adminRoutes(fastify, options) {
  
  // Apply middleware to all routes in this plugin
  fastify.addHook('preHandler', requireAdmin);

  // --- PUBLISH FAMILY TREE ---
  
  /**
   * POST /api/admin/publish-tree
   * 
   * Exports the current family tree data from the database
   * to the static JSON file for public consumption.
   * Creates versioned snapshots and updates the main file.
   */
  fastify.post('/publish-tree', async (request, reply) => {
    try {
      fastify.log.info('Publishing family tree...');
      
      const result = await exportFamilyTree();
      
      fastify.log.info(`Family tree published successfully. Version: ${result.version}`);
      
      return {
        success: true,
        message: 'Family tree published successfully',
        data: {
          version: result.version,
          exportedAt: result.exportedAt,
          nodeCount: result.nodeCount,
          edgeCount: result.edgeCount,
        },
      };
    } catch (err) {
      fastify.log.error('Failed to publish family tree:', err);
      return reply.code(500).send({
        success: false,
        error: 'Failed to publish family tree',
        details: err.message,
      });
    }
  });

  // --- READ ROUTES ---

  // Get all members (lightweight list)
  fastify.get('/members', async (request, reply) => {
    const query = `
      SELECT id, full_name, birth_year, death_year, created_at 
      FROM family_members 
      ORDER BY created_at ASC
    `;
    const client = await pool.connect();
    try {
      const { rows } = await client.query(query);
      return rows;
    } catch (err) {
      console.error(err);
      return reply.code(500).send({ error: 'Database error', details: err.message });
    } finally {
      client.release();
    }
  });

  // Get single member details
  fastify.get('/members/:id', async (request, reply) => {
    const { id } = request.params;
    const query = 'SELECT * FROM family_members WHERE id = $1';
    
    const client = await pool.connect();
    try {
      const { rows } = await client.query(query, [id]);
      if (rows.length === 0) {
        return reply.code(404).send({ error: 'Member not found' });
      }
      return rows[0];
    } catch (err) {
      console.error(err);
      return reply.code(500).send({ error: 'Database error', details: err.message });
    } finally {
      client.release();
    }
  });

  // Get member relations (parents, children, spouses)
  fastify.get('/members/:id/relations', async (request, reply) => {
    const { id } = request.params;
    const client = await pool.connect();
    try {
      // 1. Check if member exists
      const memberRes = await client.query('SELECT id FROM family_members WHERE id = $1', [id]);
      if (memberRes.rows.length === 0) {
        return reply.code(404).send({ error: 'Member not found' });
      }

      // 2. Run relation queries in parallel
      const parentsQuery = `
        SELECT p.* 
        FROM family_members fm
        JOIN family_members p ON (p.id = fm.father_id OR p.id = fm.mother_id)
        WHERE fm.id = $1
      `;
      
      const childrenQuery = `
        SELECT * 
        FROM family_members 
        WHERE father_id = $1 OR mother_id = $1
      `;

      // Spouses: Find marriages where this person is husband OR wife, join to get the OTHER person
      const spousesQuery = `
        SELECT fm.*, m.marriage_year, m.id as marriage_id
        FROM marriages m
        JOIN family_members fm ON (fm.id = m.husband_id OR fm.id = m.wife_id)
        WHERE (m.husband_id = $1 OR m.wife_id = $1) 
        AND fm.id != $1
      `;

      const [parentsRes, childrenRes, spousesRes] = await Promise.all([
        client.query(parentsQuery, [id]),
        client.query(childrenQuery, [id]),
        client.query(spousesQuery, [id])
      ]);

      return {
        parents: parentsRes.rows,
        children: childrenRes.rows,
        spouses: spousesRes.rows
      };

    } catch (err) {
      console.error(err);
      return reply.code(500).send({ error: 'Database error', details: err.message });
    } finally {
      client.release();
    }
  });

  // --- WRITE ROUTES ---

  // Add family member
  fastify.post('/members', async (request, reply) => {
    const { 
      full_name, 
      gender, 
      birth_year, 
      death_year, 
      father_id, 
      mother_id,
      user_id 
    } = request.body;

    // Basic validation
    if (!full_name) {
      return reply.code(400).send({ error: 'full_name is required' });
    }

    const created_by = request.user.id;

    const query = `
      INSERT INTO family_members 
      (full_name, gender, birth_year, death_year, father_id, mother_id, user_id, created_by, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
      RETURNING *
    `;

    const values = [full_name, gender, birth_year, death_year, father_id, mother_id, user_id, created_by];

    const client = await pool.connect();
    try {
      const { rows } = await client.query(query, values);
      return rows[0];
    } catch (err) {
      console.error(err);
      return reply.code(500).send({ error: 'Database error', details: err.message });
    } finally {
      client.release();
    }
  });

  // Add marriage
  fastify.post('/marriages', async (request, reply) => {
    const { husband_id, wife_id, marriage_year } = request.body;
    
    if (!husband_id || !wife_id) {
      return reply.code(400).send({ error: 'Both husband_id and wife_id are required' });
    }

    const created_by = request.user.id;
    
    // Note: Supports multiple marriages just by inserting a new row.
    const query = `
      INSERT INTO marriages 
      (husband_id, wife_id, marriage_year, created_by, created_at)
      VALUES ($1, $2, $3, $4, NOW())
      RETURNING *
    `;
    
    const client = await pool.connect();
    try {
      const { rows } = await client.query(query, [husband_id, wife_id, marriage_year, created_by]);
      return rows[0];
    } catch (err) {
      console.error(err);
      return reply.code(500).send({ error: 'Database error', details: err.message });
    } finally {
      client.release();
    }
  });

  // Link parent to child
  // Assuming body: { parent_id, role: 'father' | 'mother' }
  fastify.patch('/members/:id/parents', async (request, reply) => {
    const { id } = request.params;
    const { parent_id, role } = request.body;

    if (!parent_id || !['father', 'mother'].includes(role)) {
      return reply.code(400).send({ error: 'Valid parent_id and role (father/mother) required' });
    }

    // Dynamic column update based on role
    const column = role === 'father' ? 'father_id' : 'mother_id';
    
    const query = `
      UPDATE family_members
      SET ${column} = $1
      WHERE id = $2
      RETURNING *
    `;

    const client = await pool.connect();
    try {
      const { rows } = await client.query(query, [parent_id, id]);
      if (rows.length === 0) {
        return reply.code(404).send({ error: 'Child not found' });
      }
      return rows[0];
    } catch (err) {
      console.error(err);
      return reply.code(500).send({ error: 'Database error', details: err.message });
    } finally {
      client.release();
    }
  });

  // Edit family member
  fastify.put('/members/:id', async (request, reply) => {
    const { id } = request.params;
    const { 
      full_name, 
      gender, 
      birth_year, 
      death_year, 
      father_id,
      mother_id,
      user_id 
    } = request.body;

    console.log('UPDATE MEMBER HIT', request.params.id, request.body);

    if (!full_name) {
      return reply.code(400).send({ error: 'full_name is required' });
    }

    // Prevent self-parenting in backend as basic safeguard
    if (father_id === id || mother_id === id) {
       return reply.code(400).send({ error: 'Cannot set member as their own parent' });
    }

    const query = `
      UPDATE family_members 
      SET full_name = $1, gender = $2, birth_year = $3, death_year = $4, father_id = $5, mother_id = $6
      WHERE id = $7
      RETURNING *
    `;

    const values = [
        full_name, 
        gender, 
        birth_year, 
        death_year, 
        father_id || null, 
        mother_id || null, 
        id
    ];

    const client = await pool.connect();
    try {
      const { rows } = await client.query(query, values);
      if (rows.length === 0) {
        return reply.code(404).send({ error: 'Member not found' });
      }
      return rows[0];
    } catch (err) {
      console.error(err);
      return reply.code(500).send({ error: 'Database error', details: err.message });
    } finally {
      client.release();
    }
  });

  // Delete family member
  fastify.delete('/members/:id', async (request, reply) => {
    const { id } = request.params;
    const query = 'DELETE FROM family_members WHERE id = $1 RETURNING id';
    const client = await pool.connect();
    try {
      const { rows } = await client.query(query, [id]);
      if (rows.length === 0) {
        return reply.code(404).send({ error: 'Member not found' });
      }
      return { message: 'Member deleted', id };
    } catch (err) {
      console.error(err);
      if (err.code === '23503') { // ForeignKeyViolation
         return reply.code(400).send({ error: 'Cannot delete member because they are linked as a parent or spouse.' });
      }
      return reply.code(500).send({ error: 'Database error', details: err.message });
    } finally {
      client.release();
    }
  });

  // --- PLATFORM MEMBERS MANAGEMENT ---

  // Get all platform members
  fastify.get('/platform-members', async (request, reply) => {
    const client = await pool.connect();
    try {
      const { rows } = await client.query(`
        SELECT pm.*, fm.full_name as tree_person_name
        FROM platform_members pm
        LEFT JOIN family_members fm ON pm.claimed_tree_person_id = fm.id
        ORDER BY pm.created_at DESC
      `);
      return rows;
    } catch (err) {
      return reply.code(500).send({ error: 'Database error', details: err.message });
    } finally {
      client.release();
    }
  });

  // Create or update platform member
  fastify.post('/platform-members', async (request, reply) => {
    const { full_name, email, role, status, auth_user_id, claimed_tree_person_id } = request.body;
    const client = await pool.connect();
    try {
      const query = `
        INSERT INTO platform_members (full_name, email, role, status, auth_user_id, claimed_tree_person_id)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (email) DO UPDATE
        SET full_name = EXCLUDED.full_name,
            role = EXCLUDED.role,
            status = EXCLUDED.status,
            auth_user_id = EXCLUDED.auth_user_id,
            claimed_tree_person_id = EXCLUDED.claimed_tree_person_id,
            updated_at = NOW()
        RETURNING *
      `;
      const { rows } = await client.query(query, [
        full_name, email, role || 'guest', status || 'pending', auth_user_id || null, claimed_tree_person_id || null
      ]);
      return rows[0];
    } catch (err) {
      return reply.code(500).send({ error: 'Database error', details: err.message });
    } finally {
      client.release();
    }
  });

  // Update a platform member
  fastify.patch('/platform-members/:id', async (request, reply) => {
    const { id } = request.params;
    const updates = request.body;
    const client = await pool.connect();
    try {
      const keys = Object.keys(updates).filter(k => ['full_name', 'role', 'status', 'claimed_tree_person_id'].includes(k));
      const values = keys.map(k => updates[k]);
      
      if (keys.length === 0) return { message: 'No updates' };

      const setClause = keys.map((k, i) => `${k} = $${i + 2}`).join(', ');
      const query = `UPDATE platform_members SET ${setClause}, updated_at = NOW() WHERE id = $1 RETURNING *`;
      
      const { rows } = await client.query(query, [id, ...values]);
      return rows[0];
    } catch (err) {
      return reply.code(500).send({ error: 'Database error', details: err.message });
    } finally {
      client.release();
    }
  });

  // Delete platform member
  fastify.delete('/platform-members/:id', async (request, reply) => {
    const { id } = request.params;
    const client = await pool.connect();
    try {
      await client.query('DELETE FROM platform_members WHERE id = $1', [id]);
      return { success: true };
    } catch (err) {
      return reply.code(500).send({ error: 'Database error', details: err.message });
    } finally {
      client.release();
    }
  });

  // --- MEMBER PROFILE MANAGEMENT ---

  // Update or create platform member social profile
  fastify.put('/profile/:platformMemberId', async (request, reply) => {
    const { platformMemberId } = request.params;
    const { bio, avatar_url, cover_url, visibility } = request.body;
    
    const client = await pool.connect();
    try {
      const upsertQuery = `
        INSERT INTO member_profiles (platform_member_id, bio, avatar_url, cover_url, visibility, updated_at)
        VALUES ($1, $2, $3, $4, $5, NOW())
        ON CONFLICT (platform_member_id) DO UPDATE
        SET bio = EXCLUDED.bio,
            avatar_url = EXCLUDED.avatar_url,
            cover_url = EXCLUDED.cover_url,
            visibility = EXCLUDED.visibility,
            updated_at = NOW()
        RETURNING *
      `;
      const { rows } = await client.query(upsertQuery, [
        platformMemberId, 
        bio || null, 
        avatar_url || null, 
        cover_url || null, 
        visibility || 'family'
      ]);
      return rows[0];
    } catch (err) {
      fastify.log.error('Admin profile update error:', err);
      return reply.code(500).send({ error: 'Database error', details: err.message });
    } finally {
      client.release();
    }
  });

  // --- MEMBER TIMELINE MANAGEMENT ---

  // Create a new post for a platform member
  fastify.post('/profile/:platformMemberId/posts', async (request, reply) => {
    const { platformMemberId } = request.params;
    const { content, media_urls, post_type } = request.body;
    const created_by = request.user.id;

    const client = await pool.connect();
    try {
      const query = `
        INSERT INTO member_posts (platform_member_id, content, media_urls, created_by, post_type)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *
      `;
      const { rows } = await client.query(query, [
        platformMemberId, 
        content || null, 
        media_urls || [], 
        created_by,
        post_type || 'update'
      ]);

      return rows[0];
    } catch (err) {
      fastify.log.error('Admin create post error:', err);
      return reply.code(500).send({ error: 'Database error', details: err.message });
    } finally {
      client.release();
    }
  });

  // Delete a post
  fastify.delete('/posts/:id', async (request, reply) => {
    const { id } = request.params;
    const client = await pool.connect();
    try {
      const { rows } = await client.query(
        'DELETE FROM member_posts WHERE id = $1 RETURNING id',
        [id]
      );
      if (rows.length === 0) {
        return reply.code(404).send({ error: 'Post not found' });
      }
      return { message: 'Post deleted', id };
    } catch (err) {
      fastify.log.error('Admin delete post error:', err);
      return reply.code(500).send({ error: 'Database error', details: err.message });
    } finally {
      client.release();
    }
  });


  // --- COMMENT MANAGEMENT ---

  // Delete a comment (safety valve)
  fastify.delete('/comments/:id', async (request, reply) => {
    const { id } = request.params;
    const client = await pool.connect();
    try {
      const { rows } = await client.query(
        'DELETE FROM post_comments WHERE id = $1 RETURNING id',
        [id]
      );
      if (rows.length === 0) {
        return reply.code(404).send({ error: 'Comment not found' });
      }
      return { message: 'Comment deleted', id };
    } catch (err) {
      fastify.log.error('Admin delete comment error:', err);
      return reply.code(500).send({ error: 'Database error', details: err.message });
    } finally {
      client.release();
    }
  });



  // Delete marriage
  fastify.delete('/marriages/:id', async (request, reply) => {
    const { id } = request.params;
    const query = 'DELETE FROM marriages WHERE id = $1 RETURNING id';
    const client = await pool.connect();
    try {
      const { rows } = await client.query(query, [id]);
      if (rows.length === 0) {
        return reply.code(404).send({ error: 'Marriage not found' });
      }
      return { message: 'Marriage deleted', id };
    } catch (err) {
      console.error(err);
      return reply.code(500).send({ error: 'Database error', details: err.message });
    } finally {
      client.release();
    }
  });

  // =========================================================
  // MEDIA ROUTES - Albums and Photos
  // =========================================================

  // --- ALBUMS ---

  // Get all albums (robust)
  fastify.get('/albums', async (request, reply) => {
    const query = `
      SELECT 
        a.*, 
        p.secure_url as cover_url,
        (SELECT COUNT(*) FROM public.photos WHERE album_id = a.id) as photo_count
      FROM public.photo_albums a
      LEFT JOIN public.photos p ON p.id = a.cover_photo_id
      ORDER BY a.created_at DESC
    `;
    let client;
    try {
      client = await pool.connect();
    } catch (err) {
      console.error('DB connection failed:', err);
      return reply.code(503).send({ error: 'Database unavailable' });
    }
    try {
      const { rows } = await client.query(query);
      return rows;
    } catch (err) {
      console.error(err);
      return reply.code(500).send({ error: 'Failed to load albums', code: err.code });
    } finally {
      client.release();
    }
  });

  // Get single album with photos (robust)
  fastify.get('/albums/:id', async (request, reply) => {
    const { id } = request.params;
    let client;
    try {
      client = await pool.connect();
    } catch (err) {
      console.error('DB connection failed:', err);
      return reply.code(503).send({ error: 'Database unavailable' });
    }
    try {
      const albumQuery = `
        SELECT a.*, p.secure_url as cover_url
        FROM public.photo_albums a
        LEFT JOIN public.photos p ON p.id = a.cover_photo_id
        WHERE a.id = $1
      `;
      const photosQuery = `
        SELECT * FROM public.photos 
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
      return { ...albumRes.rows[0], photos: photosRes.rows };
    } catch (err) {
      console.error(err);
      return reply.code(500).send({ error: 'Failed to load album', code: err.code });
    } finally {
      client.release();
    }
  });

  // Create album (robust)
  fastify.post('/albums', async (request, reply) => {
    const { title, description } = request.body;
    if (!title) {
      return reply.code(400).send({ error: 'Title is required' });
    }
    const created_by = request.user.id;
    const query = `
      INSERT INTO public.photo_albums (title, description, created_by)
      VALUES ($1, $2, $3)
      RETURNING *
    `;
    let client;
    try {
      client = await pool.connect();
    } catch (err) {
      console.error('DB connection failed:', err);
      return reply.code(503).send({ error: 'Database unavailable' });
    }
    try {
      const { rows } = await client.query(query, [title, description, created_by]);
      const album = rows[0];
      notifyMediaUpload({
        type: 'album',
        id: album.id,
        title: album.title,
        uploadedBy: created_by,
      }).catch(() => {});
      return album;
    } catch (err) {
      console.error(err);
      return reply.code(500).send({ error: 'Failed to create album', code: err.code });
    } finally {
      client.release();
    }
  });

  // Update album (robust)
  fastify.put('/albums/:id', async (request, reply) => {
    const { id } = request.params;
    const { title, description, cover_photo_id } = request.body;
    if (!title) {
      return reply.code(400).send({ error: 'Title is required' });
    }
    const query = `
      UPDATE public.photo_albums
      SET title = $1, description = $2, cover_photo_id = $3, updated_at = NOW()
      WHERE id = $4
      RETURNING *
    `;
    let client;
    try {
      client = await pool.connect();
    } catch (err) {
      console.error('DB connection failed:', err);
      return reply.code(503).send({ error: 'Database unavailable' });
    }
    try {
      const { rows } = await client.query(query, [title, description, cover_photo_id, id]);
      if (rows.length === 0) {
        return reply.code(404).send({ error: 'Album not found' });
      }
      return rows[0];
    } catch (err) {
      console.error(err);
      return reply.code(500).send({ error: 'Failed to update album', code: err.code });
    } finally {
      client.release();
    }
  });

  // Delete album (robust)
  fastify.delete('/albums/:id', async (request, reply) => {
    const { id } = request.params;
    let client;
    try {
      client = await pool.connect();
    } catch (err) {
      console.error('DB connection failed:', err);
      return reply.code(503).send({ error: 'Database unavailable' });
    }
    try {
      const { rows } = await client.query(
        'DELETE FROM public.photo_albums WHERE id = $1 RETURNING id',
        [id]
      );
      if (rows.length === 0) {
        return reply.code(404).send({ error: 'Album not found' });
      }
      return { message: 'Album deleted', id };
    } catch (err) {
      console.error(err);
      return reply.code(500).send({ error: 'Failed to delete album', code: err.code });
    } finally {
      client.release();
    }
  });

  // --- PHOTOS ---

  // Get all photos (robust)
  fastify.get('/photos', async (request, reply) => {
    const { album_id, limit = 50, offset = 0 } = request.query;
    
    let query = `
      SELECT p.*, a.title as album_title
      FROM public.photos p
      LEFT JOIN public.photo_albums a ON a.id = p.album_id
    `;
    const params = [];
    
    if (album_id) {
      params.push(album_id);
      query += ` WHERE p.album_id = $${params.length}`;
    }
    
    query += ` ORDER BY p.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    let client;
    try {
      client = await pool.connect();
    } catch (err) {
      console.error('DB connection failed:', err);
      return reply.code(503).send({ error: 'Database unavailable' });
    }
    try {
      const { rows } = await client.query(query, params);
      
      // Get total count
      let countQuery = 'SELECT COUNT(*) FROM public.photos';
      const countParams = [];
      if (album_id) {
        countParams.push(album_id);
        countQuery += ` WHERE album_id = $1`;
      }
      const countRes = await client.query(countQuery, countParams);
      
      return {
        photos: rows,
        total: parseInt(countRes.rows[0].count),
        limit: parseInt(limit),
        offset: parseInt(offset)
      };
    } catch (err) {
      console.error(err);
      return reply.code(500).send({ error: 'Failed to load photos', code: err.code });
    } finally {
      client.release();
    }
  });

  // Get single photo (robust)
  fastify.get('/photos/:id', async (request, reply) => {
    const { id } = request.params;
    const query = `
      SELECT p.*, a.title as album_title
      FROM public.photos p
      LEFT JOIN public.photo_albums a ON a.id = p.album_id
      WHERE p.id = $1
    `;
    let client;
    try {
      client = await pool.connect();
    } catch (err) {
      console.error('DB connection failed:', err);
      return reply.code(503).send({ error: 'Database unavailable' });
    }
    try {
      const { rows } = await client.query(query, [id]);
      if (rows.length === 0) {
        return reply.code(404).send({ error: 'Photo not found' });
      }
      return rows[0];
    } catch (err) {
      console.error(err);
      return reply.code(500).send({ error: 'Failed to load photo', code: err.code });
    } finally {
      client.release();
    }
  });

  // Save photo metadata (robust)
  fastify.post('/photos', async (request, reply) => {
    const { 
      album_id, 
      public_id, 
      secure_url, 
      width, 
      height, 
      format, 
      caption, 
      tags 
    } = request.body;

    // Validate required fields
    if (!public_id || !secure_url || !width || !height || !format) {
      return reply.code(400).send({ 
        error: 'Missing required fields',
        required: ['public_id', 'secure_url', 'width', 'height', 'format']
      });
    }

    const uploaded_by = request.user.id;
    const query = `
      INSERT INTO public.photos (album_id, public_id, secure_url, width, height, format, caption, tags, uploaded_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `;

    let client;
    try {
      client = await pool.connect();
    } catch (err) {
      console.error('DB connection failed:', err);
      return reply.code(503).send({ error: 'Database unavailable' });
    }
    try {
      const { rows } = await client.query(query, [
        album_id || null,
        public_id,
        secure_url,
        width,
        height,
        format,
        caption || null,
        tags || null,
        uploaded_by
      ]);
      const photo = rows[0];
      
      notifyMediaUpload({
        type: 'photo',
        id: photo.id,
        albumId: album_id || null,
        uploadedBy: uploaded_by,
      }).catch(() => {});
      
      return photo;
    } catch (err) {
      console.error(err);
      if (err.code === '23505') { // Unique violation
        return reply.code(400).send({ error: 'Photo with this public_id already exists' });
      }
      return reply.code(500).send({ error: 'Failed to save photo', code: err.code });
    } finally {
      client.release();
    }
  });

  // Update photo (robust)
  fastify.put('/photos/:id', async (request, reply) => {
    const { id } = request.params;
    const { album_id, caption, tags } = request.body;

    const query = `
      UPDATE public.photos
      SET album_id = $1, caption = $2, tags = $3, updated_at = NOW()
      WHERE id = $4
      RETURNING *
    `;

    let client;
    try {
      client = await pool.connect();
    } catch (err) {
      console.error('DB connection failed:', err);
      return reply.code(503).send({ error: 'Database unavailable' });
    }
    try {
      const { rows } = await client.query(query, [album_id, caption, tags, id]);
      if (rows.length === 0) {
        return reply.code(404).send({ error: 'Photo not found' });
      }
      return rows[0];
    } catch (err) {
      console.error(err);
      return reply.code(500).send({ error: 'Failed to update photo', code: err.code });
    } finally {
      client.release();
    }
  });

  // Delete photo (robust)
  fastify.delete('/photos/:id', async (request, reply) => {
    const { id } = request.params;
    let client;
    try {
      client = await pool.connect();
    } catch (err) {
      console.error('DB connection failed:', err);
      return reply.code(503).send({ error: 'Database unavailable' });
    }
    try {
      const { rows } = await client.query(
        'DELETE FROM public.photos WHERE id = $1 RETURNING id, public_id',
        [id]
      );
      if (rows.length === 0) {
        return reply.code(404).send({ error: 'Photo not found' });
      }
      return { 
        message: 'Photo deleted', 
        id,
        public_id: rows[0].public_id // For Cloudinary cleanup
      };
    } catch (err) {
      console.error(err);
      return reply.code(500).send({ error: 'Failed to delete photo', code: err.code });
    } finally {
      client.release();
    }
  });
}



module.exports = adminRoutes;
