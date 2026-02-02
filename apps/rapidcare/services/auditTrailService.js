const db = require('../config/database');

class AuditTrailService {
  // Create audit log entry
  static log(auditData) {
    const stmt = db.prepare(`
      INSERT INTO audit_trail (
        event_type, entity_type, entity_id, user_id, 
        changes, metadata, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `);

    const changes = {
      action: auditData.action,
      userType: auditData.userType,
      oldData: auditData.oldData || {},
      newData: auditData.newData || {}
    };

    const result = stmt.run(
      auditData.action, // event_type
      auditData.entityType,
      auditData.entityId.toString(),
      auditData.userId,
      JSON.stringify(changes),
      JSON.stringify(auditData.metadata || {})
    );

    return this.getById(result.lastInsertRowid);
  }

  // Get audit log by ID
  static getById(id) {
    const audit = db.prepare(`
      SELECT a.*, u.name as userName, u.email as userEmail
      FROM audit_trail a
      LEFT JOIN users u ON a.user_id = u.id
      WHERE a.id = ?
    `).get(id);

    if (!audit) return null;

    const changes = audit.changes ? JSON.parse(audit.changes) : {};

    return {
      ...audit,
      action: audit.event_type,
      entityType: audit.entity_type,
      entityId: parseInt(audit.entity_id),
      userId: audit.user_id,
      userType: changes.userType,
      oldData: changes.oldData || {},
      newData: changes.newData || {},
      metadata: audit.metadata ? JSON.parse(audit.metadata) : {},
      createdAt: audit.created_at
    };
  }

  // Get audit trail for entity
  static getByEntity(entityType, entityId, limit = 100) {
    const audits = db.prepare(`
      SELECT a.*, u.name as userName, u.email as userEmail
      FROM audit_trail a
      LEFT JOIN users u ON a.user_id = u.id
      WHERE a.entity_type = ? AND a.entity_id = ?
      ORDER BY a.created_at DESC
      LIMIT ?
    `).all(entityType, entityId.toString(), limit);

    return audits.map(audit => {
      const changes = audit.changes ? JSON.parse(audit.changes) : {};
      return {
        ...audit,
        action: audit.event_type,
        entityType: audit.entity_type,
        entityId: parseInt(audit.entity_id),
        userId: audit.user_id,
        userType: changes.userType,
        oldData: changes.oldData || {},
        newData: changes.newData || {},
        metadata: audit.metadata ? JSON.parse(audit.metadata) : {},
        createdAt: audit.created_at
      };
    });
  }

  // Get audit trail for user
  static getByUser(userId, limit = 100) {
    const audits = db.prepare(`
      SELECT a.*, u.name as userName, u.email as userEmail
      FROM audit_trail a
      LEFT JOIN users u ON a.user_id = u.id
      WHERE a.user_id = ?
      ORDER BY a.created_at DESC
      LIMIT ?
    `).all(userId, limit);

    return audits.map(audit => {
      const changes = audit.changes ? JSON.parse(audit.changes) : {};
      return {
        ...audit,
        action: audit.event_type,
        entityType: audit.entity_type,
        entityId: parseInt(audit.entity_id),
        userId: audit.user_id,
        userType: changes.userType,
        oldData: changes.oldData || {},
        newData: changes.newData || {},
        metadata: audit.metadata ? JSON.parse(audit.metadata) : {},
        createdAt: audit.created_at
      };
    });
  }

  // Hospital approval specific audit methods
  static logHospitalSubmission(hospitalId, authorityUserId, hospitalData) {
    return this.log({
      entityType: 'hospital',
      entityId: hospitalId,
      action: 'submitted',
      userId: authorityUserId,
      userType: 'hospital-authority',
      newData: hospitalData,
      metadata: {
        submittedAt: new Date().toISOString(),
        status: 'pending'
      }
    });
  }

