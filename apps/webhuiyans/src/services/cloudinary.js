/**
 * Cloudinary Service Module
 * 
 * Handles all Cloudinary operations for the We Bhuiyans project.
 * Uses CLOUDINARY_URL environment variable for configuration.
 * 
 * NOTE: Never expose API secret to frontend. All uploads go through backend.
 */

const cloudinary = require('cloudinary').v2;

// Initialize Cloudinary from environment variable
// CLOUDINARY_URL format: cloudinary://API_KEY:API_SECRET@CLOUD_NAME
if (!process.env.CLOUDINARY_URL) {
  console.error('❌ CLOUDINARY_URL environment variable is not set');
} else {
  // Cloudinary auto-configures from CLOUDINARY_URL env var
  cloudinary.config();
  console.log('✅ Cloudinary configured for cloud:', cloudinary.config().cloud_name);
}

/**
 * Upload an image to Cloudinary
 * 
 * @param {Buffer} buffer - Image file buffer
 * @param {Object} options - Upload options
 * @param {string} options.filename - Original filename (without extension)
 * @param {string} options.folder - Cloudinary folder (default: 'we-bhuiyans')
 * @param {string} options.resourceType - Resource type (default: 'image')
 * @returns {Promise<Object>} Upload result with public_id, secure_url, width, height, format
 */
async function uploadImage(buffer, options = {}) {
  const {
    filename = `upload_${Date.now()}`,
    folder = 'we-bhuiyans',
    resourceType = 'image',
  } = options;

  // Clean filename: remove extension, replace spaces with underscores
  const cleanFilename = filename
    .replace(/\.[^/.]+$/, '') // Remove extension
    .replace(/\s+/g, '_')     // Replace spaces
    .replace(/[^a-zA-Z0-9_-]/g, ''); // Remove special chars

  const publicId = `${folder}/${cleanFilename}_${Date.now()}`;

  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        public_id: publicId,
        resource_type: resourceType,
        folder: '', // Already included in public_id
        use_filename: true,
        unique_filename: false,
        overwrite: true,
        // Optimization
        fetch_format: 'auto', // f_auto
        quality: 'auto',      // q_auto
        // Metadata
        tags: ['we-bhuiyans', 'family-tree'],
      },
      (error, result) => {
        if (error) {
          console.error('❌ Cloudinary upload error:', error.message);
          console.error('   Error details:', JSON.stringify(error, null, 2));
          reject(error);
        } else {
          console.log('✅ Cloudinary upload success:', result.public_id);
          resolve({
            public_id: result.public_id,
            secure_url: result.secure_url,
            width: result.width,
            height: result.height,
            format: result.format,
            bytes: result.bytes,
            created_at: result.created_at,
          });
        }
      }
    );

    // Write buffer to stream
    uploadStream.end(buffer);
  });
}

/**
 * Delete an image from Cloudinary
 * 
 * @param {string} publicId - The public_id of the image to delete
 * @returns {Promise<Object>} Deletion result
 */
async function deleteImage(publicId) {
  try {
    const result = await cloudinary.uploader.destroy(publicId);
    console.log('✅ Cloudinary delete result:', result);
    return result;
  } catch (error) {
    console.error('❌ Cloudinary delete error:', error.message);
    throw error;
  }
}

/**
 * Get optimized URL for an image
 * 
 * @param {string} publicId - The public_id of the image
 * @param {Object} options - Transformation options
 * @returns {string} Optimized image URL
 */
function getOptimizedUrl(publicId, options = {}) {
  const {
    width,
    height,
    crop = 'fill',
    quality = 'auto',
    format = 'auto',
  } = options;

  const transformations = {
    quality,
    fetch_format: format,
  };

  if (width) transformations.width = width;
  if (height) transformations.height = height;
  if (width || height) transformations.crop = crop;

  return cloudinary.url(publicId, transformations);
}

/**
 * Test Cloudinary connection
 * 
 * @returns {Promise<Object>} Ping result
 */
async function testConnection() {
  try {
    const result = await cloudinary.api.ping();
    return { success: true, status: result.status };
  } catch (error) {
    console.error('❌ Cloudinary connection test failed:', error.message);
    return { success: false, error: error.message };
  }
}

module.exports = {
  cloudinary,
  uploadImage,
  deleteImage,
  getOptimizedUrl,
  testConnection,
};
