const db = require('../config/database');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const config = require('../config/config');

class UserService {
  // Register new user
  static async register(userData) {
    const { email, password, name, phone, userType } = userData;

    // Check if user already exists
    const existingUser = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existingUser) {
      throw new Error('User with this email already exists');
    }

    // Hash password
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Insert user with default balance of 10,000 BDT
    const stmt = db.prepare(`
      INSERT INTO users (email, password, name, phone, userType, balance)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(email, hashedPassword, name, phone, userType, 10000.00);
    const userId = result.lastInsertRowid;

    // If hospital authority, create hospital authority record
    if (userType === 'hospital-authority') {
      const authorityStmt = db.prepare(`
        INSERT INTO hospital_authorities (userId, role, permissions)
        VALUES (?, ?, ?)
      `);
      authorityStmt.run(userId, 'staff', JSON.stringify(['view_hospital', 'update_resources']));
    }

    return this.getById(userId);
  }

  // Login user
  static async login(email, password) {
    const user = db.prepare(`
      SELECT u.*, ha.role, ha.hospitalId, ha.permissions
      FROM users u
      LEFT JOIN hospital_authorities ha ON u.id = ha.userId
      WHERE u.email = ? AND u.isActive = 1
      ORDER BY ha.hospitalId DESC NULLS LAST
      LIMIT 1
    `).get(email);

    if (!user) {
      throw new Error('Invalid email or password');
    }

    // Check password
    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      throw new Error('Invalid email or password');
    }

    // Generate JWT token
    const token = jwt.sign(
      {
        userId: user.id,
        email: user.email,
        userType: user.userType,
        role: user.role,
        hospitalId: user.hospitalId || user.hospital_id
      },
      config.jwtSecret,
      { expiresIn: config.jwtExpiresIn }
    );

    // Remove password from response
    const { password: _, ...userWithoutPassword } = user;
    
    return {
      user: userWithoutPassword,
      token
    };
  }

  // Get user by ID
  static getById(id) {
    const user = db.prepare(`
      SELECT u.*, ha.role, ha.hospitalId as authHospitalId, ha.permissions
      FROM users u
      LEFT JOIN hospital_authorities ha ON u.id = ha.userId
      WHERE u.id = ? AND u.isActive = 1
      ORDER BY ha.hospitalId DESC NULLS LAST
      LIMIT 1
    `).get(id);

    if (!user) return null;

    // Remove password from response
    const { password, ...userWithoutPassword } = user;
    
    // For hospital authorities, use hospitalId from hospital_authorities table if available,
    // otherwise fall back to hospital_id from users table
    if (user.userType === 'hospital-authority') {
      userWithoutPassword.hospitalId = user.authHospitalId || user.hospital_id;
    }
    
    return userWithoutPassword;
  }

  // Get user by email
  static getByEmail(email) {
    const user = db.prepare(`
      SELECT u.*, ha.role, ha.hospitalId, ha.permissions
      FROM users u
      LEFT JOIN hospital_authorities ha ON u.id = ha.userId
      WHERE u.email = ? AND u.isActive = 1
      ORDER BY ha.hospitalId DESC NULLS LAST
      LIMIT 1
    `).get(email);

    if (!user) return null;

    // Remove password from response
    const { password, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }

  // Update user profile
  static updateProfile(id, updateData) {
    const { name, phone } = updateData;
    
    const stmt = db.prepare(`
      UPDATE users 
      SET name = ?, phone = ?, updatedAt = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    
    stmt.run(name, phone, id);
    return this.getById(id);
  }

