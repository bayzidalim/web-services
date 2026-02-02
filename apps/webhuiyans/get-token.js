require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY   // IMPORTANT: anon key, not service role
);

async function run() {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: 'bayzidalim@gmail.com',
    password: 'abdulalim'
  });

  if (error) {
    console.error(error);
    return;
  }

  console.log('\nACCESS TOKEN:\n');
  console.log(data.session.access_token);
}

run();
