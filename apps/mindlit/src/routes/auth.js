import express from 'express';
import { runQuery, getQuery } from '../config/database.js';
import { generateToken, hashPassword, comparePassword, authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// POST /api/auth/register - User registration endpoint
router.post('/register', async (req, res, next) => {
  try {
    const { username, email, password } = req.body;

    // Input validation
    if (!username || !email || !password) {
      return res.status(400).json({ 
        error: 'Username, email, and password are required' 
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    // Validate password length (minimum 8 characters)
    if (password.length < 8) {
      return res.status(400).json({ 
        error: 'Password must be at least 8 characters long' 
      });
    }

    // Validate username length
    if (username.length < 3) {
      return res.status(400).json({ 
        error: 'Username must be at least 3 characters long' 
      });
    }

    // Hash password
    const passwordHash = await hashPassword(password);

    // Insert user into database
    const query = `
      INSERT INTO users (username, email, password_hash)
      VALUES (?, ?, ?)
    `;

    try {
      const result = runQuery(query, [username, email, passwordHash]);

      // Generate JWT token
      const token = generateToken(result.id);

      // Return success response
      res.status(201).json({
        token,
        user: {
          id: result.id,
          username,
          email
        }
      });
    } catch (err) {
      // Handle unique constraint violations
      if (err.message.includes('UNIQUE constraint failed: users.email')) {
        return res.status(409).json({ error: 'Email already exists' });
      }
      if (err.message.includes('UNIQUE constraint failed: users.username')) {
        return res.status(409).json({ error: 'Username already exists' });
      }
      throw err;
    }
  } catch (error) {
    next(error);
  }
});

// POST /api/auth/login - User login endpoint
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;

    // Input validation
    if (!email || !password) {
      return res.status(400).json({ 
        error: 'Email and password are required' 
      });
    }

    // Query user from database
    const query = `SELECT id, username, email, password_hash FROM users WHERE email = ?`;

    const user = getQuery(query, [email]);

    // Check if user exists
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Validate password
    const isPasswordValid = await comparePassword(password, user.password_hash);

    if (!isPasswordValid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Generate JWT token
    const token = generateToken(user.id);

    // Return success response
    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email
      }
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/auth/me - User verification endpoint (protected route)
router.get('/me', authenticateToken, (req, res, next) => {
  try {
    // Query user from database using userId from token
    const query = `SELECT id, username, email, created_at FROM users WHERE id = ?`;

    const user = getQuery(query, [req.userId]);

    // Check if user exists
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Return user information
    res.json({
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        createdAt: user.created_at
      }
    });
  } catch (error) {
    next(error);
  }
});

export default router;
