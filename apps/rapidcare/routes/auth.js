const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { authenticate, authorizeUserType } = require('../middleware/auth');

// Public routes
router.post('/register', authController.register);
router.post('/login', authController.login);

// Protected routes
router.get('/profile', authenticate, authController.getProfile);
router.put('/profile', authenticate, authController.updateProfile);
router.put('/change-password', authenticate, authController.changePassword);

// Admin routes
router.get('/users', authenticate, authorizeUserType(['hospital-authority']), authController.getAllUsers);
router.get('/hospital-authorities', authenticate, authorizeUserType(['hospital-authority']), authController.getHospitalAuthorities);
router.post('/assign-hospital', authenticate, authorizeUserType(['hospital-authority']), authController.assignHospital);
router.put('/users/:id/deactivate', authenticate, authorizeUserType(['hospital-authority']), authController.deactivateUser);

module.exports = router; 