  static logHospitalApproval(hospitalId, adminUserId, approvalData) {
    return this.log({
      entityType: 'hospital',
      entityId: hospitalId,
      action: 'approved',
      userId: adminUserId,
      userType: 'admin',
      oldData: { approval_status: 'pending' },
      newData: { approval_status: 'approved' },
      metadata: {
        approvedAt: new Date().toISOString(),
        notes: approvalData.notes || null
      }
    });
  }

  static logHospitalRejection(hospitalId, adminUserId, rejectionData) {
    return this.log({
      entityType: 'hospital',
      entityId: hospitalId,
      action: 'rejected',
      userId: adminUserId,
      userType: 'admin',
      oldData: { approval_status: 'pending' },
      newData: { approval_status: 'rejected' },
      metadata: {
        rejectedAt: new Date().toISOString(),
        reason: rejectionData.reason,
        notes: rejectionData.notes || null
      }
    });
  }

  static logHospitalResubmission(hospitalId, authorityUserId, resubmissionData) {
    return this.log({
      entityType: 'hospital',
      entityId: hospitalId,
      action: 'resubmitted',
      userId: authorityUserId,
      userType: 'hospital-authority',
      oldData: { approval_status: 'rejected' },
      newData: { approval_status: 'pending' },
      metadata: {
        resubmittedAt: new Date().toISOString(),
        changes: resubmissionData.changes || null
      }
    });
  }

  // Get approval workflow metrics
  static getApprovalMetrics(startDate, endDate) {
    const metrics = db.prepare(`
      SELECT 
        event_type as action,
        COUNT(*) as count,
        AVG(
          CASE 
            WHEN event_type = 'approved' THEN 
              (julianday(created_at) - julianday(
                (SELECT created_at FROM audit_trail a2 
                 WHERE a2.entity_type = 'hospital' 
                 AND a2.entity_id = audit_trail.entity_id 
                 AND a2.event_type = 'submitted' 
                 ORDER BY a2.created_at DESC LIMIT 1)
              )) * 24
            ELSE NULL 
          END
        ) as avg_approval_time_hours
      FROM audit_trail 
      WHERE entity_type = 'hospital' 
      AND event_type IN ('submitted', 'approved', 'rejected', 'resubmitted')
      AND created_at BETWEEN ? AND ?
      GROUP BY event_type
    `).all(startDate, endDate);

    return metrics;
  }

  // Get approval efficiency stats
  static getApprovalEfficiency() {
    const stats = db.prepare(`
      SELECT 
        COUNT(CASE WHEN event_type = 'submitted' THEN 1 END) as total_submissions,
        COUNT(CASE WHEN event_type = 'approved' THEN 1 END) as total_approvals,
        COUNT(CASE WHEN event_type = 'rejected' THEN 1 END) as total_rejections,
        COUNT(CASE WHEN event_type = 'resubmitted' THEN 1 END) as total_resubmissions,
        AVG(
          CASE 
            WHEN event_type = 'approved' THEN 
              (julianday(created_at) - julianday(
                (SELECT created_at FROM audit_trail a2 
                 WHERE a2.entity_type = 'hospital' 
                 AND a2.entity_id = audit_trail.entity_id 
                 AND a2.event_type = 'submitted' 
                 ORDER BY a2.created_at DESC LIMIT 1)
              )) * 24
            ELSE NULL 
          END
        ) as avg_approval_time_hours
      FROM audit_trail 
      WHERE entity_type = 'hospital'
    `).get();

    return {
      ...stats,
      approval_rate: stats.total_submissions > 0 ? 
        (stats.total_approvals / stats.total_submissions * 100).toFixed(2) : 0,
      rejection_rate: stats.total_submissions > 0 ? 
        (stats.total_rejections / stats.total_submissions * 100).toFixed(2) : 0,
      resubmission_rate: stats.total_rejections > 0 ? 
        (stats.total_resubmissions / stats.total_rejections * 100).toFixed(2) : 0
    };
  }
}

module.exports = AuditTrailService;