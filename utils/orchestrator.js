import Database from 'better-sqlite3';

// Helper to clean and tokenize text for similarity check (handles English & Hindi/Devanagari characters)
export function getJaccardSimilarity(str1, str2) {
  if (!str1 || !str2) return 0;
  const clean = str => str
    .toLowerCase()
    .replace(/[^\w\s\u0900-\u097F]/g, '') // Keep words, spaces, and Hindi characters
    .split(/\s+/)
    .filter(Boolean);
  
  const words1 = new Set(clean(str1));
  const words2 = new Set(clean(str2));
  
  if (words1.size === 0 && words2.size === 0) return 1;
  if (words1.size === 0 || words2.size === 0) return 0;
  
  const intersection = new Set([...words1].filter(w => words2.has(w)));
  const union = new Set([...words1, ...words2]);
  
  return intersection.size / union.size;
}

// Log response times
export function recordResponseTime(db, sessionId, durationMs) {
  try {
    const stmt = db.prepare('INSERT INTO response_times (session_id, duration_ms) VALUES (?, ?)');
    stmt.run(sessionId, durationMs);
  } catch (err) {
    console.error("Error saving response time:", err.message);
  }
}

// Retrieve average response times of the last 5 runs
export function getAverageResponseTime(db) {
  try {
    const stmt = db.prepare('SELECT duration_ms FROM response_times ORDER BY id DESC LIMIT 5');
    const rows = stmt.all();
    if (rows.length === 0) return 2500; // Default to FAST (2.5s) if no history
    const sum = rows.reduce((acc, row) => acc + row.duration_ms, 0);
    return sum / rows.length;
  } catch (err) {
    console.error("Error reading response times:", err.message);
    return 2500;
  }
}

// Classify speed
export function classifySpeed(avgDurationMs) {
  const seconds = avgDurationMs / 1000;
  if (seconds < 3) return 'FAST';
  if (seconds <= 7) return 'MEDIUM';
  return 'SLOW';
}

// Check cache for similar queries (similarity >= 0.85)
export function findInCache(db, query) {
  try {
    const stmt = db.prepare('SELECT query_key, response_text, model_name, image_url FROM response_cache');
    const cacheRows = stmt.all();
    let bestMatch = null;
    let highestSim = 0;
    
    for (const row of cacheRows) {
      const sim = getJaccardSimilarity(query, row.query_key);
      if (sim > highestSim) {
        highestSim = sim;
        bestMatch = row;
      }
    }
    
    if (highestSim >= 0.85 && bestMatch) {
      console.log(`🎯 Cache Hit! Match: "${bestMatch.query_key}" with similarity ${highestSim.toFixed(2)}`);
      return bestMatch;
    }
  } catch (err) {
    console.error("Error reading response cache:", err.message);
  }
  return null;
}

// Save query to cache
export function saveToCache(db, query, responseText, modelName, imageUrl) {
  try {
    // Check if query is already cached to avoid duplicate keys
    const check = db.prepare('SELECT id FROM response_cache WHERE query_key = ?');
    const existing = check.get(query);
    if (existing) {
      const update = db.prepare('UPDATE response_cache SET response_text = ?, model_name = ?, image_url = ?, timestamp = CURRENT_TIMESTAMP WHERE id = ?');
      update.run(responseText, modelName, imageUrl, existing.id);
    } else {
      const insert = db.prepare('INSERT INTO response_cache (query_key, response_text, model_name, image_url) VALUES (?, ?, ?, ?)');
      insert.run(query, responseText, modelName, imageUrl);
    }
    console.log(`💾 Query saved to cache: "${query}"`);
  } catch (err) {
    console.error("Error saving response to cache:", err.message);
  }
}

// Evaluate Response Quality (returns a score from 1-10)
export async function evaluateQuality(callLLM, userQuery, responseText, speedMode) {
  try {
    if (responseText.includes("Instagram Security Block") || responseText.includes("published successfully") || responseText.includes("Instagram post failed") || responseText.includes("post published") || responseText.includes("Failed to execute tool") || responseText.includes("Error executing") || responseText.includes("Message sent to") || responseText.includes("Could not send") || responseText.includes("login failed") || responseText.includes("Could not find file")) {
      console.log("⭐ Tool status/error response detected. Bypassing quality evaluation with score 10.");
      return 10;
    }
    console.log(`🔍 Evaluating response quality... Speed Mode: ${speedMode}`);
    
    // For SLOW model speed, we want the quality check to be as fast as possible
    const checkPrompt = [
      {
        role: 'system',
        content: `You are a critical response quality inspector. Evaluate the AI's response based on the User Query.
Rate the response quality on a scale of 1 to 10.
Return ONLY a single number from 1 to 10 (e.g. "8"). No explanation, no comments, no extra characters.
Criteria: Relevance, completeness, compliance with the rules (no fluff), accuracy.`
      },
      {
        role: 'user',
        content: `User Query: "${userQuery}"\nAI Response: "${responseText.substring(0, 1500)}"`
      }
    ];

    // For SLOW mode, we lower temperature and restrict tokens to keep evaluation fast
    const qualityResult = await callLLM(checkPrompt, 0.1);
    const scoreStr = qualityResult?.text?.trim() || '8';
    
    // Parse first number found
    const match = scoreStr.match(/\d+/);
    const score = match ? parseInt(match[0], 10) : 8;
    console.log(`⭐ Quality evaluation score: ${score}/10`);
    return score;
  } catch (err) {
    console.error("Quality evaluation failed, defaulting to 8:", err.message);
    return 8; // Default to safe score on error
  }
}

