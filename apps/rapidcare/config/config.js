module.exports = {
  port: process.env.PORT || 5000,
  jwtSecret: process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-this-in-production',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '24h',
  nodeEnv: process.env.NODE_ENV || 'development'
}; 