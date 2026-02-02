require('dotenv').config();
const pool = require('../src/config/database');

// Configuration
const CONFIG = {
    USER_COUNT: 8,
    POST_COUNT: 20,
    COMMENT_COUNT: 60,
    START_DATE: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 days ago
};

// Helper to get random item
const random = (arr) => arr[Math.floor(Math.random() * arr.length)];
const randomInt = (min, max) => Math.floor(Math.random() * (max - min + 1) + min);

// Specific Test Users
const TEST_USERS = [
    { name: 'Test User 1', role: 'admin', gender: 'male', bio: 'Passionate about preserving our family legacy.' },
    { name: 'Test User 2', role: 'family', gender: 'female', bio: 'Love connecting with cousins from all over!' },
    { name: 'Test User 3', role: 'family', gender: 'male', bio: 'Tech enthusiast and family historian.' },
    { name: 'Test User 4', role: 'historian', gender: 'female', bio: 'Documenting stories that matter.' },
    { name: 'Test User 5', role: 'family', gender: 'male', bio: 'Here for the food and the company 😄' },
    { name: 'Test User 6', role: 'outsider', gender: 'female', bio: 'Friend of the family since college.' },
    { name: 'Test User 7', role: 'guest', gender: 'male', bio: 'Just looking around.' },
    { name: 'Test User 8', role: 'family', gender: 'female', bio: 'Mother of two, keeping traditions alive.' }
];

const POST_TEMPLATES = [
    "Feeling proud to be part of this family archive! It's amazing to see how far we've come.",
    "Just found this old photo in the attic. Does anyone recognize the person on the left?",
    "Happy to see everyone gathering here. This digital home means a lot.",
    "The new family tree visualization is fantastic! Thanks to the team for building this.",
    "Does anyone have the recipe for Nanu's beef bhuna? I'm missing it terribly today.",
    "Visiting the village home this weekend. The weather is perfect.",
    "Remembering our elders today. Their sacrifices made our lives possible.",
    "Can we organize a virtual meetup soon? It's been too long!",
    "Just updated my profile with recent photos. Check them out!",
    "The stories section is my favorite part of this site. So much history.",
    "Who is managing the upcoming Eid reunion? I'd like to volunteer.",
    "Found a letter from 1971. It's heartbreaking but inspiring.",
    "Eid Mubarak in advance to everyone! 🌙",
    "Does anyone know exactly when the old house was built?",
    "So grateful for this community. ❤️"
];

const COMMENT_TEMPLATES = [
    "Absolutely agree!",
    "This is wonderful news.",
    "I believe it was around 1965.",
    "Count me in!",
    "Beautifully said.",
    "Miss you all!",
    "Great catch!",
    "I'll check my archives and let you know.",
    "Admin, can you verify this?",
    "Haha, good times!",
    "SubhanAllah.",
    "Let's make it happen.",
    "Can't wait to see more.",
    "Sending love from London.",
    "Please share more details.",
    "Yes, totally!",
    "Wow.",
    "Thanks for sharing, bhai."
];

