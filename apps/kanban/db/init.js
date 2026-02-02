const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Create database file in the db folder
const dbPath = process.env.DB_PATH || path.join(__dirname, 'kanban.db');

// Initialize database
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database:', err.message);
  } else {
    console.log('Connected to SQLite database.');
  }
});

// Create tables
db.serialize(() => {
  // Users table
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `, (err) => {
    if (err) {
      console.error('Error creating users table:', err.message);
    } else {
      console.log('Users table created successfully.');
    }
  });

  // Tasks table
  db.run(`
    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      status TEXT DEFAULT 'todo' CHECK (status IN ('todo', 'in-progress', 'completed')),
      priority TEXT DEFAULT 'low' CHECK (priority IN ('low', 'medium', 'high')),
      due_date DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
    )
  `, (err) => {
    if (err) {
      console.error('Error creating tasks table:', err.message);
    } else {
      console.log('Tasks table created successfully.');
    }
  });

  // Create indexes for better performance
  db.run('CREATE INDEX IF NOT EXISTS idx_tasks_user_id ON tasks(user_id)', (err) => {
    if (err) {
      console.error('Error creating tasks user_id index:', err.message);
    } else {
      console.log('Tasks user_id index created successfully.');
    }
  });

  db.run('CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status)', (err) => {
    if (err) {
      console.error('Error creating tasks status index:', err.message);
    } else {
      console.log('Tasks status index created successfully.');
    }
  });

  db.run('CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)', (err) => {
    if (err) {
      console.error('Error creating users email index:', err.message);
    } else {
      console.log('Users email index created successfully.');
    }
  });
});

// Close database connection
db.close((err) => {
  if (err) {
    console.error('Error closing database:', err.message);
  } else {
    console.log('Database connection closed.');
  }
}); 