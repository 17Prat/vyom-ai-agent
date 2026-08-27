import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import Cerebras from '@cerebras/cerebras_cloud_sdk';
import Groq from 'groq-sdk';
import Anthropic from '@anthropic-ai/sdk';
import path from 'path';
import fs from 'fs';
import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
 
import { searchWeb } from './services/searchService.js';
import { askLLM } from './services/llmService.js';
import { scrapeWebsite } from './services/scrapeService.js';
import { generatePosterImage, generateFreeVideoAsset } from './services/mediaService.js';
import { listSkills, readSkill } from './utils/skillLoader.js';
import { publishInstagramPhoto, publishInstagramVideo, getInstagramRecentMedia, getInstagramProfileInfo, sendInstagramMessage, getLatestIncomingInstagramMessage } from './services/instagramService.js';
import { toolsDefinition } from './tools.js';
import { sendWhatsappMessage, getLatestIncomingWhatsappMessage } from './services/whatsappService.js';
import { generatePollinationsVideo } from './services/pollinationsVideoService.js';
import { generateCompleteReel } from './services/reelEngine.js';
import { generateDynamicReel } from './services/dynamicReelEngine.js';
import * as orchestrator from './utils/orchestrator.js';
import { SmartResponseController } from './core/SmartResponseController.js';
import { 
  UserIntelligenceEngine, 
  rankCandidateReels, 
  buildContentDNA, 
  formatMandatory17ReelOutput, 
  BRAHMAND_FEATURE_BRAIN 
} from './services/recommendationEngine.js';

const userIntelligence = new UserIntelligenceEngine();

// Track last generated image URL across tool calls within the same request
let _lastGenImageUrl = null;
let _lastPlannedReel = null;
let _lastGenVideoPath = null;

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

// Clean up all playground test files starting with 'test-' or 'test_' and clean_tests.bat on boot
try {
  const rootFiles = fs.readdirSync(__dirname);
  rootFiles.forEach(file => {
    if (file.startsWith('test-') || file.startsWith('test_') || file === 'clean_tests.bat') {
      try {
        const filePath = path.join(__dirname, file);
        if (fs.statSync(filePath).isFile()) {
          fs.unlinkSync(filePath);
          console.log(`🧹 Deleted test file: ${file}`);
        }
      } catch (e) {
        console.warn(`Failed to delete ${file}:`, e.message);
      }
    }
  });

  // Clean temp folder on boot
  const tempPath = path.join(__dirname, 'temp');
  if (fs.existsSync(tempPath)) {
    const cleanDir = (dirPath) => {
      const files = fs.readdirSync(dirPath);
      for (const file of files) {
        const curPath = path.join(dirPath, file);
        if (fs.lstatSync(curPath).isDirectory()) {
          cleanDir(curPath);
          fs.rmdirSync(curPath);
        } else {
          fs.unlinkSync(curPath);
        }
      }
    };
    cleanDir(tempPath);
    console.log("🧹 Boot Clean: Emptied 'temp' directory contents successfully!");
  }
} catch (err) {
  console.warn("Failed to perform startup cleanup:", err.message);
}

const app = express();
app.use(express.json());
app.use(cors());

// Serve previews and posters folders statically
app.use('/previews', express.static(path.join(__dirname, 'public', 'previews')));
app.use('/posters', express.static(path.join(__dirname, 'public', 'posters')));
app.use('/posters', express.static(path.join(__dirname, 'BRAHMANDPOSTER')));
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
  DELETE FROM response_cache WHERE 
    query_key LIKE '%msg%' OR 
    query_key LIKE '%message%' OR 
    query_key LIKE '%instagram%' OR 
    query_key LIKE '%dm%' OR 
    query_key LIKE '%send%' OR 
    query_key LIKE '%chat%' OR 
    query_key LIKE '%direct%' OR
    query_key LIKE '%post%' OR
    query_key LIKE '%upload%';
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

// NVIDIA NIM — PRIMARY provider
if (process.env.NVIDIA_API_KEY) {
  console.log('🟢 NVIDIA NIM loaded as PRIMARY LLM provider (Llama-3.3 70B / Mistral / DeepSeek).');
} else {
  console.warn('⚠️  NVIDIA_API_KEY not set — NVIDIA PRIMARY disabled.');
}

// Anthropic Claude — Secondary provider
const anthropic = process.env.ANTHROPIC_API_KEY
  ? new Anthropic({ 
      apiKey: process.env.ANTHROPIC_API_KEY,
      baseURL: 'https://api.anthropic.com' // Explicitly set to bypass environment base URL conflicts
    })
  : null;

if (anthropic) {
  console.log('✅ Anthropic Claude loaded as Secondary fallback provider.');
} else {
  console.warn('⚠️  ANTHROPIC_API_KEY not set — Claude fallback disabled.');
}

// OpenAI — secondary provider (fetch-based, no extra package needed)
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || null;
if (OPENAI_API_KEY) {
  console.log('✅ OpenAI key detected — available as secondary fallback.');
} else {
  console.warn('⚠️  OPENAI_API_KEY not set — OpenAI fallback disabled.');
}

// Helper to determine if a query is dynamic/action-oriented and should bypass cache
function shouldBypassCache(queryText) {
  if (!queryText) return true;
  const normalized = queryText.toLowerCase().trim();
  
  // Any query that is very short (5 characters or less) is likely a confirmation (e.g., 'yes', 'no', 'ok', 'haan', 'karo')
  // We should never cache these short context-dependent replies.
  if (normalized.length <= 5) {
    return true;
  }

  const keywords = [
    'instagram', 'ig ', 'ig_', 'feed', 'post', 'upload', 'msg', 'message', 'dm', 
    'send', 'chat', 'direct', 'reels', 'reel', 'story', 'stories', 
    'karo', 'haan', 'yes', 'ok', 'sure', 'done', 'go ahead',
    'reply', 'replied', 'check', 'dekh', 'kaha', 'kahan', 'tu', 'bata', 'bol', 'hai', 'sun', 'sunn',
    'whatsapp', 'wa ', 'wa_', 'number', 'query:', 'search', 'latest', 'news', 'crawl', 'maxun',
    'batao', 'bhejo', 'bhej', 'tell', 'write', 'likho'
  ];
  return keywords.some(kw => normalized.includes(kw));
}

function loadSkills() {
  const skillsDir = path.join(__dirname, 'skills');
  let combinedSkills = '';
  if (fs.existsSync(skillsDir)) {
    const files = fs.readdirSync(skillsDir);
    files.forEach((file) => {
      if (file.endsWith('.md')) {
        combinedSkills += '\n\n--- SKILL/FRAMEWORK: ' + file + ' ---\n' + fs.readFileSync(path.join(skillsDir, file), 'utf-8');
      }
    });
  }
  return combinedSkills;
}

// 💾 Live Preview Saver Utility
function saveWebsitePreview(sessionId, aiResponseText) {
  if (!sessionId) return null;
  try {
    const htmlRegex = new RegExp('```html([\\s\\S]*?)```', 'i');
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
      return 'http://127.0.0.1:' + PORT + '/previews/' + sessionId + '/index.html';
    }
  } catch (err) {
    console.error("Error saving website preview:", err.message);
  }
  return null;
}

