import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
puppeteer.use(StealthPlugin());
import fetch from "node-fetch";
import fs from "fs";
import path from "path";
import os from "os";
import dotenv from "dotenv";
dotenv.config();

const CHROME_PATH = "C:/Program Files/Google/Chrome/Application/chrome.exe";

function parseNum(str) {
  if (!str) return 0;
  const num = str.replace(/,/g, "").trim();
  if (num.endsWith("M")) return Math.round(parseFloat(num) * 1000000);
  if (num.endsWith("K")) return Math.round(parseFloat(num) * 1000);
  return parseInt(num) || 0;
}

function parsePostMeta(ogDesc) {
  if (!ogDesc) return null;
  const likeMatch = ogDesc.match(/([\d,]+[KM]?)\s*like[s]?/i);
  const commentMatch = ogDesc.match(/([\d,]+[KM]?)\s*comment[s]?/i);
  const dateMatch = ogDesc.match(/on\s+(\w+\s+\d+,\s*\d{4})/);
  const colonIdx = ogDesc.indexOf(": ");
  let caption = colonIdx > 0 ? ogDesc.substring(colonIdx + 2).trim() : "";
  caption = caption.replace(/^"+|"\.?$/g, "").trim();
  return {
    likes: parseNum(likeMatch?.[1]),
    comments: parseNum(commentMatch?.[1]),
    date: dateMatch ? dateMatch[1] : "",
    caption: caption
  };
}

function parseProfileMeta(ogDesc) {
  if (!ogDesc) return null;
  const match = ogDesc.match(/([\d,]+[KM]?)\s*Followers?,\s*([\d,]+[KM]?)\s*Following,\s*([\d,]+[KM]?)\s*Posts?\s*-\s*See Instagram photos and videos from\s*(.+?)\s*\(@(\w+)\)/i);
  if (!match) return null;
  return {
    username: match[5],
    full_name: match[4].trim(),
    follower_count: parseNum(match[1]),
    following_count: parseNum(match[2]),
    media_count: parseNum(match[3]),
  };
}

function parseProfileHeader(headerText) {
  const lines = headerText.split("\n").filter(l => l.trim());
  let username = "", fullName = "", followers = "", following = "";
  const bioLines = [];
  for (const line of lines) {
    if (line.includes(" followers") || line.includes(" follower")) {
      followers = line.replace(/ followers?/, "").trim();
    }
    else if (line.includes(" following")) following = line.replace(" following", "").trim();
    else if (line.match(/^[\d,]+[KM]?\s*posts?$/i)) continue;
    else if (!username) username = line;
    else if (!fullName) fullName = line;
    else bioLines.push(line);
  }
  return {
    username,
    full_name: fullName,
    biography: bioLines.join("\n"),
    follower_count: parseNum(followers),
    following_count: parseNum(following),
  };
}

const SESSION_DIR = path.join(os.homedir(), ".brahmand-ig-session");

function ensureSessionDir() {
  if (!fs.existsSync(SESSION_DIR)) fs.mkdirSync(SESSION_DIR, { recursive: true });
}

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

let ig = null;

async function igInit() {
  if (ig && ig.page && !ig.page.isClosed()) {
    try {
      await ig.page.evaluate(() => document.body);
      return ig;
    } catch(e) { /* page died, reset */ }
  }

  ensureSessionDir();
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: false,
    args: ["--no-sandbox", "--disable-setuid-sandbox", `--user-data-dir=${SESSION_DIR}/profile`],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1366, height: 768 });

  ig = { browser, page, ready: false };
  return ig;
}