async function seed() {
    console.log('🌱 Starting Social Data Seeding...');
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // 1. CLEANUP
        console.log('🧹 Cleaning up old seed data...');
        // Order matters for FK constraints
        await client.query('DELETE FROM post_comments WHERE is_seed = TRUE');
        await client.query('DELETE FROM member_posts WHERE is_seed = TRUE');
        // We delete profiles via CASCADE from platform_members deletion?
        // Let's rely on DELETE CASCADE triggers/constraints for profiles
        // But first, let's find the seed members IDs to ensure clean cascade?
        // Actually, schema 012 defined ON DELETE CASCADE for profiles from platform_members.
        await client.query('DELETE FROM platform_members WHERE is_seed = TRUE');
        
        console.log('✅ Cleanup done.');

        // 2. CREATE USERS
        console.log('👥 Creating test users...');
        const userIds = [];

        for (const u of TEST_USERS) {
            const email = `${u.name.toLowerCase().replace(' ', '.')}@test.webhuiyans.com`;
            
            // Create Platform Member
            const userRes = await client.query(`
                INSERT INTO platform_members (full_name, email, role, status, is_seed, updated_at)
                VALUES ($1, $2, $3, 'approved', TRUE, NOW())
                RETURNING id
            `, [u.name, email, u.role]);
            
            const userId = userRes.rows[0].id;
            userIds.push(userId);

            // Create Member Profile
            // Generate deterministic avatar color/initial logic placeholder or use a UI-availatar service if wanted.
            // For now specific URLs or null (UI handles initials)
            // Let's use a dummy service for visual flair if possible, or just null/initials. 
            // The prompt "Ensure avatars... look realistic". 
            // Let's try to use ui-avatars.com or just rely on the UI initials we built already. The UI uses initials and colors nicely.
            // BUT, let's add a few random valid URLs for variety if we want 'realistic'.
            
            await client.query(`
                INSERT INTO member_profiles (platform_member_id, bio, visibility)
                VALUES ($1, $2, 'public')
                ON CONFLICT (platform_member_id) DO NOTHING
            `, [userId, u.bio]);
        }

        // 3. CREATE POSTS
        console.log('📝 Creating dummy posts...');
        const postIds = [];
        const endDate = new Date();
        const startDate = CONFIG.START_DATE;

        for (let i = 0; i < CONFIG.POST_COUNT; i++) {
            const authorId = random(userIds);
            const content = random(POST_TEMPLATES);
            // Random time in last 30 days
            const createdAt = new Date(startDate.getTime() + Math.random() * (endDate.getTime() - startDate.getTime()));
            
            const postRes = await client.query(`
                INSERT INTO member_posts (platform_member_id, content, is_seed, created_at, created_by)
                VALUES ($1, $2, TRUE, $3, $4)
                RETURNING id
            `, [authorId, content, createdAt, '00000000-0000-0000-0000-000000000000']); // Dummy GUID for created_by audit if needed, or just nullable? 
            // Wait, member_posts `created_by` usually refers to auth.users.id. 
            // In migration 009, created_by is UUID but NOT NULL? 
            // Let's check schema. If needed, we might need a dummy UUID. 
            // Migration 009: created_by UUID NOT NULL.
            // We use a dummy UUID.

            postIds.push({ id: postRes.rows[0].id, createdAt });
        }

        // 4. CREATE COMMENTS
        console.log('💬 Creating dummy comments...');
        for (let i = 0; i < CONFIG.COMMENT_COUNT; i++) {
            const post = random(postIds);
            const authorId = random(userIds);
            
            // Get author name
            const nameRes = await client.query('SELECT full_name FROM platform_members WHERE id = $1', [authorId]);
            const authorName = nameRes.rows[0].full_name;

            const content = random(COMMENT_TEMPLATES);
            
            // Comment time: post time + random minutes (5min to 2 days)
            const commentTime = new Date(post.createdAt.getTime() + randomInt(5 * 60 * 1000, 48 * 60 * 60 * 1000));
            // Ensure not in future
            const finalCommentTime = commentTime > new Date() ? new Date() : commentTime;

            await client.query(`
                INSERT INTO post_comments (post_id, author_platform_member_id, author_name, content, is_seed, created_at)
                VALUES ($1, $2, $3, $4, TRUE, $5)
            `, [post.id, authorId, authorName, content, finalCommentTime]);
        }

        await client.query('COMMIT');
        console.log('🎉 Seeding completed successfully!');
        console.log(`stats: ${userIds.length} users, ${postIds.length} posts, ~${CONFIG.COMMENT_COUNT} comments.`);

    } catch (err) {
        await client.query('ROLLBACK');
        console.error('❌ Seeding failed:', err);
    } finally {
        client.release();
        // Since we are running this as a script, we might need to close the pool?
        // pool.end() is usually required if script hangs.
        // But `require('../src/config/database')` might export a singleton pool.
        // Let's assume process.exit will handle it or explicit end.
        process.exit(0);
    }
}

seed();