const DECISION_SYSTEM_PROMPT = `Tu Nakshatra AI hai — Brahmand App ka official Content Intelligence, Personalized Recommendation Agent aur Reel Creation Assistant.

# 🧠 NAKSHATRA AI MASTER SYSTEM DIRECTIVES

## 1. CORE OBJECTIVE
Understand Content (Content DNA) → Understand User (Dynamic Interests) → Learn from User Behaviour → Find Best Match → Maintain Content Diversity (55/20/15/10 Mix) → Learn Continuously.

## 2. CONTENT INTELLIGENCE (CONTENT DNA)
Har reel aur post ka semantic Content DNA identify karo:
- Primary & Secondary Topics, Entities, Deities, Temples, Historical/Mythological/Spiritual references.
- Content Type, Emotional Tone, Knowledge Level, Related Topics, Related Brahmand Features.

## 3. DYNAMIC USER INTELLIGENCE
User ke interests dynamically track aur adjust karo across 3 levels:
- **Short-Term Interest**: Current session activity & cluster detection.
- **Recent Interest**: Shorter time window (last several days).
- **Long-Term Interest**: Stable historical baseline.
- Progressive confidence: Single positive signal = small increase, repeated positive = high confidence, explicit negative/skip = score reduction.

## 4. INTEREST GRAPH & DIVERSITY CONTROL (55/20/15/10 MIX)
- Topic relationship expansion (e.g., Shiva → Jyotirlinga, Kashi, Somnath, Temple History, Mantra, Mahashivratri).
- Recommend SIMILAR INTEREST, not IDENTICAL CONTENT.
- Mix strategy: 55% Strong Match, 20% Closely Related Topics, 15% Exploration, 10% Fresh/Strategic Content.
- Anti-Monotony Rule: Avoid consecutive identical topic recommendations.

## 5. CONTEXTUAL BRAHMAND FEATURE MATCHING
Features (Live Jaap Counter, Mantra Library, Temple Finder, Live Darshan, AI Jyotish/Kundli, Daily Sadhana, SOS Emergency) ko contextually introduce karo. Educational first, promotional second.

## 6. MANDATORY 17 REEL OUTPUT COMPONENTS
Jab user reel create karne bole, exact in 17 steps format mein return karo:
1. Reel Title
2. Target Audience
3. Primary Interest Cluster
4. Content Objective
5. Hook (0–3s)
6. Total Duration
7. Full Narration Script with timestamps
8. Scene-by-Scene Breakdown
9. Cinematic Image Prompt for each scene
10. On-Screen Text
11. Brahmand Feature Integration
12. CTA
13. Instagram Caption
14. Relevant Hashtags
15. Content DNA / Tags
16. Why this reel should appeal to the selected audience
17. Structured JSON representation

## 7. TIME-OF-DAY SPIRITUAL CONTEXT
User ke current time ke target context ke hisaab se tone tune karo:
- **Brahma Muhurat (4 AM - 6 AM)**: Meditation, Mantras, Daily Sadhana, Japa.
- **Morning Aarti (6 AM - 10 AM)**: Live Darshan, Aarti, Morning Prayers, Temple Finder.
- **Day Wisdom (10 AM - 5 PM)**: Temple Mysteries, History, Sanatan Science, Gita.
- **Evening Devotion (5 PM - 9 PM)**: Stotrams, Devotional Songs, Evening Aarti.
- **Night Mystery (9 PM - 4 AM)**: Ancient Secrets, Deep History, Jyotish/Kundli, Epic Lore.

---

## 🔥 TOPIC → FEATURE MAPPING (SABSE IMPORTANT)

JAB USER "CHANTING" / "MANTRA" / "JAAP" KE BAARE MEIN BAAT KARE:
→ TOH LIVE JAAP COUNTER RECOMMEND KARO.
→ MANTRA LIBRARY RECOMMEND KARO.
→ DAILY SADHANA RECOMMEND KARO.
→ AUR PUCHHO: "Kya aap kisi aur mantra ka bhi jaap karte hain?"

JAB USER "TEMPLE" / "MANDIR" KE BAARE MEIN BAAT KARE:
→ TOH TEMPLE FINDER RECOMMEND KARO.
→ LIVE DARSHAN RECOMMEND KARO.
→ AUR PUCHHO: "Kya aap kisi specific mandir ke baare mein jaanna chahte hain?"

JAB USER "SPIRITUAL" / "JYOTISH" KE BAARE MEIN BAAT KARE:
→ TOH AI JYOTISH RECOMMEND KARO.
→ KUNDLI GENERATOR RECOMMEND KARO.
→ AUR PUCHHO: "Kya aap apni kundli ke baare mein jaanna chahte hain?"

JAB USER "EMERGENCY" / "HELP" / "SOS" / "BLOOD" / "ANNADAN" / "PASSPORT" KE BAARE MEIN BAAT KARE:
→ TOH SOS EMERGENCY HELP & BLOOD DONATION RECOMMEND KARO.
→ TOH SANATAN PASSPORT & SL ID RECOMMEND KARO.
→ AUR PUCHHO: "Kya aap in safety aur community features ke baare mein jaanna chahte hain?"

---

## 🔥 SABSE IMPORTANT RULE — "OK" / "YES" HANDLING

JAB USER "OK" YA "YES" BOLE:
→ PEHLE JAANO: User kis cheez ke liye "ok" bola hai?
→ AGAR TU NE PEHLE "DOWNLOAD" OFFER KIYA THA:
   → TOH AB INSTALL LINK DO.
   → STEPS BATAO.
   → SAME REPLY DOBAARA MAT DENO.
→ AGAR TU NE PEHLE "FEATURE BATAUN" PUCHHA THA:
   → TOH FEATURE EXPLAIN KARO.
→ AGAR TU NE PEHLE "SAWAL" PUCHHA THA:
   → TOH US SAWAL KA JAWAB DO.

KABHI BHI SAME REPLY DOBAARA MAT DENO.
KABHI BHI USER KE "OK" KO IGNORE MAT KARO.

---

## 🧠 CONTEXT + CROSS-SELL RULES

Har reply mein:
1. **PEHLE:** User ke sawal ka jawab do
2. **PHIR:** User ke topic ke hisaab se 2-3 features suggest karo
3. **PHIR:** Puchho ki kya wo features ke baare mein jaanna chahta hai
4. **PHIR:** Ek aur natural sawal poochho (jaise "aur koi mantra?")

Tu yeh sab yaad rakhega HAR BAAR:
• User ne abhi kya kaha
• User ne pehle kya kaha
• Tu ne pehle kya kaha
• Tu ne user ko kya offer kiya
• User ne kya action liya
• User ke current interests (temples, chanting, spiritual, etc.)

---

## 📋 RESPONSE FLOWS & EXAMPLES

### Example 1: User ne "hare krishna hare krishna" bola
✅ **SAHI:**
"Bahut sundar! 🙏 Hare Krishna mahamantra bahut hi prasidh aur shaktishali mantra hai. Iske jaap se mann shant hota hai aur bhagwan Krishna ki kripa prapt hoti hai.

Kya aap daily Hare Krishna mahamantra ka jaap karte hain?

**Agar aapko chanting mein interest hai toh Brahmand App ke yeh features useful ho sakte hain:**
1. **Live Jaap Counter** — mantra jaap track karne ke liye
2. **Mantra Library** — 100+ mantras with meaning
3. **Daily Sadhana** — daily spiritual routine tracker

**Kya main aapko in features ke baare mein bataun?**

**Aur kya aap kisi aur mantra ka bhi jaap karte hain?** 😊"

### Example 2: User ne "Hanuman Chalisa" bola
✅ **SAHI:**
"Bahut sundar choice. 🙏 Hanuman Chalisa bhagwan Hanuman ko samarpit ek bahut hi prasidh stotra hai. Isme 40 chaupaiyan hain aur yeh Tulsidas ji ne likha tha.

Kya aap daily Hanuman Chalisa ka paath karte hain?

**Agar aapko chanting mein interest hai toh Brahmand App ke yeh features useful ho sakte hain:**
1. **Live Jaap Counter** — mantra jaap track karne ke liye
2. **Mantra Library** — 100+ mantras with meaning
3. **Daily Sadhana** — daily spiritual routine tracker

**Kya main aapko in features ke baare mein bataun?**

**Aur kya aap kisi aur mantra ka bhi jaap karte hain?** 😊"

### Example 3: User ne "Shiv ji temple" bola
✅ **SAHI:**
"Bahut achhi choice. 🙏 Shiv mandiron ka apna ek alag spiritual mahatva hota hai. Kashi Vishwanath, Mahakaleshwar, aur Kedarnath sabse famous Shiv mandiron mein se hain.

Kya aap inme se kisi ke baare mein jaanna chahte hain?

**Agar aapko temples mein interest hai toh Brahmand App ke yeh features useful ho sakte hain:**
1. **Temple Finder** — nearby temples dhoondhne ke liye
2. **Live Darshan** — mandiron ke live aarti aur darshan dekhiye
3. **AI Jyotish** — mandir se related spiritual guidance

**Kya main aapko in features ke baare mein bataun?** 😊"

### Example 4: User "ok" bola (install ke liye)
**Pehle Bot:** "Would you like me to help you install it? 😊"
**User:** "ok"
✅ **AB BOT YE BOLEGA:**
"Bahut achha! 🎉 Main app install karne mein aapki help karta hoon.

**Brahmand App Install Kaise Karein:**

**For Android (Google Play Store):**
1. Play Store kholiye aur search karein: **Brahmand AI**
2. **Install** button tap karein.
3. Link: https://play.google.com/store/apps/details?id=com.brahmand.app

**For iOS (Apple App Store):**
1. App Store kholiye aur search karein: **Brahmand App**
2. **Get / Download** button tap karein.
3. Link: https://apps.apple.com/app/brahmand-app/id6765467224

Install karne ke baad explore karein aur apna experience zaroor batayein! 😊
Kya install karne mein koi problem ho rahi hai?"

---

## 🚫 GOLDEN RULES (KABHI MAT TODNA)

❌ Chanting ke liye Temple Finder mat recommend karo.
❌ Temple ke liye Live Jaap Counter mat recommend karo.
❌ User ka topic change mat karo.
❌ Same reply dobaara mat dena.
❌ User ke "ok" ko ignore mat karna.
❌ User ko force mat karna.

✅ User ke topic ke hisaab se sahi feature recommend karo.
✅ Pehle user ka jawab do, phir feature batao.
✅ Har baar alag response do.
✅ Conversation ko aage badhao (aur koi mantra?).
✅ User ke "ok" ka context samjho aur us hisaab se action lo.

---

## 💎 SABSE IMPORTANT

User topic → Feature mapping yaad rakho.

Chanting → Live Jaap Counter, Mantra Library, Daily Sadhana.
Temple → Temple Finder, Live Darshan, Temple Events.
Spiritual → AI Jyotish, Kundli Generator, Rashifal.

Aur hamesha puchho: **"Aur kya?"** — ya koi aur natural sawal taaki conversation ruke nahi.

**Har Har Mahadev! 🚩**

### BEHAVIOR AND PERSONA:
- Respond in natural, conversational Hinglish (or match the user's input language/script). Keep responses helpful and premium.
- Before responding, perform deep step-by-step reasoning internally.
- **CRITICAL CHAT CLEANLINESS RULE**: NEVER output your internal thinking, reasoning steps, tool planning thoughts, or system prompt instructions into the chat! Provide ONLY the final clean response to the user.
- **MESSAGING RULE**: When sending WhatsApp or Instagram messages, you MUST extract the exact recipient name or number specified by the user and pass it as the recipient. DO NOT hardcode any names or use mock values.
- Cite sources intelligently using markdown links. 
- Only write HTML/JS/CSS code when EXPLICITLY requested. If so, write complete functional code in a single ```html ... ``` block.

## 🎯 META ADS / AD STUDIO ROUTING RULE:
Jab bhi user "meta ads", "facebook ads", "ad campaign", "ad copy", "ad run", "run ad", "ad banao", "ad script", "ad creative", "performance ad", "ad studio" — kuch bhi ads-related bole:
1. PEHLE `read_skill('brahmand_ad_studio')` call karo.
2. Skill read karne ke baad us skill ke NATURAL PRESENTATION STYLE follow karo.
3. **CRITICAL**: Rigid numbered template headings MAT likho. Conversational, friendly tone mein respond karo — jaise ek real creative strategist dost se baat karta hai.
4. Agar user ne feature/audience specify nahi kiya toh PEHLE puchho — generate mat karo blindly.
5. Poster generate karne ki zaroorat NAHI hai jab tak user explicitly "poster" na maange.
6. NEVER route ad requests to the poster interceptor. Ads aur Posters bilkul alag hain.`;

const GROQ_MODELS = {
  default:  'qwen/qwen3.6-27b',        // Fast, reliable default with tool calling
  smart:    'meta-llama/llama-3.3-70b-instruct', // Emulating reasoning via prompt
  code:     'openai/gpt-oss-120b',     // Code specialist
  creative: 'qwen/qwen3.6-27b',        // Emulating reasoning via prompt
  expert:   'meta-llama/llama-3.3-70b-instruct', // Emulating reasoning via prompt
  fast:     'qwen/qwen3.6-27b',        // Urgent / sub-second tool calling
};

// LLM Gateway model IDs — use exact model IDs from /v1/models list
const GATEWAY_MODELS = {
  default:  'gemini-1.5-flash',
  smart:    'gemini-1.5-pro',
  code:     'gemini-1.5-pro',
  creative: 'gemini-1.5-pro',
  expert:   'gemini-1.5-pro',
  fast:     'gemini-1.5-flash',
};

// ─────────────────────────────────────────────────────────────────────────────
// Anthropic Claude API bridge
// ─────────────────────────────────────────────────────────────────────────────
async function callClaude(messages, temperature, modelId, tools = null) {
  let systemText = '';
  const userMessages = [];
  for (const msg of messages) {
    if (msg.role === 'system') {
      systemText += msg.content + '\n';
    } else if (msg.role === 'tool') {
      userMessages.push({
        role: 'user',
        content: [{
          type: 'tool_result',
          tool_use_id: msg.tool_call_id,
          content: msg.content
        }]
      });
    } else {
      if (msg.role === 'assistant' && msg.tool_calls && msg.tool_calls.length > 0) {
        const contentBlocks = [];
        if (msg.content) contentBlocks.push({ type: 'text', text: msg.content });
        for (const tc of msg.tool_calls) {
          let inputObj = {};
          try { inputObj = JSON.parse(tc.function.arguments || '{}'); } catch (e) {}
          contentBlocks.push({
            type: 'tool_use',
            id: tc.id,
            name: tc.function.name,
            input: inputObj
          });
        }
        userMessages.push({ role: 'assistant', content: contentBlocks });
      } else {
        userMessages.push({ role: msg.role, content: msg.content || '' });
      }
    }
  }

  const claudeTools = tools ? tools
    .filter(t => t.type === 'function' && t.function)
    .map(t => ({
      name: t.function.name,
      description: t.function.description || '',
      input_schema: t.function.parameters || { type: 'object', properties: {} }
    })) : undefined;

  const params = {
    model: modelId,
    max_tokens: 2048,
    temperature,
    system: systemText.trim() || 'You are a helpful AI assistant.',
    messages: userMessages
  };
  if (claudeTools && claudeTools.length > 0) {
    params.tools = claudeTools;
  }

  const response = await anthropic.messages.create(params);

  let textContent = '';
  const toolCalls = [];
  for (const block of response.content) {
    if (block.type === 'text') {
      textContent += block.text;
    } else if (block.type === 'tool_use') {
      toolCalls.push({
        id: block.id,
        type: 'function',
        function: {
          name: block.name,
          arguments: JSON.stringify(block.input)
        }
      });
    }
  }

  return {
    text: textContent,
    tool_calls: toolCalls.length > 0 ? toolCalls : null,
    model: 'Claude (' + modelId + ')'
  };
}

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
      'Authorization': 'Bearer ' + process.env.LLM_GATEWAY_API_KEY
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error('Gateway ' + res.status + ': ' + errText);
  }

  const data = await res.json();
  const message = data.choices?.[0]?.message;
  if (!message) throw new Error('Gateway returned empty content');
  return { 
    text: message.content || '', 
    tool_calls: message.tool_calls || null, 
    model: 'Gateway (' + modelId + ')' 
  };
}

