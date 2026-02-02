/**
 * Notification Service
 * 
 * Handles creation of in-app notifications for admin users.
 * Notifications are created for:
 * - New guest signups
 * - Story submissions
 * - Media uploads (photos/albums)
 * 
 * This service is designed to be non-blocking - notification
 * failures should not affect the primary operation.
 */

const pool = require('../config/database');

// Notification types matching the database enum
const NotificationType = {
  GUEST_SIGNUP: 'guest_signup',
  STORY_SUBMISSION: 'story_submission',
  MEDIA_UPLOAD: 'media_upload',
};

/**
 * Create a notification record in the database.
 * This is a fire-and-forget operation - errors are logged but not thrown.
 * 
 * @param {Object} options
 * @param {string} options.type - One of NotificationType values
 * @param {string} options.title - Short title for the notification
 * @param {string} options.message - Descriptive message
 * @param {Object} [options.metadata] - Optional JSON metadata for navigation
 */
async function createNotification({ type, title, message, metadata = null }) {
  const client = await pool.connect();
  try {
    const query = `
      INSERT INTO notifications (type, title, message, metadata)
      VALUES ($1, $2, $3, $4)
      RETURNING id, created_at
    `;
    const { rows } = await client.query(query, [type, title, message, metadata]);
    console.log(`📢 Notification created: [${type}] ${title} (id: ${rows[0].id})`);
    return rows[0];
  } catch (err) {
    // Log but don't throw - notifications are non-blocking
    console.error('Failed to create notification:', err.message);
    return null;
  } finally {
    client.release();
  }
}

/**
 * Create a notification for a new guest signup.
 * 
 * @param {Object} user - The newly signed up user
 * @param {string} user.id - User's UUID
 * @param {string} user.email - User's email
 */
async function notifyGuestSignup(user) {
  return createNotification({
    type: NotificationType.GUEST_SIGNUP,
    title: 'New Guest Registered',
    message: `A new guest has signed up: ${user.email}`,
    metadata: {
      userId: user.id,
      email: user.email,
    },
  });
}

/**
 * Create a notification for a story submission.
 * 
 * @param {Object} story - The created story
 * @param {string} story.id - Story's UUID
 * @param {string} story.title - Story title
 * @param {string} story.created_by - Author's user ID
 */
async function notifyStorySubmission(story) {
  return createNotification({
    type: NotificationType.STORY_SUBMISSION,
    title: 'New Story Submitted',
    message: `A new story was added: "${story.title}"`,
    metadata: {
      storyId: story.id,
      storyTitle: story.title,
      authorId: story.created_by,
    },
  });
}

/**
 * Create a notification for a media upload.
 * 
 * @param {Object} options
 * @param {string} options.type - 'photo' or 'album'
 * @param {string} options.id - Resource ID
 * @param {string} [options.title] - Album title (for albums)
 * @param {string} [options.albumId] - Album ID (for photos)
 * @param {string} options.uploadedBy - Uploader's user ID
 */
async function notifyMediaUpload({ type, id, title, albumId, uploadedBy }) {
  const isAlbum = type === 'album';
  return createNotification({
    type: NotificationType.MEDIA_UPLOAD,
    title: isAlbum ? 'New Album Created' : 'New Photo Uploaded',
    message: isAlbum 
      ? `A new album was created: "${title}"`
      : `A new photo was uploaded${albumId ? ' to an album' : ''}`,
    metadata: {
      mediaType: type,
      resourceId: id,
      albumId: albumId || null,
      albumTitle: title || null,
      uploadedBy,
    },
  });
}

module.exports = {
  NotificationType,
  createNotification,
  notifyGuestSignup,
  notifyStorySubmission,
  notifyMediaUpload,
};
