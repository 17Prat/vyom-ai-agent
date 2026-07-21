import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import Groq from 'groq-sdk';
import { Cerebras } from '@cerebras/cerebras_cloud_sdk';
import TelegramBot from 'node-telegram-bot-api';
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

// 🤖 Telegram Bot Initialization
const telegramToken = process.env.TELEGRAM_BOT_TOKEN;
let telegramBot = null;

if (telegramToken && telegramToken !== 'YOUR_BOT_TOKEN_HERE') {
  try {
    telegramBot = new TelegramBot(telegramToken, { polling: true });
    console.log("🤖 Telegram Bot initialized successfully!");
  } catch (err) {
    console.error("Telegram Bot init error:", err.message);
  }
}

const BASE_SYSTEM_PROMPT = `You are Brahmand (ब्रह्मांड), an elite AI Specialist Agent available on Web and Telegram.
Be highly intelligent, friendly, concise, and helpful in Hinglish, Hindi, or English.`;

const chatSessions = {};

// 🧠 Multi-Model Completion (openai/gpt-oss-120b Primary + Fallbacks)
async function getAIResponse(messages) {
  // Preference 1: Groq openai/gpt-oss-120b Model
  if (groq) {
    try {
      const res = await groq.chat.completions.create({
        messages,
        model: 'openai/gpt-oss-120b',
        temperature: 0.3,
      });
      return { text: res.choices[0].message.content, model: 'GPT OSS 120B (Groq)' };
    } catch (e) {
      console.warn("gpt-oss-120b fallback, trying qwen / llama...", e.message);
      try {
        const res = await groq.chat.completions.create({
          messages,
          model: 'qwen-2.5-coder-32b',
          temperature: 0.3,
        });
        return { text: res.choices[0].message.content, model: 'Qwen 2.5 Coder 32B (Groq)' };
      } catch (qErr) {
        try {
          const res = await groq.chat.completions.create({
            messages,
            model: 'llama-3.3-70b-versatile',
            temperature: 0.3,
          });
          return { text: res.choices[0].message.content, model: 'Groq (Llama 3.3 70B)' };
        } catch (lErr) {}
      }
    }
  }

  // Preference 2: Cerebras Fallback
  if (cerebras) {
    try {
      const res = await cerebras.chat.completions.create({
        messages,
        model: 'llama-3.3-70b',
        temperature: 0.3,
      });
      return { text: res.choices[0].message.content, model: 'Cerebras (Llama 3.3 70B)' };
    } catch (e) {
      console.warn("Cerebras failed...", e.message);
    }
  }

  throw new Error("No active AI provider found!");
}

// 🧠 Smart Intent Classifier for Image
async function checkImageGenerationIntent(userMessage) {
  try {
    const checkMessages = [
      {
        role: 'system',
        content: 'Does the user explicitly ask to create, draw, generate, or show a picture/image/photo/poster? Reply ONLY "YES" or "NO".'
      },
      { role: 'user', content: userMessage }
    ];
    const res = await getAIResponse(checkMessages);
    return res.text.trim().toUpperCase().includes('YES');
  } catch (e) {
    return false;
  }
}

