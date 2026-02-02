const { createClient } = require('@supabase/supabase-js');
const { Pool } = require('pg');
require('dotenv').config({ path: '../.env' }); // Load .env from parent dir

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const databaseUrl = process.env.DATABASE_URL;

if (!supabaseUrl || !supabaseKey || !databaseUrl) {
    console.error('Missing env vars. Ensure SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and DATABASE_URL are set.');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);
const pool = new Pool({ connectionString: databaseUrl });

async function grantAdmin(email) {
    console.log(`Searching for user: ${email}`);
    
    // 1. Get User ID from Supabase Auth (optional, mostly to verify existence)
    /* 
       Note: platform_members stores auth_user_id. 
       We can query platform_members directly by email since we sync it.
    */

    const client = await pool.connect();
    try {
        const res = await client.query('SELECT * FROM platform_members WHERE email = $1', [email]);
        
        if (res.rows.length === 0) {
            console.error('User not found in platform_members table.');
            console.log('Ensure the user has logged in at least once to create a profile.');
            return;
        }

        const user = res.rows[0];
        console.log(`Found user: ${user.full_name} (${user.id})`);
        console.log(`Current Role: ${user.role}, is_admin: ${user.is_admin}`);

        // 2. Update Role
        const updateRes = await client.query(
            `UPDATE platform_members 
             SET role = 'admin', is_admin = true, updated_at = NOW() 
             WHERE id = $1 
             RETURNING *`,
            [user.id]
        );

        const updatedUser = updateRes.rows[0];
        console.log('✅ Admin privileges granted successfully!');
        console.log(`New Role: ${updatedUser.role}, is_admin: ${updatedUser.is_admin}`);

    } catch (err) {
        console.error('Database error:', err);
    } finally {
        client.release();
        await pool.end();
    }
}

grantAdmin('bayzidalim@gmail.com');
