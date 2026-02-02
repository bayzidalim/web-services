const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'database.sqlite');
const db = new Database(dbPath);

// Migration: Create Rapid Social posts table
const up = () => {
  console.log('Running migration: 010_rapid_social_posts');

  // Social posts table
  db.exec(`
    CREATE TABLE IF NOT EXISTS social_posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId INTEGER NOT NULL,
      hospitalId INTEGER NOT NULL,
      postType TEXT NOT NULL CHECK(postType IN ('experience', 'complaint', 'problem', 'moment')),
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      isAdminVerified BOOLEAN DEFAULT 0,
      verifiedBy INTEGER,
      verifiedAt DATETIME,
      isActive BOOLEAN DEFAULT 1,
      likesCount INTEGER DEFAULT 0,
      commentsCount INTEGER DEFAULT 0,
      viewsCount INTEGER DEFAULT 0,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (userId) REFERENCES users (id) ON DELETE CASCADE,
      FOREIGN KEY (hospitalId) REFERENCES hospitals (id) ON DELETE CASCADE,
      FOREIGN KEY (verifiedBy) REFERENCES users (id)
    )
  `);

  // Post likes table
  db.exec(`
    CREATE TABLE IF NOT EXISTS social_post_likes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      postId INTEGER NOT NULL,
      userId INTEGER NOT NULL,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (postId) REFERENCES social_posts (id) ON DELETE CASCADE,
      FOREIGN KEY (userId) REFERENCES users (id) ON DELETE CASCADE,
      UNIQUE(postId, userId)
    )
  `);

  // Post comments table
  db.exec(`
    CREATE TABLE IF NOT EXISTS social_post_comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      postId INTEGER NOT NULL,
      userId INTEGER NOT NULL,
      content TEXT NOT NULL,
      isActive BOOLEAN DEFAULT 1,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (postId) REFERENCES social_posts (id) ON DELETE CASCADE,
      FOREIGN KEY (userId) REFERENCES users (id) ON DELETE CASCADE
    )
  `);

  // Create indexes for better performance
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_social_posts_hospital ON social_posts(hospitalId);
    CREATE INDEX IF NOT EXISTS idx_social_posts_user ON social_posts(userId);
    CREATE INDEX IF NOT EXISTS idx_social_posts_type ON social_posts(postType);
    CREATE INDEX IF NOT EXISTS idx_social_posts_verified ON social_posts(isAdminVerified);
    CREATE INDEX IF NOT EXISTS idx_social_posts_created ON social_posts(createdAt DESC);
    CREATE INDEX IF NOT EXISTS idx_social_post_likes_post ON social_post_likes(postId);
    CREATE INDEX IF NOT EXISTS idx_social_post_comments_post ON social_post_comments(postId);
  `);

  console.log('Migration 010_rapid_social_posts completed successfully');
};

const down = () => {
  console.log('Rolling back migration: 010_rapid_social_posts');
  
  db.exec(`DROP TABLE IF EXISTS social_post_comments`);
  db.exec(`DROP TABLE IF EXISTS social_post_likes`);
  db.exec(`DROP TABLE IF EXISTS social_posts`);
  
  console.log('Migration 010_rapid_social_posts rolled back successfully');
};

module.exports = { up, down };

// Run migration if executed directly
if (require.main === module) {
  up();
  db.close();
}