  // Change password
  static async changePassword(id, currentPassword, newPassword) {
    const user = db.prepare('SELECT password FROM users WHERE id = ?').get(id);
    if (!user) {
      throw new Error('User not found');
    }

    // Verify current password
    const isValidPassword = await bcrypt.compare(currentPassword, user.password);
    if (!isValidPassword) {
      throw new Error('Current password is incorrect');
    }

    // Hash new password
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(newPassword, saltRounds);

    // Update password
    const stmt = db.prepare(`
      UPDATE users 
      SET password = ?, updatedAt = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    
    stmt.run(hashedPassword, id);
    return { message: 'Password updated successfully' };
  }

  // Assign hospital to hospital authority
  static assignHospital(userId, hospitalId, role = 'staff') {
    const permissions = this.getPermissionsForRole(role);
    
    // Check if hospital authority record exists
    const existing = db.prepare('SELECT id FROM hospital_authorities WHERE userId = ?').get(userId);
    
    if (existing) {
      // Update existing record
      const stmt = db.prepare(`
        UPDATE hospital_authorities 
        SET hospitalId = ?, role = ?, permissions = ?, updatedAt = CURRENT_TIMESTAMP
        WHERE userId = ?
      `);
      stmt.run(hospitalId, role, JSON.stringify(permissions), userId);
    } else {
      // Insert new record
      const stmt = db.prepare(`
        INSERT INTO hospital_authorities (userId, hospitalId, role, permissions, updatedAt)
        VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
      `);
      stmt.run(userId, hospitalId, role, JSON.stringify(permissions));
    }
    
    return this.getById(userId);
  }

  // Get permissions for role
  static getPermissionsForRole(role) {
    const permissions = {
      'admin': [
        'view_hospital', 'update_hospital', 'delete_hospital',
        'view_resources', 'update_resources', 'delete_resources',
        'view_surgeons', 'update_surgeons', 'delete_surgeons',
        'view_bookings', 'update_bookings', 'delete_bookings',
        'view_staff', 'update_staff', 'delete_staff'
      ],
      'manager': [
        'view_hospital', 'update_hospital',
        'view_resources', 'update_resources',
        'view_surgeons', 'update_surgeons',
        'view_bookings', 'update_bookings',
        'view_staff'
      ],
      'staff': [
        'view_hospital',
        'view_resources', 'update_resources',
        'view_surgeons',
        'view_bookings', 'update_bookings'
      ]
    };
    
    return permissions[role] || [];
  }

  // Check if user has permission
  static hasPermission(user, permission) {
    if (!user || !user.permissions) return false;
    
    const permissions = JSON.parse(user.permissions);
    return permissions.includes(permission);
  }

  // Get all users (admin only)
  static getAll() {
    const users = db.prepare(`
      SELECT u.*, ha.role, ha.hospitalId, ha.permissions
      FROM users u
      LEFT JOIN hospital_authorities ha ON u.id = ha.userId
      WHERE u.isActive = 1
      ORDER BY u.createdAt DESC
    `).all();

    return users.map(user => {
      const { password, ...userWithoutPassword } = user;
      return userWithoutPassword;
    });
  }

  // Get hospital authorities
  static getHospitalAuthorities() {
    const authorities = db.prepare(`
      SELECT u.id, u.email, u.name, u.phone, u.userType, u.createdAt,
             ha.role, ha.hospitalId, ha.permissions,
             h.name as hospitalName
      FROM users u
      INNER JOIN hospital_authorities ha ON u.id = ha.userId
      LEFT JOIN hospitals h ON ha.hospitalId = h.id
      WHERE u.isActive = 1
      ORDER BY u.createdAt DESC
    `).all();

    return authorities;
  }

  // Deactivate user
  static deactivateUser(id) {
    const stmt = db.prepare(`
      UPDATE users 
      SET isActive = 0, updatedAt = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    
    return stmt.run(id);
  }

  // Verify JWT token
  static verifyToken(token) {
    try {
      const decoded = jwt.verify(token, config.jwtSecret);
      return decoded;
    } catch (error) {
      throw new Error('Invalid token');
    }
  }

  // Create user (for testing purposes)
  static create(userData) {
    const { email, password, name, phone, userType, hospital_id, balance } = userData;

    // Hash password synchronously for testing
    const saltRounds = 10;
    const hashedPassword = bcrypt.hashSync(password, saltRounds);

    // Insert user with default balance
    const stmt = db.prepare(`
      INSERT INTO users (email, password, name, phone, userType, hospital_id, balance)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(email, hashedPassword, name, phone, userType, hospital_id, balance || 10000.00);
    const userId = result.lastInsertRowid;

    // Return user without password
    const user = db.prepare(`
      SELECT id, email, name, phone, userType, hospital_id, createdAt, updatedAt
      FROM users WHERE id = ?
    `).get(userId);

    return user;
  }

  // Generate JWT token (for testing purposes)
  static generateToken(userId) {
    const user = db.prepare(`
      SELECT id, email, userType, hospital_id
      FROM users WHERE id = ?
    `).get(userId);

    if (!user) {
      throw new Error('User not found');
    }

    return jwt.sign(
      {
        userId: user.id,
        email: user.email,
        userType: user.userType,
        hospital_id: user.hospital_id
      },
      config.jwtSecret,
      { expiresIn: config.jwtExpiresIn }
    );
  }
}

module.exports = UserService; 