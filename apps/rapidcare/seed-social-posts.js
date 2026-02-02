const db = require('./config/database');

// Get valid user and hospital IDs from database
function getSamplePosts() {
  // Get a valid user ID
  const user = db.prepare('SELECT id FROM users WHERE userType = ? LIMIT 1').get('user');
  const userId = user ? user.id : 824; // Fallback to known user ID

  // Get valid hospital IDs
  const hospitals = db.prepare('SELECT id FROM hospitals WHERE approval_status = ? LIMIT 3').all('approved');
  const hospitalIds = hospitals.length > 0 ? hospitals.map(h => h.id) : [760, 761, 762];

  return [
    {
      userId: userId,
      hospitalId: hospitalIds[0],
      postType: 'experience',
      title: 'Excellent Emergency Care at Dhaka Medical College Hospital',
      content: 'I had to visit the emergency room last night with severe chest pain. The staff was incredibly professional and caring. They immediately attended to me, ran all necessary tests, and kept me informed throughout the process. The doctors were knowledgeable and took time to explain everything. I felt safe and well-cared for during a scary situation. Highly recommend this hospital for emergency care!'
    },
    {
      userId: userId,
      hospitalId: hospitalIds[0],
      postType: 'complaint',
      title: 'Long Wait Times in Outpatient Department',
      content: 'I had an appointment scheduled for 10 AM but had to wait for over 2 hours to see the doctor. The waiting area was crowded and there was no clear communication about the delay. While the doctor was good once I finally saw them, the wait time management needs serious improvement. This is not the first time this has happened.'
    },
    {
      userId: userId,
      hospitalId: hospitalIds[0],
      postType: 'problem',
      title: 'Billing Department Issues',
      content: 'There seems to be a recurring problem with the billing department. I was charged for services I did not receive, and when I tried to get it corrected, I was transferred between multiple departments. It took three visits to finally get the issue resolved. The hospital needs to streamline their billing process and improve communication between departments.'
    },
    {
      userId: userId,
      hospitalId: hospitalIds[0],
      postType: 'moment',
      title: 'Nurse Sarah Made My Day',
      content: 'During my recent stay, Nurse Sarah went above and beyond to make me comfortable. She not only provided excellent medical care but also took time to chat and lift my spirits when I was feeling down. She remembered my preferences and always had a smile. Healthcare workers like her are the reason this hospital is special. Thank you, Sarah!'
    },
    {
      userId: userId,
      hospitalId: hospitalIds[1] || hospitalIds[0],
      postType: 'experience',
      title: 'Outstanding Maternity Care',
      content: 'I delivered my baby at this hospital and the experience was wonderful. The maternity ward is modern and comfortable. The nurses and doctors were supportive throughout labor and delivery. They respected my birth plan and made me feel empowered. The postpartum care was excellent too. I would definitely recommend this hospital to expecting mothers!'
    },
    {
      userId: userId,
      hospitalId: hospitalIds[1] || hospitalIds[0],
      postType: 'complaint',
      title: 'Parking Situation is Terrible',
      content: 'The parking at this hospital is a nightmare. There are never enough spots, and I often have to circle for 20-30 minutes to find parking. For a hospital that serves so many patients, this is unacceptable. They need to either expand the parking lot or provide valet service. It adds unnecessary stress to already stressful hospital visits.'
    },
    {
      userId: userId,
      hospitalId: hospitalIds[2] || hospitalIds[0],
      postType: 'experience',
      title: 'Professional and Caring Staff',
      content: 'The medical staff at this hospital are truly exceptional. From the reception desk to the doctors, everyone was professional, courteous, and genuinely caring. They took time to answer all my questions and made sure I understood my treatment plan. This level of care makes all the difference when you\'re dealing with health issues.'
    },
    {
      userId: userId,
      hospitalId: hospitalIds[2] || hospitalIds[0],
      postType: 'moment',
      title: 'Doctor Went Above and Beyond',
      content: 'Dr. Rahman stayed late to ensure my surgery was successful and personally checked on me multiple times during recovery. His dedication and compassion were truly remarkable. It\'s doctors like him who restore faith in the healthcare system. Forever grateful for his care!'
    }
  ];
}

