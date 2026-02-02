import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';

dotenv.config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

// Retry configuration
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000; // 1 second

/**
 * Delay helper for retry logic
 */
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Retry wrapper for API calls with exponential backoff
 */
async function retryWithBackoff(fn, retries = MAX_RETRIES) {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i === retries - 1) throw error;
      
      const delayTime = RETRY_DELAY * Math.pow(2, i);
      console.log(`Retry attempt ${i + 1} after ${delayTime}ms...`);
      await delay(delayTime);
    }
  }
}

/**
 * Generate book summary from book name and author
 */
export async function generateBookSummary(bookName, authorName) {
  const bookTitle = authorName ? `"${bookName}" by ${authorName}` : `"${bookName}"`;
  const prompt = `Provide a comprehensive summary of the book ${bookTitle}. 
The summary should be 3-4 paragraphs long and cover the main themes, key concepts, and overall message of the book.
Focus on what makes this book valuable and what readers can learn from it.`;

  return retryWithBackoff(async () => {
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    
    if (!text || text.trim().length === 0) {
      throw new Error('Empty response from Gemini AI');
    }
    
    return text.trim();
  });
}

/**
 * Generate key messages from the book (5-7 messages)
 */
export async function generateKeyMessages(bookName, authorName) {
  const bookTitle = authorName ? `"${bookName}" by ${authorName}` : `"${bookName}"`;
  const prompt = `List 5-7 key messages from the book ${bookTitle}.
Each message should be a concise, actionable insight that captures an important idea from the book.
Format your response as a JSON array of strings, like this:
["Message 1", "Message 2", "Message 3", "Message 4", "Message 5"]

Only return the JSON array, no additional text.`;

  return retryWithBackoff(async () => {
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    
    // Parse JSON response
    const messages = parseJSONResponse(text);
    
    if (!Array.isArray(messages) || messages.length < 5 || messages.length > 7) {
      throw new Error('Invalid messages format or count');
    }
    
    return messages;
  });
}

/**
 * Generate lessons from the book (5-7 lessons)
 */
export async function generateLessons(bookName, authorName) {
  const bookTitle = authorName ? `"${bookName}" by ${authorName}` : `"${bookName}"`;
  const prompt = `List 5-7 practical lessons from the book ${bookTitle}.
Each lesson should be a specific, actionable takeaway that readers can apply to their lives.
Format your response as a JSON array of strings, like this:
["Lesson 1", "Lesson 2", "Lesson 3", "Lesson 4", "Lesson 5"]

Only return the JSON array, no additional text.`;

  return retryWithBackoff(async () => {
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    
    // Parse JSON response
    const lessons = parseJSONResponse(text);
    
    if (!Array.isArray(lessons) || lessons.length < 5 || lessons.length > 7) {
      throw new Error('Invalid lessons format or count');
    }
    
    return lessons;
  });
}

/**
 * Generate flashcards with questions and answers (minimum 5 cards)
 */
export async function generateFlashcards(bookName, authorName) {
  const bookTitle = authorName ? `"${bookName}" by ${authorName}` : `"${bookName}"`;
  const prompt = `Create 5-7 flashcards for the book ${bookTitle}.
Each flashcard should have a question on one side and a detailed answer on the other.
Questions should test understanding of key concepts from the book.
Format your response as a JSON array of objects with "question" and "answer" fields, like this:
[
  {"question": "What is the main concept?", "answer": "The main concept is..."},
  {"question": "How does the author suggest?", "answer": "The author suggests..."}
]

Only return the JSON array, no additional text.`;

  return retryWithBackoff(async () => {
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    
    // Parse JSON response
    const flashcards = parseJSONResponse(text);
    
    if (!Array.isArray(flashcards) || flashcards.length < 5) {
      throw new Error('Invalid flashcards format or insufficient count');
    }
    
    // Validate flashcard structure
    for (const card of flashcards) {
      if (!card.question || !card.answer || 
          typeof card.question !== 'string' || 
          typeof card.answer !== 'string') {
        throw new Error('Invalid flashcard structure');
      }
    }
    
    return flashcards;
  });
}

/**
 * Generate all content for a book in one call
 */
export async function generateAllBookContent(bookName, authorName) {
  try {
    const [summary, messages, lessons, flashcards] = await Promise.all([
      generateBookSummary(bookName, authorName),
      generateKeyMessages(bookName, authorName),
      generateLessons(bookName, authorName),
      generateFlashcards(bookName, authorName)
    ]);
    
    return {
      summary,
      messages,
      lessons,
      flashcards
    };
  } catch (error) {
    console.error('Error generating book content:', error);
    throw new Error(`Failed to generate book content: ${error.message}`);
  }
}

/**
 * Parse JSON response from Gemini, handling markdown code blocks
 */
function parseJSONResponse(text) {
  try {
    // Remove markdown code blocks if present
    let cleanText = text.trim();
    
    // Remove ```json and ``` markers
    if (cleanText.startsWith('```json')) {
      cleanText = cleanText.replace(/^```json\s*/, '').replace(/```\s*$/, '');
    } else if (cleanText.startsWith('```')) {
      cleanText = cleanText.replace(/^```\s*/, '').replace(/```\s*$/, '');
    }
    
    return JSON.parse(cleanText.trim());
  } catch (error) {
    console.error('Failed to parse JSON response:', text);
    throw new Error('Invalid JSON response from AI');
  }
}

export default {
  generateBookSummary,
  generateKeyMessages,
  generateLessons,
  generateFlashcards,
  generateAllBookContent
};
