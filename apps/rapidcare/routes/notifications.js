const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/notificationController');
const { authenticate } = require('../middleware/auth');

// GET /api/notifications - Get user notifications
router.get('/', authenticate, notificationController.getUserNotifications);

// GET /api/notifications/unread-count - Get unread notification count
router.get('/unread-count', authenticate, notificationController.getUnreadCount);

// PUT /api/notifications/:id/read - Mark notification as read
router.put('/:id/read', authenticate, notificationController.markAsRead);

// PUT /api/notifications/mark-all-read - Mark all notifications as read
router.put('/mark-all-read', authenticate, notificationController.markAllAsRead);

// DELETE /api/notifications/:id - Delete notification
router.delete('/:id', authenticate, notificationController.deleteNotification);

module.exports = router;