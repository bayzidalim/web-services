/**
 * Admin Upload Routes
 * 
 * Handles file uploads for the admin dashboard.
 * All routes are protected by requireAdmin middleware.
 * 
 * Endpoints:
 * - POST /uploads/image - Upload an image to Cloudinary
 * - DELETE /uploads/image/:public_id - Delete an image from Cloudinary
 * - GET /uploads/health - Test Cloudinary connection
 */

const { requireAdmin } = require('../middleware/auth');
const { uploadImage, deleteImage, testConnection } = require('../services/cloudinary');

// Allowed image MIME types
const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/avif',
  'image/svg+xml',
];

// Maximum file size (5MB)
const MAX_FILE_SIZE = 5 * 1024 * 1024;

async function uploadRoutes(fastify, options) {
  
  // Apply admin middleware to all routes
  fastify.addHook('preHandler', requireAdmin);

  /**
   * POST /uploads/image
   * 
   * Upload an image to Cloudinary.
   * Accepts multipart/form-data with 'file' field.
   * 
   * Request:
   *   Content-Type: multipart/form-data
   *   Body: file (image file)
   * 
   * Response:
   *   {
   *     success: true,
   *     data: {
   *       public_id: "we-bhuiyans/filename_123456789",
   *       secure_url: "https://res.cloudinary.com/...",
   *       width: 1920,
   *       height: 1080,
   *       format: "jpg"
   *     }
   *   }
   */
  fastify.post('/image', async (request, reply) => {
    try {
      // Get the file from multipart request
      const data = await request.file();
      
      if (!data) {
        return reply.code(400).send({
          success: false,
          error: 'No file uploaded',
          details: 'Request must include a file field with an image',
        });
      }

      // Validate MIME type
      const mimeType = data.mimetype;
      if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
        return reply.code(400).send({
          success: false,
          error: 'Invalid file type',
          details: `Allowed types: ${ALLOWED_MIME_TYPES.join(', ')}`,
          received: mimeType,
        });
      }

      // Read file into buffer
      const chunks = [];
      for await (const chunk of data.file) {
        chunks.push(chunk);
      }
      const buffer = Buffer.concat(chunks);

      // Validate file size
      if (buffer.length > MAX_FILE_SIZE) {
        return reply.code(400).send({
          success: false,
          error: 'File too large',
          details: `Maximum file size is ${MAX_FILE_SIZE / 1024 / 1024}MB`,
          received: `${(buffer.length / 1024 / 1024).toFixed(2)}MB`,
        });
      }

      // Check for empty file
      if (buffer.length === 0) {
        return reply.code(400).send({
          success: false,
          error: 'Empty file',
          details: 'The uploaded file is empty',
        });
      }

      fastify.log.info(`Uploading image: ${data.filename} (${buffer.length} bytes)`);

      // Upload to Cloudinary
      const result = await uploadImage(buffer, {
        filename: data.filename,
        folder: 'we-bhuiyans',
      });

      fastify.log.info(`Image uploaded successfully: ${result.public_id}`);

      return {
        success: true,
        message: 'Image uploaded successfully',
        data: {
          public_id: result.public_id,
          secure_url: result.secure_url,
          width: result.width,
          height: result.height,
          format: result.format,
        },
      };

    } catch (error) {
      fastify.log.error('Upload error:', error);
      
      return reply.code(500).send({
        success: false,
        error: 'Upload failed',
        details: error.message,
      });
    }
  });

  /**
   * DELETE /uploads/image/:public_id
   * 
   * Delete an image from Cloudinary.
   * Note: public_id should be URL-encoded if it contains slashes.
   * 
   * Request:
   *   Params: public_id (URL-encoded Cloudinary public_id)
   * 
   * Response:
   *   {
   *     success: true,
   *     message: "Image deleted successfully"
   *   }
   */
  fastify.delete('/image/:public_id', async (request, reply) => {
    try {
      const { public_id } = request.params;
      
      if (!public_id) {
        return reply.code(400).send({
          success: false,
          error: 'Missing public_id',
          details: 'Please provide the public_id of the image to delete',
        });
      }

      // Decode the public_id (may contain slashes)
      const decodedPublicId = decodeURIComponent(public_id);
      
      fastify.log.info(`Deleting image: ${decodedPublicId}`);

      const result = await deleteImage(decodedPublicId);

      if (result.result === 'ok') {
        return {
          success: true,
          message: 'Image deleted successfully',
          public_id: decodedPublicId,
        };
      } else if (result.result === 'not found') {
        return reply.code(404).send({
          success: false,
          error: 'Image not found',
          details: `No image found with public_id: ${decodedPublicId}`,
        });
      } else {
        return reply.code(500).send({
          success: false,
          error: 'Delete failed',
          details: `Unexpected result: ${result.result}`,
        });
      }

    } catch (error) {
      fastify.log.error('Delete error:', error);
      
      return reply.code(500).send({
        success: false,
        error: 'Delete failed',
        details: error.message,
      });
    }
  });

  /**
   * GET /uploads/health
   * 
   * Test Cloudinary connection.
   * Useful for verifying configuration without uploading.
   * 
   * Response:
   *   {
   *     success: true,
   *     cloudinary: { status: "ok" }
   *   }
   */
  fastify.get('/health', async (request, reply) => {
    try {
      const result = await testConnection();
      
      if (result.success) {
        return {
          success: true,
          message: 'Cloudinary connection healthy',
          cloudinary: {
            status: result.status,
          },
        };
      } else {
        return reply.code(503).send({
          success: false,
          error: 'Cloudinary connection failed',
          details: result.error,
        });
      }

    } catch (error) {
      fastify.log.error('Health check error:', error);
      
      return reply.code(503).send({
        success: false,
        error: 'Health check failed',
        details: error.message,
      });
    }
  });
}

module.exports = uploadRoutes;