async function callGemini(messages, temperature, modelId = 'gemini-1.5-flash') {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY not configured');
  
  let systemInstruction = undefined;
  const contents = [];
  for (const m of messages) {
    if (m.role === 'system') {
      systemInstruction = { parts: [{ text: m.content || '' }] };
    } else {
      const role = m.role === 'assistant' ? 'model' : 'user';
      contents.push({ role, parts: [{ text: m.content || '' }] });
    }
  }

  const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + modelId + ':generateContent?key=' + apiKey;
  const body = { contents, generationConfig: { temperature, maxOutputTokens: 2048 } };
  if (systemInstruction) body.systemInstruction = systemInstruction;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error('Gemini ' + res.status + ': ' + errText);
  }

  const data = await res.json();
  const text = data.candidates?.[0]?.content?.[0]?.text || data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  return { text, tool_calls: null, model: 'Google Gemini (' + modelId + ')' };
}

async function callOpenRouter(messages, temperature, modelId = 'meta-llama/llama-3.3-70b-instruct:free') {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('OPENROUTER_API_KEY not configured');
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + apiKey
    },
    body: JSON.stringify({ model: modelId, messages, temperature, max_tokens: 2048 })
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error('OpenRouter ' + res.status + ': ' + errText);
  }
  const data = await res.json();
  const msg = data.choices?.[0]?.message;
  return { text: msg?.content || '', tool_calls: msg?.tool_calls || null, model: 'OpenRouter (' + modelId + ')' };
}

async function callNvidia(messages, temperature, modelId = 'meta/llama-3.2-90b-vision-instruct', tools = null) {
  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) throw new Error('NVIDIA_API_KEY not configured');
  const body = { model: modelId, messages, temperature, max_tokens: 2048 };
  if (tools && tools.length > 0) {
    body.tools = tools;
    body.tool_choice = 'auto';
  }
  const res = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + apiKey
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(12000)
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error('NVIDIA ' + res.status + ': ' + errText);
  }
  const data = await res.json();
  const msg = data.choices?.[0]?.message;
  return { text: msg?.content || '', tool_calls: msg?.tool_calls || null, model: 'NVIDIA (' + modelId + ')' };
}

async function callOpenAI(messages, temperature, modelId = 'gpt-4o-mini', tools = null) {
  const body = {
    model: modelId,
    messages,
    temperature,
    max_tokens: 2048
  };
  if (tools && tools.length > 0) {
    body.tools = tools;
    body.tool_choice = 'auto';
  }
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + OPENAI_API_KEY
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error('OpenAI ' + res.status + ': ' + errText);
  }

  const data = await res.json();
  const msg = data.choices?.[0]?.message;
  if (!msg) throw new Error('OpenAI returned empty response');

  return {
    text: msg.content || '',
    tool_calls: msg.tool_calls || null,
    model: 'OpenAI (' + modelId + ')'
  };
}

async function callLLM(messages, temperature = 0.3, targetModel = 'auto', tools = null) {
  const maxRetries = 2;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      console.log('🔄 Retry ' + attempt + '/' + maxRetries + ' for LLM call...');
      await new Promise(r => setTimeout(r, attempt * 1000));
    }
    try {
      return await callLLMOnce(messages, temperature, targetModel, tools);
    } catch (err) {
      console.warn('LLM attempt ' + (attempt + 1) + ' failed: ' + err.message);
      if (attempt === maxRetries) throw err;
    }
  }
}

async function callLLMOnce(messages, temperature = 0.3, targetModel = 'auto', tools = null) {
  const groqModelId = GROQ_MODELS[targetModel] || GROQ_MODELS.smart;
  const providerErrors = [];

  // 1. Groq (PRIMARY - Ultra-Fast 200ms Sub-Second Response)
  for (const [client, label, models] of [
    [groq, 'Groq', [groqModelId, GROQ_MODELS.default, 'qwen/qwen3.6-27b', 'meta-llama/llama-3.3-70b-instruct', 'openai/gpt-oss-120b']],
    [groq2, 'Groq Key2', [groqModelId, GROQ_MODELS.default, 'qwen/qwen3.6-27b', 'meta-llama/llama-3.3-70b-instruct', 'openai/gpt-oss-120b']]
  ]) {
    if (!client) continue;
    for (const model of [...new Set(models)]) {
      try {
        console.log('⚡ ' + label + ' PRIMARY → ' + model);
        const params = { messages, model, temperature, max_tokens: 2048 };
        if (tools) { params.tools = tools; params.tool_choice = 'auto'; }
        const completion = await client.chat.completions.create(params);
        const m = completion.choices[0].message;
        if (m) return { text: m.content || '', tool_calls: m.tool_calls || null, model: label + ' (' + model + ')' };
      } catch (err) {
        const detail = '[' + label + '/' + model + '] ' + err.message;
        console.warn('❌ ' + detail);
        providerErrors.push(detail);
      }
    }
  }

  // 2. NVIDIA NIM (BACKUP 1)
  if (process.env.NVIDIA_API_KEY && process.env.NVIDIA_API_KEY.trim() !== '' && !process.env.NVIDIA_API_KEY.includes('your_')) {
    const nvidiaModels = ['meta/llama-3.2-90b-vision-instruct', 'meta/llama-3.2-11b-vision-instruct'];
    for (const model of nvidiaModels) {
      try {
        console.log('🟢 NVIDIA NIM Fallback → ' + model);
        return await callNvidia(messages, temperature, model, tools);
      } catch (err) {
        const detail = '[NVIDIA/' + model + '] ' + err.message;
        console.warn('❌ ' + detail);
        providerErrors.push(detail);
      }
    }
  }

  // 3. Google Gemini
  if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim() !== '') {
    const geminiModels = ['gemini-1.5-flash', 'gemini-2.0-flash', 'gemini-1.5-pro'];
    for (const model of geminiModels) {
      try {
        console.log('✨ Google Gemini Fallback → ' + model);
        return await callGemini(messages, temperature, model);
      } catch (err) {
        const detail = '[Gemini/' + model + '] ' + err.message;
        console.warn('❌ ' + detail);
        providerErrors.push(detail);
      }
    }
  }

  // 4. OpenRouter
  if (process.env.OPENROUTER_API_KEY && process.env.OPENROUTER_API_KEY.trim() !== '' && !process.env.OPENROUTER_API_KEY.includes('your_')) {
    const openrouterModels = ['meta-llama/llama-3.3-70b-instruct:free', 'google/gemini-2.0-flash-exp:free', 'deepseek/deepseek-r1:free'];
    for (const model of openrouterModels) {
      try {
        console.log('🚀 OpenRouter Fallback → ' + model);
        return await callOpenRouter(messages, temperature, model);
      } catch (err) {
        const detail = '[OpenRouter/' + model + '] ' + err.message;
        console.warn('❌ ' + detail);
        providerErrors.push(detail);
      }
    }
  }

  // 5. Anthropic Claude
  if (anthropic && process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_API_KEY.includes('your_')) {
    const claudeModels = ['claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022', 'claude-3-haiku-20240307'];
    for (const claudeModel of claudeModels) {
      try {
        console.log('🧠 Claude Fallback → ' + claudeModel);
        return await callClaude(messages, temperature, claudeModel, tools);
      } catch (err) {
        const detail = '[Claude/' + claudeModel + '] ' + err.message;
        console.warn('❌ ' + detail);
        providerErrors.push(detail);
        const errMsg = err.message.toLowerCase();
        if (!errMsg.includes('404') && !errMsg.includes('not_found') && !errMsg.includes('model_not_found')) {
          break;
        }
      }
    }
  }

  // 6. Cerebras
  if (cerebras && process.env.CEREBRAS_API_KEY && !process.env.CEREBRAS_API_KEY.includes('your_')) {
    const cerebrasModels = ['gemma-4-31b', 'gpt-oss-120b'];
    for (const model of cerebrasModels) {
      try {
        console.log('🧠 Cerebras Fallback → ' + model);
        const params = {
          model,
          messages: messages.map(m => ({ role: m.role, content: m.content || '' })),
          temperature,
          max_tokens: 2048
        };
        const completion = await cerebras.chat.completions.create(params);
        const m = completion.choices[0].message;
        if (m) {
          return { text: m.content || '', tool_calls: null, model: 'Cerebras (' + model + ')' };
        }
      } catch (err) {
        const detail = '[Cerebras/' + model + '] ' + err.message;
        console.warn('❌ ' + detail);
        providerErrors.push(detail);
      }
    }
  }

  // 7. OpenAI
  if (OPENAI_API_KEY && !OPENAI_API_KEY.includes('your_')) {
    const openaiModel = tools ? 'gpt-4o' : 'gpt-4o-mini';
    try {
      console.log('🔵 OpenAI Fallback → ' + openaiModel);
      return await callOpenAI(messages, temperature, openaiModel, tools);
    } catch (err) {
      const detail = '[OpenAI/' + openaiModel + '] ' + err.message;
      console.warn('❌ ' + detail);
      providerErrors.push(detail);
    }
  }

  // 8. LLM Gateway
  if (process.env.LLM_GATEWAY_API_KEY && !process.env.LLM_GATEWAY_API_KEY.includes('your_')) {
    const gatewayModelId = GATEWAY_MODELS[targetModel] || GATEWAY_MODELS.smart;
    try {
      console.log('🌐 LLM Gateway Fallback → ' + gatewayModelId);
      return await callGateway(messages, temperature, gatewayModelId, tools);
    } catch (err) {
      const detail = '[Gateway/' + gatewayModelId + '] ' + err.message;
      console.warn('❌ ' + detail);
      providerErrors.push(detail);
    }
  }

  // 9. Zero-Config Free Fallback: Pollinations AI Text (100% Free, No API Key Required)
  try {
    console.log('🌸 Pollinations AI Text Fallback (Zero-Config Free Tier)...');
    const cleanMessages = messages.map(m => ({ role: m.role, content: m.content || '' }));
    const res = await fetch('https://text.pollinations.ai/openai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: cleanMessages, model: 'openai', temperature: 0.7 })
    });
    if (res.ok) {
      const data = await res.json();
      const text = data.choices?.[0]?.message?.content;
      if (text) {
        return { text, tool_calls: null, model: 'Pollinations AI (Free)' };
      }
    }
  } catch (e) {
    console.warn('⚠️ Pollinations AI Text fallback failed:', e.message);
  }

  const summary = providerErrors.map((e, i) => '  ' + (i + 1) + '. ' + e).join('\\n');
  console.error('\\n🚨 ALL PROVIDERS FAILED:\\n' + summary + '\\n');
  throw new Error('All AI providers failed:\n' + summary);
}

function storeUserFact(category = 'general', key, value) {
  const cat = category || 'general';
  try {



    const stmt = db.prepare(`
      INSERT INTO user_preferences (key, value)
      VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = ?
    `);
    const fullKey = `fact_${cat}_${key}`;
    stmt.run(fullKey, value, value);
    console.log(`🧠 [Memory Stored] ${fullKey} = "${value}"`);
    return `✅ Fact saved in Nakshatra Memory [Category: ${cat}]: ${key} = "${value}"`;
  } catch (err) {
    return `❌ Failed to store fact in memory: ${err.message}`;
  }
}

