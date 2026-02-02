import db from '../config/database.js';
import { initializeDatabase } from '../models/schema.js';

const bookSuggestions = [
  {
    title: 'Atomic Habits',
    author: 'James Clear',
    description: 'An easy and proven way to build good habits and break bad ones through tiny changes that deliver remarkable results.'
  },
  {
    title: 'Thinking, Fast and Slow',
    author: 'Daniel Kahneman',
    description: 'A groundbreaking tour of the mind explaining the two systems that drive the way we think and make decisions.'
  },
  {
    title: 'The 7 Habits of Highly Effective People',
    author: 'Stephen R. Covey',
    description: 'A powerful framework for personal effectiveness based on principles of fairness, integrity, and human dignity.'
  },
  {
    title: 'Deep Work',
    author: 'Cal Newport',
    description: 'Rules for focused success in a distracted world, teaching how to master hard things quickly and produce at an elite level.'
  },
  {
    title: 'Sapiens: A Brief History of Humankind',
    author: 'Yuval Noah Harari',
    description: 'A narrative history of humanity from the Stone Age to the modern age, exploring how Homo sapiens came to dominate the world.'
  },
  {
    title: 'The Power of Now',
    author: 'Eckhart Tolle',
    description: 'A guide to spiritual enlightenment that teaches the importance of living in the present moment.'
  },
  {
    title: 'Educated',
    author: 'Tara Westover',
    description: 'A memoir about a young woman who grows up in a survivalist family and eventually escapes to learn about the wider world through education.'
  },
  {
    title: 'The Lean Startup',
    author: 'Eric Ries',
    description: 'A methodology for developing businesses and products that aims to shorten product development cycles through validated learning.'
  },
  {
    title: 'Man\'s Search for Meaning',
    author: 'Viktor E. Frankl',
    description: 'A psychiatrist\'s memoir of survival in Nazi death camps and his psychotherapeutic method of finding meaning in all forms of existence.'
  },
  {
    title: 'The Subtle Art of Not Giving a F*ck',
    author: 'Mark Manson',
    description: 'A counterintuitive approach to living a good life by focusing on what truly matters and letting go of what doesn\'t.'
  },
  {
    title: 'How to Win Friends and Influence People',
    author: 'Dale Carnegie',
    description: 'Timeless advice on building relationships, influencing others, and achieving success through effective communication.'
  },
  {
    title: 'The Alchemist',
    author: 'Paulo Coelho',
    description: 'A philosophical novel about a young shepherd\'s journey to find treasure and discover his personal legend.'
  },
  {
    title: 'Start With Why',
    author: 'Simon Sinek',
    description: 'A framework for building inspiring organizations by starting with the fundamental question of why you do what you do.'
  },
  {
    title: 'Mindset: The New Psychology of Success',
    author: 'Carol S. Dweck',
    description: 'Research-based insights on how our mindset shapes our success, contrasting fixed and growth mindsets.'
  },
  {
    title: 'The Four Agreements',
    author: 'Don Miguel Ruiz',
    description: 'A practical guide to personal freedom based on ancient Toltec wisdom, offering four simple agreements to transform your life.'
  }
];

async function seedSuggestions() {
  try {
    // Initialize database first
    await initializeDatabase();
    
    console.log('Starting to seed book suggestions...');

    // Check if suggestions already exist
    const checkQuery = 'SELECT COUNT(*) as count FROM suggestions';
    
    db.get(checkQuery, async (err, row) => {
      if (err) {
        console.error('Error checking existing suggestions:', err);
        process.exit(1);
      }

      if (row.count > 0) {
        console.log(`Database already has ${row.count} suggestions. Skipping seed.`);
        console.log('To re-seed, delete existing suggestions first.');
        process.exit(0);
      }

      // Insert all suggestions
      const insertQuery = `INSERT INTO suggestions (title, author, description) VALUES (?, ?, ?)`;
      
      let completed = 0;
      let failed = 0;

      for (const suggestion of bookSuggestions) {
        db.run(insertQuery, [suggestion.title, suggestion.author, suggestion.description], (err) => {
          if (err) {
            console.error(`Error inserting "${suggestion.title}":`, err);
            failed++;
          } else {
            console.log(`✓ Added: "${suggestion.title}" by ${suggestion.author}`);
            completed++;
          }

          // Check if all insertions are done
          if (completed + failed === bookSuggestions.length) {
            console.log(`\nSeeding complete! Added ${completed} suggestions.`);
            if (failed > 0) {
              console.log(`Failed to add ${failed} suggestions.`);
            }
            process.exit(failed > 0 ? 1 : 0);
          }
        });
      }
    });
  } catch (error) {
    console.error('Error seeding suggestions:', error);
    process.exit(1);
  }
}

// Run the seed function
seedSuggestions();
