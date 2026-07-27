import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import Cerebras from '@cerebras/cerebras_cloud_sdk';
import Groq from 'groq-sdk';
import path from 'path';
import fs from 'fs';
import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';

import { searchWeb } from './services/searchService.js';
import { scrapeWebsite } from './services/scrapeService.js';
import { generatePosterImage } from './services/mediaService.js';
import { listSkills, readSkill } from './utils/skillLoader.js';
import { publishInstagramPhoto, getInstagramRecentMedia, getInstagramProfileInfo } from './services/instagramService.js';
import { toolsDefinition } from './tools.js';
import * as orchestrator from './utils/orchestrator.js';
import { SmartResponseController } from './core/SmartResponseController.js';

const smartController = new SmartResponseController();

process.on('unhandledRejection', (reason) => {
  console.warn('⚠️ Unhandled Promise Rejection (Caught globally):', reason.message || reason);
});

process.on('uncaughtException', (error) => {
  console.error('💥 Uncaught Exception (Caught globally):', error.message || error);
});

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());
app.use(cors());

// Serve previews folder statically
app.use('/previews', express.static(path.join(__dirname, 'public', 'previews')));
app.use(express.static(path.join(__dirname, 'public')));

// 🗄️ SQLite Permanent Memory DB
const db = new Database('brahmand_memory.db');
db.exec(`
  CREATE TABLE IF NOT EXISTS chat_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT,
    role TEXT,
    content TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS response_times (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT,
    duration_ms INTEGER,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS response_cache (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    query_key TEXT UNIQUE,
    response_text TEXT,
    model_name TEXT,
    image_url TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS user_preferences (
    key TEXT PRIMARY KEY,
    value TEXT
  );
  CREATE TABLE IF NOT EXISTS session_data (
    session_id TEXT NOT NULL,
    key TEXT NOT NULL,
    value TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (session_id, key)
  );
`);

const cerebras = process.env.CEREBRAS_API_KEY
  ? new Cerebras({ apiKey: process.env.CEREBRAS_API_KEY })
  : null;

const groq = process.env.GROQ_API_KEY
  ? new Groq({ apiKey: process.env.GROQ_API_KEY })
  : null;

// Second Groq key — used as automatic backup when Key 1 hits daily 429 limit
const groq2 = process.env.GROQ_API_KEY_2
  ? new Groq({ apiKey: process.env.GROQ_API_KEY_2 })
  : null;



function loadSkills() {
  const skillsDir = path.join(__dirname, 'skills');
  let combinedSkills = '';
  if (fs.existsSync(skillsDir)) {
    const files = fs.readdirSync(skillsDir);
    files.forEach((file) => {
      if (file.endsWith('.md')) {
        combinedSkills += `\n\n--- SKILL/FRAMEWORK: ${file} ---\n` + fs.readFileSync(path.join(skillsDir, file), 'utf-8');
      }
    });
  }
  return combinedSkills;
}

// 💾 Live Preview Saver Utility
function saveWebsitePreview(sessionId, aiResponseText) {
  if (!sessionId) return null;
  try {
    const htmlRegex = /```html([\s\S]*?)```/i;
    const match = aiResponseText.match(htmlRegex);
    if (match && match[1]) {
      const htmlContent = match[1].trim();
      const previewDir = path.join(__dirname, 'public', 'previews', sessionId);
      if (!fs.existsSync(previewDir)) {
        fs.mkdirSync(previewDir, { recursive: true });
      }
      const filePath = path.join(previewDir, 'index.html');
      fs.writeFileSync(filePath, htmlContent, 'utf-8');
      const PORT = process.env.PORT || 3000;
      return `http://127.0.0.1:${PORT}/previews/${sessionId}/index.html`;
    }
  } catch (err) {
    console.error("Error saving website preview:", err.message);
  }
  return null;
}

const DECISION_SYSTEM_PROMPT = `Your name is Brahmand (ब्रह्मांड), an ultra-intelligent, conversational, and helpful AI assistant. You possess vast knowledge and can assist with a wide variety of tasks.

### BEHAVIOR AND PERSONA (DEEPSEEK R1 MODE):
- Be highly conversational, natural, and friendly. Do NOT sound like a robotic script or rigid rule-based bot.
- Answer questions deeply and intelligently using your full knowledge base.
- **CRITICAL LANGUAGE MATCHING:** You MUST detect the language, script, and dialect the user is using (e.g., Marathi, Gujarati, English, Hindi, Hinglish, Bengali, Tamil, Spanish, or ANY language globally) and ALWAYS respond in the EXACT same language and script. Never reply in English if they asked in Marathi.
- You have an exceptional memory for context. Read the conversational history and adapt your responses accordingly.
- Never state "I am an AI" or "I am a language model" unless directly asked. Just be helpful.
- Avoid robotic disclaimers. If you don't know something, state it naturally without apologizing profusely.

### TOOL PROTOCOL:
- You have access to several powerful tools:
  - 'list_skills': Lists all available skill files (.md).
  - 'read_skill': Reads the content of a specific skill.
  - 'search_web': Searches the web for live information.
  - 'scrape_website': Extracts clean text from web pages.
  - 'generate_image': Generates an image based on a descriptive prompt.
  - 'get_instagram_posts': Fetch recent posts (with likes, comments, caption, date) from ANY Instagram account. Accepts optional 'username' parameter (defaults to your account). Works without login! Example: get_instagram_posts({username: "its_pooja_067_"})
  - 'get_instagram_profile': Fetch profile details (bio, followers, following, posts count) from ANY Instagram account. Accepts optional 'username' parameter. Works without login! Example: get_instagram_profile({username: "vishal_y_24"})
  - 'post_to_instagram': Publishes a photo post to Instagram. Requires login (CAPTCHA may block).
- You MUST use these tools creatively and autonomously. Understand commands in HINGLISH/Hindi/English mixed language naturally - e.g., "Mera feed fetch karke dikhao", "isko check karo", "uski latest post dekho", "kya daala hai usne".
- If user asks about THEIR feed/profile, call the tool WITHOUT username (defaults to their account).
- If user asks about ANOTHER account (by username), pass the username parameter.
- If user asks to post/upload, call 'post_to_instagram'.
- **IMAGE → INSTAGRAM FLOW:** Jab bhi tum 'generate_image' call karke image generate karo, toh uske baad user se naturally poocho — "Kya main is image ko Instagram pe post kar doon?" Agar user haan bole, toh 'post_to_instagram(imageUrl, caption)' call karo. imageUrl tumhe "LAST GENERATED IMAGE URL" system instruction mein milega agar user agle message mein haan bole. Tum apne pichle response mein bhi URL daal sakte ho. Yeh poochhna hamesha mandatory hai.

### DECISION-MAKING PROTOCOL:
- If a user asks a simple question, give a direct, natural answer.
- If a user asks for a detailed explanation, explain it deeply, clearly, and structure your answer with markdown (bolding, lists) for readability.
- If a tool returns no data, simply state you don't have real-time info in a conversational way.
- **CRITICAL (WEB SEARCH):** If you use data from [LIVE SEARCH DATA] or [SCRAPED DATA], you MUST cite your sources intelligently using markdown links (e.g., "[Source Name](url)"). Filter out noise and present only verified facts.

### FOLLOWUP SUGGESTIONS RULES (VERY IMPORTANT):
- Do NOT add <followups> after every response. Most responses do NOT need them.
- ONLY add <followups> tag when ALL of the following are true:
  1. The topic is complex, multi-part, or exploratory (e.g. user asked about a broad subject, an image was generated, or code was written).
  2. There are genuinely useful next steps that the user would actually want.
  3. The response itself does NOT already invite further discussion naturally.
- NEVER add <followups> for: simple confirmations, yes/no answers, short factual replies, greetings, or casual chat.
- When you do include them, limit to maximum 2-3 short, highly relevant suggestions.
- Format: <followups>["Suggestion 1", "Suggestion 2"]</followups>

### CODE & WEBSITE GENERATION (CRITICAL):
- NEVER generate HTML, CSS, JavaScript, or any code UNLESS the user EXPLICITLY asks you to write code or build a website.
- If the user is just asking a general question, answer with plain text. DO NOT output code blocks unnecessarily.
- ONLY when EXPLICITLY requested, write the complete, self-contained, functional code inside a standard markdown HTML block: \`\`\`html <runnable page code> \`\`\`.
- Put all styles in <style> and scripts in <script> tags inside that HTML code block.`;

