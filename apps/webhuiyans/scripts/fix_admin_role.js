require('dotenv').config();
const pool = require('../src/config/database');

async function fixAdmin() {
    console.log('🔧 Fixing Admin Role...');
    const client = await pool.connect();
    try {
        // Find non-test users (the real developer)
        const { rows } = await client.query(`
            SELECT * FROM platform_members 
            WHERE email NOT LIKE '%@test.webhuiyans.com'
        `);

        if (rows.length === 0) {
            console.log('⚠️ No real users found to promote.');
            return;
        }

        for (const user of rows) {
            console.log(`Promoting user: ${user.full_name} (${user.email}) to ADMIN`);
            await client.query(`
                UPDATE platform_members 
                SET role = 'admin' 
                WHERE id = $1
            `, [user.id]);
        }
        console.log('✅ Done.');

    } catch (err) {
        console.error('❌ Error:', err);
    } finally {
        client.release();
        process.exit(0);
    }
}

fixAdmin();
