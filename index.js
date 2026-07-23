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
import { getRandomGitaShloka, getDailyPanchang } from './utils/spiritualDb.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/appicon.jpeg', express.static(path.join(__dirname, 'icon', 'appicon.jpeg')));

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
Be highly intelligent, friendly, concise, and helpful.

LANGUAGE POLICY:
- If the user writes/queries in English, respond in English.
- If the user writes/queries in Hinglish (Hindi using the Latin alphabet, e.g., "sunn search krke de", "post leke aa", "kaise ho"), you MUST respond in Hinglish.
- Do NOT respond in pure Hindi (Devanagari script like "नमस्ते, मैं आपकी सहायता...") unless the user explicitly queries in Devanagari script.

IMPORTANT: You do not have access to call external API functions/tools (like web-search) directly in JSON tool format. You must always reply in normal conversational text/Markdown. Never output raw tool-call JSON blocks like '{"name": "web-search", ...}'.

CRITICAL INSTAGRAM URL RULE: 
When users ask for Instagram posts, reels, or links, do not hallucinate, fake, or invent shortcodes. Instead, cite and present the verified real-time resolved URLs provided to you in the search context.`;

const chatSessions = {};

// 🧠 Multi-Model Completion
async function getAIResponse(messages) {
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
      const opts = {
        reply_markup: {
          inline_keyboard: [
            [
              { text: "🕉️ Gita Shloka", callback_data: "get_shloka" },
              { text: "📅 Daily Panchang", callback_data: "get_panchang" }
            ],
            [
              { text: "🪔 Create Poster", callback_data: "create_poster" },
              { text: "🔍 Help & Search", callback_data: "help_search" }
            ]
          ]
        }
      };
      return telegramBot.sendMessage(chatId, "🌌 *Namaste! Main Brahmand AI Bot hoon.*\n\nMain aapki sahayata ke liye taiyar hoon. Rojana ka Panchang dekhne, Gita Shloka padhne ya koi bhi shubh kam ke liye niche diye buttons par click karein ya type karein!", { ...opts, parse_mode: 'Markdown' });
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

  // Handle Callback Queries (Button Clicks)
  telegramBot.on('callback_query', async (callbackQuery) => {
    const message = callbackQuery.message;
    const chatId = message.chat.id;
    const action = callbackQuery.data;

    try {
      telegramBot.answerCallbackQuery(callbackQuery.id).catch(() => {});

      if (action === 'get_shloka') {
        const shloka = getRandomGitaShloka();
        const responseText = `🕉️ *Bhagavad Gita Shloka*\n\n*Verse:*\n_${shloka.verse}_\n\n*Transliteration:*\n_${shloka.transliteration}_\n\n*English Translation:*\n"${shloka.translation}"\n\n*Hindi Meaning (Hinglish):*\n${shloka.explanation}`;
        await telegramBot.sendMessage(chatId, responseText, { parse_mode: 'Markdown' });
      } else if (action === 'get_panchang') {
        const panchang = getDailyPanchang();
        const responseText = `📅 *Daily Panchang - ${panchang.date}*\n\n*Tithi:* ${panchang.tithi}\n*Nakshatra:* ${panchang.nakshatra}\n*Yoga:* ${panchang.yoga}\n\n🌅 *Auspicious Timing:*\n${panchang.shubhMuhurat}\n\n⚠️ *Rahukaal (Inauspicious):*\n${panchang.rahukaal}`;
        await telegramBot.sendMessage(chatId, responseText, { parse_mode: 'Markdown' });
      } else if (action === 'create_poster') {
        await telegramBot.sendMessage(chatId, "🎨 *Create Festival Poster*\n\nPoster banane ke liye aap mujhe seedhe message send karein, jaise:\n`Draw a beautiful poster of Lord Shiva during Mahashivratri` aur main aapke liye turant AI poster generate kar dunga!", { parse_mode: 'Markdown' });
      } else if (action === 'help_search') {
        await telegramBot.sendMessage(chatId, "🔍 *Help & Search Capabilities*\n\nAap kisi bhi vishay par live internet search kar sakte hain. Bas type karein: `search latest news of Ayodhya Mandir` ya kisi bhi website ko scrape karne ke liye uska URL send karein!", { parse_mode: 'Markdown' });
      }
    } catch (err) {
      console.error("Callback Query Error:", err.message);
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

    const isShlokaReq = /shloka|gita|verse/i.test(message);
    const isPanchangReq = /panchang|tithi|muhurat|nakshatra/i.test(message);

    if (isShlokaReq) {
       const shloka = getRandomGitaShloka();
       extraContext = `\n\n[CURATED GITA SHLOKA]:\nVerse: ${shloka.verse}\nTranslation: ${shloka.translation}\nExplanation: ${shloka.explanation}\nIntegrate this shloka or refer to it to answer the user beautifully.`;
    } else if (isPanchangReq) {
       const panchang = getDailyPanchang();
       extraContext = `\n\n[DYNAMIC DAILY PANCHANG DATA]:\nDate: ${panchang.date}\nTithi: ${panchang.tithi}\nNakshatra: ${panchang.nakshatra}\nYoga: ${panchang.yoga}\nShubh Muhurat: ${panchang.shubhMuhurat}\nRahukaal: ${panchang.rahukaal}\nUse this Panchang context to answer the user's request.`;
    } else if (isScrapeReq && urlMatch) {
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