// ============================================================
// 🤖 AI ENGINE — Groq SDK PRIMARY + LLM Gateway OPTIONAL
// Groq SDK works reliably. Gateway used only when it has
// the provider keys configured in the dashboard.
// ============================================================

// Groq SDK model IDs (these actually work)
const GROQ_MODELS = {
  default:  'llama-3.1-8b-instant',      // Fast, reliable default
  smart:    'llama-3.3-70b-versatile', // Emulating reasoning via prompt
  code:     'qwen-2.5-coder-32b',        // Code specialist
  creative: 'llama-3.3-70b-versatile', // Emulating reasoning via prompt
  expert:   'llama-3.3-70b-versatile', // Emulating reasoning via prompt
  fast:     'llama-3.1-8b-instant',      // Urgent / sub-second
};

// LLM Gateway model IDs — only used if Gateway has the provider keys set
const GATEWAY_MODELS = {
  default:  'google/gemini-1.5-flash',
  smart:    'google/gemini-1.5-pro',
  code:     'google/gemini-1.5-pro',
  creative: 'google/gemini-1.5-pro',
  expert:   'google/gemini-1.5-pro',
  fast:     'google/gemini-1.5-flash',
};

async function callGateway(messages, temperature, modelId, tools = null) {
  const url = 'https://api.llmgateway.io/v1/chat/completions';
  const body = { model: modelId, messages, temperature };
  if (tools) {
    body.tools = tools;
    body.tool_choice = 'auto';
  }
  
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.LLM_GATEWAY_API_KEY}`
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gateway ${res.status}: ${errText}`);
  }

  const data = await res.json();
  const message = data.choices?.[0]?.message;
  if (!message) throw new Error('Gateway returned empty content');
  return { 
    text: message.content || '', 
    tool_calls: message.tool_calls || null, 
    model: `${modelId}` 
  };
}

async function callLLM(messages, temperature = 0.3, targetModel = 'auto', tools = null) {
  const maxRetries = 2;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      console.log(`🔄 Retry ${attempt}/${maxRetries} for LLM call...`);
      await new Promise(r => setTimeout(r, attempt * 1000));
    }
    try {
      return await callLLMOnce(messages, temperature, targetModel, tools);
    } catch (err) {
      console.warn(`LLM attempt ${attempt + 1} failed: ${err.message}`);
      if (attempt === maxRetries) throw err;
    }
  }
}

async function callLLMOnce(messages, temperature = 0.3, targetModel = 'auto', tools = null) {
  const cerebrasModelId = targetModel === 'fast' ? 'zai-glm-4.7' : 'gpt-oss-120b';

  if (cerebras) {
    try {
      console.log(`🚀 Cerebras Primary → ${cerebrasModelId}`);
      const params = {
        messages, model: cerebrasModelId, temperature, max_tokens: 2048,
      };
      if (tools) { params.tools = tools; params.tool_choice = 'auto'; }
      const completion = await cerebras.chat.completions.create(params);
      const m = completion.choices[0].message;
      if (m) return { text: m.content || '', tool_calls: m.tool_calls || null, model: `Cerebras (${cerebrasModelId})` };
    } catch (err) { console.warn(`Cerebras failed: ${err.message}`); }
  }

  const groqModelId = GROQ_MODELS[targetModel] || GROQ_MODELS.smart;
  for (const [client, label, models] of [
    [groq, 'Groq', [groqModelId, GROQ_MODELS.default]],
    [groq2, 'Groq Key2', [groqModelId, GROQ_MODELS.default]]
  ]) {
    if (!client) continue;
    for (const model of [...new Set(models)]) {
      try {
        console.log(`🤖 ${label} → ${model}`);
        const params = { messages, model, temperature, max_tokens: 2048 };
        if (tools) { params.tools = tools; params.tool_choice = 'auto'; }
        const completion = await client.chat.completions.create(params);
        const m = completion.choices[0].message;
        if (m) return { text: m.content || '', tool_calls: m.tool_calls || null, model: `${label} (${model})` };
      } catch (err) { console.warn(`${label} ${model} failed: ${err.message}`); }
    }
  }

  if (process.env.LLM_GATEWAY_API_KEY) {
    const gatewayModelId = GATEWAY_MODELS[targetModel] || GATEWAY_MODELS.smart;
    try {
      console.log(`🌐 Gateway Fallback → ${gatewayModelId}`);
      return await callGateway(messages, temperature, gatewayModelId, tools);
    } catch (err) { console.warn(`Gateway failed: ${err.message}`); }
  }

  throw new Error('All AI providers failed. Check CEREBRAS_API_KEY, GROQ_API_KEY, or LLM_GATEWAY_API_KEY in .env');
}

