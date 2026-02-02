const db = require('./config/database');
const Review = require('./models/Review');

const seedDummyReviews = () => {
  try {
    console.log('🌱 Seeding dummy reviews...');

    // Get all hospitals
    const hospitals = db.prepare('SELECT id, name FROM hospitals WHERE isActive = 1').all();
    console.log(`Found ${hospitals.length} hospitals`);

    // Get all users (excluding admin)
    const users = db.prepare('SELECT id, name FROM users WHERE userType != ? AND isActive = 1').all('admin');
    console.log(`Found ${users.length} users`);

    if (hospitals.length === 0 || users.length === 0) {
      console.log('❌ No hospitals or users found. Please seed hospitals and users first.');
      return;
    }

    // Sample review data
    const reviewTemplates = [
      {
        titles: [
          "Excellent care and service!",
          "Great hospital with professional staff",
          "Highly recommended for emergency care",
          "Outstanding medical facilities",
          "Very satisfied with the treatment",
          "Professional and caring staff",
          "Clean and well-maintained facility",
          "Quick and efficient service",
          "Great experience overall",
          "Would definitely come back"
        ],
        comments: [
          "The staff was very professional and caring. The facilities are clean and well-maintained. I would definitely recommend this hospital to others.",
          "Excellent service from start to finish. The doctors were knowledgeable and the nurses were very attentive. The waiting time was reasonable.",
          "Great hospital with modern facilities. The staff was friendly and helpful. The treatment was effective and I felt well taken care of.",
          "Very satisfied with the care I received. The doctors were thorough and explained everything clearly. The facilities are top-notch.",
          "Professional staff and excellent facilities. The treatment was successful and I felt comfortable throughout my stay.",
          "Outstanding medical care. The staff was very knowledgeable and caring. I would highly recommend this hospital.",
          "Clean, modern facility with professional staff. The treatment was effective and the recovery was smooth.",
          "Great experience overall. The staff was friendly and the facilities were excellent. I felt well taken care of.",
          "Excellent medical care and service. The staff was professional and the facilities were clean and modern.",
          "Highly recommended hospital. The staff was caring and the treatment was successful. Great facilities and service."
        ]
      }
    ];

    const negativeReviewTemplates = [
      {
        titles: [
          "Could be better",
          "Average experience",
          "Room for improvement",
          "Not what I expected",
          "Decent but not great"
        ],
        comments: [
          "The service was okay but could be improved. The staff was friendly but the waiting time was longer than expected.",
          "Average hospital experience. The facilities are decent but not exceptional. The staff was professional but not very engaging.",
          "The treatment was effective but the overall experience could be better. The facilities are clean but somewhat outdated.",
          "Decent care but there's room for improvement. The staff was helpful but the process could be more streamlined.",
          "The hospital is okay but not exceptional. The staff was professional but the facilities could be more modern."
        ]
      }
    ];

    let reviewCount = 0;
    const maxReviewsPerHospital = 15;

    // Generate reviews for each hospital
    hospitals.forEach(hospital => {
      const numReviews = Math.floor(Math.random() * maxReviewsPerHospital) + 5; // 5-20 reviews per hospital
      
      for (let i = 0; i < numReviews; i++) {
        // Select a random user
        const user = users[Math.floor(Math.random() * users.length)];
        
        // 80% chance of positive review (4-5 stars), 20% chance of negative (1-3 stars)
        const isPositive = Math.random() < 0.8;
        const rating = isPositive 
          ? Math.floor(Math.random() * 2) + 4 // 4-5 stars
          : Math.floor(Math.random() * 3) + 1; // 1-3 stars
        
        const templates = isPositive ? reviewTemplates[0] : negativeReviewTemplates[0];
        const title = templates.titles[Math.floor(Math.random() * templates.titles.length)];
        const comment = templates.comments[Math.floor(Math.random() * templates.comments.length)];
        
        // 20% chance of anonymous review
        const isAnonymous = Math.random() < 0.2;
        
        // 30% chance of verified review (linked to booking)
        const isVerified = Math.random() < 0.3;
        
        try {
          const reviewId = Review.create({
            userId: user.id,
            hospitalId: hospital.id,
            bookingId: null, // Don't link to bookings for now to avoid constraint issues
            rating: rating,
            title: title,
            comment: comment,
            isVerified: 0, // Set to 0 to avoid booking constraint
            isAnonymous: isAnonymous ? 1 : 0,
            isActive: 1
          });
          
          reviewCount++;
          
          // Add some helpful votes to random reviews
          if (Math.random() < 0.3) {
            const helpfulCount = Math.floor(Math.random() * 5) + 1; // 1-5 helpful votes
            for (let j = 0; j < helpfulCount; j++) {
              const voter = users[Math.floor(Math.random() * users.length)];
              if (voter.id !== user.id) {
                try {
                  Review.addHelpfulVote(reviewId, voter.id, true);
                } catch (voteError) {
                  // Skip if vote already exists
                }
              }
            }
          }
        } catch (error) {
          console.log(`Skipped review for hospital ${hospital.id} due to constraint: ${error.message}`);
        }
      }
    });

    console.log(`✅ Seeded ${reviewCount} dummy reviews`);

    // Display some statistics
    const stats = db.prepare(`
      SELECT 
        COUNT(*) as totalReviews,
        AVG(rating) as averageRating,
        COUNT(CASE WHEN rating = 5 THEN 1 END) as fiveStar,
        COUNT(CASE WHEN rating = 4 THEN 1 END) as fourStar,
        COUNT(CASE WHEN rating = 3 THEN 1 END) as threeStar,
        COUNT(CASE WHEN rating = 2 THEN 1 END) as twoStar,
        COUNT(CASE WHEN rating = 1 THEN 1 END) as oneStar
      FROM reviews 
      WHERE isActive = 1
    `).get();

    console.log('\n📊 Review Statistics:');
    console.log(`Total Reviews: ${stats.totalReviews}`);
    console.log(`Average Rating: ${stats.averageRating ? parseFloat(stats.averageRating.toFixed(2)) : 0}`);
    console.log(`5 Stars: ${stats.fiveStar}`);
    console.log(`4 Stars: ${stats.fourStar}`);
    console.log(`3 Stars: ${stats.threeStar}`);
    console.log(`2 Stars: ${stats.twoStar}`);
    console.log(`1 Star: ${stats.oneStar}`);

    // Show sample reviews
    console.log('\n📝 Sample Reviews:');
    const sampleReviews = db.prepare(`
      SELECT r.*, u.name as userName, h.name as hospitalName
      FROM reviews r
      LEFT JOIN users u ON r.userId = u.id
      LEFT JOIN hospitals h ON r.hospitalId = h.id
      WHERE r.isActive = 1
      ORDER BY r.createdAt DESC
      LIMIT 5
    `).all();

    sampleReviews.forEach((review, index) => {
      console.log(`\n${index + 1}. ${review.hospitalName}`);
      console.log(`   Rating: ${'★'.repeat(review.rating)}${'☆'.repeat(5 - review.rating)} (${review.rating}/5)`);
      console.log(`   Title: ${review.title}`);
      console.log(`   Comment: ${review.comment}`);
      console.log(`   By: ${review.isAnonymous ? 'Anonymous' : review.userName}`);
      console.log(`   Verified: ${review.isVerified ? 'Yes' : 'No'}`);
      console.log(`   Helpful: ${review.helpfulCount} votes`);
    });

  } catch (error) {
    console.error('❌ Error seeding dummy reviews:', error);
    throw error;
  }
};

// Run the seeder
if (require.main === module) {
  seedDummyReviews();
}

module.exports = seedDummyReviews;
