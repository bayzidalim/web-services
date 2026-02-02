require('dotenv').config();
const pool = require('../src/config/database');

async function seedPicnicMemory() {
    console.log('🧺 Seeding Picnic Memory Post...');
    const client = await pool.connect();

    try {
        // 1. Find a user to attribute the post to (Admin or Family member)
        const userRes = await client.query(`
            SELECT id FROM platform_members 
            WHERE role IN ('admin', 'family') 
            LIMIT 1
        `);

        if (userRes.rows.length === 0) {
            console.error('❌ No suitable user found to post this memory.');
            return;
        }

        const userId = userRes.rows[0].id;
        const picnicImageUrl = 'https://images.unsplash.com/photo-1542038784456-1ea8e935640e?ixlib=rb-4.0.3&auto=format&fit=crop&w=1600&q=80'; // Placeholder for "Picnic"
        const content = "The obligatory photo of our family picnic in Poromtola — a moment that reminds us how far we’ve come together.";
        
        // 2. Insert the post
        const insertQuery = `
            INSERT INTO member_posts (
                platform_member_id, 
                content, 
                post_type, 
                media_urls, 
                created_by, 
                created_at, 
                is_seed
            )
            VALUES ($1, $2, 'memory', $3, $4, NOW() - INTERVAL '3 days', TRUE)
            RETURNING id;
        `;
        
        // We need a UUID for created_by. We'll use the user's ID if we can resolve it to a profile->auth id, 
        // but member_posts.created_by is usually auth.users.id. 
        // seed_social.js used '00000000-0000-0000-0000-000000000000'. We'll stick to that for seed data.
        const createdBy = '00000000-0000-0000-0000-000000000000';

        // Prepare media_urls JSONB
        // Using a realistic looking picnic photo
        const mediaUrls = JSON.stringify([picnicImageUrl]);

        const res = await client.query(insertQuery, [userId, content, mediaUrls, createdBy]);
        
        console.log(`✅ Created Picnic Memory Post! ID: ${res.rows[0].id}`);

    } catch (err) {
        console.error('❌ Failed to seed picnic post:', err);
    } finally {
        client.release();
        process.exit(0); // Exit cleanly
    }
}

seedPicnicMemory();