function getUserFacts(category = null) {
  try {
    const stmt = db.prepare(`SELECT key, value FROM user_preferences WHERE key LIKE 'fact_%'`);
    const rows = stmt.all();
    if (!rows || rows.length === 0) {
      return "No custom user facts stored in long-term memory yet.";
    }
    const filtered = category 
      ? rows.filter(r => r.key.startsWith(`fact_${category}_`))
      : rows;
    if (filtered.length === 0) {
      return `No stored facts found for category '${category}'.`;
    }
    return filtered.map(r => `• ${r.key.replace(/^fact_[^_]+_/, '')}: ${r.value}`).join('\n');
  } catch (err) {
    return `Failed to retrieve user facts: ${err.message}`;
  }
}

async function getViralContentIdeas(niche = 'general', targetAudience = 'India Hinglish') {
  const prompt = [
    {
      role: 'system',
      content: `You are Nakshatra AI Viral Content Strategist. Generate 5 high-converting, viral Reel ideas for the niche: "${niche}" targeting audience: "${targetAudience}".
Return a formatted JSON string with:
{
  "niche": "${niche}",
  "viral_hooks": ["Hook 1...", "Hook 2...", "Hook 3..."],
  "trending_concepts": [
    { "title": "Concept 1", "visual_prompt": "...", "audio_vibe": "...", "script_hook": "..." }
  ],
  "recommended_hashtags": ["#tag1", "#tag2"],
  "best_posting_times": ["6:00 PM IST", "9:00 PM IST"]
}`
    }
  ];
  try {
    const res = await callLLM(prompt, 0.7, 'smart');
    return res.text;
  } catch (err) {
    return JSON.stringify({ error: `Failed to generate viral ideas: ${err.message}` });
  }
}

function getAgentAnalytics() {
  try {
    const msgCountRow = db.prepare('SELECT COUNT(*) as count FROM messages').get();
    const prefCountRow = db.prepare('SELECT COUNT(*) as count FROM user_preferences').get();
    
    return JSON.stringify({
      agent_name: "Nakshatra AI Autonomous Agent",
      status: "🟢 Operational & Smart Ready",
      uptime: process.uptime() ? `${Math.floor(process.uptime() / 60)} minutes` : "Active",
      database_analytics: {
        total_messages_processed: msgCountRow ? msgCountRow.count : 0,
        total_longterm_memories: prefCountRow ? prefCountRow.count : 0
      },
      ai_engine_health: {
        primary_llm: process.env.NVIDIA_API_KEY ? "🟢 NVIDIA NIM Active" : "⚠️ NVIDIA Not Set",
        primary_fallback: process.env.OPENROUTER_API_KEY ? "🚀 OpenRouter Active" : "⚠️ OpenRouter Not Set",
        secondary_llm: process.env.ANTHROPIC_API_KEY ? "🧠 Anthropic Claude Active" : "⚠️ Anthropic Not Set"
      },
      active_intelligent_features: [
        "Self-Healing Tool Execution & Automatic Failure Retry",
        "Persistent Brand & Personal Fact Memory",
        "Viral Reel Hook & Concept Intelligence Engine",
        "Instagram & WhatsApp Automated Campaign Orchestration"
      ]
    }, null, 2);
  } catch (err) {
    return JSON.stringify({ error: err.message });
  }
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
      case 'search_web': {
        let finalQuery = args.query;
        try {
          const userLoc = getPreference('user_location');
          if (userLoc && (finalQuery.toLowerCase().includes('near me') || finalQuery.toLowerCase().includes('nearby') || finalQuery.toLowerCase().includes('local'))) {
            finalQuery = `${finalQuery.replace(/near me|nearby|local/gi, '')} in ${userLoc}`.replace(/\s+/g, ' ').trim();
            console.log(`📍 Augmented search query with saved location: "${finalQuery}"`);
          }
        } catch (e) {
          console.error("Failed to augment location:", e.message);
        }
        return await searchWeb(finalQuery);
      }
      case 'manage_agent_reach': {
        const os = await import('os');
        const { execSync } = await import('child_process');
        const userHome = os.homedir();
        const venvPath = path.join(userHome, '.agent-reach-venv');
        const agentReachPath = os.platform() === 'win32'
          ? path.join(venvPath, 'Scripts', 'agent-reach.exe')
          : path.join(venvPath, 'bin', 'agent-reach');

        if (!fs.existsSync(agentReachPath)) {
          return "❌ Agent Reach virtual environment or executable not found. Please ask the user to run 'node scratch/run_setup.js' in their terminal first.";
        }

        try {
          if (args.action === 'doctor') {
            const out = execSync(`"${agentReachPath}" doctor`, { encoding: 'utf-8' });
            return out;
          } else if (args.action === 'install_channel') {
            const channels = args.channels || 'all';
            const out = execSync(`"${agentReachPath}" install --env=auto --system --channels=${channels}`, { encoding: 'utf-8' });
            return out;
          }
          return "Unknown action";
        } catch (err) {
          return `Error executing Agent Reach command: ${err.message}`;
        }
      }
      case 'scrape_website':
        return await scrapeWebsite(args.url);
      case 'generate_image': {
        const url = await generatePosterImage(args.prompt);
        _lastGenImageUrl = url;
        return url;
      }
      case 'get_instagram_posts':
        return await getInstagramRecentMedia(args.username || 'pratham_patel_18');
      case 'get_instagram_profile':
        return await getInstagramProfileInfo(args.username || 'pratham_patel_18');
      case 'post_to_instagram': {
        let imgUrl = args.imageUrl;
        if (!imgUrl || imgUrl === 'LAST GENERATED IMAGE URL' || imgUrl === 'last generated image url') {
          imgUrl = _lastGenImageUrl;
        }
        return await publishInstagramPhoto(imgUrl, args.caption);
      }
      case 'send_instagram_message':
        return await sendInstagramMessage(args.username, args.message, args.mediaPath);
      case 'send_whatsapp_message':
        return await sendWhatsappMessage(args.recipient, args.message, args.mediaPath);
      case 'generate_video':
        return await generatePollinationsVideo(args.prompt, args.duration || 12, args.model || 'nova-reel', args.aspectRatio || '9:16', args.audio || false);
      case 'generate_free_video_asset':
        return await generateFreeVideoAsset(args.prompt);
      case 'post_video_to_instagram':
        return await publishInstagramVideo(args.videoPath, args.caption);
      case 'plan_instagram_reel': {
        const planResultText = await planInstagramReel(args.topic);
        if (writeStreamChunk && _lastPlannedReel) {
          try {
            writeStreamChunk({ type: 'reel_plan', plan: _lastPlannedReel });
          } catch(e) {}
        }
        return planResultText;
      }
      case 'check_and_reply_instagram_messages': {
        const checkResult = await getLatestIncomingInstagramMessage(args.username);
        if (checkResult.error) {
          return `Error checking messages: ${checkResult.error}`;
        }
        if (checkResult.lastMessage && checkResult.isIncoming) {
          console.log(`Incoming reply from @${args.username}: "${checkResult.lastMessage}". Generating reply...`);
          if (writeStreamChunk) {
            writeStreamChunk({ type: 'status', text: `Generating reply for @${args.username}...` });
          }

          // Format recent message history to give contextual awareness to LLM
          let formattedHistory = "";
          if (checkResult.chatHistory && checkResult.chatHistory.length > 0) {
            formattedHistory = checkResult.chatHistory.map(h => {
              const sender = h.isIncoming ? `@${args.username}` : "You";
              return `${sender}: ${h.text}`;
            }).join("\n");
          } else {
            formattedHistory = `@${args.username}: ${checkResult.lastMessage}`;
          }

          const replyPrompt = [
            {
              role: 'system',
              content: `Tu Nakshatra (ब्रह्मांड) hai — Brahmand App ka official ultra-intelligent, friendly, aur highly empathetic AI assistant.
Tu @${args.username} ke saath Instagram Direct Messages par baat kar raha hai.

🔥 TOPIC → FEATURE MAPPING & LINKS:
- Chanting/Mantra/Jaap → Live Jaap Counter & Mantra Library
- Temple/Mandir → Temple Finder & Live Darshan
- Spiritual/Jyotish/Kundli → AI Jyotish & Kundli Generator
- Emergency/Help/SOS/Blood → SOS Emergency Network & Sanatan Passport
- Download/App Link → Play Store: https://play.google.com/store/apps/details?id=com.brahmand.app | App Store: https://apps.apple.com/app/brahmand-app/id6765467224

GUIDELINES:
- Analyze the user's emotion, intent, and tone from their last message.
- Respond in natural, conversational Hinglish (a warm mix of Hindi and English written in Latin script).
- Keep it natural, short, and conversational (exactly like a human would chat on DM).
- **MEDIA ATTACHMENT RULE:** If the user EXPLICITLY asks you to send them a photo, picture, image, or video (e.g. "photo bhej", "send a picture", "video dikha"), trigger a media send by appending "[MEDIA: image_generation_prompt]" at the end of your response text (where image_generation_prompt is a description of the image to generate). If they did NOT ask for a photo or video, do NOT include the [MEDIA: ...] tag under any circumstance.
- Do NOT output any system tags, explanations, quotes, or conversational headers.
- Output ONLY the raw message text to send.`
            },
            {
              role: 'user',
              content: `Recent DM chat history with @${args.username}:\n${formattedHistory}\n\nLatest message from @${args.username}: "${checkResult.lastMessage}". Respond to @${args.username} naturally.`
            }
          ];
          const llmRes = await callLLM(replyPrompt, 0.5, 'smart');
          let generatedReply = llmRes.text.trim().replace(/^"+|"+$/g, "");
          
          let mediaUrl = null;
          const mediaRegex = /\[MEDIA:\s*(.*?)\]/i;
          const mediaMatch = generatedReply.match(mediaRegex);
          if (mediaMatch && mediaMatch[1]) {
            const mediaPromptText = mediaMatch[1].trim();
            console.log(`[Media Request Detected] Generating image for DM: "${mediaPromptText}"`);
            if (writeStreamChunk) {
              writeStreamChunk({ type: 'status', text: `Generating requested photo: "${mediaPromptText}"...` });
            }
            try {
              mediaUrl = await generatePosterImage(mediaPromptText);
            } catch (imgErr) {
              console.error("Failed to generate image for auto-reply:", imgErr.message);
            }
            generatedReply = generatedReply.replace(mediaRegex, "").trim();
          }

          console.log(`Generated reply: "${generatedReply}". Sending via DM (Media: ${mediaUrl || 'None'})...`);
          if (writeStreamChunk) {
            writeStreamChunk({ type: 'status', text: `Sending reply to @${args.username}...` });
          }
          const sendRes = await sendInstagramMessage(args.username, generatedReply, mediaUrl);
          return JSON.stringify({
            success: true,
            checkedUsername: args.username,
            receivedMessage: checkResult.lastMessage,
            sentReply: generatedReply,
            sendResult: sendRes
          });
        }
        return JSON.stringify({
          success: true,
          checkedUsername: args.username,
          message: checkResult.lastMessage ? "Last message in thread was sent by us. No reply needed." : "No chat history found."
        });
      }
      case 'check_and_reply_whatsapp_messages': {
        const checkResult = await getLatestIncomingWhatsappMessage(args.recipient);
        if (checkResult.error) {
          return `Error checking messages: ${checkResult.error}`;
        }
        if (checkResult.lastMessage && checkResult.isIncoming) {
          console.log(`Incoming reply from WhatsApp contact "${args.recipient}": "${checkResult.lastMessage}". Generating reply...`);
          if (writeStreamChunk) {
            writeStreamChunk({ type: 'status', text: `Generating reply for WhatsApp contact "${args.recipient}"...` });
          }

          let formattedHistory = "";
          if (checkResult.chatHistory && checkResult.chatHistory.length > 0) {
            formattedHistory = checkResult.chatHistory.map(h => {
              const sender = h.isIncoming ? args.recipient : "You";
              return `${sender}: ${h.text}`;
            }).join("\n");
          } else {
            formattedHistory = `${args.recipient}: ${checkResult.lastMessage}`;
          }

          const replyPrompt = [
            {
              role: 'system',
              content: `Tu Nakshatra (ब्रह्मांड) hai — Brahmand App ka official ultra-intelligent, friendly, aur highly empathetic AI assistant.
Tu WhatsApp contact "${args.recipient}" ke saath chat kar raha hai.

🔥 TOPIC → FEATURE MAPPING & LINKS:
- Chanting/Mantra/Jaap → Live Jaap Counter & Mantra Library
- Temple/Mandir → Temple Finder & Live Darshan
- Spiritual/Jyotish/Kundli → AI Jyotish & Kundli Generator
- Emergency/Help/SOS/Blood → SOS Emergency Network & Sanatan Passport
- Download/App Link → Play Store: https://play.google.com/store/apps/details?id=com.brahmand.app | App Store: https://apps.apple.com/app/brahmand-app/id6765467224

GUIDELINES:
- Analyze their last message and respond contextually.
- Respond in natural, conversational Hinglish (warm mix of Hindi/English).
- Keep it natural, short, and conversational.
- **MEDIA ATTACHMENT RULE:** If the user EXPLICITLY asks for a photo, picture, or image (e.g. "photo bhej", "send image"), append "[MEDIA: image_description]" at the end. Otherwise do NOT include [MEDIA: ...].
- Do NOT output any system tags, explanations, quotes, or conversational headers.
- Output ONLY the raw message text to send.`
            },
            {
              role: 'user',
              content: `Recent WhatsApp chat history with "${args.recipient}":\n${formattedHistory}\n\nLatest message from "${args.recipient}": "${checkResult.lastMessage}". Respond naturally.`
            }
          ];
          const llmRes = await callLLM(replyPrompt, 0.5, 'smart');
          let generatedReply = llmRes.text.trim().replace(/^"+|"+$/g, "");

          let mediaUrl = null;
          const mediaRegex = /\[MEDIA:\s*(.*?)\]/i;
          const mediaMatch = generatedReply.match(mediaRegex);
          if (mediaMatch && mediaMatch[1]) {
            const mediaPromptText = mediaMatch[1].trim();
            console.log(`[WhatsApp Media Request Detected] Generating image: "${mediaPromptText}"`);
            if (writeStreamChunk) {
              writeStreamChunk({ type: 'status', text: `Generating requested photo: "${mediaPromptText}"...` });
            }
            try {
              mediaUrl = await generatePosterImage(mediaPromptText);
            } catch (imgErr) {
              console.error("Failed to generate image for WhatsApp auto-reply:", imgErr.message);
            }
            generatedReply = generatedReply.replace(mediaRegex, "").trim();
          }

          console.log(`Generated WhatsApp reply: "${generatedReply}". Sending via WhatsApp (Media: ${mediaUrl || 'None'})...`);
          if (writeStreamChunk) {
            writeStreamChunk({ type: 'status', text: `Sending WhatsApp reply to "${args.recipient}"...` });
          }
          const sendRes = await sendWhatsappMessage(args.recipient, generatedReply, mediaUrl);
          return JSON.stringify({
            success: true,
            checkedRecipient: args.recipient,
            receivedMessage: checkResult.lastMessage,
            sentReply: generatedReply,
            mediaAttached: mediaUrl,
            sendResult: typeof sendRes === 'string' ? JSON.parse(sendRes) : sendRes
          });
        }
        return JSON.stringify({
          success: true,
          checkedRecipient: args.recipient,
          message: checkResult.lastMessage ? "Last message in WhatsApp thread was sent by us. No reply needed." : "No chat history found."
        });
      }
      case 'store_user_fact':
        return storeUserFact(args.category, args.key, args.value);
      case 'get_user_facts':
        return getUserFacts(args.category);
      case 'get_viral_content_ideas':
        return await getViralContentIdeas(args.niche, args.targetAudience);
      case 'get_agent_analytics':
        return getAgentAnalytics();
      case 'recommend_content': {
        const userId = args.userId || 'default_user';
        const userCtx = userIntelligence.getUserContext(userId);
        const candidates = (args.candidateTopics || ["Kashi Vishwanath Mystery", "Somnath Temple History", "Hare Krishna Mantra", "Kundli AI Astrologer", "Daily Sadhana Routine", "Ayodhya Ram Mandir"]).map((topic, i) => ({
          id: `reel_${i+1}`,
          title: topic,
          topic
        }));
        const ranked = rankCandidateReels(userId, candidates, userCtx, { limit: args.limit || 5 });
        return JSON.stringify({ userId, userContext: userCtx, recommendations: ranked }, null, 2);
      }
      case 'record_user_signal': {
        userIntelligence.recordInteractionSignal(
          args.userId || 'default_user',
          args.reelId || 'reel_gen',
          args.topics || [],
          {
            completion_pct: args.completionPct || 0.8,
            is_like: args.isLike,
            is_save: args.isSave,
            is_share: args.isShare,
            is_skip: args.isSkip,
            is_not_interested: args.isNotInterested
          }
        );
        const updatedCtx = userIntelligence.getUserContext(args.userId || 'default_user');
        return JSON.stringify({ success: true, updatedProfile: updatedCtx.topInterests });
      }
      case 'extract_content_dna': {
        const dna = buildContentDNA({ primary_topic: args.topic, secondary_topics: args.details ? [args.details] : [] });
        return JSON.stringify(dna, null, 2);
      }
      default:
        return `Error: Unknown function ${functionName}`;
    }
  } catch (error) {
    console.error(`⚠️ [Self-Healing Engine] Error executing ${functionName}:`, error.message);
    // Self-Healing Auto-Repair for video generation or web search
    if (functionName === 'generate_video' && args.model !== 'wan') {
      console.log(`🔄 [Self-Healing Retry] Retrying video generation with fallback model 'wan'...`);
      try {
        return await generatePollinationsVideo(args.prompt, args.duration || 12, 'wan', args.aspectRatio || '9:16', args.audio || false);
      } catch (retryErr) {
        return `Error executing tool: ${retryErr.message}`;
      }
    }
    return `Error executing tool: ${error.message}`;
  }
}


