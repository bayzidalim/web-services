const express = require('express');
const router = express.Router();
const socialController = require('../controllers/socialController');
const { authenticate } = require('../middleware/auth');

// Public routes (anyone can view)
router.get('/posts', socialController.getAllPosts);
router.get('/posts/:id', socialController.getPostById);
router.get('/posts/:id/comments', socialController.getComments);
router.get('/stats', socialController.getStats);

// Protected routes (require authentication)
router.post('/posts', authenticate, socialController.createPost);
router.put('/posts/:id', authenticate, socialController.updatePost);
router.delete('/posts/:id', authenticate, socialController.deletePost);
router.post('/posts/:id/like', authenticate, socialController.toggleLike);
router.post('/posts/:id/comments', authenticate, socialController.addComment);
router.get('/my-posts', authenticate, socialController.getUserPosts);

// Admin routes
router.post('/posts/:id/verify', authenticate, socialController.verifyPost);
router.post('/posts/:id/unverify', authenticate, socialController.unverifyPost);

module.exports = router;
