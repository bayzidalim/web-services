const SocialPost = require('../models/SocialPost');

// Get all posts with filters
exports.getAllPosts = async (req, res) => {
  try {
    const { hospitalId, postType, isAdminVerified, limit = 50, offset = 0 } = req.query;
    
    const filters = {
      limit: parseInt(limit),
      offset: parseInt(offset)
    };
    
    if (hospitalId) filters.hospitalId = parseInt(hospitalId);
    if (postType) filters.postType = postType;
    if (isAdminVerified !== undefined) filters.isAdminVerified = isAdminVerified === 'true';
    
    const posts = SocialPost.findAll(filters);
    
    // Check if current user has liked each post
    if (req.user) {
      posts.forEach(post => {
        post.hasUserLiked = SocialPost.hasUserLiked(post.id, req.user.id);
      });
    }
    
    res.json({
      success: true,
      data: posts,
      count: posts.length
    });
  } catch (error) {
    console.error('Error fetching posts:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch posts'
    });
  }
};

// Get single post by ID
exports.getPostById = async (req, res) => {
  try {
    const { id } = req.params;
    const post = SocialPost.findById(id);
    
    if (!post) {
      return res.status(404).json({
        success: false,
        error: 'Post not found'
      });
    }
    
    // Increment view count
    SocialPost.incrementViews(id);
    
    // Check if current user has liked the post
    if (req.user) {
      post.hasUserLiked = SocialPost.hasUserLiked(post.id, req.user.id);
    }
    
    // Get comments
    post.comments = SocialPost.getComments(id);
    
    res.json({
      success: true,
      data: post
    });
  } catch (error) {
    console.error('Error fetching post:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch post'
    });
  }
};

// Create new post
exports.createPost = async (req, res) => {
  try {
    const { hospitalId, postType, title, content } = req.body;
    
    // Validation
    if (!hospitalId || !postType || !title || !content) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields'
      });
    }
    
    if (!['experience', 'complaint', 'problem', 'moment'].includes(postType)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid post type'
      });
    }
    
    if (title.length < 5 || title.length > 200) {
      return res.status(400).json({
        success: false,
        error: 'Title must be between 5 and 200 characters'
      });
    }
    
    if (content.length < 10 || content.length > 5000) {
      return res.status(400).json({
        success: false,
        error: 'Content must be between 10 and 5000 characters'
      });
    }
    
    const postData = {
      userId: req.user.id,
      hospitalId: parseInt(hospitalId),
      postType,
      title: title.trim(),
      content: content.trim()
    };
    
    const post = SocialPost.create(postData);
    
    res.status(201).json({
      success: true,
      data: post,
      message: 'Post created successfully'
    });
  } catch (error) {
    console.error('Error creating post:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create post'
    });
  }
};

// Update post
exports.updatePost = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, content, postType } = req.body;
    
    const post = SocialPost.findById(id);
    
    if (!post) {
      return res.status(404).json({
        success: false,
        error: 'Post not found'
      });
    }
    
    // Only post owner can update
    if (post.userId !== req.user.id) {
      return res.status(403).json({
        success: false,
        error: 'You can only update your own posts'
      });
    }
    
    const updates = {};
    if (title) updates.title = title.trim();
    if (content) updates.content = content.trim();
    if (postType) updates.postType = postType;
    
    const updatedPost = SocialPost.update(id, updates);
    
    res.json({
      success: true,
      data: updatedPost,
      message: 'Post updated successfully'
    });
  } catch (error) {
    console.error('Error updating post:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update post'
    });
  }
};

// Delete post
exports.deletePost = async (req, res) => {
  try {
    const { id } = req.params;
    const post = SocialPost.findById(id);
    
    if (!post) {
      return res.status(404).json({
        success: false,
        error: 'Post not found'
      });
    }
    
    // Only admin can delete posts
    if (req.user.userType !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Only administrators can delete posts'
      });
    }
    
    SocialPost.delete(id);
    
    res.json({
      success: true,
      message: 'Post deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting post:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete post'
    });
  }
};

// Admin: Verify post
exports.verifyPost = async (req, res) => {
  try {
    const { id } = req.params;
    
    if (req.user.userType !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Only admins can verify posts'
      });
    }
    
    const post = SocialPost.findById(id);
    
    if (!post) {
      return res.status(404).json({
        success: false,
        error: 'Post not found'
      });
    }
    
    const verifiedPost = SocialPost.verifyPost(id, req.user.id);
    
    res.json({
      success: true,
      data: verifiedPost,
      message: 'Post verified successfully'
    });
  } catch (error) {
    console.error('Error verifying post:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to verify post'
    });
  }
};

// Admin: Unverify post
exports.unverifyPost = async (req, res) => {
  try {
    const { id } = req.params;
    
    if (req.user.userType !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Only admins can unverify posts'
      });
    }
    
    const post = SocialPost.findById(id);
    
    if (!post) {
      return res.status(404).json({
        success: false,
        error: 'Post not found'
      });
    }
    
    const unverifiedPost = SocialPost.unverifyPost(id);
    
    res.json({
      success: true,
      data: unverifiedPost,
      message: 'Post verification removed'
    });
  } catch (error) {
    console.error('Error unverifying post:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to unverify post'
    });
  }
};

// Like/Unlike post
exports.toggleLike = async (req, res) => {
  try {
    const { id } = req.params;
    const post = SocialPost.findById(id);
    
    if (!post) {
      return res.status(404).json({
        success: false,
        error: 'Post not found'
      });
    }
    
    const hasLiked = SocialPost.hasUserLiked(id, req.user.id);
    
    if (hasLiked) {
      SocialPost.unlikePost(id, req.user.id);
      res.json({
        success: true,
        liked: false,
        message: 'Post unliked'
      });
    } else {
      SocialPost.likePost(id, req.user.id);
      res.json({
        success: true,
        liked: true,
        message: 'Post liked'
      });
    }
  } catch (error) {
    console.error('Error toggling like:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to toggle like'
    });
  }
};

// Get comments for a post
exports.getComments = async (req, res) => {
  try {
    const { id } = req.params;
    const comments = SocialPost.getComments(id);
    
    res.json({
      success: true,
      data: comments,
      count: comments.length
    });
  } catch (error) {
    console.error('Error fetching comments:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch comments'
    });
  }
};

// Add comment to post
exports.addComment = async (req, res) => {
  try {
    const { id } = req.params;
    const { content } = req.body;
    
    if (!content || content.trim().length < 1) {
      return res.status(400).json({
        success: false,
        error: 'Comment content is required'
      });
    }
    
    if (content.length > 1000) {
      return res.status(400).json({
        success: false,
        error: 'Comment must be less than 1000 characters'
      });
    }
    
    const post = SocialPost.findById(id);
    
    if (!post) {
      return res.status(404).json({
        success: false,
        error: 'Post not found'
      });
    }
    
    const commentId = SocialPost.addComment(id, req.user.id, content.trim());
    
    res.status(201).json({
      success: true,
      data: { id: commentId },
      message: 'Comment added successfully'
    });
  } catch (error) {
    console.error('Error adding comment:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to add comment'
    });
  }
};

// Get social stats
exports.getStats = async (req, res) => {
  try {
    const stats = SocialPost.getStats();
    
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch stats'
    });
  }
};

// Get user's posts
exports.getUserPosts = async (req, res) => {
  try {
    const posts = SocialPost.findAll({ userId: req.user.id });
    
    res.json({
      success: true,
      data: posts,
      count: posts.length
    });
  } catch (error) {
    console.error('Error fetching user posts:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch user posts'
    });
  }
};
