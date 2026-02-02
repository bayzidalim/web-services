import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const dbPath = process.env.FLY_APP_NAME 
  ? '/data/mindlit.db' 
  : join(__dirname, '../../mindlit.db');

// Create database connection
const db = new Database(dbPath);

// Enable WAL mode for better concurrency
db.pragma('journal_mode = WAL');

console.log('Connected to SQLite database');

// Helper functions for consistent API
export const runQuery = (sql, params = []) => {
  try {
    const result = db.prepare(sql).run(params);
    return { id: result.lastInsertRowid, changes: result.changes };
  } catch (err) {
    throw err;
  }
};

export const getQuery = (sql, params = []) => {
  try {
    return db.prepare(sql).get(params);
  } catch (err) {
    throw err;
  }
};

export const allQuery = (sql, params = []) => {
  try {
    return db.prepare(sql).all(params);
  } catch (err) {
    throw err;
  }
};

// Close database on process exit
process.on('exit', () => db.close());
process.on('SIGHUP', () => process.exit(128 + 1));
process.on('SIGINT', () => process.exit(128 + 2));
process.on('SIGTERM', () => process.exit(128 + 15));

export default db;