async function executeToolCall(toolCall, writeStreamChunk) {
  const functionName = toolCall.function.name;
  let args = {};
  if (toolCall.function.arguments) {
    try {
      args = JSON.parse(toolCall.function.arguments);
    } catch (e) {
      args = {};
    }
  }
  if (!args || typeof args !== 'object') {
    args = {};
  }
  console.log(`🔨 Executing tool: ${functionName} with args: ${JSON.stringify(args)}`);
  
  if (writeStreamChunk) {
    writeStreamChunk({ type: 'status', text: `Executing tool: ${functionName}...` });
  }

  try {
    switch (functionName) {
      case 'list_skills':
        return listSkills();
      case 'read_skill':
        return readSkill(args.skillName);
      case 'search_web':
        return await searchWeb(args.query);
      case 'scrape_website':
        return await scrapeWebsite(args.url);
      case 'generate_image':
        return await generatePosterImage(args.prompt);
      case 'get_instagram_posts':
        return await getInstagramRecentMedia(args.username || 'pratham_patel_18');
      case 'get_instagram_profile':
        return await getInstagramProfileInfo(args.username || 'pratham_patel_18');
      case 'post_to_instagram':
        return await publishInstagramPhoto(args.imageUrl, args.caption);
      default:
        return `Error: Unknown function ${functionName}`;
    }
  } catch (error) {
    console.error(`Error executing ${functionName}:`, error);
    return `Error executing tool: ${error.message}`;
  }
}

async function runAgentLoop(messages, temperature, modelName, writeStreamChunk) {
  const maxIterations = 5;
  let currentIteration = 0;
  let finalModelUsed = modelName;
  let generatedImageUrl = null;
  const executedCalls = new Set();

  while (currentIteration < maxIterations) {
    let response;
    try {
      response = await callLLM(messages, temperature, modelName, toolsDefinition);
    } catch (err) {
      console.error(`Agent loop LLM failed at iteration ${currentIteration}: ${err.message}`);
      if (currentIteration === 0) throw err;
      return { text: messages.length > 1 ? 'Agent encountered an error but partial results available.' : 'AI service unavailable. Please try again.', model: finalModelUsed, imageUrl: generatedImageUrl };
    }
    finalModelUsed = response.model;
    
    const assistantMsg = {
      role: 'assistant',
      content: response.text || '',
      tool_calls: response.tool_calls
    };
    messages.push(assistantMsg);

    if (response.tool_calls && response.tool_calls.length > 0) {
      for (const toolCall of response.tool_calls) {
        const callKey = `${toolCall.function.name}:${toolCall.function.arguments || ''}`;
        let result;
        
        if (executedCalls.has(callKey)) {
          console.log(`⚠️ Tool call duplicate detected: ${callKey}. Bypassing execution.`);
          result = `Info: You have already called this tool with these exact arguments in this turn. It returned the same result. Do NOT call it again. Please construct your final response based on the data you currently have.`;
        } else {
          executedCalls.add(callKey);
          try {
            result = await executeToolCall(toolCall, writeStreamChunk);
          } catch (toolErr) {
            console.error(`Tool ${toolCall.function.name} crashed: ${toolErr.message}`);
            result = `Error: Tool "${toolCall.function.name}" failed to execute. ${toolErr.message}`;
          }
        }

        if (toolCall.function.name === 'generate_image') {
          generatedImageUrl = result;
        }

        messages.push({
          tool_call_id: toolCall.id,
          role: "tool",
          name: toolCall.function.name,
          content: typeof result === 'string' ? result : JSON.stringify(result)
        });
      }
      currentIteration++;
    } else {
      return { text: response.text, model: finalModelUsed, imageUrl: generatedImageUrl };
    }
  }

  return { text: "Reached maximum iterations without final answer.", model: finalModelUsed, imageUrl: generatedImageUrl };
}

// Smart model router — maps query context to the best Gateway model key
function routeModel(questionType, userLevel, isUrgent) {
  let modelKey = 'smart';
  let reasoning = 'balanced quality model for standard queries';

  if (isUrgent) {
    modelKey = 'fast';
    reasoning = 'fast model chosen for urgent sub-second response';
  } else if (questionType === 'simple') {
    modelKey = 'fast';
    reasoning = 'fast lightweight model for simple questions';
  } else if (questionType === 'code') {
    modelKey = 'code';
    reasoning = 'specialized code model for programming tasks';
  } else if (questionType === 'creative') {
    modelKey = 'creative';
    reasoning = 'creative model for writing and imaginative tasks';
  } else if (userLevel === 'expert' || questionType === 'complex') {
    modelKey = 'expert';
    reasoning = 'expert reasoning model for deep analysis';
  }

  return { primaryModel: GATEWAY_MODELS[modelKey], reasoning };
}

// Scans user message for workflow/automation creation requests and generates custom tools/skills
function checkAndCreateTool(message) {
  const lower = message.toLowerCase();
  
  if (lower.includes('create a tool') || lower.includes('make a tool') || lower.includes('automate a workflow')) {
    try {
      const match = message.match(/(?:tool to|tool for|automate)\s+([^.\n]+)/i);
      const targetTopic = match ? match[1].trim() : 'custom_workflow';
      const cleanTopicName = targetTopic.replace(/\s+/g, '_').toLowerCase();
      
      const skillsDir = path.join(__dirname, 'skills');
      if (!fs.existsSync(skillsDir)) {
        fs.mkdirSync(skillsDir, { recursive: true });
      }
      
      const skillPath = path.join(skillsDir, `auto_tool_${cleanTopicName}.md`);
      if (!fs.existsSync(skillPath)) {
        const skillContent = `---
name: Auto Tool for ${targetTopic}
description: Automatically generated rule-set tool to handle requests regarding ${targetTopic}.
---
# Auto-Generated Tool Rules for ${targetTopic}
- When matching queries about "${targetTopic}", execute the following:
- Format the output with clean tables and lists.
- Keep explanation clear, concise, and structured.`;
        
        fs.writeFileSync(skillPath, skillContent, 'utf-8');
        console.log(`🛠️ Autonomous Tool created successfully at: ${skillPath}`);
      }
    } catch (err) {
      console.error("Error creating autonomous tool:", err.message);
    }
  }
}

