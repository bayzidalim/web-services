import db from '../config/database.js';

// SQL queries for creating tables
const createUsersTable = `
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`;

const createBooksTable = `
  CREATE TABLE IF NOT EXISTS books (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    book_name TEXT NOT NULL,
    author_name TEXT NOT NULL,
    summary TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  )
`;

const createMessagesTable = `
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    book_id INTEGER NOT NULL,
    content TEXT NOT NULL,
    order_index INTEGER,
    FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
  )
`;

const createLessonsTable = `
  CREATE TABLE IF NOT EXISTS lessons (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    book_id INTEGER NOT NULL,
    content TEXT NOT NULL,
    order_index INTEGER,
    FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
  )
`;

const createFlashcardsTable = `
  CREATE TABLE IF NOT EXISTS flashcards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    book_id INTEGER NOT NULL,
    question TEXT NOT NULL,
    answer TEXT NOT NULL,
    order_index INTEGER,
    FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
  )
`;

const createSuggestionsTable = `
  CREATE TABLE IF NOT EXISTS suggestions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    author TEXT NOT NULL,
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`;

// Initialize database with all tables
export const initializeDatabase = () => {
  try {
    db.exec(createUsersTable);
    console.log('Users table created or already exists');

    db.exec(createBooksTable);
    console.log('Books table created or already exists');

    db.exec(createMessagesTable);
    console.log('Messages table created or already exists');

    db.exec(createLessonsTable);
    console.log('Lessons table created or already exists');

    db.exec(createFlashcardsTable);
    console.log('Flashcards table created or already exists');

    db.exec(createSuggestionsTable);
    console.log('Suggestions table created or already exists');

    return Promise.resolve();
  } catch (err) {
    console.error('Error creating tables:', err);
    return Promise.reject(err);
  }
};

export default {
  initializeDatabase
};
