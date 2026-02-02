const NotificationService = require('../services/notificationService');

// Get user notifications
exports.getUserNotifications = async (req, res) => {
    try {
        const { limit = 50 } = req.query;
        const notifications = NotificationService.getByUserId(req.user.id, parseInt(limit));

        res.json({
            success: true,
            data: notifications,
            count: notifications.length
        });
    } catch (error) {
        console.error('Error fetching notifications:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch notifications'
        });
    }
};

// Get unread notification count
exports.getUnreadCount = async (req, res) => {
    try {
        const count = NotificationService.getUnreadCount(req.user.id);

        res.json({
            success: true,
            data: { count }
        });
    } catch (error) {
        console.error('Error fetching unread count:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch unread count'
        });
    }
};

// Mark notification as read
exports.markAsRead = async (req, res) => {
    try {
        const notificationId = req.params.id;
        const notification = NotificationService.getById(notificationId);

        if (!notification) {
            return res.status(404).json({
                success: false,
                error: 'Notification not found'
            });
        }

        // Check if notification belongs to current user
        if (notification.userId !== req.user.id) {
            return res.status(403).json({
                success: false,
                error: 'Access denied'
            });
        }

        const updatedNotification = NotificationService.markAsRead(notificationId);

        res.json({
            success: true,
            message: 'Notification marked as read',
            data: updatedNotification
        });
    } catch (error) {
        console.error('Error marking notification as read:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to mark notification as read'
        });
    }
};

// Mark all notifications as read
exports.markAllAsRead = async (req, res) => {
    try {
        const updatedCount = NotificationService.markAllAsRead(req.user.id);

        res.json({
            success: true,
            message: `${updatedCount} notifications marked as read`,
            data: { updatedCount }
        });
    } catch (error) {
        console.error('Error marking all notifications as read:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to mark notifications as read'
        });
    }
};

// Delete notification
exports.deleteNotification = async (req, res) => {
    try {
        const notificationId = req.params.id;
        const notification = NotificationService.getById(notificationId);

        if (!notification) {
            return res.status(404).json({
                success: false,
                error: 'Notification not found'
            });
        }

        // Check if notification belongs to current user
        if (notification.userId !== req.user.id) {
            return res.status(403).json({
                success: false,
                error: 'Access denied'
            });
        }

        const deleted = NotificationService.delete(notificationId);

        if (deleted) {
            res.json({
                success: true,
                message: 'Notification deleted successfully'
            });
        } else {
            res.status(500).json({
                success: false,
                error: 'Failed to delete notification'
            });
        }
    } catch (error) {
        console.error('Error deleting notification:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to delete notification'
        });
    }
};