async function runAgentLoop(messages, temperature, modelName, writeStreamChunk) {
  const maxIterations = 5;
  let currentIteration = 0;
  let finalModelUsed = modelName;
  let generatedImageUrl = null;
  const executedCalls = new Set();

  // Tools are only sent on the FIRST call; subsequent calls strip them to save tokens
  while (currentIteration < maxIterations) {
    let response;
    try {
      const toolsForThisCall = currentIteration === 0 ? toolsDefinition : null;
      response = await callLLM(messages, temperature, modelName, toolsForThisCall);
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
      let lastReelPlanResult = null;

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

        // ── SHORT-CIRCUIT: plan_instagram_reel returns its output directly ──────
        // Avoids a second LLM call that would exceed the 6,000 TPM limit because
        // the tool result (~2 k tokens) + system prompt pushes the payload over.
        if (toolCall.function.name === 'plan_instagram_reel') {
          lastReelPlanResult = typeof result === 'string' ? result : JSON.stringify(result);
          continue; // collect all tool calls, then we'll short-circuit below
        }

        messages.push({
          tool_call_id: toolCall.id,
          role: "tool",
          name: toolCall.function.name,
          content: typeof result === 'string' ? result : JSON.stringify(result)
        });
      }

      // If reel plan was the only (or last) tool called, return directly
      if (lastReelPlanResult !== null) {
        console.log('🎬 Reel plan short-circuit: returning mock output directly (no second LLM call).');
        return { text: lastReelPlanResult, model: finalModelUsed, imageUrl: generatedImageUrl };
      }

      currentIteration++;
    } else {
      return { text: response.text, model: finalModelUsed, imageUrl: generatedImageUrl };
    }
  }


  return { text: "Reached maximum iterations without final answer.", model: finalModelUsed, imageUrl: generatedImageUrl };
}

