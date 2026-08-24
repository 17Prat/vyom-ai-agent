import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
puppeteer.use(StealthPlugin());
import fs from 'fs';
import path from 'path';
import os from 'os';
import dotenv from 'dotenv';
import { askLLM } from './services/llmService.js';
import { hasBeenContacted, isBlacklisted, logOutreach, blacklistUser, getDailyOutreachCount } from './utils/outreachDb.js';


dotenv.config();

const CHROME_PATH = (() => {
  const paths = [
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
    path.join(process.env.LOCALAPPDATA || '', "Google/Chrome/Application/chrome.exe")
  ];
  for (const p of paths) {
    if (fs.existsSync(p)) return p;
  }
  return paths[0];
})();
const TW_SESSION_DIR = path.join(os.homedir(), '.brahmand-tw-session');
const cookiePath = path.join(TW_SESSION_DIR, 'cookies.json');

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

async function initBrowser() {
  if (!fs.existsSync(TW_SESSION_DIR)) {
    fs.mkdirSync(TW_SESSION_DIR, { recursive: true });
  }

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: false,
    args: [
      '--no-sandbox', 
      '--disable-setuid-sandbox',
      '--disable-web-security',
      '--disable-features=IsolateOrigins,site-per-process'
    ],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1366, height: 768 });
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

  if (fs.existsSync(cookiePath)) {
    try {
      const cookies = JSON.parse(fs.readFileSync(cookiePath, 'utf8'));
      if (cookies.length) {
        await page.setCookie(...cookies);
        console.log(`Loaded ${cookies.length} saved cookies for Twitter.`);
      }
    } catch (e) {
      console.warn("Failed to load saved cookies:", e.message);
    }
  }

  return { browser, page };
}

async function loginToTwitter(page) {
  console.log("🌐 Navigating to Twitter/X...");
  await page.goto('https://x.com/home', { waitUntil: 'networkidle2', timeout: 45000 }).catch(() => {});
  await delay(3000);

  const isLoggedIn = await page.evaluate(() => {
    return !!document.querySelector('[data-testid="SideNav_NewTweet_Button"]') || 
           !!document.querySelector('[data-testid="SearchBox_Search_Input"]');
  });

  if (isLoggedIn) {
    console.log("✅ Already logged in via cookies!");
    return true;
  }

  console.log("🔐 Login required. Navigating to login page...");
  await page.goto('https://x.com/login', { waitUntil: 'networkidle2', timeout: 45000 }).catch(() => {});
  await delay(4000);

  const username = process.env.TWITTER_USERNAME;
  const password = process.env.TWITTER_PASSWORD;

  if (!username || !password) {
    console.error("❌ TWITTER_USERNAME or TWITTER_PASSWORD not set in .env!");
    return false;
  }

  console.log("Typing username...");
  await page.waitForSelector('input[autocomplete="username"]', { timeout: 10000 });
  await page.type('input[autocomplete="username"]', username, { delay: 50 });
  await delay(1000);

  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button, role[button]'));
    const nextBtn = buttons.find(b => b.textContent?.trim().toLowerCase() === 'next');
    if (nextBtn) nextBtn.click();
    else {
      const spans = Array.from(document.querySelectorAll('span'));
      const nextSpan = spans.find(s => s.textContent?.trim().toLowerCase() === 'next');
      nextSpan?.closest('button')?.click();
    }
  });
  await delay(3000);

  console.log("Typing password...");
  await page.waitForSelector('input[name="password"]', { timeout: 10000 });
  await page.type('input[name="password"]', password, { delay: 50 });
  await delay(1000);

  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button, role[button]'));
    const loginBtn = buttons.find(b => b.textContent?.trim().toLowerCase() === 'log in');
    if (loginBtn) loginBtn.click();
    else {
      const spans = Array.from(document.querySelectorAll('span'));
      const loginSpan = spans.find(s => s.textContent?.trim().toLowerCase() === 'log in');
      loginSpan?.closest('button')?.click();
    }
  });
  await delay(5000);

  for (let i = 0; i < 180; i++) {
    const url = page.url();
    if (url.includes('login') && (url.includes('challenge') || url.includes('verification'))) {
      if (i === 0 || i % 15 === 0) {
        console.log("⚠️ Verification or 2FA code required. Please enter it in the browser window... (waiting up to 3 minutes)");
      }
      await delay(1000);
      continue;
    }
    break;
  }

  await page.goto('https://x.com/home', { waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {});
  await delay(4000);

  const finalCheck = await page.evaluate(() => {
    return !!document.querySelector('[data-testid="SideNav_NewTweet_Button"]') || 
           !!document.querySelector('[data-testid="SearchBox_Search_Input"]');
  });

  if (finalCheck) {
    console.log("✅ Login Success!");
    const cookies = await page.cookies();
    fs.writeFileSync(cookiePath, JSON.stringify(cookies, null, 2));
    console.log("Saved cookies.");
    return true;
  } else {
    console.error("❌ Login failed.");
    return false;
  }
}

