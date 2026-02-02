const db = require('../config/database');

const createReviewsSystem = () => {
  try {
    console.log('📝 Creating reviews system...');

    // Create reviews table
    db.exec(`
      CREATE TABLE IF NOT EXISTS reviews (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        userId INTEGER NOT NULL,
        hospitalId INTEGER NOT NULL,
        bookingId INTEGER,
        rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
        title VARCHAR(255),
        comment TEXT,
        isVerified BOOLEAN DEFAULT 0,
        isAnonymous BOOLEAN DEFAULT 0,
        helpfulCount INTEGER DEFAULT 0,
        isActive BOOLEAN DEFAULT 1,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (hospitalId) REFERENCES hospitals(id) ON DELETE CASCADE,
        FOREIGN KEY (bookingId) REFERENCES bookings(id) ON DELETE SET NULL
      )
    `);

    // Create review helpful votes table
    db.exec(`
      CREATE TABLE IF NOT EXISTS review_helpful_votes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        reviewId INTEGER NOT NULL,
        userId INTEGER NOT NULL,
        isHelpful BOOLEAN NOT NULL,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (reviewId) REFERENCES reviews(id) ON DELETE CASCADE,
        FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE(reviewId, userId)
      )
    `);

    // Create indexes for better performance
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_reviews_hospital_id ON reviews(hospitalId);
    `);
    
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_reviews_user_id ON reviews(userId);
    `);
    
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_reviews_rating ON reviews(rating);
    `);
    
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_reviews_created_at ON reviews(createdAt);
    `);

    // Create trigger to update updatedAt timestamp
    db.exec(`
      CREATE TRIGGER IF NOT EXISTS update_reviews_updated_at
      AFTER UPDATE ON reviews
      BEGIN
        UPDATE reviews SET updatedAt = CURRENT_TIMESTAMP WHERE id = NEW.id;
      END
    `);

    console.log('✅ Reviews system created successfully');
  } catch (error) {
    console.error('❌ Error creating reviews system:', error);
    throw error;
  }
};

module.exports = createReviewsSystem;
