# Kanban Backend - SQLite3

A Node.js backend for the Kanban application using SQLite3 as the database.

## 🗄️ Database Setup

### SQLite3 Database
- **Location**: `db/kanban.db`
- **Tables**: `users`, `tasks`
- **Features**: Foreign keys, indexes, constraints

### Database Schema

#### Users Table
```sql
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

#### Tasks Table
```sql
CREATE TABLE tasks (
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
);
```

## 🚀 Getting Started

### Prerequisites
- Node.js (v14 or higher)
- npm

### Installation
```bash
npm install
```

### Environment Variables
Create a `.env` file in the root directory:
```env
PORT=5000
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
NODE_ENV=development
```

### Database Initialization
```bash
npm run init-db
```

### Running the Server
```bash
# Development mode
npm run dev

# Production mode
npm start
```

## 📁 Project Structure

```
kanban-backend/
├── db/                    # Database files
│   ├── init.js           # Database initialization
│   ├── connection.js     # Database connection utility
│   └── kanban.db         # SQLite3 database file (created after init)
├── models/               # Data models
│   ├── User.js          # User model with SQLite3 operations
│   └── Task.js          # Task model with SQLite3 operations
├── controllers/          # Route controllers
│   ├── authController.js # Authentication logic
│   └── taskController.js # Task CRUD operations
├── middleware/           # Express middleware
│   └── authMiddleware.js # JWT authentication
├── routes/              # API routes
│   ├── authRoutes.js    # Authentication routes
│   └── taskRoutes.js    # Task routes
├── server.js            # Main server file
├── package.json         # Dependencies and scripts
└── README.md           # This file
```

## 🔧 API Endpoints

### Authentication
- `POST /api/auth/register` - Register a new user
- `POST /api/auth/login` - Login user

### Tasks
- `GET /api/tasks` - Get all tasks for authenticated user
- `POST /api/tasks` - Create a new task
- `PUT /api/tasks/:id` - Update a task
- `DELETE /api/tasks/:id` - Delete a task

### Health Check
- `GET /api/health` - Server health status

## 🔐 Authentication

The API uses JWT (JSON Web Tokens) for authentication:

1. **Register**: Create account with email and password
2. **Login**: Get JWT token
3. **Protected Routes**: Include token in Authorization header
   ```
   Authorization: Bearer <your-jwt-token>
   ```

## 🛠️ Development

### Database Operations
The application uses a custom database utility with promise-based operations:

```javascript
const { runQuery, getRow, getAll } = require('./db/connection');

// Insert/Update/Delete
await runQuery('INSERT INTO users (email, password) VALUES (?, ?)', [email, password]);

// Get single row
const user = await getRow('SELECT * FROM users WHERE id = ?', [userId]);

// Get multiple rows
const tasks = await getAll('SELECT * FROM tasks WHERE user_id = ?', [userId]);
```

### Error Handling
All database operations include proper error handling and logging.

## 🔒 Security Features

- **Password Hashing**: bcryptjs for secure password storage
- **JWT Authentication**: Secure token-based authentication
- **Input Validation**: Server-side validation for all inputs
- **SQL Injection Protection**: Parameterized queries
- **CORS**: Configured for frontend communication

## 📊 Performance

- **Indexes**: Created on frequently queried columns
- **Foreign Keys**: Proper relationships with cascade delete
- **Connection Pooling**: Efficient database connections

## 🚀 Deployment

### Local Development
```bash
npm run dev
```

### Production
```bash
npm start
```

### Environment Variables for Production
- Set `NODE_ENV=production`
- Use a strong `JWT_SECRET`
- Configure appropriate `PORT`

## 🔍 Troubleshooting

### Common Issues

1. **Database not found**: Run `npm run init-db`
2. **Port already in use**: Change `PORT` in `.env`
3. **JWT errors**: Check `JWT_SECRET` in `.env`

### Logs
Check console output for detailed error messages and database operations. 