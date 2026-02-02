import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { runQuery, allQuery } from '../config/database.js';

const router = express.Router();

// GET /api/suggestions - Get all book suggestions
router.get('/', async (req, res, next) => {
  try {
    const suggestions = await allQuery(
      `SELECT id, title, author, description, created_at 
       FROM suggestions ORDER BY created_at DESC`
    );

    res.json({ 
      suggestions: suggestions.map(s => ({
        id: s.id,
        title: s.title,
        author: s.author,
        description: s.description,
        createdAt: s.created_at
      }))
    });
  } catch (error) {
    console.error('Error fetching suggestions:', error);
    next(error);
  }
});

// POST /api/suggestions - Create a new book suggestion (authenticated)
router.post('/', authenticateToken, async (req, res, next) => {
  try {
    const { title, author, description } = req.body;

    // Validate inputs
    if (!title || !author) {
      return res.status(400).json({ 
        error: 'Title and author are required' 
      });
    }

    if (typeof title !== 'string' || typeof author !== 'string') {
      return res.status(400).json({ 
        error: 'Title and author must be strings' 
      });
    }

    if (title.trim().length === 0 || author.trim().length === 0) {
      return res.status(400).json({ 
        error: 'Title and author cannot be empty' 
      });
    }

    // Validate description if provided
    if (description !== undefined && description !== null) {
      if (typeof description !== 'string') {
        return res.status(400).json({ 
          error: 'Description must be a string' 
        });
      }
    }

    // Insert suggestion into database
    const result = await runQuery(
      `INSERT INTO suggestions (title, author, description) 
       VALUES (?, ?, ?)`,
      [title.trim(), author.trim(), description ? description.trim() : null]
    );

    // Return the created suggestion
    res.status(201).json({
      suggestion: {
        id: result.id,
        title: title.trim(),
        author: author.trim(),
        description: description ? description.trim() : null
      }
    });
  } catch (error) {
    console.error('Error creating suggestion:', error);
    next(error);
  }
});

export default router;
