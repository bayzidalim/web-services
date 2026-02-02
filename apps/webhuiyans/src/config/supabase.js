const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

console.log('[Supabase Config] URL:', supabaseUrl);
console.log('[Supabase Config] Key Length:', supabaseServiceKey ? supabaseServiceKey.length : 0);

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase URL or Key in .env');
  process.exit(1);
}

// this client has admin privileges (bypasses RLS)
const supabase = createClient(supabaseUrl, supabaseServiceKey);

module.exports = supabase;