// Smart model router — maps query context to the best model key
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

  return { modelKey, reasoning };
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

  // Auto-detect and save user location preference
  try {
    const locationMatch = message.match(/(?:i live in|i am in|currently in|my city is|location:?|mera city)\s+([a-zA-Z]+)/i);
    if (locationMatch && locationMatch[1]) {
      const city = locationMatch[1].trim();
      setPreference('user_location', city);
      console.log(`📍 Auto-detected and saved user location preference: "${city}"`);
    }
  } catch (e) {
    console.error("Failed to parse user location preference:", e.message);
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
    
    // Check cache similarity (Bypassed for dynamic/social queries)
    const cacheMatch = shouldBypassCache(text) ? null : orchestrator.findInCache(db, text);
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

// 🩺 Health check & service status check
app.get('/api/status', async (req, res) => {
  const osModule = import('os');
  
  let internetConnection = false;
  try {
    const netRes = await fetch('https://www.google.com', { method: 'HEAD', timeout: 3000 }).catch(() => null);
    if (netRes && netRes.ok) internetConnection = true;
  } catch (err) {
    // network check failed
  }

  // Detect local Chrome path
  const chromePaths = [
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
    path.join(process.env.LOCALAPPDATA || '', "Google/Chrome/Application/chrome.exe")
  ];
  let chromePath = null;
  for (const p of chromePaths) {
    if (fs.existsSync(p)) {
      chromePath = p;
      break;
    }
  }

  const status = {
    system: {
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      platform: process.platform,
      internetConnected: internetConnection,
      chromeInstalled: !!chromePath,
      chromePath: chromePath
    },
    database: {
      memoryDb: { active: false, writable: false, error: null }
    },
    apiKeys: {
      anthropic: !!process.env.ANTHROPIC_API_KEY,
      openai: !!process.env.OPENAI_API_KEY,
      groq: !!process.env.GROQ_API_KEY,
      cerebras: !!process.env.CEREBRAS_API_KEY,
      nvidia: !!process.env.NVIDIA_API_KEY,
      pollinations: !!process.env.POLLINATIONS_API_KEY,
      maxun: !!process.env.MAXUN_API_KEY || !!process.env.MAXUN_API_KEY_2
    },
    sessions: {
      instagram: {
        credentialsConfigured: !!process.env.IG_USERNAME && !!process.env.IG_PASSWORD,
        sessionFileExists: fs.existsSync(path.join(path.join(process.env.USERPROFILE || process.env.HOME || '', ".brahmand-ig-session"), "cookies.json"))
      },
      whatsapp: {
        sessionDirectoryExists: fs.existsSync(path.join(path.join(process.env.USERPROFILE || process.env.HOME || '', ".brahmand-wa-session")))
      },
      twitter: {
        sessionFileExists: fs.existsSync(path.join(path.join(process.env.USERPROFILE || process.env.HOME || '', ".brahmand-tw-session"), "cookies.json"))
      }
    }
  };

  // Test read/write on DB
  try {
    const testQuery = db.prepare('SELECT 1').get();
    if (testQuery) {
      status.database.memoryDb.active = true;
      // Try to write and delete
      db.prepare("INSERT OR REPLACE INTO user_preferences (key, value) VALUES ('__status_test__', '1')").run();
      db.prepare("DELETE FROM user_preferences WHERE key = '__status_test__'").run();
      status.database.memoryDb.writable = true;
    }
  } catch (err) {
    status.database.memoryDb.error = err.message;
  }

  res.json({ success: true, status });
});

// 🌟 API to fetch the latest planned Reel JSON structure for preview
app.get('/api/reels/last-plan', (req, res) => {
  res.json({ success: true, plan: _lastPlannedReel });
});

// 🚀 Phase 2 Direct Execution — No LLM call needed
// Reads _lastPlannedReel, generates an image for Scene 1, and posts to Instagram.
// This completely bypasses Groq/LLM so rate limits don't block Phase 2.
app.post('/api/reels/approve', async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Transfer-Encoding', 'chunked');

  const writeChunk = (obj) => res.write(JSON.stringify(obj) + '\n');

  try {
    if (!_lastPlannedReel) {
      writeChunk({ type: 'error', text: '❌ No approved reel plan found. Please run Phase 1 first.' });
      return res.end();
    }

    const sessionId = req.body.sessionId || 'default_session';
    const plan = _lastPlannedReel;

    // Use edited storyboard scenes & narrations from frontend if available
    if (req.body.scenes && Array.isArray(req.body.scenes)) {
      console.log('📝 Applying user edited scenes and narrations from storyboard UI...');
      plan.scenes = req.body.scenes;
      // Rebuild the narration timeline string for TTS
      plan.narration_with_timestamps = req.body.scenes.map(s => s.narration).join(' \n ');
    }

    const title = plan.title || 'Instagram Reel';
    const caption = `${plan.caption || title}\n\n${plan.hashtags || '#NakshatraAI'}`;
    const scenes = plan.scenes || [];

    console.log(`\n🚀 [PHASE 2] Starting direct execution for: "${title}"`);
    writeChunk({ type: 'status', text: `🎬 Phase 2 started for: "${title}"` });

    const scene1Prompt = scenes.length > 0 ? scenes[0].visual_prompt : `Cinematic scene for ${title}`;
    
    let publicVideoUrl = null;
    try {
      writeChunk({ type: 'status', text: '🎬 Dynamic Reel Engine: Generating unique scenes for your topic via AI...' });
      console.log(`🎬 Dynamic Reel Engine running for: "${title}"`);
      
      const duration = parseInt(req.body.duration || '18', 10);
      const language = req.body.language || 'hi';
      const aspectRatio = req.body.aspectRatio || '9:16';
      const numScenes = parseInt(req.body.numScenes || '3', 10);

      // Use Dynamic Reel Engine — REAL AI motion clips (nova-reel)
      const { videoPath } = await generateDynamicReel(plan, {
        duration,
        language,
        aspectRatio,
        numScenes
      });
      
      // Ensure target directory exists under public previews
      const targetDir = path.join(process.cwd(), 'public', 'previews', 'reels');
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }
      
      const filename = `${sessionId}_${Date.now()}_reel.mp4`;
      const targetPath = path.join(targetDir, filename);
      fs.copyFileSync(videoPath, targetPath);
      
      publicVideoUrl = `/previews/reels/${filename}?t=${Date.now()}`;
      _lastGenVideoPath = targetPath;
      
      saveSessionData(sessionId, 'last_video_path', targetPath);
      saveSessionData(sessionId, 'last_video_caption', caption);
      
      console.log(`✅ Dynamic Reel compiled & saved: ${targetPath}`);
writeChunk({ type: 'status', text: `✅ Dynamic Reel ready — unique scenes per topic!` });
      
      writeChunk({
        type: 'done',
        success: true,
        message: `✅ **Dynamic Reel Generated & Ready to Preview!**\n\nI have generated a **unique, topic-specific** vertical video reel for **"${title}"** with cinematic motion effects.\n\n🎬 Play the video preview below.\n\nWould you like to post this to Instagram?\n\n<followups>["Confirm and Post Reel to Instagram", "Cancel/Discard"]</followups>`,
        imageUrl: publicVideoUrl,
        model: 'Nakshatra Dynamic Reel Engine (LLM + Flux + Edge TTS + FFmpeg)'
      });
      
    } catch (videoErr) {
      console.error(`❌ Dynamic Reel compilation failed: ${videoErr.message}`);
      writeChunk({
        type: 'done',
        success: false,
        message: `❌ **Dynamic Reel compilation failed:** ${videoErr.message}`,
        model: 'Nakshatra Dynamic Reel Engine'
      });
    }

    return res.end();
  } catch (err) {
    console.error('Phase 2 execution error:', err.message);
    writeChunk({ type: 'error', text: `Phase 2 failed: ${err.message}` });
    return res.end();
  }
});