// Smart LLM-based Classifier to detect intent and required tools dynamically
async function classifyIntentAndTools(message) {
  const prompt = [
    {
      role: 'system',
      content: `You are an intent and tool classifier for an AI agent. Analyze the user request.
Determine if it requires any of the following tools:
1. "search": Web Search (for real-time news, current events, weather, fact-checking, or search queries).
2. "scrape": Scrape URL (if a URL is provided in the message to read its content).
3. "image": Image Generation (if the user asks to draw, generate, paint, design, or create a visual, picture, photo, poster, banner, image, or chitra).

Respond ONLY with a valid JSON block containing:
{
  "needsSearch": true/false,
  "searchQuery": "the query to search if needed, else empty string",
  "needsScrape": true/false,
  "scrapeUrl": "the url to scrape if found in message, else empty string",
  "needsImage": true/false,
  "imagePrompt": "Create a HIGHLY DESCRIPTIVE, VIVID, and PROFESSIONAL prompt in English for the AI image generator. Include specific lighting, camera angles, texture, and mood. Describe the scene exactly as the user wants, without missing details. If no image needed, leave empty string"
}
Do NOT output any markdown tags or text outside the JSON block. Do NOT include any explanations.`
    },
    {
      role: 'user',
      content: message
    }
  ];

  try {
    // Use the smart model for highly precise intent classification (Zero Mistakes)
    const result = await callLLM(prompt, 0.1, 'smart');
    const cleanJson = result.text.replace(/```json|```/gi, '').trim();
    return JSON.parse(cleanJson);
  } catch (err) {
    console.warn("LLM intent classification failed:", err.message);
    return null;
  }
}

// Get memory preference from DB
function getPreference(key) {
  try {
    const stmt = db.prepare('SELECT value FROM user_preferences WHERE key = ?');
    const row = stmt.get(key);
    return row ? row.value : null;
  } catch (err) {
    console.error("Error reading preference:", err.message);
    return null;
  }
}

// Set memory preference in DB
function setPreference(key, value) {
  try {
    const stmt = db.prepare('INSERT INTO user_preferences (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = ?');
    stmt.run(key, value, value);
  } catch (err) {
    console.error("Error setting preference:", err.message);
  }
}

// Process feedback keywords to update preferred length or tone
function processFeedbackLoop(message) {
  const lower = message.toLowerCase();
  
  if (['short mein', 'kam shabdo', 'brief', 'chhota', 'short response'].some(kw => lower.includes(kw))) {
    setPreference('preferred_length', 'short');
    setPreference('preferred_tone', 'hurry');
  } else if (['detail mein', 'samjhao', 'explain', 'vistar', 'lamba', 'detailed response'].some(kw => lower.includes(kw))) {
    setPreference('preferred_length', 'long');
    setPreference('preferred_tone', 'curious');
  }

  if (['thanks', 'thank you', 'helpful', 'dhanyavaad', 'shukriya', 'great job'].some(kw => lower.includes(kw))) {
    const positiveCount = parseInt(getPreference('feedback_positive') || '0', 10) + 1;
    setPreference('feedback_positive', positiveCount.toString());
  } else if (['galat', 'wrong', 'annoyed', 'bekar', 'not working', 'fail'].some(kw => lower.includes(kw))) {
    const negativeCount = parseInt(getPreference('feedback_negative') || '0', 10) + 1;
    setPreference('feedback_negative', negativeCount.toString());
  }
}

function determineActionIntent(userMessage) {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  if (urlRegex.test(userMessage)) return 'SCRAPE_URL';

  const searchKeywords = [
    'search', 'dhoondo', 'find online', 'latest', 'news', 
    'current', 'aaj kya', 'kaun hai', 'market stats', 'real time',
    'who is', 'what is happening', 'price of', 'weather', 'upcoming'
  ];
  const lower = userMessage.toLowerCase();
  if (searchKeywords.some(keyword => lower.includes(keyword))) {
    return 'SEARCH_WEB';
  }

  return 'DIRECT_RESPONSE';
}

function saveMessage(sessionId, role, content) {
  const stmt = db.prepare('INSERT INTO chat_history (session_id, role, content) VALUES (?, ?, ?)');
  stmt.run(sessionId, role, content);
}

function getHistory(sessionId) {
  const stmt = db.prepare(`
    SELECT role, content FROM (
      SELECT id, role, content FROM chat_history 
      WHERE session_id = ? 
      ORDER BY id DESC LIMIT 20
    ) ORDER BY id ASC
  `);
  return stmt.all(sessionId);
}

function saveSessionData(sessionId, key, value) {
  const stmt = db.prepare('REPLACE INTO session_data (session_id, key, value) VALUES (?, ?, ?)');
  stmt.run(sessionId, key, String(value));
}

function getSessionData(sessionId, key) {
  const row = db.prepare('SELECT value FROM session_data WHERE session_id = ? AND key = ?').get(sessionId, key);
  return row ? row.value : null;
}

function deleteSessionData(sessionId, key) {
  db.prepare('DELETE FROM session_data WHERE session_id = ? AND key = ?').run(sessionId, key);
}

