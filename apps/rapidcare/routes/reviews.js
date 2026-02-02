const express = require('express');
const router = express.Router();
const reviewController = require('../controllers/reviewController');
const { authenticate } = require('../middleware/auth');

// Middleware to check if user is admin
const checkAdmin = (req, res, next) => {
  if (req.user.userType !== 'admin') {
    return res.status(403).json({
      success: false,
      error: 'Access denied. Admin privileges required.'
    });
  }
  next();
};

// Public routes
router.get('/hospitals/:hospitalId', reviewController.getHospitalReviews);

// Protected routes (require authentication)
router.use(authenticate);

// User review routes
router.get('/user', reviewController.getUserReviews);
router.post('/', reviewController.createReview);
router.put('/:id', reviewController.updateReview);
router.delete('/:id', reviewController.deleteReview);
router.post('/:id/helpful', reviewController.addHelpfulVote);

// Admin routes
router.get('/admin/all', checkAdmin, reviewController.getAllReviews);

module.exports = router;
