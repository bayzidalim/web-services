const db = require('../config/database');

class NotificationService {
  // Create notification
  static create(notificationData) {
    const stmt = db.prepare(`
      INSERT INTO notifications (
        userId, type, title, message, data, isRead, createdAt
      ) VALUES (?, ?, ?, ?, ?, 0, CURRENT_TIMESTAMP)
    `);

    const result = stmt.run(
      notificationData.userId,
      notificationData.type,
      notificationData.title,
      notificationData.message,
      JSON.stringify(notificationData.data || {}),
    );

    return this.getById(result.lastInsertRowid);
  }

  // Get notification by ID
  static getById(id) {
    const notification = db.prepare(`
      SELECT * FROM notifications WHERE id = ?
    `).get(id);

    if (!notification) return null;

    return {
      ...notification,
      data: notification.data ? JSON.parse(notification.data) : {},
      isRead: Boolean(notification.isRead)
    };
  }

  // Get notifications for user
  static getByUserId(userId, limit = 50) {
    const notifications = db.prepare(`
      SELECT * FROM notifications 
      WHERE userId = ? 
      ORDER BY createdAt DESC 
      LIMIT ?
    `).all(userId, limit);

    return notifications.map(notification => ({
      ...notification,
      data: notification.data ? JSON.parse(notification.data) : {},
      isRead: Boolean(notification.isRead)
    }));
  }

  // Mark notification as read
  static markAsRead(id) {
    const stmt = db.prepare(`
      UPDATE notifications 
      SET isRead = 1, updatedAt = CURRENT_TIMESTAMP 
      WHERE id = ?
    `);
    
    stmt.run(id);
    return this.getById(id);
  }

  // Mark all notifications as read for user
  static markAllAsRead(userId) {
    const stmt = db.prepare(`
      UPDATE notifications 
      SET isRead = 1, updatedAt = CURRENT_TIMESTAMP 
      WHERE userId = ? AND isRead = 0
    `);
    
    const result = stmt.run(userId);
    return result.changes;
  }

  // Get unread count for user
  static getUnreadCount(userId) {
    const result = db.prepare(`
      SELECT COUNT(*) as count FROM notifications 
      WHERE userId = ? AND isRead = 0
    `).get(userId);

    return result.count;
  }

  // Delete notification
  static delete(id) {
    const stmt = db.prepare('DELETE FROM notifications WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  }

  // Hospital approval notification helpers
  static notifyHospitalApproved(hospitalId, authorityUserId) {
    const hospital = db.prepare('SELECT name FROM hospitals WHERE id = ?').get(hospitalId);
    
    return this.create({
      userId: authorityUserId,
      type: 'hospital_approved',
      title: 'Hospital Approved!',
      message: `Your hospital "${hospital.name}" has been approved and is now visible to users.`,
      data: { hospitalId, hospitalName: hospital.name }
    });
  }

  static notifyHospitalRejected(hospitalId, authorityUserId, reason) {
    const hospital = db.prepare('SELECT name FROM hospitals WHERE id = ?').get(hospitalId);
    
    return this.create({
      userId: authorityUserId,
      type: 'hospital_rejected',
      title: 'Hospital Registration Rejected',
      message: `Your hospital "${hospital.name}" registration was not approved. Reason: ${reason}`,
      data: { hospitalId, hospitalName: hospital.name, reason }
    });
  }

  static notifyHospitalResubmitted(hospitalId, adminUserIds) {
    const hospital = db.prepare('SELECT name FROM hospitals WHERE id = ?').get(hospitalId);
    
    // Notify all admin users
    adminUserIds.forEach(adminId => {
      this.create({
        userId: adminId,
        type: 'hospital_resubmitted',
        title: 'Hospital Resubmitted for Review',
        message: `Hospital "${hospital.name}" has been resubmitted for approval review.`,
        data: { hospitalId, hospitalName: hospital.name }
      });
    });
  }

  // Booking notification helpers
  static async sendBookingApprovalNotification(bookingId, userId, details) {
    return this.create({
      userId,
      type: 'booking_approved',
      title: 'Booking Approved!',
      message: `Your booking for ${details.resourceType} at ${details.hospitalName} has been approved.`,
      data: { bookingId, ...details }
    });
  }

  static async sendBookingDeclineNotification(bookingId, userId, details) {
    return this.create({
      userId,
      type: 'booking_declined',
      title: 'Booking Declined',
      message: `Your booking for ${details.resourceType} at ${details.hospitalName} was declined. Reason: ${details.reason}`,
      data: { bookingId, ...details }
    });
  }

  static async sendBookingCompletionNotification(bookingId, userId, details) {
    return this.create({
      userId,
      type: 'booking_completed',
      title: 'Booking Completed',
      message: `Your booking at ${details.hospitalName} has been marked as completed.`,
      data: { bookingId, ...details }
    });
  }

  static async sendBookingCancellationNotification(bookingId, userId, details) {
    return this.create({
      userId,
      type: 'booking_cancelled',
      title: 'Booking Cancelled',
      message: `Your booking at ${details.hospitalName} has been cancelled.`,
      data: { bookingId, ...details }
    });
  }
}
module.exports = NotificationService;