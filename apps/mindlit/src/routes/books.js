import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { generateAllBookContent } from '../services/gemini.js';
import { runQuery, getQuery, allQuery } from '../config/database.js';

const router = express.Router();

// POST /api/books/generate - Generate book summary with AI
router.post('/generate', authenticateToken, async (req, res, next) => {
  try {
    const { bookName, authorName } = req.body;
    const userId = req.userId;

    // Validate inputs
    if (!bookName) {
      return res.status(400).json({ 
        error: 'Book name is required' 
      });
    }

    if (typeof bookName !== 'string') {
      return res.status(400).json({ 
        error: 'Book name must be a string' 
      });
    }

    if (bookName.trim().length === 0) {
      return res.status(400).json({ 
        error: 'Book name cannot be empty' 
      });
    }

    if (authorName && typeof authorName !== 'string') {
      return res.status(400).json({ 
        error: 'Author name must be a string' 
      });
    }

    // Check if book already exists for this user
    const trimmedAuthorName = authorName ? authorName.trim() : '';
    const existingBook = await getQuery(
      `SELECT id FROM books 
       WHERE user_id = ? AND book_name = ? AND author_name = ?`,
      [userId, bookName.trim(), trimmedAuthorName]
    );

    if (existingBook) {
      // Book already exists, retrieve it with all related data
      const bookData = await getBookWithRelatedData(existingBook.id);
      return res.json(bookData);
    }

    // Generate content using Gemini AI
    console.log(`Generating content for "${bookName}" by ${authorName}...`);
    const aiContent = await generateAllBookContent(bookName, authorName);

    // Store book in database
    const bookResult = await runQuery(
      `INSERT INTO books (user_id, book_name, author_name, summary) 
       VALUES (?, ?, ?, ?)`,
      [userId, bookName.trim(), trimmedAuthorName, aiContent.summary]
    );

    const bookId = bookResult.id;

    // Store messages
    const messagePromises = aiContent.messages.map((content, index) => 
      runQuery(
        `INSERT INTO messages (book_id, content, order_index) VALUES (?, ?, ?)`,
        [bookId, content, index]
      )
    );

    // Store lessons
    const lessonPromises = aiContent.lessons.map((content, index) => 
      runQuery(
        `INSERT INTO lessons (book_id, content, order_index) VALUES (?, ?, ?)`,
        [bookId, content, index]
      )
    );

    // Store flashcards
    const flashcardPromises = aiContent.flashcards.map((card, index) => 
      runQuery(
        `INSERT INTO flashcards (book_id, question, answer, order_index) 
         VALUES (?, ?, ?, ?)`,
        [bookId, card.question, card.answer, index]
      )
    );

    // Wait for all inserts to complete
    await Promise.all([
      ...messagePromises,
      ...lessonPromises,
      ...flashcardPromises
    ]);

    // Retrieve complete book data
    const bookData = await getBookWithRelatedData(bookId);

    res.status(201).json(bookData);
  } catch (error) {
    console.error('Error generating book:', error);
    next(error);
  }
});

// GET /api/books/:id - Get single book by ID
router.get('/:id', authenticateToken, async (req, res, next) => {
  try {
    const bookId = req.params.id;
    const userId = req.userId;

    // Validate book ID
    if (!bookId || isNaN(bookId)) {
      return res.status(400).json({ error: 'Invalid book ID' });
    }

    // Check if book exists and belongs to user
    const book = await getQuery(
      `SELECT id, user_id FROM books WHERE id = ?`,
      [bookId]
    );

    if (!book) {
      return res.status(404).json({ error: 'Book not found' });
    }

    if (book.user_id !== userId) {
      return res.status(403).json({ 
        error: 'Access denied: Book does not belong to user' 
      });
    }

    // Retrieve complete book data
    const bookData = await getBookWithRelatedData(bookId);

    res.json(bookData);
  } catch (error) {
    console.error('Error fetching book:', error);
    next(error);
  }
});

// GET /api/books/history - Get all books for authenticated user
router.get('/history', authenticateToken, async (req, res, next) => {
  try {
    const userId = req.userId;

    // Get all books for this user
    const books = await allQuery(
      `SELECT id, book_name, author_name, summary, created_at 
       FROM books WHERE user_id = ? ORDER BY created_at DESC`,
      [userId]
    );

    // For each book, get related data
    const booksWithData = await Promise.all(
      books.map(async (book) => {
        const messages = await allQuery(
          `SELECT id, content, order_index FROM messages 
           WHERE book_id = ? ORDER BY order_index`,
          [book.id]
        );

        const lessons = await allQuery(
          `SELECT id, content, order_index FROM lessons 
           WHERE book_id = ? ORDER BY order_index`,
          [book.id]
        );

        const flashcards = await allQuery(
          `SELECT id, question, answer, order_index FROM flashcards 
           WHERE book_id = ? ORDER BY order_index`,
          [book.id]
        );

        return {
          id: book.id,
          bookName: book.book_name,
          authorName: book.author_name,
          summary: book.summary,
          createdAt: book.created_at,
          messages: messages.map(m => ({
            id: m.id,
            content: m.content,
            orderIndex: m.order_index
          })),
          lessons: lessons.map(l => ({
            id: l.id,
            content: l.content,
            orderIndex: l.order_index
          })),
          flashcards: flashcards.map(f => ({
            id: f.id,
            question: f.question,
            answer: f.answer,
            orderIndex: f.order_index
          }))
        };
      })
    );

    res.json({ books: booksWithData });
  } catch (error) {
    console.error('Error fetching book history:', error);
    next(error);
  }
});

// Helper function to retrieve book with all related data
async function getBookWithRelatedData(bookId) {
  const book = await getQuery(
    `SELECT id, user_id, book_name, author_name, summary, created_at 
     FROM books WHERE id = ?`,
    [bookId]
  );

  if (!book) {
    throw new Error('Book not found');
  }

  const messages = await allQuery(
    `SELECT id, content, order_index FROM messages 
     WHERE book_id = ? ORDER BY order_index`,
    [bookId]
  );

  const lessons = await allQuery(
    `SELECT id, content, order_index FROM lessons 
     WHERE book_id = ? ORDER BY order_index`,
    [bookId]
  );

  const flashcards = await allQuery(
    `SELECT id, question, answer, order_index FROM flashcards 
     WHERE book_id = ? ORDER BY order_index`,
    [bookId]
  );

  return {
    id: book.id,
    userId: book.user_id,
    bookName: book.book_name,
    authorName: book.author_name,
    summary: book.summary,
    createdAt: book.created_at,
    messages: messages.map(m => ({
      id: m.id,
      content: m.content,
      orderIndex: m.order_index
    })),
    lessons: lessons.map(l => ({
      id: l.id,
      content: l.content,
      orderIndex: l.order_index
    })),
    flashcards: flashcards.map(f => ({
      id: f.id,
      question: f.question,
      answer: f.answer,
      orderIndex: f.order_index
    }))
  };
}

export default router;