// 🤖 Telegram Bot Handler
if (telegramBot) {
  telegramBot.on('polling_error', (err) => { });

  telegramBot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const userText = msg.text;

    if (!userText) return;

    if (userText === '/start') {
      return telegramBot.sendMessage(chatId, "🌌 Namaste! Main Brahmand AI Bot (GPT-OSS-120B Powered) hoon.\n\nMain aapke sawalon ke jawab, Web Search, Website Scraping aur HD AI Images generate kar sakta hoon. Kuch bhi poochhein!");
    }

    try {
      telegramBot.sendChatAction(chatId, 'typing').catch(() => { });

      const loadedSkills = loadAllSkills();
      const FULL_SYSTEM_PROMPT = `${BASE_SYSTEM_PROMPT}\n\n### LOADED SKILLS ###\n${loadedSkills}`;

      const history = chatSessions[`tg_${chatId}`] || [];

      // Web search intent
      const isSearchReq = /search|latest|news|today|current|price|who is|weather/i.test(userText);
      let searchContext = "";
      if (isSearchReq) {
        try {
          const searchResults = await searchWeb(userText);
          if (searchResults) {
            searchContext = `\n\n[LIVE SEARCH RESULTS]: \n${searchResults}`;
          }
        } catch (sErr) { }
      }

      const messages = [
        { role: 'system', content: FULL_SYSTEM_PROMPT + searchContext },
        ...history,
        { role: 'user', content: userText }
      ];

      const aiResult = await getAIResponse(messages);

      // Safe Send Text
      try {
        await telegramBot.sendMessage(chatId, aiResult.text, { parse_mode: 'Markdown' });
      } catch (e) {
        await telegramBot.sendMessage(chatId, aiResult.text);
      }

      // Update history
      history.push({ role: 'user', content: userText });
      history.push({ role: 'assistant', content: aiResult.text });
      chatSessions[`tg_${chatId}`] = history;

      // Image generation check
      const needsImage = await checkImageGenerationIntent(userText);
      if (needsImage) {
        telegramBot.sendChatAction(chatId, 'upload_photo').catch(() => { });
        const imagePrompt = `High quality, ${userText}, cinematic lighting, masterpiece, 8k detail`;
        const imageUrl = await generatePosterImage(imagePrompt);
        if (imageUrl) {
          await telegramBot.sendPhoto(chatId, imageUrl, { caption: "✨ Generated by Brahmand AI" }).catch(() => { });
        }
      }

    } catch (err) {
      console.error("Telegram Bot Error:", err.message);
      telegramBot.sendMessage(chatId, "⚠️ Maaf kijiye, kuch error aa gaya. Kripya thodi der baad try karein.").catch(() => { });
    }
  });
}

// 🌐 Web API Endpoints
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

    const urlMatch = message.match(/(https?:\/\/[^\s]+|[a-zA-Z0-9-]+\.(com|org|dev|in|io|net)[^\s]*)/i);
    const isScrapeReq = /scrape|read website|extract page|crawl|fetch url/i.test(message) && urlMatch;

    let extraContext = "";

    if (isScrapeReq && urlMatch) {
      let targetUrl = urlMatch[0];
      if (!targetUrl.startsWith('http')) targetUrl = 'https://' + targetUrl;
      const scrapedData = await scrapeWebsite(targetUrl);
      if (scrapedData) {
        extraContext = `\n\n[SCRAPED WEBSITE CONTENT FROM ${targetUrl}]: \n${scrapedData}`;
      }
    } else {
      const isSearchReq = /search|latest|news|today|current|price|who is|what is|weather/i.test(message);
      if (isSearchReq) {
        const searchResults = await searchWeb(message);
        if (searchResults) {
          extraContext = `\n\n[LIVE WEB SEARCH RESULTS]: \n${searchResults}`;
        }
      }
    }

    const messages = [
      { role: 'system', content: FULL_SYSTEM_PROMPT + extraContext },
      ...history,
      { role: 'user', content: message }
    ];

    const aiResult = await getAIResponse(messages);
    let imageUrl = null;

    const needsImage = await checkImageGenerationIntent(message);

    if (needsImage) {
      const promptGenMessages = [
        { role: 'system', content: 'Output ONLY the raw visual descriptive prompt text for FLUX AI.' },
        { role: 'user', content: `Generate a visual image prompt for: ${message}` }
      ];

      let rawPrompt = message;
      try {
        const promptRes = await getAIResponse(promptGenMessages);
        rawPrompt = promptRes.text.replace(/^Here is.*?:/gi, '').replace(/["']/g, '').trim();
      } catch (e) { }

      imageUrl = await generatePosterImage(rawPrompt);
    }

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