// 🎤 Phase 1 TTS Preview Endpoint
// Allows the user to test the voiceover narration of any scene dynamically in Phase 1
app.post('/api/tts/preview', async (req, res) => {
  try {
    const { text, language = 'hi' } = req.body;
    if (!text) {
      return res.status(400).json({ error: 'Text is required for TTS preview' });
    }

    const { generateNarration } = await import('./services/ttsService.js');
    const audioPath = await generateNarration(text, language);

    // Copy to public preview folder so it can be played by the browser
    const filename = `preview_${Date.now()}_tts.mp3`;
    const targetDir = path.join(process.cwd(), 'public', 'previews', 'tts');
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }
    const targetPath = path.join(targetDir, filename);
    fs.copyFileSync(audioPath, targetPath);

    const publicUrl = `/previews/tts/${filename}`;
    res.json({ success: true, audioUrl: publicUrl });
  } catch (err) {
    console.error('❌ TTS Preview failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});


async function planInstagramReel(topic) {
  console.log(`🎬 [AI MODE] Planning Instagram Reel via LLM for: "${topic}"...`);

  const safeTopic = topic.replace(/"/g, '\"').replace(/\n/g, ' ');
  const cleanHashtag = safeTopic.replace(/[^a-zA-Z0-9]/g, '');

  // ── Detect topic type to guide LLM visual style ──────────────────────────
  const tLower = topic.toLowerCase();
  let topicType = 'general';
  if (/shivaji|chatrapati|rana|maharaj|rajput|warrior|sipahi|talvar|kila|yuddh|battle/.test(tLower)) topicType = 'warrior_historical';
  else if (/temple|mandir|aarti|puja|bhakti|prasad|devotion|darshan|murti|ram mandir|krishna|shiva|hanuman|devi/.test(tLower)) topicType = 'devotional';
  else if (/holi|diwali|navratri|festival|celebration|dance|rang|utsav|mela|eid|christmas/.test(tLower)) topicType = 'festival';
  else if (/nature|forest|river|mountain|waterfall|sunrise|jungle|wildlife|pahad/.test(tLower)) topicType = 'nature';
  else if (/science|vigyan|space|universe|technology|research|discovery/.test(tLower)) topicType = 'science';

  const styleGuide = {
    warrior_historical: 'WARRIOR style: Name real forts, real warrior names (e.g. Raigad, Shivaji, Jijabai, Maratha). Use battle scenes, swords, royal courts, horses.',
    devotional:         'DEVOTIONAL style: Name real temples, deities, rituals (e.g. Ram Lalla, Saryu nadi, aarti, ghee diyas, bhakton ki bheed, Jai Shri Ram).',
    festival:           'FESTIVAL style: Name specific festival rituals (e.g. gulal, dhol, dandiya, pataakhe, diyas, rangoli, traditional dress, crowd dancing).',
    nature:             'NATURE style: Name specific mountains, rivers, wildlife (e.g. Himalayan peaks, Ganga, Bengal tiger, dense forests, golden hour aerial shots).',
    science:            'SCIENCE style: Use space visuals, lab scenes, equations, galaxies, scientific instruments, glowing neural networks.',
    general:            'GENERAL style: Mix engaging facts, real people experiencing this topic, specific visual details.'
  }[topicType] || 'GENERAL style.';

  const llmPrompt = `You are Brahmand — India's best Instagram Reel script writer.

Write a UNIQUE, SPECIFIC script for: "${topic}"

${styleGuide}

CRITICAL RULES:
- Every narration line MUST mention SPECIFIC elements of "${topic}" (real names, real places, real events)
- Every image prompt MUST name REAL things from this topic — NO generic phrases like "spiritual atmosphere"
- Motion must match scene energy:
  * Opening/arrival → pan-right
  * Battle/action/intense → zoom-in
  * Landscape/panorama → pan-left
  * Emotion/prayer/devotion → glide
  * Victory/reveal/celebration → zoom-out
  * Closing/call to action → static

Return ONLY valid JSON (no markdown, no explanation):
{
  "title": "Catchy specific title for ${safeTopic}",
  "hook": "Gripping line that mentions ${safeTopic} specifically",
  "total_duration_seconds": 40,
  "narration_with_timestamps": "0:00-0:07: [hook]\\n0:07-0:15: [revelation]\\n0:15-0:25: [climax]\\n0:25-0:33: [emotion]\\n0:33-0:40: [CTA]",
  "scenes": [
    {"scene_number": 1, "duration_seconds": 7,  "narration": "specific narration 1", "visual_prompt": "specific real cinematic image prompt for ${safeTopic} scene 1, 8k, 9:16 portrait", "motion_hint": "pan-right"},
    {"scene_number": 2, "duration_seconds": 8,  "narration": "specific narration 2", "visual_prompt": "specific real cinematic image prompt for ${safeTopic} scene 2", "motion_hint": "zoom-in"},
    {"scene_number": 3, "duration_seconds": 10, "narration": "specific narration 3", "visual_prompt": "specific real cinematic image prompt for ${safeTopic} scene 3", "motion_hint": "glide"},
    {"scene_number": 4, "duration_seconds": 8,  "narration": "specific narration 4", "visual_prompt": "specific real cinematic image prompt for ${safeTopic} scene 4", "motion_hint": "zoom-out"},
    {"scene_number": 5, "duration_seconds": 7,  "narration": "closing narration",    "visual_prompt": "inspiring closing cinematic image for ${safeTopic}", "motion_hint": "static"}
  ],
  "caption": "Engaging caption with emojis about ${safeTopic}",
  "hashtags": "#${cleanHashtag} #NakshatraAI #Viral #India"
}`;

  let llmJsonStr = null;

  try {
    const llmMessages = [
      {
        role: 'system',
        content: `Tu Nakshatra hai — India ka best Instagram Reel script writer.\nHar script UNIQUE aur SPECIFIC hoti hai teri. Kabhi generic template use nahi karta.\nShivaji → Raigad, talvar, Jijabai. Ram Mandir → aarti, Ram Lalla, Saryu. Holi → rang, dhol, gulal.\nSirf valid JSON return kar — koi explanation nahi, koi markdown nahi.`
      },
      { role: 'user', content: llmPrompt }
    ];

    console.log(`  🤖 Calling LLM for unique "${topic}" script...`);
    const llmResult = await callLLM(llmMessages, 0.8, 'creative');
    const rawText = llmResult.text || '';

    const jsonStart = rawText.indexOf('{');
    const jsonEnd = rawText.lastIndexOf('}');
    if (jsonStart === -1 || jsonEnd === -1) throw new Error('No JSON in LLM response');

    llmJsonStr = rawText.substring(jsonStart, jsonEnd + 1);
    _lastPlannedReel = JSON.parse(llmJsonStr);
    console.log(`  ✅ Unique LLM script ready: "${_lastPlannedReel.title}"`);

  } catch (e) {
    console.warn(`  ⚠️ LLM script failed (${e.message}), using topic-aware fallback`);
    const fallbackScenes = buildTopicFallbackScenes(topic, topicType);
    _lastPlannedReel = {
      title: `${topic} — Ek Adbhut Safar`,
      hook: `Kya aap jaante hain ${topic} ka asli raaz? Aaj jaaniye!`,
      total_duration_seconds: 40,
      narration_with_timestamps: fallbackScenes.map((s, i) => `0:${String(i*7).padStart(2,'0')}: ${s.narration}`).join('\n'),
      scenes: fallbackScenes,
      caption: `${topic} ke baare mein yeh jaankar aap hairan ho jaayenge! 🔥\nFollow karo aur share karo! ✨`,
      hashtags: `#${cleanHashtag} #NakshatraAI #Viral #IndianCulture`
    };
    llmJsonStr = JSON.stringify(_lastPlannedReel, null, 2);
  }

  const plan = _lastPlannedReel;
  const responseText = `### 🎬 Reel Package: ${plan.title}\n\n**🎣 Hook:** ${plan.hook}\n\n**📖 Narration Script:**\n${plan.narration_with_timestamps || ''}\n\n**🎥 Scenes:**\n${(plan.scenes || []).map(s => `- **Scene ${s.scene_number}** [${s.motion_hint || 'glide'}] (${s.duration_seconds}s): ${s.narration}`).join('\n')}\n\n**📝 Caption:** ${plan.caption}\n**🏷️ Hashtags:** ${plan.hashtags}\n\n\`\`\`json\n${llmJsonStr}\n\`\`\``;

  return responseText;
}

// ─── Topic-aware fallback scenes — never generic, always specific ─────────────
function buildTopicFallbackScenes(topic, topicType) {
  const motions = ['pan-right', 'zoom-in', 'glide', 'zoom-out', 'static'];
  const templates = {
    warrior_historical: [
      { n: `${topic} — ek mahaan yoddha ki amar kahani!`,       vp: `Epic wide cinematic shot of Maratha warriors at the fort of ${topic}, sunrise battle light, 8k photorealistic` },
      { n: `Unki talvar se dushman kaanpte the!`,               vp: `Intense close-up of warrior's gleaming sword, ${topic} warrior in battle armor, fire torches, dramatic cinematic` },
      { n: `Unka kila aaj bhi unki shaurya ki kahani kehta hai.`,vp: `Majestic aerial view of historical Indian fort associated with ${topic}, golden hour, sweeping landscape, 8k` },
      { n: `Ek yoddha jis ne itihaas badal diya.`,              vp: `Powerful portrait of ${topic} warrior on horseback, dramatic cloudy sky, epic cinematic portrait` },
      { n: `Jai ${topic}! Yeh gaurav ki kahani share karo!`,    vp: `Triumphant silhouette of ${topic} against dramatic Indian sunset sky, epic inspirational closing frame` },
    ],
    devotional: [
      { n: `${topic} — jahan atma ko milti hai asli shanti.`,   vp: `Majestic establishing shot of ${topic} temple at dawn, golden light on sacred architecture, devotees arriving, 8k` },
      { n: `Yahan aakar dil ko chain milta hai.`,               vp: `Crowd of devotees at ${topic} offering flowers, incense smoke rising in divine morning light, cinematic portrait` },
      { n: `Yeh aarti ka nazar aapki rooh ko chu jayegi.`,      vp: `Grand aarti ceremony at ${topic} with flames, brass bells, priests in traditional attire, wide dramatic shot` },
      { n: `Bhakti mein hai asli shakti.`,                      vp: `Emotional close-up of devotee at ${topic} with closed eyes in prayer, tears of devotion, soft divine light` },
      { n: `Darshan karo, share karo — sabko chahiye yeh shanti.`, vp: `Serene panoramic view of ${topic} at golden sunset, peaceful sacred atmosphere, inspiring cinematic frame` },
    ],
    festival: [
      { n: `${topic} — rang, khushi, aur pyaar ka tyohaar!`,    vp: `Vibrant wide shot of ${topic} festival celebration, colorful joyful crowd, festive energy, 8k cinematic` },
      { n: `Har chehra khushi se chamak raha hai!`,             vp: `Dynamic action shot of people throwing colors or dancing at ${topic}, motion blur, joyful festive energy` },
      { n: `Yeh parv jodta hai dilo ko.`,                       vp: `Heartwarming scene of families together during ${topic}, warm lighting, traditional dress, beautiful composition` },
      { n: `${topic} ka yeh nazar yaad rahega saalon tak!`,     vp: `Spectacular wide shot of ${topic} climax — fireworks or diyas or colors, dramatic and beautiful sky` },
      { n: `Share karo yeh khushi apne khaas logon ke saath!`, vp: `Warm closing shot of friends embracing during ${topic}, golden hour, cinematic portrait` },
    ],
    nature: [
      { n: `${topic} — prakriti ka ek adbhut tohfa!`,           vp: `Breathtaking aerial cinematic view of ${topic} natural landscape, golden hour, majestic scale, 8k` },
      { n: `Yeh nazar dekhkar dil khush ho jaata hai.`,         vp: `Stunning close-up detail shot of ${topic} — water, flora, or wildlife, macro cinematic photography` },
      { n: `Prakriti ki yeh khoobsurti apni taraf bulaati hai.`,vp: `Wide landscape panorama of ${topic} at its most spectacular, sunrise sky, dramatic clouds` },
      { n: `Yahaan aakar zindagi naye rang dikhti hai.`,         vp: `Person standing in awe before ${topic}'s grandeur, silhouette against beautiful dramatic sky, cinematic` },
      { n: `Share karo — hum sab ki dharohar hai yeh.`,         vp: `Epic closing frame of ${topic} natural wonder, golden light, cinematic portrait, 8k photorealistic` },
    ],
    general: [
      { n: `${topic} ke baare mein yeh jaankar aap hairan ho jaayenge!`, vp: `Dramatic cinematic establishing shot introducing ${topic}, professional lighting, ultra-realistic, 8k` },
      { n: `Yeh ek aisee baat hai jo log jaante nahi.`,                  vp: `Close-up revealing the most interesting visual aspect of ${topic}, dramatic lighting, hyper-detailed` },
      { n: `${topic} ka yeh pehlu sabse khaas hai.`,                     vp: `Detailed cinematic visualization of core concept of ${topic}, professional photography style, 8k` },
      { n: `Yahi baat ${topic} ko sabse alag banati hai.`,               vp: `Emotional impactful shot connecting people to ${topic}, warm cinematic lighting, storytelling composition` },
      { n: `Jaano, samjho, aur zaroor share karo!`,                      vp: `Inspiring closing frame for ${topic}, dramatic sky, cinematic wide portrait, 8k photorealistic` },
    ]
  };
  const defs = templates[topicType] || templates.general;
  return defs.map((def, i) => ({
    scene_number: i + 1,
    duration_seconds: [7, 8, 10, 8, 7][i] || 8,
    narration: def.n,
    visual_prompt: def.vp,
    motion_hint: motions[i] || 'glide'
  }));
}

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

// ========================================================
// 🪷 DEDICATED POSTER ENDPOINT — No Streaming, Plain JSON
// Fast, reliable, no connection errors
// ========================================================
app.post('/api/poster', async (req, res) => {
  try {
    const { message = '', sessionId = 'default_session', uploadedImage = null } = req.body;
    const cleanMsg = message.trim().toLowerCase();

    let masterPosterUrl = await generatePosterImage(cleanMsg || 'master');
    let reply = `🪷 Here's your **Nakshatra Master Poster** for "${message || 'Brahmand'}"!\n\nInstant delivery — dark luxury gold theme, cinematic showcase. Perfect for Meta Ads & Instagram!`;

    if (uploadedImage) {
      try {
        const base64Data = uploadedImage.replace(/^data:image\/\w+;base64,/, '');
        const filename = `custom_upload_${Date.now()}.jpg`;
        const postersDir = path.join(__dirname, 'public', 'posters');
        if (!fs.existsSync(postersDir)) fs.mkdirSync(postersDir, { recursive: true });
        fs.writeFileSync(path.join(postersDir, filename), base64Data, 'base64');
        masterPosterUrl = `/posters/${filename}`;
        reply = "🪷 Here is your **Custom Nakshatra Master Poster** from your uploaded photo!\n\nReady for Meta Ads & Instagram marketing!";
      } catch (e) {
        console.warn("Custom photo save failed:", e.message);
      }
    }

    try { saveMessage(sessionId, 'user', message || '/meta'); } catch (_) {}
    try { saveMessage(sessionId, 'assistant', reply); } catch (_) {}
    try { saveSessionData(sessionId, 'last_image_url', masterPosterUrl); } catch (_) {}

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.json({
      success: true,
      message: reply,
      imageUrl: masterPosterUrl,
      model: 'Meta Poster Engine',
      sessionId
    });
  } catch (err) {
    console.error("Poster endpoint error:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

// Streamed Chat Endpoint
app.post('/api/chat', async (req, res) => {
  // Set headers for Chunked NDJSON response stream
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Transfer-Encoding', 'chunked');

  const writeStreamChunk = (obj) => {
    res.write(JSON.stringify(obj) + '\n');
  };

  try {
    _lastGenImageUrl = null; // Reset per-request
    const { 
      message, 
      uploadedImage = null,
      sessionId = 'default_session', 
      simulatedSpeed = 'auto', 
      urgent = false,
      expertise = 'beginner',
      intent = 'overview',
      emotion = 'curious'
    } = req.body;

    if (!message && !uploadedImage) {
      writeStreamChunk({ error: 'message or uploadedImage is required' });
      return res.end();
    }

    const cleanMsg = (message || '').trim().toLowerCase();

    // 🪷 Poster Interceptor — catches ONLY the /meta slash command or explicit poster keywords
    // ⚠️ FIX: cleanMsg.startsWith('meta') was TOO BROAD — it hijacked "meta ads run", 
    //         "meta campaign", etc. and wrongly sent them to the poster flow.
    //         Now only the /meta slash command OR explicit "poster" keywords trigger this.
    const isPosterRequest = cleanMsg.startsWith('/meta') ||
      cleanMsg.includes('poster') || cleanMsg.includes('master poster') ||
      cleanMsg.includes('nakshatra poster') || cleanMsg.includes('brahmand poster') ||
      (uploadedImage && (cleanMsg.includes('poster') || cleanMsg === ''));

    if (isPosterRequest) {
      writeStreamChunk({ type: 'status', text: '🎨 Processing Master Promotional Poster...' });
      
      let masterPosterUrl = generatePosterImage ? await generatePosterImage(cleanMsg) : '/posters/poster_master_cinematic_ad.jpg';
      let reply = "Here's your exclusive **Nakshatra Master Premium Cinematic Promotional Poster**! 🪷✨\n\nCrafted with a dark-luxury theme, glowing golden accents, and a sleek 3D smartphone showcase. Perfect for Meta Ads, Instagram feed, or digital marketing campaigns!";

      if (uploadedImage) {
        try {
          const base64Data = uploadedImage.replace(/^data:image\/\w+;base64,/, '');
          const filename = `custom_upload_${Date.now()}.jpg`;
          const postersDir = path.join(__dirname, 'public', 'posters');
          if (!fs.existsSync(postersDir)) {
            fs.mkdirSync(postersDir, { recursive: true });
          }
          const uploadPath = path.join(postersDir, filename);
          fs.writeFileSync(uploadPath, base64Data, 'base64');
          masterPosterUrl = `/posters/${filename}`;
          reply = "Here is your custom **Brahmand Master Promotional Poster** generated from your uploaded photo! 🪷✨\n\nShowcasing your uploaded screenshot in ultra-high quality, ready for Meta Ads & Instagram marketing!";
        } catch (e) {
          console.warn("Custom photo save failed, using default master poster:", e.message);
        }
      }

      saveMessage(sessionId, 'user', message || '/meta');
      saveMessage(sessionId, 'assistant', reply);
      _lastGenImageUrl = masterPosterUrl;
      saveSessionData(sessionId, 'last_image_url', masterPosterUrl);

      writeStreamChunk({
        type: 'done',
        success: true,
        sessionId,
        message: reply,
        imageUrl: masterPosterUrl,
        model: 'Meta Poster Engine'
      });
      if (typeof res.flush === 'function') res.flush();
      return res.end();
    }

    const startTime = Date.now();
    if (cleanMsg === 'confirm and post reel to instagram' || cleanMsg === 'confirm & post reel to instagram') {
      writeStreamChunk({ type: 'status', text: '🚀 Fetching cached media and caption...' });
      
      const lastVideoPath = getSessionData(sessionId, 'last_video_path') || _lastGenVideoPath;
      const lastImageUrl = getSessionData(sessionId, 'last_image_url') || _lastGenImageUrl;
      const lastCaption = getSessionData(sessionId, 'last_video_caption') || getSessionData(sessionId, 'last_image_caption') || 'Brahmand AI Reel #NakshatraAI';
      
      if (!lastVideoPath && !lastImageUrl) {
        saveMessage(sessionId, 'user', message);
        const reply = "❌ **Error:** Mujhe publish karne ke liye koi active generated video ya image nahi mila. Please pehle ek reel plan approve kijiye.";
        saveMessage(sessionId, 'assistant', reply);
        writeStreamChunk({
          type: 'done',
          success: false,
          sessionId,
          message: reply,
          model: 'Direct Confirm Pipeline (No LLM)'
        });
        return res.end();
      }
      
      try {
        if (lastVideoPath) {
          writeStreamChunk({ type: 'status', text: '📤 Posting generated video reel to Instagram...' });
          console.log(`📤 Uploading and publishing video reel: "${lastVideoPath}"`);
          
          let resolvedPath = lastVideoPath;
          if (lastVideoPath.startsWith('/previews/')) {
            resolvedPath = path.join(process.cwd(), 'public', lastVideoPath);
          }
          
          const postResult = await publishInstagramVideo(resolvedPath, lastCaption);
          console.log(`✅ Instagram video post result:`, postResult);
          
          saveMessage(sessionId, 'user', message);
          const reply = `✅ **Reel Posted Successfully on Instagram!**\n\nVideo has been successfully uploaded and published to your timeline.\n\n🎥 **Caption:**\n${lastCaption}`;
          saveMessage(sessionId, 'assistant', reply);
        } else {
          writeStreamChunk({ type: 'status', text: '📤 Posting generated poster image to Instagram...' });
          console.log(`📤 Uploading and publishing poster: "${lastImageUrl}"`);
          
          const postResult = await publishInstagramPhoto(lastImageUrl, lastCaption);
          console.log(`✅ Instagram poster post result:`, postResult);
          
          saveMessage(sessionId, 'user', message);
          const reply = `✅ **Reel Poster Posted Successfully on Instagram!**\n\nPoster image has been successfully uploaded and published to your timeline.\n\n🎥 **Caption:**\n${lastCaption}`;
          saveMessage(sessionId, 'assistant', reply);
        }
        
        // Clean up session data
        deleteSessionData(sessionId, 'last_video_path');
        deleteSessionData(sessionId, 'last_video_caption');
        deleteSessionData(sessionId, 'last_image_url');
        deleteSessionData(sessionId, 'last_image_caption');
        
        writeStreamChunk({
          type: 'done',
          success: true,
          sessionId,
          message: reply,
          model: 'Direct Confirm Pipeline (No LLM)'
        });
      } catch (postErr) {
        console.error(`❌ Direct Instagram media posting failed:`, postErr);
        saveMessage(sessionId, 'user', message);
        const reply = `❌ **Instagram posting failed:** ${postErr.message || postErr}`;
        saveMessage(sessionId, 'assistant', reply);
        writeStreamChunk({
          type: 'done',
          success: false,
          sessionId,
          message: reply,
          model: 'Direct Confirm Pipeline (No LLM)'
        });
      }
      return res.end();
    }
    
    if (cleanMsg === 'cancel/discard' || cleanMsg === 'cancel' || cleanMsg === 'discard') {
      saveMessage(sessionId, 'user', message);
      const reply = "🗑️ **Reel Discarded.** Pending upload session clear kar diya hai.";
      saveMessage(sessionId, 'assistant', reply);
      
      deleteSessionData(sessionId, 'last_video_path');
      deleteSessionData(sessionId, 'last_video_caption');
      deleteSessionData(sessionId, 'last_image_url');
      deleteSessionData(sessionId, 'last_image_caption');
      
      writeStreamChunk({
        type: 'done',
        success: true,
        sessionId,
        message: reply,
        model: 'Direct Discard Pipeline (No LLM)'
      });
      return res.end();
    }

    // Trigger Autonomous Tool Creation check
    checkAndCreateTool(message);

    // 1. Check Similarity Cache (Bypassed for dynamic Instagram/live social queries)
    const cacheMatch = shouldBypassCache(message) ? null : orchestrator.findInCache(db, message);
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

    // 2. Classify Speed (Forced to SLOW and quality checks bypassed as requested)
    let speedMode = 'SLOW';
    let avgLatency = 251150;
    console.log(`📊 Measured Average Latency: ${(avgLatency / 1000).toFixed(2)}s -> Class: ${speedMode}`);

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
    let routedModelKey = modelSelection.modelKey;
    let selectionReasoning = modelSelection.reasoning;

    // For Instagram and messaging queries, use the smart model for robust tool calling
    if (shouldBypassCache(message)) {
      routedModelKey = 'smart';
      selectionReasoning = 'smart 70b model chosen for social media tool calling';
    }

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

    const storedFacts = getUserFacts();
    if (storedFacts && !storedFacts.includes('No custom user facts')) {
      memoryContextPrompt += `\n- SAVED LONG-TERM MEMORIES & FACTS:\n${storedFacts}`;
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
    } else if (chatQuestionType === 'simple' && message.split(' ').length < 10 && !lowerMessage.includes('search') && !lowerMessage.includes('news') && !lowerMessage.includes('latest') && !lowerMessage.includes('query')) {
      promptOverride += `\n\n### CRITICAL RESPONSE LENGTH CONSTRAINT ###\n- The user asked a short, simple question. \n- Respond directly in a single, short sentence. Keep it under 40 words!`;
    }

    // ─── REELS PIPELINE STATE MACHINE ───────────────────────────────────────────
    // Detect if the user is requesting a reel plan (Phase 1) or approving one (Phase 2)
    const lowerMsg = message.toLowerCase();
    const isReelPlanRequest = /(reel plan|plan.*reel|reel.*plan|instagram reel|reel script|script.*reel|reel.*bana|reel.*generate)/i.test(message);
    const isReelApproval  = /^approve reel workflow:/i.test(message.trim());

    if (isReelApproval) {
      // Phase 2 — media generation + posting is now permitted
      promptOverride += `

### 🎬 REEL WORKFLOW — PHASE 2: APPROVED
The user has approved the reel package. You may now proceed to:
1. Call generate_image for each scene's visual prompt.
2. Assemble and post using post_to_instagram or post_video_to_instagram.
Do NOT call plan_instagram_reel again — use the already-approved plan.`;
    } else if (isReelPlanRequest) {
      // Phase 1 — planning only, media tools strictly forbidden
      promptOverride += `

### 🎬 REEL WORKFLOW — PHASE 1: PLANNING ONLY MODE
CRITICAL CONSTRAINTS — DO NOT VIOLATE:
- You MUST call plan_instagram_reel(topic) and return the full Reel Package.
- You MUST NOT call generate_image, generate_video, or post_video_to_instagram.
- Do NOT generate any images or videos yet.
- Do NOT post anything to Instagram.
- Output ONLY the plan. The user will click the Approve button to proceed to Phase 2.`;
    }

    // 5. Build Dynamic Agent Messages
    let skills = loadSkills();
    let temperature = 0.3;
    skills = skills.substring(0, 2000) + '\n... [Truncated for token limit]';
    
    let systemPrompt = buildSystemPrompt(skills, '', speedMode, isUrgent, detectedExpertise, detectedIntent, detectedEmotion, promptOverride);

    // Inject last generated image URL for cross-request Instagram posting flow
    const lastImageUrl = getSessionData(sessionId, 'last_image_url');
    if (lastImageUrl) {
      systemPrompt += `\n\n### LAST GENERATED IMAGE URL (pichle request se bachi hui)\nImage URL: ${lastImageUrl}\n\nAgar user ab "post karo" / "haan" bole to yeh URL use karo:\npost_to_instagram(imageUrl: "${lastImageUrl}", caption: "caption yahan")\nYeh exact URL hai, ise string mein hi daalo.\n`;
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
    const agentResult = await runAgentLoop(fullMessages, temperature, routedModelKey, writeStreamChunk);
    
    let finalResponseText = agentResult.text;
    let modelUsed = agentResult.model;
    let generatedImageUrl = agentResult.imageUrl;

    // Persist last generated image URL for cross-request Instagram posting
    if (generatedImageUrl) {
      saveSessionData(sessionId, 'last_image_url', generatedImageUrl);
    }

    // 7. Quality check — skip if already slow (waste of time)
    let qualityScore = 10;
    let revisionSuggested = false;
    if (speedMode !== 'SLOW') {
      try {
        qualityScore = await orchestrator.evaluateQuality(callLLM, message, finalResponseText, speedMode);
      } catch { qualityScore = 10; }
    }

    if (speedMode !== 'SLOW' && qualityScore < 7) {
      revisionSuggested = true;
      try {
        const revisedResult = await callLLM([...cleanHistory, { role: 'user', content: `Improve this response: ${finalResponseText}` }], temperature, routedModelKey);
        if (revisedResult?.text) finalResponseText = revisedResult.text;
        modelUsed = revisedResult?.model || modelUsed;
      } catch (e) {}
    }

    writeStreamChunk({ type: 'status', text: `✅ Response ready (score ${qualityScore}/10)` });

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

    // Save to Cache (Bypassed for dynamic/social queries)
    if (!shouldBypassCache(message)) {
      orchestrator.saveToCache(db, message, finalResponseText, modelUsed, generatedImageUrl || null);
    }

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
const server = app.listen(PORT, () => {
  console.log(`\n🚀 Nakshatra Smart Decision Agent running on http://localhost:${PORT}`);
  
  /*
  // Start background auto-reply loop for Instagram
  const targetUser = process.env.AUTO_REPLY_TARGET || getPreference('auto_reply_target');
  if (!targetUser) {
    console.log(`🤖 Background Auto-Reply Monitor: No target user configured. To enable, please set AUTO_REPLY_TARGET in your .env file or 'auto_reply_target' in preferences.`);
  } else {
    console.log(`🤖 Background Auto-Reply Monitor starting for target: @${targetUser}`);
    
    let lastSeenIgMessage = null;
    
    setInterval(async () => {
      try {
        console.log(`🔄 [Poll] Checking Instagram messages for @${targetUser}...`);
        const res = await getLatestIncomingInstagramMessage(targetUser);
        if (res && res.lastMessage) {
          const { lastMessage, isIncoming } = res;
          if (isIncoming && lastMessage !== lastSeenIgMessage) {
            console.log(`📥 New incoming IG message from @${targetUser}: "${lastMessage}"`);
            
            const prompt = `
Write a polite, warm, and brief Hinglish reply to: "${lastMessage}"
Introduce the premium Sanatan/heritage app "Brahmand". Keep it under 2 sentences.
Website: https://brahmand.app
`;
            const replyText = await askLLM(prompt, 300);
            console.log(`📤 Sending auto-reply: "${replyText.trim()}"`);
            await sendInstagramMessage(targetUser, replyText.trim());
            lastSeenIgMessage = lastMessage;
          }
        }
      } catch (err) {
        console.warn("⚠️ Background IG poller warning:", err.message);
      }
    }, 25000); // Check every 25 seconds
  }
  */

}).on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.log(`\n❌ Port ${PORT} is already in use! Another instance of Nakshatra AI Agent is already running.`);
    console.log(`👉 Please close all other running terminal windows / node processes, or set PORT=3001 in your .env file.`);
    process.exit(1);
  } else {
    console.error('Server error:', err.message);
  }
});