// Helper to build dynamic system prompts matching speed, expertise, intent, and emotion guidelines
function buildSystemPrompt(skills, toolContext, speedMode, urgent, expertise, intent, emotion, promptOverride = '') {
  let personaInstructions = '\n\n### 🎯 PERSONALIZED RESPONSE INSTRUCTIONS:';

  // 1. Audience Expertise level
  if (expertise === 'beginner') {
    personaInstructions += `
- TARGET AUDIENCE: BEGINNER. Use very simple language and clear everyday analogies (e.g., comparing concepts to cars, cooking, or sports).
- Strictly avoid technical jargon (or explain it simply if unavoidable).
- Limit the explanation to 3 main points.
- Target word count: ~150 words.`;
  } else if (expertise === 'intermediate') {
    personaInstructions += `
- TARGET AUDIENCE: INTERMEDIATE. Provide a balanced explanation containing technical terms but explaining them clearly.
- Provide practical examples.
- Limit the explanation to 4-5 key points.
- Target word count: ~250 words.`;
  } else if (expertise === 'expert') {
    personaInstructions += `
- TARGET AUDIENCE: EXPERT. Use formal technical language and advanced conceptual details.
- Avoid simple analogies; get straight to mechanisms, mathematics, error margins, or research specifications.
- Target word count: ~400-500 words.`;
  }

  // 2. Response Intent
  if (intent === 'overview') {
    personaInstructions += `
- RESPONSE FORMAT: OVERVIEW. Keep the response direct, high-level, and concise. Do not deep-dive.`;
  } else if (intent === 'detailed') {
    personaInstructions += `
- RESPONSE FORMAT: DETAILED. Provide a comprehensive summary with structured sections and clear bullet points.`;
  } else if (intent === 'deep_dive') {
    personaInstructions += `
- RESPONSE FORMAT: DEEP DIVE. Provide a highly detailed, thorough, multi-layered explanation covering edge cases and architectural principles.`;
  }

  // 3. Emotional Mode
  if (emotion === 'hurry') {
    personaInstructions += `
- TONE: URGENT / HURRY. The user is in a rush. Skip any intro, warm greetings, or outro text. Keep response short (under 100 words) and use direct bullets.`;
  } else if (emotion === 'curious') {
    personaInstructions += `
- TONE: CURIOUS. Keep the tone engaging, interactive, and friendly. Use relevant emojis.`;
  } else if (emotion === 'excited') {
    personaInstructions += `
- TONE: EXCITED. Use energetic, enthusiastic language. Highlight interesting facts and use exclamation marks and formatting to show excitement.`;
  } else if (emotion === 'confused') {
    personaInstructions += `
- TONE: CONFUSED. Be highly empathetic and reassuring. Break the information down step-by-step in a structured, easy-to-follow guide.`;
  }

  let speedLabel = '';
  if (speedMode === 'SLOW') {
    speedLabel = `\n- MODEL IS SLOW: Overwrite length constraints to prioritize brevity. Prefer shorter formatting.`;
  } else if (speedMode === 'MEDIUM') {
    speedLabel = `\n- MODEL IS MEDIUM: Balanced speed and depth.`;
  }

  if (urgent) {
    speedLabel += `\n- URGENT PRIORITY: Keep response under 80 words. Bullet points only.`;
  }

  const followupsInstruction = `
\n\n### 📋 CRITICAL: INTERACTIVE FOLLOW-UPS PROTOCOL
- At the very end of your response, you MUST append a suggestion array inside a single line containing EXACTLY this tag:
<followups>["Option 1", "Option 2", "Option 3"]</followups>
- Replace "Option 1", "Option 2", "Option 3" with 3 realistic, specific, and highly engaging follow-up prompts the user might ask next based on this conversation.
- Example prompts should be direct questions suited to their current expertise level (e.g. if beginner: simple questions; if expert: advanced technical details).
- Do NOT output any explanation outside the tag. Put it on a new line at the very end of your message.`;

  return `${DECISION_SYSTEM_PROMPT}\n${skills}${personaInstructions}${speedLabel}${followupsInstruction}${promptOverride}${toolContext ? `\n\n### RETRIEVED LIVE TOOL DATA ###${toolContext}` : ''}`;
}

// 🌟 API to create a new session
app.post('/api/session/new', (req, res) => {
  const sessionId = 'session_' + Math.random().toString(36).substring(2, 11);
  res.json({ success: true, sessionId });
});

