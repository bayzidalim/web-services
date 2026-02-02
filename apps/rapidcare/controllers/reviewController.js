const Review = require('../models/Review');
const Hospital = require('../models/Hospital');
const { authenticate } = require('../middleware/auth');

const reviewController = {
  // Get reviews for a specific hospital
  getHospitalReviews: (req, res) => {
    try {
      const { hospitalId } = req.params;
      const { 
        page = 1, 
        limit = 10, 
        rating = null, 
        sortBy = 'createdAt', 
        sortOrder = 'DESC' 
      } = req.query;
      
      const offset = (page - 1) * limit;
      
      const reviews = Review.findByHospitalId(hospitalId, {
        limit: parseInt(limit),
        offset: parseInt(offset),
        rating: rating ? parseInt(rating) : null,
        sortBy,
        sortOrder: sortOrder.toUpperCase()
      });
      
      const stats = Review.getHospitalStats(hospitalId);
      
      res.json({
        success: true,
        data: {
          reviews,
          stats: {
            totalReviews: stats.totalReviews || 0,
            averageRating: stats.averageRating ? parseFloat(stats.averageRating.toFixed(1)) : 0,
            ratingDistribution: {
              fiveStar: stats.fiveStar || 0,
              fourStar: stats.fourStar || 0,
              threeStar: stats.threeStar || 0,
              twoStar: stats.twoStar || 0,
              oneStar: stats.oneStar || 0
            }
          },
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total: stats.totalReviews || 0,
            pages: Math.ceil((stats.totalReviews || 0) / limit)
          }
        }
      });
    } catch (error) {
      console.error('Get hospital reviews error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch hospital reviews'
      });
    }
  },

  // Get user's reviews
  getUserReviews: (req, res) => {
    try {
      const userId = req.user.id;
      const { page = 1, limit = 10 } = req.query;
      const offset = (page - 1) * limit;
      
      const reviews = Review.findByUserId(userId, {
        limit: parseInt(limit),
        offset: parseInt(offset)
      });
      
      res.json({
        success: true,
        data: reviews
      });
    } catch (error) {
      console.error('Get user reviews error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch user reviews'
      });
    }
  },

  // Create a new review
  createReview: (req, res) => {
    try {
      const userId = req.user.id;
      const { hospitalId, bookingId, rating, title, comment, isAnonymous = false } = req.body;
      
      // Validate required fields
      if (!hospitalId || !rating) {
        return res.status(400).json({
          success: false,
          error: 'Hospital ID and rating are required'
        });
      }
      
      if (rating < 1 || rating > 5) {
        return res.status(400).json({
          success: false,
          error: 'Rating must be between 1 and 5'
        });
      }
      
      // Check if user can review
      const canReview = Review.canUserReview(userId, hospitalId, bookingId);
      if (!canReview.canReview) {
        return res.status(400).json({
          success: false,
          error: canReview.reason
        });
      }
      
      // Create review
      const reviewId = Review.create({
        userId,
        hospitalId,
        bookingId,
        rating,
        title,
        comment,
        isAnonymous,
        isVerified: bookingId ? 1 : 0 // Verified if linked to a booking
      });
      
      // Update hospital rating
      Hospital.updateRating(hospitalId);
      
      const review = Review.findById(reviewId);
      
      res.status(201).json({
        success: true,
        data: review,
        message: 'Review created successfully'
      });
    } catch (error) {
      console.error('Create review error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to create review'
      });
    }
  },

  // Update a review
  updateReview: (req, res) => {
    try {
      const userId = req.user.id;
      const { id } = req.params;
      const { rating, title, comment, isAnonymous } = req.body;
      
      // Check if review exists and belongs to user
      const existingReview = Review.findById(id);
      if (!existingReview) {
        return res.status(404).json({
          success: false,
          error: 'Review not found'
        });
      }
      
      if (existingReview.userId !== userId) {
        return res.status(403).json({
          success: false,
          error: 'You can only update your own reviews'
        });
      }
      
      // Update review
      const updated = Review.update(id, {
        rating,
        title,
        comment,
        isAnonymous
      });
      
      if (!updated) {
        return res.status(400).json({
          success: false,
          error: 'Failed to update review'
        });
      }
      
      // Update hospital rating if rating was changed
      if (rating !== undefined) {
        Hospital.updateRating(existingReview.hospitalId);
      }
      
      const review = Review.findById(id);
      
      res.json({
        success: true,
        data: review,
        message: 'Review updated successfully'
      });
    } catch (error) {
      console.error('Update review error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to update review'
      });
    }
  },

  // Delete a review
  deleteReview: (req, res) => {
    try {
      const userId = req.user.id;
      const { id } = req.params;
      
      // Check if review exists and belongs to user
      const existingReview = Review.findById(id);
      if (!existingReview) {
        return res.status(404).json({
          success: false,
          error: 'Review not found'
        });
      }
      
      if (existingReview.userId !== userId) {
        return res.status(403).json({
          success: false,
          error: 'You can only delete your own reviews'
        });
      }
      
      // Delete review
      const deleted = Review.delete(id);
      
      if (!deleted) {
        return res.status(400).json({
          success: false,
          error: 'Failed to delete review'
        });
      }
      
      // Update hospital rating after deletion
      Hospital.updateRating(existingReview.hospitalId);
      
      res.json({
        success: true,
        message: 'Review deleted successfully'
      });
    } catch (error) {
      console.error('Delete review error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to delete review'
      });
    }
  },

  // Add helpful vote to a review
  addHelpfulVote: (req, res) => {
    try {
      const userId = req.user.id;
      const { id } = req.params;
      const { isHelpful } = req.body;
      
      // Check if review exists
      const review = Review.findById(id);
      if (!review) {
        return res.status(404).json({
          success: false,
          error: 'Review not found'
        });
      }
      
      // Add helpful vote
      const success = Review.addHelpfulVote(id, userId, isHelpful);
      
      if (!success) {
        return res.status(400).json({
          success: false,
          error: 'Failed to add helpful vote'
        });
      }
      
      res.json({
        success: true,
        message: 'Helpful vote added successfully'
      });
    } catch (error) {
      console.error('Add helpful vote error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to add helpful vote'
      });
    }
  },

  // Get all reviews (admin only)
  getAllReviews: (req, res) => {
    try {
      const { 
        page = 1, 
        limit = 50, 
        hospitalId = null, 
        userId = null, 
        rating = null 
      } = req.query;
      
      const offset = (page - 1) * limit;
      
      const reviews = Review.getAll({
        limit: parseInt(limit),
        offset: parseInt(offset),
        hospitalId: hospitalId ? parseInt(hospitalId) : null,
        userId: userId ? parseInt(userId) : null,
        rating: rating ? parseInt(rating) : null
      });
      
      res.json({
        success: true,
        data: reviews
      });
    } catch (error) {
      console.error('Get all reviews error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch reviews'
      });
    }
  }
};

module.exports = reviewController;
