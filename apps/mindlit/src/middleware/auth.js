import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const JWT_EXPIRES_IN = '24h';
const SALT_ROUNDS = 10;

// Generate JWT token
export const generateToken = (userId) => {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
};

// Verify JWT token
export const verifyToken = (token) => {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    return null;
  }
};

// Hash password
export const hashPassword = async (password) => {
  return await bcrypt.hash(password, SALT_ROUNDS);
};

// Compare password with hash
export const comparePassword = async (password, hash) => {
  return await bcrypt.compare(password, hash);
};

// Authentication middleware for protected routes
export const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  const decoded = verifyToken(token);
  
  if (!decoded) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  req.userId = decoded.userId;
  next();
};

export default {
  generateToken,
  verifyToken,
  hashPassword,
  comparePassword,
  authenticateToken
};
