const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
  throw new Error('❌ DATABASE_URL is not set');
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

pool.on('connect', () => {
  console.log('✅ Connected to Supabase Postgres');
});

pool.on('error', (err) => {
  console.error('❌ Postgres pool error:', err);
  process.exit(1);
});

module.exports = pool;