async function seedSocialPosts() {
  console.log('🌱 Seeding social posts...');

  try {
    // Check if posts already exist
    const existingPosts = db.prepare('SELECT COUNT(*) as count FROM social_posts').get();
    
    if (existingPosts.count > 0) {
      console.log(`⚠️  Database already has ${existingPosts.count} social posts. Skipping seed.`);
      console.log('   To reseed, delete existing posts first.');
      return;
    }

    // Get sample posts with valid IDs
    const samplePosts = getSamplePosts();

    // Insert sample posts
    const insertStmt = db.prepare(`
      INSERT INTO social_posts (userId, hospitalId, postType, title, content)
      VALUES (?, ?, ?, ?, ?)
    `);

    let insertedCount = 0;
    for (const post of samplePosts) {
      try {
        insertStmt.run(
          post.userId,
          post.hospitalId,
          post.postType,
          post.title,
          post.content
        );
        insertedCount++;
      } catch (error) {
        console.error(`Error inserting post "${post.title}":`, error.message);
      }
    }

    // Add some likes and comments to make it more realistic
    const posts = db.prepare('SELECT id FROM social_posts').all();
    
    if (posts.length > 0) {
      // Add likes
      const likeStmt = db.prepare(`
        INSERT INTO social_post_likes (postId, userId)
        VALUES (?, ?)
      `);

      posts.forEach(post => {
        // Random number of likes (0-5)
        const likeCount = Math.floor(Math.random() * 6);
        for (let i = 0; i < likeCount; i++) {
          try {
            likeStmt.run(post.id, 1); // Using userId 1 for simplicity
          } catch (error) {
            // Ignore duplicate likes
          }
        }
      });

      // Update like counts
      const updateLikesStmt = db.prepare(`
        UPDATE social_posts 
        SET likesCount = (
          SELECT COUNT(*) FROM social_post_likes WHERE postId = social_posts.id
        )
      `);
      updateLikesStmt.run();

      // Add some comments
      const commentStmt = db.prepare(`
        INSERT INTO social_post_comments (postId, userId, content)
        VALUES (?, ?, ?)
      `);

      const sampleComments = [
        'Thank you for sharing your experience!',
        'I had a similar experience at this hospital.',
        'This is very helpful information.',
        'I hope the hospital addresses this issue.',
        'Great to hear positive feedback!',
      ];

      posts.forEach(post => {
        // Random number of comments (0-3)
        const commentCount = Math.floor(Math.random() * 4);
        for (let i = 0; i < commentCount; i++) {
          const randomComment = sampleComments[Math.floor(Math.random() * sampleComments.length)];
          try {
            commentStmt.run(post.id, 1, randomComment);
          } catch (error) {
            console.error('Error adding comment:', error.message);
          }
        }
      });

      // Update comment counts
      const updateCommentsStmt = db.prepare(`
        UPDATE social_posts 
        SET commentsCount = (
          SELECT COUNT(*) FROM social_post_comments WHERE postId = social_posts.id AND isActive = 1
        )
      `);
      updateCommentsStmt.run();

      // Add some views
      const updateViewsStmt = db.prepare(`
        UPDATE social_posts 
        SET viewsCount = ?
        WHERE id = ?
      `);

      posts.forEach(post => {
        const viewCount = Math.floor(Math.random() * 100) + 10; // 10-110 views
        updateViewsStmt.run(viewCount, post.id);
      });

      // Verify some posts (50% chance)
      const verifyStmt = db.prepare(`
        UPDATE social_posts 
        SET isAdminVerified = 1, verifiedBy = 1, verifiedAt = CURRENT_TIMESTAMP
        WHERE id = ?
      `);

      posts.forEach(post => {
        if (Math.random() > 0.5) {
          verifyStmt.run(post.id);
        }
      });
    }

    console.log(`✅ Successfully seeded ${insertedCount} social posts`);
    console.log('   Posts include likes, comments, views, and some are admin-verified');
    
    // Display summary
    const stats = db.prepare(`
      SELECT 
        COUNT(*) as totalPosts,
        SUM(CASE WHEN isAdminVerified = 1 THEN 1 ELSE 0 END) as verifiedPosts,
        SUM(likesCount) as totalLikes,
        SUM(commentsCount) as totalComments,
        SUM(viewsCount) as totalViews
      FROM social_posts
    `).get();

    console.log('\n📊 Social Posts Summary:');
    console.log(`   Total Posts: ${stats.totalPosts}`);
    console.log(`   Verified Posts: ${stats.verifiedPosts}`);
    console.log(`   Total Likes: ${stats.totalLikes}`);
    console.log(`   Total Comments: ${stats.totalComments}`);
    console.log(`   Total Views: ${stats.totalViews}`);

  } catch (error) {
    console.error('❌ Error seeding social posts:', error);
    throw error;
  }
}

// Run seeding if executed directly
if (require.main === module) {
  seedSocialPosts()
    .then(() => {
      console.log('\n✨ Social posts seeding completed!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n💥 Social posts seeding failed:', error);
      process.exit(1);
    });
}

module.exports = { seedSocialPosts };