async function igLogin() {
  if (!ig) await igInit();
  const { page } = ig;

  const cookiePath = path.join(SESSION_DIR, "cookies.json");

  // Load saved cookies
  if (fs.existsSync(cookiePath)) {
    try {
      const cookies = JSON.parse(fs.readFileSync(cookiePath, "utf8"));
      if (cookies.length) await page.setCookie(...cookies);
    } catch(e) {}
  }

  await page.goto("https://www.instagram.com/", { waitUntil: "networkidle2", timeout: 30000 }).catch(() => {});
  await delay(3000);

  // Check if already logged in via cookies
  const alreadyLoggedIn = await page.evaluate(() => {
    if (document.querySelector('input[name="email"], input[name="username"]')) return false;
    return !!document.querySelector('svg[aria-label="Home"], svg[aria-label="Search"], a[href*="/direct/inbox/"], a[href*="/pratham_patel_18/"]');
  });
  if (alreadyLoggedIn) {
    console.log("✅ Instagram: Already logged in via cookies");
    ig.ready = true;
    return true;
  }

  // Auto-login with credentials from .env
  const username = process.env.IG_USERNAME;
  const password = process.env.IG_PASSWORD;
  if (!username || !password) {
    console.log("❌ Instagram: IG_USERNAME or IG_PASSWORD not set in .env");
    return false;
  }

  console.log("🔐 Instagram: Attempting auto-login...");
  await page.goto("https://www.instagram.com/accounts/login/", { waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => {});
  await delay(2000);

  // Type username
  const usernameInput = await page.$('input[name="email"], input[name="username"]');
  if (usernameInput) {
    await usernameInput.click();
    await usernameInput.type(username, { delay: 30 });
  } else {
    console.log("❌ Instagram: Username input not found");
    return false;
  }

  // Type password
  const passwordInput = await page.$('input[name="pass"]');
  if (passwordInput) {
    await passwordInput.click();
    await passwordInput.type(password, { delay: 30 });
  } else {
    console.log("❌ Instagram: Password input not found");
    return false;
  }

  await delay(500);

  // Click login button
  await page.evaluate(() => {
    const btns = document.querySelectorAll('button');
    for (const b of btns) {
      if (b.textContent.trim().toLowerCase() === 'log in' || b.textContent.trim().toLowerCase() === 'log in' || b.type === 'submit') {
        b.click(); return;
      }
    }
    // Fallback: try div[role="button"]
    const divs = document.querySelectorAll('div[role="button"]');
    for (const d of divs) {
      if (d.textContent.trim().toLowerCase() === 'log in') { d.click(); return; }
    }
  });

  console.log("⏳ Instagram: Waiting for login to complete...");
  await delay(5000);

  const challengeTimeout = 120000;
  const startTime = Date.now();
  let challengeDetected = false;

  while (Date.now() - startTime < challengeTimeout) {
    const curUrl = page.url();

    const isLoggedIn = await page.evaluate(() => {
      return !!document.querySelector('svg[aria-label="Home"], svg[aria-label="Search"], a[href*="/direct/inbox/"]');
    }).catch(() => false);

    if (isLoggedIn) {
      console.log("✅ Instagram: Auto-login successful!");
      ig.ready = true;
      // Save cookies
      const cookies = await page.cookies();
      fs.writeFileSync(cookiePath, JSON.stringify(cookies, null, 2));
      return true;
    }

    if (curUrl.includes('challenge') || curUrl.includes('recaptcha') || curUrl.includes('auth_platform')) {
      if (!challengeDetected) {
        challengeDetected = true;
        console.log("⚠️ Instagram: Challenge/captcha detected! Waiting for manual solve...");
        console.log("   Browser window is open. Please solve the captcha there.");
        console.log("   Waiting up to 2 minutes...");
      }
      await delay(2000);
      continue;
    }

    if (curUrl.includes('login') || curUrl.includes('accounts/login')) {
      const loginError = await page.evaluate(() => {
        const el = document.querySelector('#slfErrorAlert, p[data-testid="login-error-message"]');
        return el ? el.textContent : null;
      }).catch(() => null);
      if (loginError) {
        console.log(`❌ Instagram: Login error: ${loginError}`);
        return false;
      }
    }

    await delay(1000);
  }

  if (challengeDetected) {
    console.log("❌ Instagram: Challenge not solved within timeout");
  } else {
    console.log("❌ Instagram: Login timeout - could not verify login status");
  }
  return false;
}

async function ensureLoggedIn() {
  if (!ig) await igInit();
  if (ig.ready) return true;
  ig.ready = false; // reset if previous session died
  return await igLogin();
}

// ============================================================
// GET FUNCTIONS (public profile, no login needed)
// ============================================================
async function withBrowser(fn) {
  const b = await igInit();
  return await fn(b.browser);
}

export async function getInstagramProfileInfo(targetUsername) {
  const b = await igInit();
  const page = await b.browser.newPage();
  await page.setViewport({ width: 1366, height: 768 });

  await page.goto(`https://www.instagram.com/${targetUsername}/`, { waitUntil: "networkidle2", timeout: 30000 });
  await delay(3000);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await delay(1500);

  const metaDesc = await page.evaluate(() => {
    const m = document.querySelector('meta[property="og:description"]');
    const m2 = document.querySelector('meta[name="description"]');
    return { og: m?.content || null, name: m2?.content || null };
  });

  const metaProfile = parseProfileMeta(metaDesc.og);

  let bioFromMeta = "";
  if (metaDesc.name) {
    const bioMatch = metaDesc.name.match(/on Instagram:\s*"(.+)"$/);
    if (bioMatch) bioFromMeta = bioMatch[1].trim();
  }

  const headerData = await page.evaluate(() => {
    const header = document.querySelector("header");
    if (!header) return null;
    const text = header.innerText || "";
    const postLinks = Array.from(document.querySelectorAll("article a")).map(a => ({
      href: a.href,
      type: a.href.includes("/reel/") ? "reel" : "post"
    }));
    return { headerText: text, postLinks: postLinks.slice(0, 12) };
  });

  const profile = headerData ? parseProfileHeader(headerData.headerText) : {};

  return JSON.stringify({
    username: profile.username || metaProfile?.username || targetUsername,
    full_name: profile.full_name || metaProfile?.full_name || "",
    biography: bioFromMeta || profile.biography || "No bio available",
    follower_count: profile.follower_count || metaProfile?.follower_count || 0,
    following_count: profile.following_count || metaProfile?.following_count || 0,
    media_count: metaProfile?.media_count || 0,
    is_private: headerData?.headerText?.includes("This account is private") || false,
    latest_posts: (headerData?.postLinks || []).slice(0, 6).map(l => l.href)
  }, null, 2);
}

export async function getInstagramRecentMedia(targetUsername) {
  const b = await igInit();
  const page = await b.browser.newPage();
  await page.setViewport({ width: 1366, height: 768 });

  await page.goto(`https://www.instagram.com/${targetUsername}/`, { waitUntil: "networkidle2", timeout: 30000 });
  await delay(3000);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await delay(1500);

  const postLinks = await page.evaluate(() => {
    return Array.from(document.querySelectorAll("article a")).slice(0, 6).map(a => ({
      href: a.href,
      type: a.href.includes("/reel/") ? "reel" : "post"
    }));
  });

  const posts = [];
  for (const link of postLinks) {
    try {
      await page.goto(link.href, { waitUntil: "networkidle2", timeout: 20000 });
      await delay(2000);

      const postData = await page.evaluate(() => {
        const m = document.querySelector('meta[property="og:description"]');
        const image = document.querySelector('meta[property="og:image"]');
        const video = document.querySelector('meta[property="og:video"]');
        return {
          ogDesc: m?.content || null,
          ogImage: image?.content || null,
          ogVideo: video?.content || null,
        };
      });

      const meta = parsePostMeta(postData.ogDesc);
      posts.push({
        url: link.href,
        type: link.type,
        caption: meta?.caption || "",
        likes: meta?.likes || 0,
        comments: meta?.comments || 0,
        date: meta?.date || "",
        thumbnail: postData.ogImage || postData.ogVideo || ""
      });
    } catch (e) {
      posts.push({ url: link.href, type: link.type, error: e.message?.substring(0, 100) });
    }
  }

  return JSON.stringify(posts, null, 2);
}

// ============================================================
// POST TO INSTAGRAM
// ============================================================
export async function publishInstagramPhoto(imageUrl, caption) {
  const ok = await ensureLoggedIn();
  if (!ok) return "Instagram login failed. Check .env credentials or solve captcha manually.";

  const { page } = ig;

  for (let attempt = 1; attempt <= 3; attempt++) {
    console.log(`\n=== Post attempt ${attempt}/3 ===`);
    try {
      let ext = '.jpg';
      let buffer;
      if (imageUrl.startsWith('http')) {
        const resp = await fetch(imageUrl);
        if (!resp.ok) return `Failed to fetch file: ${resp.statusText}`;
        buffer = Buffer.from(await resp.arrayBuffer());
        const contentType = resp.headers.get('content-type') || '';
        if (contentType.includes('video/mp4')) ext = '.mp4';
        else if (contentType.includes('image/png')) ext = '.png';
        else if (contentType.includes('image/jpeg') || contentType.includes('image/jpg')) ext = '.jpg';
        else {
          const urlMatch = imageUrl.match(/\.(\w+)(?:\?|$)/);
          if (urlMatch) ext = '.' + urlMatch[1];
        }
      } else {
        buffer = fs.readFileSync(imageUrl);
        const fileMatch = imageUrl.match(/\.(\w+)$/);
        if (fileMatch) ext = '.' + fileMatch[1];
      }
      const tmpPath = path.join(os.tmpdir(), `ig-post-${Date.now()}${ext}`);
      fs.writeFileSync(tmpPath, buffer);

      await page.goto("https://www.instagram.com/create/select/", { waitUntil: "networkidle2", timeout: 20000 }).catch(() => {});
      await delay(3000);

      const fileInput = await page.waitForSelector('input[type="file"]', { timeout: 15000 }).catch(() => null);
      if (!fileInput) return "Instagram: Could not find file upload input.";
      await fileInput.uploadFile(tmpPath);
      console.log("File uploaded: " + tmpPath);
      await delay(6000);

      // Progress through the "Next" buttons until we reach the caption screen
      let reachedCaptionPage = false;
      for (let step = 0; step < 6; step++) {
        // Dismiss introductory dialogs / popups if present (e.g. video sharing updates, dismissals)
        await page.evaluate(() => {
          const dialogs = Array.from(document.querySelectorAll('button, div[role="button"], span'));
          for (const b of dialogs) {
            const text = b.textContent.trim().toLowerCase();
            if (text === 'ok' || text === 'continue' || text === 'get started' || text === 'not now' || text === 'dismiss' || text === 'close') {
              b.click();
            }
          }
        });
        await delay(1000);

        const textareaVisible = await page.evaluate(() => {
          const t = document.querySelector('textarea');
          return !!(t && (t.placeholder?.toLowerCase().includes('write') || t.placeholder?.toLowerCase().includes('caption')));
        });
        if (textareaVisible) {
          reachedCaptionPage = true;
          break;
        }

        console.log(`Step ${step + 1}: Clicking "Next" button to progress...`);
        const clickedNext = await page.evaluate(() => {
          // Look inside the active dialog header first for Next/Share buttons
          const dialog = document.querySelector('div[role="dialog"]');
          if (dialog) {
            const headers = Array.from(dialog.querySelectorAll('header, div'));
            for (const header of headers) {
              const rect = header.getBoundingClientRect();
              if (rect.height > 20 && rect.height < 120) {
                const clickables = Array.from(header.querySelectorAll('button, div[role="button"], span, div'));
                const actionBtn = clickables.find(el => {
                  const txt = el.textContent.trim().toLowerCase();
                  return txt === 'next' || txt === 'share' || txt === 'आगे' || txt === 'साझा करें';
                });
                if (actionBtn) {
                  actionBtn.click();
                  return true;
                }
              }
            }
          }

          // Fallback: search the entire page for any button/div with exact text
          const allButtons = Array.from(document.querySelectorAll('button, div[role="button"], span, div'));
          const nextBtn = allButtons.find(el => {
            const text = el.textContent.trim().toLowerCase();
            return text === 'next' || text === 'share' || text === 'आगे' || text === 'साझा करें';
          });
          if (nextBtn) {
            nextBtn.click();
            return true;
          }
          return false;
        });

        if (!clickedNext) {
          console.log("Could not find 'Next' button at this step. Checking if already loaded or waiting...");
        }
        await delay(3000);
      }

      await page.evaluate(() => {
        for (const t of document.querySelectorAll('textarea')) {
          if (t.placeholder?.toLowerCase().includes('write') || t.placeholder?.toLowerCase().includes('caption')) {
            t.focus(); t.click(); return;
          }
        }
      });
      await delay(800);
      await page.keyboard.type(caption, { delay: 12 });
      await delay(1000);

      await page.evaluate(() => {
        // Find the share button in the dialog
        const dialog = document.querySelector('div[role="dialog"]');
        if (dialog) {
          const clickables = Array.from(dialog.querySelectorAll('button, div[role="button"], span, div'));
          const shareBtn = clickables.find(b => {
            const txt = b.textContent.trim().toLowerCase();
            return txt === 'share' || txt === 'share post' || txt === 'साझा करें' || txt === 'post';
          });
          if (shareBtn) { shareBtn.click(); return; }
        }

        // Fallback
        for (const b of document.querySelectorAll('button, div[role="button"], span')) {
          const txt = b.textContent.trim().toLowerCase();
          if (txt === 'share' || txt === 'share post' || txt === 'साझा करें') { b.click(); return; }
        }
      });
      console.log("Share clicked");
      await delay(20000); // Wait 20 seconds for video upload and processing

      let stillOnCreate = page.url().includes('/create/');
      if (stillOnCreate) {
        console.log("Still on create page, waiting another 10s for upload to complete...");
        await delay(10000);
        stillOnCreate = page.url().includes('/create/');
      }

      if (stillOnCreate) {
        console.log("Instagram: Post could not be published (stayed on create page). Try again later.");
        try { fs.unlinkSync(tmpPath); } catch(e) {}
        if (attempt < 3) { await delay(120000); continue; }
        return "Instagram: Post could not be published (stayed on create page). Try again later.";
      }

      try { fs.unlinkSync(tmpPath); } catch(e) {}
      fs.writeFileSync(path.join(SESSION_DIR, "cookies.json"), JSON.stringify(await page.cookies(), null, 2));
      return JSON.stringify({ success: true, message: "Post published successfully on Instagram!" });
    } catch (error) {
      if (attempt < 3) { await delay(120000); continue; }
      return `Instagram post failed: ${error.message}`;
    }
  }
  return "Instagram: Exhausted retry attempts.";
}

export const publishInstagramVideo = publishInstagramPhoto;

// ============================================================
// SEND DM
// ============================================================
export async function sendInstagramMessage(username, messageText, mediaPath) {
  const ok = await ensureLoggedIn();
  if (!ok) return "Instagram login failed. Check .env credentials or solve captcha manually.";

  const { page } = ig;

  try {
    if (!mediaPath) {
      await page.goto("https://www.instagram.com/", { waitUntil: "networkidle2", timeout: 20000 }).catch(() => {});
      await delay(2000);

      const stillLoggedIn = await page.evaluate(() => {
        return !!document.querySelector('svg[aria-label="Home"], a[href*="/pratham_patel_18/"]');
      });
      if (!stillLoggedIn) {
        ig.ready = false;
        return "Session expired. Please try again (might need captcha).";
      }

      const result = await page.evaluate(async ({ user, msg }) => {
        try {
          const resp = await fetch('/api/v1/direct_v2/threads/broadcast/text/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
              recipient_users: JSON.stringify([user]),
              action: 'send_item',
              text: msg,
            }).toString(),
            credentials: 'include',
          });
          const text = await resp.text();
          return { ok: resp.ok, status: resp.status, body: text.substring(0, 200) };
        } catch(e) {
          return { ok: false, error: e.message };
        }
      }, { user: username, msg: messageText });

      console.log("DM API result:", JSON.stringify(result));

      if (result.ok) {
        return JSON.stringify({ success: true, message: `Message sent to @${username}` });
      }

      console.log("API failed, trying UI approach...");
    } else {
      console.log("Media attachment path provided. Initializing direct message UI upload...");
    }

    await page.goto(`https://www.instagram.com/${username}/`, { waitUntil: "networkidle2", timeout: 20000 }).catch(() => {});
    await delay(3000);

    const profileBtns = await page.evaluate(() => {
      const btns = [];
      document.querySelectorAll('button, div[role="button"]').forEach(b => {
        const t = b.textContent?.trim().toLowerCase() || '';
        if (t) btns.push(t.substring(0, 20));
      });
      return btns;
    });
    console.log("Profile buttons:", profileBtns);

    await page.evaluate(() => {
      const all = document.querySelectorAll('button, div[role="button"]');
      for (const el of all) {
        const t = el.textContent?.trim().toLowerCase() || '';
        if (t === 'message') { el.click(); return; }
      }
    });
    await delay(5000);

    // Wait up to 10 seconds for a text input element to become visible on the direct message page
    let inputFocused = false;
    for (let i = 0; i < 10; i++) {
      inputFocused = await page.evaluate(() => {
        const areas = document.querySelectorAll('textarea, div[role="textbox"], div[contenteditable="true"]');
        for (const a of areas) {
          if (a.offsetParent !== null) {
            a.focus();
            a.click();
            return true;
          }
        }
        return false;
      });
      if (inputFocused) break;
      await delay(1000);
    }

    if (inputFocused) {
      if (mediaPath) {
        console.log(`Locating file input in DM thread for: ${mediaPath}`);
        try {
          let ext = '.jpg';
          let buffer;
          if (mediaPath.startsWith('http')) {
            const resp = await fetch(mediaPath);
            if (resp.ok) {
              buffer = Buffer.from(await resp.arrayBuffer());
              const contentType = resp.headers.get('content-type') || '';
              if (contentType.includes('video/mp4')) ext = '.mp4';
              else if (contentType.includes('video/quicktime')) ext = '.mov';
              else if (contentType.includes('image/png')) ext = '.png';
              else if (contentType.includes('image/jpeg') || contentType.includes('image/jpg')) ext = '.jpg';
            }
          } else {
            buffer = fs.readFileSync(mediaPath);
            const fileMatch = mediaPath.match(/\.(\w+)$/);
            if (fileMatch) ext = '.' + fileMatch[1];
          }

          if (buffer) {
            const tmpPath = path.join(os.tmpdir(), `ig-dm-media-${Date.now()}${ext}`);
            fs.writeFileSync(tmpPath, buffer);
            
            const fileInputHandle = await page.evaluateHandle(() => {
              const textbox = document.querySelector('textarea, div[role="textbox"], div[contenteditable="true"]');
              if (!textbox) return null;
              let parent = textbox.parentElement;
              for (let i = 0; i < 10; i++) {
                if (!parent) break;
                const input = parent.querySelector('input[type="file"]');
                if (input) return input;
                parent = parent.parentElement;
              }
              const allInputs = Array.from(document.querySelectorAll('input[type="file"]'));
              for (const input of allInputs) {
                const rect = input.getBoundingClientRect();
                if (rect.left > 250) return input;
              }
              return document.querySelector('input[type="file"]');
            });
            const fileInput = fileInputHandle.asElement();
            if (fileInput) {
              await fileInput.uploadFile(tmpPath);
              console.log(`Media file uploaded to DM successfully: ${tmpPath}`);
              await delay(8000); // Wait for media to process and upload
            } else {
              console.log("Could not find file input element in direct chat window.");
            }
            try { fs.unlinkSync(tmpPath); } catch (e) {}
          }
        } catch (mediaErr) {
          console.error("Error processing/uploading DM media:", mediaErr.message);
        }
      }

      await delay(1000);
      if (messageText) {
        await page.keyboard.type(messageText, { delay: 50 });
        await delay(1000);
        await page.keyboard.press('Enter');
        console.log("Message text sent via UI!");
        await delay(2000);
      }
      return JSON.stringify({ success: true, message: `Message sent to @${username}` });
    }

    return "Could not send message. Input element not focused.";
  } catch (error) {
    return `Failed to send message: ${error.message}`;
  }
}