// 🌟 API to delete a session's history
app.delete('/api/session/:id', (req, res) => {
  const { id } = req.params;
  try {
    const stmt = db.prepare('DELETE FROM chat_history WHERE session_id = ?');
    stmt.run(id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 🌟 API for real-time predictive pre-generation (checking cache similarity while typing)
app.post('/api/typing-predict', (req, res) => {
  try {
    const { text } = req.body;
    if (!text || text.trim().length < 4) {
      return res.json({ success: true, match: false });
    }
    
    // Check cache similarity
    const cacheMatch = orchestrator.findInCache(db, text);
    if (cacheMatch) {
      return res.json({
        success: true,
        match: true,
        response_text: cacheMatch.response_text,
        model_name: cacheMatch.model_name + ' (Cached Pre-loaded)',
        image_url: cacheMatch.image_url
      });
    }
    
    res.json({ success: true, match: false });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 🌟 API to save user preference dynamically
app.post('/api/preference/save', (req, res) => {
  const { key, value } = req.body;
  if (!key || !value) {
    return res.status(400).json({ success: false, error: 'key and value are required' });
  }
  setPreference(key, value);
  res.json({ success: true });
});

// 🌟 API to revise response in background
app.post('/api/revise', async (req, res) => {
  try {
    const { 
      message, 
      previousResponse, 
      sessionId,
      expertise = 'beginner',
      intent = 'overview',
      emotion = 'curious'
    } = req.body;

    if (!message || !previousResponse) {
      return res.status(400).json({ error: 'message and previousResponse are required' });
    }

    // Auto-detect settings from query text
    const lowerMessage = message.toLowerCase();
    let isUrgent = false;
    if (['urgent', 'jaldi', 'quick', 'fast', 'emergency', 'turant', 'immediately', 'right now', 'abbi', 'fatafat'].some(kw => lowerMessage.includes(kw))) {
      isUrgent = true;
    }

    let detectedExpertise = expertise;
    if (expertise === 'beginner') {
      const expertKeywords = ['technical', 'architecture', 'mathematical', 'formula', 'paper', 'research', 'decoherence', 'entanglement', 'proof', 'equation', 'quantum gate', 'algorithm', 'cryptography', 'mechanism'];
      const intermediateKeywords = ['explain', 'detail', 'concept', 'example', 'difference', 'bit', 'qubit', 'compare', 'work', 'how to', 'kya hota', 'kaise'];
      if (expertKeywords.some(kw => lowerMessage.includes(kw))) {
        detectedExpertise = 'expert';
      } else if (intermediateKeywords.some(kw => lowerMessage.includes(kw))) {
        detectedExpertise = 'intermediate';
      }
    }

    let detectedIntent = intent;
    if (intent === 'overview') {
      const deepDiveKeywords = ['deep dive', 'in-depth', 'comprehensively', 'full detail', 'details', 'detail mein', 'visar', 'sabh', 'history', 'background'];
      const detailedKeywords = ['list', 'steps', 'points', 'types', 'features', 'explain', 'samjhao'];
      if (deepDiveKeywords.some(kw => lowerMessage.includes(kw))) {
        detectedIntent = 'deep_dive';
      } else if (detailedKeywords.some(kw => lowerMessage.includes(kw))) {
        detectedIntent = 'detailed';
      }
    }

    let detectedEmotion = emotion;
    if (emotion === 'curious') {
      if (isUrgent) {
        detectedEmotion = 'hurry';
      } else if (['help', 'don\'t understand', 'confused', 'samajh nahi', 'pata nahi', 'gadbad', 'error', 'fail'].some(kw => lowerMessage.includes(kw))) {
        detectedEmotion = 'confused';
      } else if (['!', 'awesome', 'wow', 'excited', 'great', 'bahut badhiya'].some(kw => lowerMessage.includes(kw))) {
        detectedEmotion = 'excited';
      }
    }

    console.log(`🔄 Background Revision Triggered. Query: "${message}" | Auto-Detected Settings: [${detectedExpertise}, ${detectedIntent}, ${detectedEmotion}]`);
        // Determine question type and length override constraints using the controller
    const questionType = smartController.detectQuestionType(message);
    const isConfirm = smartController.isConfirmationQuestion(message);
    
    let promptOverride = '';
    if (isConfirm || questionType === 'confirm' || questionType === 'yesno') {
      promptOverride = `\n\n### CRITICAL RESPONSE LENGTH CONSTRAINT ###\n- The user asked a simple YES/NO or confirmation question. \n- You MUST respond with a brief "Haan/Nahi" (or Yes/No equivalent in Hindi/English) followed by exactly one sentence explanation. \n- Do NOT give historical backgrounds, lists, or long details. Keep the total response under 30 words!`;
    } else if (questionType === 'simple' && message.split(' ').length < 10) {
      promptOverride = `\n\n### CRITICAL RESPONSE LENGTH CONSTRAINT ###\n- The user asked a short, simple question. \n- Respond directly in a single, short sentence. Keep it under 40 words!`;
    }

    const skills = loadSkills();
    const systemPrompt = buildSystemPrompt(skills, '', 'FAST', isUrgent, detectedExpertise, detectedIntent, detectedEmotion, promptOverride);

    const revisionPrompt = [
      { 
        role: 'system', 
        content: `${systemPrompt}\n\n### REVISION PROTOCOL ###\nYou are performing a background quality upgrade. Revise the previous response to align perfectly with the required expertise, intent, tone, and formatting constraints. Maintain the interactive suggestion chips tag (<followups>...</followups>) at the end.` 
      },
      { role: 'user', content: message },
      { role: 'assistant', content: previousResponse },
      { role: 'user', content: 'Provide the fully revised, high-quality response.' }
    ];

    const result = await callLLM(revisionPrompt, 0.3);
    let revisedText = result.text;

    // Append explainable revision for transparency
    const explainableRevision = `

<details>
<summary>Why This Approach (Revised) 🧠</summary>

- **Model Used for Revision**: \`groq/llama-3.3-70b-versatile\` (Expert evaluation and quality check alignment)
- **Status**: Successful Background Revision & Optimization

</details>`;

    // Insert reasoning before followups tag if present to keep suggestion chips at the absolute bottom
    const followupsRegex = /<followups>([\s\S]*?)<\/followups>/i;
    if (followupsRegex.test(revisedText)) {
      revisedText = revisedText.replace(followupsRegex, (match) => explainableRevision + '\n\n' + match);
    } else {
      revisedText += explainableRevision;
    }

    // Save/Update in SQLite Chat history
    const selectStmt = db.prepare("SELECT id FROM chat_history WHERE session_id = ? AND role = 'assistant' ORDER BY id DESC LIMIT 1");
    const lastMsg = selectStmt.get(sessionId);
    if (lastMsg) {
      const updateStmt = db.prepare('UPDATE chat_history SET content = ? WHERE id = ?');
      updateStmt.run(revisedText, lastMsg.id);
    } else {
      saveMessage(sessionId, 'assistant', revisedText);
    }

    // Update Cache
    orchestrator.saveToCache(db, message, revisedText, result.model, null);

    res.json({
      success: true,
      message: revisedText,
      model: result.model
    });
  } catch (err) {
    console.error("Background Revision Error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Helper to update last assistant message content in chat history
function updateLastAssistantMessage(sessionId, content) {
  try {
    const selectStmt = db.prepare("SELECT id FROM chat_history WHERE session_id = ? AND role = 'assistant' ORDER BY id DESC LIMIT 1");
    const lastMsg = selectStmt.get(sessionId);
    if (lastMsg) {
      const updateStmt = db.prepare('UPDATE chat_history SET content = ? WHERE id = ?');
      updateStmt.run(content, lastMsg.id);
    }
  } catch (err) {
    console.error("Failed to update last assistant message:", err.message);
  }
}

// Streamed Chat Endpoint
app.post('/api/chat', async (req, res) => {
  // Set headers for Chunked NDJSON response stream
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Transfer-Encoding', 'chunked');

  const writeStreamChunk = (obj) => {
    res.write(JSON.stringify(obj) + '\n');
  };

  try {
    const { 
      message, 
      sessionId = 'default_session', 
      simulatedSpeed = 'auto', 
      urgent = false,
      expertise = 'beginner',
      intent = 'overview',
      emotion = 'curious'
    } = req.body;

    if (!message) {
      writeStreamChunk({ error: 'message is required' });
      return res.end();
    }

    const startTime = Date.now();

    // Trigger Autonomous Tool Creation check
    checkAndCreateTool(message);

    // 1. Check Similarity Cache (Bypassed for dynamic Instagram/live social queries)
    const isInstagramQuery = ['instagram', 'ig ', 'ig_', 'feed', 'post', 'upload'].some(kw => message.toLowerCase().includes(kw));
    const cacheMatch = isInstagramQuery ? null : orchestrator.findInCache(db, message);
    if (cacheMatch) {
      writeStreamChunk({ type: 'status', text: '🎯 Similarity cache hit! Fetching instant response...' });
      // Short delay for realistic UI transition
      await new Promise(resolve => setTimeout(resolve, 300));
      
      saveMessage(sessionId, 'user', message);
      saveMessage(sessionId, 'assistant', cacheMatch.response_text);
      
      writeStreamChunk({
        type: 'done',
        success: true,
        sessionId,
        intent: 'CACHE_HIT',
        message: cacheMatch.response_text,
        model: cacheMatch.model_name + ' (Cached)',
        imageUrl: cacheMatch.image_url,
        averageLatencyMs: 0
      });
      return res.end();
    }

    // 2. Classify Speed
    let speedMode = 'FAST';
    let avgLatency = 2000;
    
    if (simulatedSpeed && simulatedSpeed !== 'auto') {
      speedMode = simulatedSpeed.toUpperCase();
      console.log(`⚙️ Simulated Model Speed Override: ${speedMode}`);
    } else {
      avgLatency = orchestrator.getAverageResponseTime(db);
      speedMode = orchestrator.classifySpeed(avgLatency);
      console.log(`📊 Measured Average Latency: ${(avgLatency / 1000).toFixed(2)}s -> Class: ${speedMode}`);
    }

    // 3. User Communication
    writeStreamChunk({ type: 'status', text: 'Processing your request... ⏳', speedMode, avgLatencyMs: avgLatency });
    
    if (speedMode === 'SLOW') {
      writeStreamChunk({ type: 'status', text: 'Thoda time lagega, main parallel execution kar raha hoon...' });
    }

    // 4. Determine Tools
    const lowerMessage = message.toLowerCase();

    // Automatic classification from message text
    // 1. Auto-detect Urgent/Hurry
    let isUrgent = urgent;
    if (['urgent', 'jaldi', 'quick', 'fast', 'emergency', 'turant', 'immediately', 'right now', 'abbi', 'fatafat'].some(kw => lowerMessage.includes(kw))) {
      isUrgent = true;
    }

    // 2. Auto-detect Expertise Level
    let detectedExpertise = expertise;
    if (expertise === 'beginner') { 
      const expertKeywords = ['technical', 'architecture', 'mathematical', 'formula', 'paper', 'research', 'decoherence', 'entanglement', 'proof', 'equation', 'quantum gate', 'algorithm', 'cryptography', 'mechanism'];
      const intermediateKeywords = ['explain', 'detail', 'concept', 'example', 'difference', 'bit', 'qubit', 'compare', 'work', 'how to', 'kya hota', 'kaise'];
      
      if (expertKeywords.some(kw => lowerMessage.includes(kw))) {
        detectedExpertise = 'expert';
      } else if (intermediateKeywords.some(kw => lowerMessage.includes(kw))) {
        detectedExpertise = 'intermediate';
      }
    }

    // 3. Auto-detect Intent
    let detectedIntent = intent;
    if (intent === 'overview') {
      const deepDiveKeywords = ['deep dive', 'in-depth', 'comprehensively', 'full detail', 'details', 'detail mein', 'visar', 'sabh', 'history', 'background'];
      const detailedKeywords = ['list', 'steps', 'points', 'types', 'features', 'explain', 'samjhao'];
      
      if (deepDiveKeywords.some(kw => lowerMessage.includes(kw))) {
        detectedIntent = 'deep_dive';
      } else if (detailedKeywords.some(kw => lowerMessage.includes(kw))) {
        detectedIntent = 'detailed';
      }
    }

    // 4. Auto-detect Emotion & Language
    const detectedEmotion = orchestrator.detectEmotion(message);
    const detectedLanguage = orchestrator.detectLanguage(message);

    // 5. Multi-Model Dynamic Routing
    const chatQuestionTypeCategory = orchestrator.analyzeQuestionType(message);
    const modelSelection = routeModel(chatQuestionTypeCategory, detectedExpertise, isUrgent);
    const routedModelName = modelSelection.primaryModel;
    const selectionReasoning = modelSelection.reasoning;

    // Determine question type and length override constraints using the controller
    const chatQuestionType = smartController.detectQuestionType(message);
    const chatIsConfirm = smartController.isConfirmationQuestion(message);
    
    // Build context-aware memory constraints
    const prefTone = getPreference('preferred_tone');
    const prefLength = getPreference('preferred_length');
    const lastTopic = getPreference('last_topic');
    const lastTopicTime = getPreference('last_topic_timestamp');

    let memoryContextPrompt = '';
    if (prefTone) {
      memoryContextPrompt += `\n- Tone preference: The user has previously preferred a ${prefTone} tone. Adjust accordingly.`;
    }
    if (prefLength) {
      memoryContextPrompt += `\n- Length preference: The user has previously preferred ${prefLength} responses. Adjust length accordingly.`;
    }

    const currentTopic = smartController.extractTopic(message);
    if (currentTopic !== 'unknown') {
      if (lastTopic === currentTopic && lastTopicTime && (Date.now() - parseInt(lastTopicTime, 10) < 24 * 60 * 60 * 1000)) {
        memoryContextPrompt += `\n- Continuity Context: The user is continuing a topic from earlier today about "${currentTopic}". Connect naturally to what you already discussed.`;
      }
      setPreference('last_topic', currentTopic);
      setPreference('last_topic_timestamp', Date.now().toString());
    }

    let promptOverride = memoryContextPrompt;
    
    // Add language override constraints
    if (detectedLanguage === 'hindi') {
      promptOverride += `\n- LANGUAGE CONSTRAINT: Respond strictly in Hindi language (Devanagari script).`;
    } else if (detectedLanguage === 'hinglish') {
      promptOverride += `\n- LANGUAGE CONSTRAINT: Respond strictly in Hinglish language (a natural, friendly mix of English and Hindi written in Latin characters).`;
    } else {
      promptOverride += `\n- LANGUAGE CONSTRAINT: Respond in English language.`;
    }

    if (chatIsConfirm || chatQuestionType === 'confirm' || chatQuestionType === 'yesno') {
      promptOverride += `\n\n### CRITICAL RESPONSE LENGTH CONSTRAINT ###\n- The user asked a simple YES/NO or confirmation question. \n- You MUST respond with a brief "Haan/Nahi" (or Yes/No equivalent in Hindi/English) followed by exactly one sentence explanation. \n- Do NOT give historical backgrounds, lists, or long details. Keep the total response under 30 words!`;
    } else if (chatQuestionType === 'simple' && message.split(' ').length < 10) {
      promptOverride += `\n\n### CRITICAL RESPONSE LENGTH CONSTRAINT ###\n- The user asked a short, simple question. \n- Respond directly in a single, short sentence. Keep it under 40 words!`;
    }

    // 5. Build Dynamic Agent Messages
    let skills = loadSkills();
    let temperature = 0.3;
    skills = skills.substring(0, 2000) + '\n... [Truncated for token limit]';
    
    let systemPrompt = buildSystemPrompt(skills, '', speedMode, isUrgent, detectedExpertise, detectedIntent, detectedEmotion, promptOverride);

    // Inject last generated image URL for cross-request Instagram posting flow
    const lastImageUrl = getSessionData(sessionId, 'last_image_url');
    if (lastImageUrl) {
      systemPrompt += `\n\n### LAST GENERATED IMAGE URL (for cross-request use)\nImage URL: ${lastImageUrl}\n\nAgar user ne pichle message mein image generate karwai thi aur ab "post karo" / "haan" / "kardo" keh raha hai, toh yeh URL use karke 'post_to_instagram(imageUrl: "${lastImageUrl}", caption: "...")' call karo.\n`;
    }

    // Limit history to the last 4 messages to save token overhead
    const history = getHistory(sessionId).slice(-4);
    const cleanHistory = history.map(h => ({
      role: h.role,
      content: h.content.includes('```html')
        ? h.content.replace(/```html[\s\S]*?```/gi, '[Website Code Block - Truncated for token optimization]')
        : h.content
    }));

    const fullMessages = [
      { role: 'system', content: systemPrompt },
      ...cleanHistory,
      { role: 'user', content: message }
    ];

    writeStreamChunk({ type: 'status', text: 'Spawning autonomous agent loop... ⏳' });

    // Execute dynamic agent loop (tool calling)
    const agentResult = await runAgentLoop(fullMessages, temperature, routedModelName, writeStreamChunk);
    
    let finalResponseText = agentResult.text;
    let modelUsed = agentResult.model;
    let generatedImageUrl = agentResult.imageUrl;

    // Persist last generated image URL for cross-request Instagram posting
    if (generatedImageUrl) {
      saveSessionData(sessionId, 'last_image_url', generatedImageUrl);
    }

    // 7. Quality check & Revision loop
    let qualityScore = 10;
    try {
      qualityScore = await orchestrator.evaluateQuality(callLLM, message, finalResponseText, speedMode);
    } catch { qualityScore = 10; }

    let maxRevisions = 0;
    if (speedMode === 'FAST') maxRevisions = 3;
    else if (speedMode === 'MEDIUM') maxRevisions = 1;

    let revisionAttempt = 0;
    let revisionSuggested = false;

    while (qualityScore < 7 && revisionAttempt < maxRevisions) {
      revisionAttempt++;
      writeStreamChunk({ type: 'status', text: `Quality Score: ${qualityScore}/10 is below threshold. Refining response... (Attempt ${revisionAttempt}/${maxRevisions})` });
      
      const revisionMessages = [
        { role: 'system', content: `${systemPrompt}\n\n### QUALITY CHECK FAILURE ###\nYour previous response was rated ${qualityScore}/10. Please write a revised version. Address all details and correct the formatting.` },
        ...cleanHistory,
        { role: 'user', content: message },
        { role: 'assistant', content: finalResponseText },
        { role: 'user', content: 'Provide the revised response.' }
      ];

      try {
        const revisedResult = await callLLM(revisionMessages, temperature, routedModelName);
        finalResponseText = revisedResult.text || finalResponseText;
        modelUsed = revisedResult.model;
      } catch { break; }

      try {
        qualityScore = await orchestrator.evaluateQuality(callLLM, message, finalResponseText, speedMode);
      } catch { break; }
    }

    try {
      if (speedMode === 'SLOW' && qualityScore < 6) {
        revisionSuggested = true;
        writeStreamChunk({ type: 'status', text: `Quality Score: ${qualityScore}/10 is low, but proceeding to save response time.` });
      } else {
        writeStreamChunk({ type: 'status', text: `Quality Check passed: ${qualityScore}/10.` });
      }
    } catch (e) {}

    // Append explainable reasoning to the response text for transparency
    const explainableReasoning = `\n\n<details>\n<summary>Why This Approach 🧠</summary>\n\n- **Routed Model**: \`${modelUsed}\` (${selectionReasoning})\n- **Question Type**: \`${chatQuestionTypeCategory.toUpperCase()}\`\n- **User Expertise**: \`${detectedExpertise.toUpperCase()}\`\n- **Detected Emotion**: \`${detectedEmotion.toUpperCase()}\`\n- **Detected Language**: \`${detectedLanguage.toUpperCase()}\`\n- **Memory Preferences**: ${prefTone || prefLength ? `Length: ${prefLength || 'default'}, Tone: ${prefTone || 'default'}` : 'None (using defaults)'}\n\n</details>`;

    // Insert reasoning before followups tag if present to keep suggestion chips at the absolute bottom
    const followupsRegex = /<followups>([\s\S]*?)<\/followups>/i;
    if (followupsRegex.test(finalResponseText)) {
      finalResponseText = finalResponseText.replace(followupsRegex, (match) => explainableReasoning + '\n\n' + match);
    } else {
      finalResponseText += explainableReasoning;
    }

    // 8. Save Response & Latency
    const elapsedMs = Date.now() - startTime;
    orchestrator.recordResponseTime(db, sessionId, elapsedMs);

    // Save website preview
    const previewUrl = saveWebsitePreview(sessionId, finalResponseText);
    if (previewUrl) {
      finalResponseText += `\n\n🌐 **Live Website Preview:** [Click here to view your site live](${previewUrl})`;
    }

    // Save to Cache
    orchestrator.saveToCache(db, message, finalResponseText, modelUsed, generatedImageUrl || null);

    // Save messages in history
    saveMessage(sessionId, 'user', message);
    saveMessage(sessionId, 'assistant', finalResponseText);

    let sessionTitle = null;
    if (history.length === 0) {
      try {
        const titlePrompt = [{ role: 'user', content: `Summarize this in 2 to 4 words for a chat title: "${message}". Reply ONLY with the words, no quotes, no explanations.` }];
        const titleRes = await callLLM(titlePrompt, 0.3, 'fast');
        if (titleRes?.text) sessionTitle = titleRes.text.trim();
      } catch (e) {}
    }

    writeStreamChunk({
      type: 'done',
      success: true,
      sessionId,
      sessionTitle,
      intent: determineActionIntent(message),
      message: finalResponseText,
      model: modelUsed,
      imageUrl: generatedImageUrl || null,
      revisionSuggested,
      averageLatencyMs: elapsedMs
    });

    res.end();

  } catch (error) {
    console.error('Agent Decision Error:', error.message);
    writeStreamChunk({ success: false, error: error.message });
    res.end();
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n🚀 Brahmand Smart Decision Agent running on http://localhost:${PORT}`);
});