async function postTweet(page, tweetText) {
  console.log(`📝 Posting Tweet: "${tweetText}"`);
  
  await page.goto('https://x.com/home', { waitUntil: 'networkidle2' }).catch(() => {});
  await delay(3000);

  const editorSelector = '[data-testid="tweetTextarea_0"]';
  await page.waitForSelector(editorSelector, { timeout: 15000 });
  await page.click(editorSelector);
  await delay(500);

  await page.keyboard.type(tweetText, { delay: 40 });
  await delay(1500);

  console.log("Clicking Post button...");
  await page.evaluate(() => {
    const postBtn = document.querySelector('[data-testid="tweetButtonInline"]') || 
                    document.querySelector('[data-testid="tweetButton"]');
    postBtn?.click();
  });
  await delay(4000);
  console.log("✅ Tweet Posted!");
}

async function verifyTweetSuitability(tweetText) {
  const prompt = `
Analyze this tweet and decide if it is suitable to reply with an introduction to our premium "Brahmand" app (Indian culture, temple architecture, and mantra app).
Tweet: "${tweetText}"

Rules:
- Reply YES if the tweet is positive, respectful, and talks about Indian culture, Sanatan, heritage, temples, history, yoga, meditation, or positive Indian philosophy.
- Reply NO if it contains political debates, religious controversy, negative/abusive content, spam, arguments, or is completely unrelated.

Response MUST be exactly YES or NO. No explanation.
`;

  try {
    const answer = await askLLM(prompt, 100);
    return answer.trim().toUpperCase().includes('YES');
  } catch (e) {
    return true;
  }
}

