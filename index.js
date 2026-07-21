import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import Groq from 'groq-sdk';
import { Cerebras } from '@cerebras/cerebras_cloud_sdk';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadAllSkills } from './utils/skillLoader.js';
import { generatePosterImage } from './services/mediaService.js';
import { searchWeb } from './services/searchService.js';
import { scrapeWebsite } from './services/scrapeService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

// Clients Initialization
const groq = process.env.GROQ_API_KEY ? new Groq({ apiKey: process.env.GROQ_API_KEY }) : null;
const cerebras = process.env.CEREBRAS_API_KEY ? new Cerebras({ apiKey: process.env.CEREBRAS_API_KEY }) : null;

const BASE_SYSTEM_PROMPT = `You are Brahmand (ब्रह्मांड), an elite AI Specialist Agent.
Be highly intelligent, helpful, and natural in Hinglish or English. Follow loaded skill runbooks strictly.`;

const chatSessions = {};

// Multi-Model Completion Fallback Logic
async function getAIResponse(messages) {
  if (cerebras) {
    try {
      const res = await cerebras.chat.completions.create({
        messages,
        model: 'llama-3.3-70b',
        temperature: 0.3,
      });
      return { text: res.choices[0].message.content, model: 'Cerebras (Llama 3.3 70B)' };
    } catch (e) {
      console.warn("Cerebras failed, falling back to Groq...", e.message);
    }
  }

  if (groq) {
    const res = await groq.chat.completions.create({
      messages,
      model: 'llama-3.3-70b-versatile',
      temperature: 0.3,
    });
    return { text: res.choices[0].message.content, model: 'Groq (Llama 3.3 70B)' };
  }

  throw new Error("No active AI provider found!");
}

// 🧠 Smart Intent Classifier: Checks if user explicitly wants an Image
async function checkImageGenerationIntent(userMessage) {
  try {
    const checkMessages = [
      {
        role: 'system',
        content: 'You are an intent classifier. Does the user explicitly ask to create, draw, generate, or show a picture/image/photo/poster? Reply with ONLY "YES" or "NO".'
      },
      { role: 'user', content: userMessage }
    ];
    const res = await getAIResponse(checkMessages);
    return res.text.trim().toUpperCase().includes('YES');
  } catch (e) {
    return false;
  }
}

app.post('/api/session/new', (req, res) => {
  const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  chatSessions[sessionId] = [];
  res.json({ success: true, sessionId });
});

app.post('/api/chat', async (req, res) => {
  try {
    const { message, sessionId } = req.body;
    if (!message) return res.status(400).json({ error: 'message field is required' });

    const loadedSkills = loadAllSkills();
    const FULL_SYSTEM_PROMPT = `${BASE_SYSTEM_PROMPT}\n\n### LOADED SKILLS & RUNBOOKS ###\n${loadedSkills}`;

    const history = chatSessions[sessionId] || [];

    // 🕸️ 1. Auto-Detect Web URL Scrape Intent
    const urlMatch = message.match(/(https?:\/\/[^\s]+|[a-zA-Z0-9-]+\.(com|org|dev|in|io|net)[^\s]*)/i);
    const isScrapeReq = /scrape|read website|extract page|crawl|fetch url/i.test(message) && urlMatch;
    
    let extraContext = "";

    if (isScrapeReq && urlMatch) {
      let targetUrl = urlMatch[0];
      if (!targetUrl.startsWith('http')) targetUrl = 'https://' + targetUrl;
      const scrapedData = await scrapeWebsite(targetUrl);
      if (scrapedData) {
        extraContext = `\n\n[SCRAPED WEBSITE CONTENT FROM ${targetUrl}]: \n${scrapedData}\n\nAnalyze and present the key information from this website according to the user request.`;
      }
    } else {
      // 🔍 2. Auto-Detect Web Search Intent
      const isSearchReq = /search|latest|news|today|current|price|who is|what is|weather|score|update/i.test(message);
      if (isSearchReq) {
        const searchResults = await searchWeb(message);
        if (searchResults) {
          extraContext = `\n\n[LIVE WEB SEARCH RESULTS FOR "${message}"]: \n${searchResults}\n\nUse the above live search information to provide an up-to-date accurate answer.`;
        }
      }
    }

    const messages = [
      { role: 'system', content: FULL_SYSTEM_PROMPT + extraContext },
      ...history,
      { role: 'user', content: message }
    ];

    // 3. Get Smart LLM Response
    const aiResult = await getAIResponse(messages);
    let imageUrl = null;

    // 🧠 4. Smart Intent Classifier for Image Generation
    const needsImage = await checkImageGenerationIntent(message);

    if (needsImage) {
      console.log("🎨 Smart AI confirmed Image Generation request for:", message);

      const promptGenMessages = [
        { 
          role: 'system', 
          content: 'Output ONLY the raw visual descriptive prompt text for FLUX AI. Focus purely on subject, lighting, composition, and 8k detail.' 
        },
        { role: 'user', content: `Generate a visual image prompt for: ${message}` }
      ];

      let rawPrompt = message;
      try {
        const promptRes = await getAIResponse(promptGenMessages);
        rawPrompt = promptRes.text
          .replace(/^Here is.*?:/gi, '')
          .replace(/^Sure.*?:/gi, '')
          .replace(/["']/g, '')
          .trim();
      } catch (e) {
        console.warn("Could not extract prompt.");
      }

      imageUrl = await generatePosterImage(rawPrompt);
    }

    // Update session
    history.push({ role: 'user', content: message });
    history.push({ role: 'assistant', content: aiResult.text });
    if (sessionId) chatSessions[sessionId] = history;

    res.json({
      success: true,
      sessionId: sessionId || null,
      message: aiResult.text,
      imageUrl: imageUrl,
      model: aiResult.model
    });

  } catch (error) {
    console.error('Agent Error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Brahmand AI Agent active on http://localhost:${PORT}`);
});