// Detect language (English, Hindi, Hinglish)
export function detectLanguage(message) {
  if (!message) return 'english';
  const cleanStr = message.toLowerCase().trim();
  
  // 1. Check for Devanagari script characters (Hindi)
  if (/[\u0900-\u097F]/.test(message)) {
    return 'hindi';
  }
  
  // 2. Check for typical Hinglish structural words / keywords
  const hinglishWords = [
    'kya', 'hai', 'hain', 'the', 'thi', 'rehte', 'rehta', 'rahe', 'sahi', 'galat',
    'kaise', 'kyu', 'kyon', 'kab', 'kahan', 'kisne', 'kiska', 'batao', 'samjhao',
    'achha', 'accha', 'nhi', 'nahi', 'na', 'yaar', 'bhai', 'chalega', 'kaam', 'hoga',
    'bana', 'banao', 'karo', 'karne', 'gaya', 'gayi', 'hote', 'hota', 'chahiye'
  ];
  const words = cleanStr.replace(/[^\w\s]/g, '').split(/\s+/);
  const hinglishCount = words.filter(w => hinglishWords.includes(w)).length;
  
  // If at least 15% of words are typical Hinglish keywords, classify as Hinglish
  if (hinglishCount / Math.max(words.length, 1) >= 0.15) {
    return 'hinglish';
  }
  
  return 'english';
}

// Detect emotion in query
export function detectEmotion(message) {
  if (!message) return 'curious';
  const lower = message.toLowerCase();
  
  // Frustration
  if (['ugh', 'frustrated', 'annoyed', 'not working', 'fail', 'error', 'failed', 'gadbad', 'bekar', 'gussa', 'bura', 'kharab'].some(kw => lower.includes(kw))) {
    return 'frustrated';
  }
  // Excitement
  if (['wow', 'amazing', 'great', 'awesome', 'excited', 'sundar', 'mast', 'badhiya', 'maza', '!'].some(kw => lower.includes(kw))) {
    return 'excited';
  }
  // Confusion
  if (['confused', 'not clear', 'what do you mean', 'help', 'samajh nahi', 'pata nahi', ' उलझन', 'explain', 'samjhao'].some(kw => lower.includes(kw))) {
    return 'confused';
  }
  // Urgency
  if (['urgent', 'asap', 'immediately', 'quick', 'fast', 'jaldi', 'turant', 'abbi', 'fatafat'].some(kw => lower.includes(kw))) {
    return 'urgency';
  }
  // Appreciation
  if (['thanks', 'thank you', 'helpful', 'dhanyavaad', 'shukriya', 'meharbani'].some(kw => lower.includes(kw))) {
    return 'appreciation';
  }
  // Skepticism
  if (['really', 'sure', 'doubt', 'not convinced', 'kya sach', 'sach mein', 'pakka'].some(kw => lower.includes(kw))) {
    return 'skepticism';
  }
  
  return 'curious'; // Default conversational tone
}

// Analyze query structure to categorize complexity and format
export function analyzeQuestionType(message) {
  if (!message) return 'simple';
  const lower = message.toLowerCase().trim();
  const words = lower.replace(/[^\w\s\u0900-\u097F]/g, '').split(/\s+/).filter(Boolean);
  const wordCount = words.length;

  const complexKeywords = [
    'explain', 'describe', 'architecture', 'mechanism', 'mathematical', 'compare',
    'difference', 'analysis', 'steps', 'history', 'code', 'script', 'integrate',
    'anthology', 'siddhanta', 'samjhao', 'itihas', 'vishlesharn'
  ];

  const creativeKeywords = [
    'generate', 'create', 'write a poem', 'poem', 'story', 'kahani', 'poster', 'creative',
    'design', 'marketing', 'campaign', 'idea', 'photo', 'image', 'chitra'
  ];

  // Coding request
  if (['code', 'script', 'programming', 'function', 'class', 'html', 'css', 'javascript', 'python', 'sql', 'database', 'tool'].some(kw => lower.includes(kw))) {
    return 'code';
  }

  // Creative request
  if (creativeKeywords.some(kw => lower.includes(kw))) {
    return 'creative';
  }

  // Complex request
  if (wordCount > 12 || complexKeywords.some(kw => lower.includes(kw))) {
    return 'complex';
  }

  return 'simple';
}