async function searchAndReply(page, searchQuery) {
  console.log(`🔍 Searching Twitter for: "${searchQuery}"`);
  const encodedQuery = encodeURIComponent(searchQuery);
  await page.goto(`https://x.com/search?q=${encodedQuery}&f=live`, { waitUntil: 'networkidle2' }).catch(() => {});
  await delay(5000);

  // Extract multiple tweets so we can pick the best one instead of blindly choosing the first
  const tweets = await page.evaluate(() => {
    const tweetElements = Array.from(document.querySelectorAll('[data-testid="tweet"]'));
    return tweetElements.map((el, index) => {
      const textEl = el.querySelector('[data-testid="tweetText"]');
      const userLink = el.querySelector('a[href*="/status/"]')?.getAttribute('href')?.split('/')[1];
      const replyBtn = el.querySelector('[data-testid="reply"]');
      return {
        index,
        text: textEl ? textEl.textContent : '',
        username: userLink || 'unknown',
        hasReply: !!replyBtn
      };
    }).filter(t => t.text.length > 10);
  });

  if (!tweets || tweets.length === 0) {
    console.log("❌ No tweets found matching query.");
    return;
  }

  console.log(`Discovered ${tweets.length} candidate tweets. Finding the most suitable one...`);
  
  let selectedTweet = null;
  let selectedReplyText = '';

  for (const tweet of tweets) {
    const tweetIdKey = tweet.text.trim().substring(0, 100);

    // Skip blacklisted and already contacted tweets
    if (isBlacklisted('twitter', tweet.username) || isBlacklisted('twitter', tweetIdKey) || hasBeenContacted('twitter', tweetIdKey)) {
      continue;
    }

    // Smart LLM Suitability Check
    const isSuitable = await verifyTweetSuitability(tweet.text);
    if (!isSuitable) {
      console.log(`⏭️ Tweet from @${tweet.username} deemed unsuitable by LLM. Skipping.`);
      logOutreach('twitter', tweetIdKey, 'skipped', 'LLM verification failed');
      
      // Auto-blacklist username if highly hostile triggers appear
      const lowerText = tweet.text.toLowerCase();
      if (lowerText.includes('scam') || lowerText.includes('hate') || lowerText.includes('trash') || lowerText.includes('nonsense')) {
        blacklistUser('twitter', tweet.username, 'Tweet contained negative hostility triggers');
      }
      continue;
    }

    selectedTweet = tweet;

    // Craft highly contextual response
    console.log(`🧠 Drafting contextual reply for tweet from @${tweet.username}...`);
    const prompt = `
A user named @${tweet.username} tweeted: "${tweet.text}"

Task: Write a helpful, highly elegant, and premium reply to this tweet in Hinglish (Hindi written in Roman script) introducing the "Brahmand" app.
Rules:
1. Keep it short (maximum 140 characters to fit easily).
2. Make it sound like a natural, thoughtful recommendation (e.g. "Aapko Brahmand App try karna chahiye...").
3. Do not sound salesy or commercial.
4. Align with our brand: calm, minimal, premium.

Provide ONLY the response text. No quotes.
`;
    selectedReplyText = await askLLM(prompt, 300);
    break; // Found a suitable one, break loop
  }

  if (!selectedTweet) {
    console.log("❌ None of the discovered tweets in this batch were suitable or fresh.");
    return;
  }

  const finalTweetIdKey = selectedTweet.text.trim().substring(0, 100);
  console.log(`📌 Replying to @${selectedTweet.username}: "${selectedTweet.text}"`);
  console.log(`💬 Reply message: "${selectedReplyText.trim()}"`);

  // Navigate directly to reply button click via Puppeteer evaluation to prevent scroll issues
  const clicked = await page.evaluate((idx) => {
    const cards = document.querySelectorAll('[data-testid="tweet"]');
    if (cards[idx]) {
      const replyBtn = cards[idx].querySelector('[data-testid="reply"]');
      if (replyBtn) {
        replyBtn.scrollIntoView({ block: 'center' });
        replyBtn.click();
        return true;
      }
    }
    return false;
  }, selectedTweet.index);

  if (!clicked) {
    console.log("❌ Failed to click the reply button.");
    return;
  }
  await delay(3000);

  const replyEditorSelector = '[data-testid="tweetTextarea_0"]';
  await page.waitForSelector(replyEditorSelector, { timeout: 10000 });
  await page.type(replyEditorSelector, selectedReplyText.trim(), { delay: 40 });
  await delay(1500);

  // Click submit reply
  await page.evaluate(() => {
    const sendBtn = document.querySelector('[data-testid="tweetButtonInline"]') || 
                    document.querySelector('[data-testid="tweetButton"]');
    sendBtn?.click();
  });
  await delay(4000);
  
  logOutreach('twitter', finalTweetIdKey, 'replied', selectedReplyText.trim(), 1);
  console.log("✅ Reply posted successfully!");
}

async function main() {
  const args = process.argv.slice(2);
  const postIndex = args.indexOf('--post');
  const searchIndex = args.indexOf('--search-reply');

  if (postIndex === -1 && searchIndex === -1) {
    console.log(`
Brahmand Twitter (X) Outreach Agent (Super Smart Edition)

Usage:
  node twitter_outreach_agent.mjs --post "<tweet_text>"
  node twitter_outreach_agent.mjs --search-reply "<search_query>"

Examples:
  node twitter_outreach_agent.mjs --post "Explore the roots of Sanatan Dharma with the premium Brahmand App. 🌌🕉️"
  node twitter_outreach_agent.mjs --search-reply "Sanatan app recommendation"
`);
    process.exit(0);
  }

  // Safety Governor Check
  const dailyCount = getDailyOutreachCount('twitter');
  const DAILY_LIMIT = 15;
  if (dailyCount >= DAILY_LIMIT) {
    console.log(`\n⚠️ Safety Governor: Twitter daily reply limit of ${DAILY_LIMIT} reached (Sent today: ${dailyCount}).`);
    console.log(`👉 Pausing execution to protect your Twitter account from being locked.`);
    process.exit(0);
  }

  const { browser, page } = await initBrowser();
  const success = await loginToTwitter(page);
  
  if (!success) {
    console.log("❌ Could not proceed. Exiting.");
    await browser.close();
    process.exit(1);
  }

  try {
    if (postIndex !== -1 && args[postIndex + 1]) {
      const text = args[postIndex + 1];
      await postTweet(page, text);
    } else if (searchIndex !== -1 && args[searchIndex + 1]) {
      const query = args[searchIndex + 1];
      await searchAndReply(page, query);
    }
  } catch (err) {
    console.error("❌ Error during task execution:", err.message);
  }

  console.log("Closing browser in 5 seconds...");
  await delay(5000);
  await browser.close();
  console.log("Finished.");
}

main().catch(err => {
  console.error("Fatal Error:", err);
});