export async function getLatestIncomingInstagramMessage(username) {
  const ok = await ensureLoggedIn();
  if (!ok) return { error: "Instagram login failed." };

  const { page } = ig;

  try {
    console.log(`Checking messages for @${username}...`);
    await page.goto(`https://www.instagram.com/${username}/`, { waitUntil: "networkidle2", timeout: 20000 }).catch(() => {});
    await delay(3000);

    // Click Message button to open thread
    const clicked = await page.evaluate(() => {
      const all = document.querySelectorAll('button, div[role="button"]');
      for (const el of all) {
        const t = el.textContent?.trim().toLowerCase() || '';
        if (t === 'message') { el.click(); return true; }
      }
      return false;
    });

    if (!clicked) {
      return { error: `Could not find Message button on @${username}'s profile.` };
    }

    await delay(5000); // Wait for messages to load

    // Read message list and analyze alignment
    const result = await page.evaluate(() => {
      const inputEl = document.querySelector('textarea, div[role="textbox"], div[contenteditable="true"]');
      const inputRect = inputEl ? inputEl.getBoundingClientRect() : null;

      const bubbles = Array.from(document.querySelectorAll('div[dir="auto"], span[dir="auto"]')).filter(el => {
        const text = el.textContent?.trim();
        if (!text || text.length === 0 || el.offsetParent === null) return false;
        
        // Filter out elements that are to the left of the chat window (e.g. sidebar threads)
        if (inputRect) {
          const rect = el.getBoundingClientRect();
          if (rect.left < inputRect.left - 50) return false;
        }
        return true;
      });

      if (bubbles.length === 0) return null;

      // Find the main chat box container
      const chatBox = inputEl ? inputEl.closest('div[style*="height"], div.x9f619') || inputEl.parentElement : document.body;
      const boxRect = chatBox.getBoundingClientRect();
      const midPoint = boxRect.left + (boxRect.width / 2);

      const parsed = bubbles.map(el => {
        const rect = el.getBoundingClientRect();
        // Check alignment: Aligned left of center line = incoming
        const isIncoming = (rect.left + rect.width / 2) < midPoint;
        return {
          text: el.textContent.trim(),
          y: rect.top,
          isIncoming
        };
      });

      // Sort by vertical position (Y-coordinate) to get chronological order
      parsed.sort((a, b) => a.y - b.y);
      return parsed;
    });

    if (!result || result.length === 0) {
      console.log(`No message bubbles found in thread with @${username}`);
      return { lastMessage: null, isIncoming: false, chatHistory: [] };
    }

    const lastMsg = result[result.length - 1];
    console.log(`Last message in thread: "${lastMsg.text}" (Incoming: ${lastMsg.isIncoming})`);
    return {
      lastMessage: lastMsg.text,
      isIncoming: lastMsg.isIncoming,
      chatHistory: result
    };

  } catch (error) {
    console.error(`Error reading messages: ${error.message}`);
    return { error: error.message };
  }
}

export { ig, igInit };
export { getInstagramRecentMedia as getInstagramPosts };