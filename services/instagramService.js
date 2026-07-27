import puppeteer from "puppeteer-core";
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

export async function getInstagramProfileInfo(targetUsername) {
  return await withBrowser(async (browser) => {
    const page = await browser.newPage();
    newPage(page);

    await page.goto(`https://www.instagram.com/${targetUsername}/`, { waitUntil: "networkidle2", timeout: 30000 });
    await new Promise(r => setTimeout(r, 3000));
    // Scroll to trigger lazy-loaded posts
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await new Promise(r => setTimeout(r, 1500));

    const metaDesc = await page.evaluate(() => {
      const m = document.querySelector('meta[property="og:description"]');
      const m2 = document.querySelector('meta[name="description"]');
      return { og: m?.content || null, name: m2?.content || null };
    });

    const metaProfile = parseProfileMeta(metaDesc.og);

    // Extract bio from meta[name="description"] if available
    // Format: "617K Followers, ... - Name (@user) on Instagram: \"bio text\""
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
  });
}

export async function getInstagramRecentMedia(targetUsername) {
  return await withBrowser(async (browser) => {
    const page = await browser.newPage();
    newPage(page);

    await page.goto(`https://www.instagram.com/${targetUsername}/`, { waitUntil: "networkidle2", timeout: 30000 });
    await new Promise(r => setTimeout(r, 3000));
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await new Promise(r => setTimeout(r, 1500));

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
        await new Promise(r => setTimeout(r, 2000));

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
  });
}

const SESSION_DIR = path.join(os.homedir(), ".brahmand-ig-session");

function ensureSessionDir() {
  if (!fs.existsSync(SESSION_DIR)) fs.mkdirSync(SESSION_DIR, { recursive: true });
}

async function getSavedCookies(page) {
  const cookiePath = path.join(SESSION_DIR, "cookies.json");
  if (!fs.existsSync(cookiePath)) return false;
  const cookies = JSON.parse(fs.readFileSync(cookiePath, "utf8"));
  if (!cookies.length) return false;
  await page.setCookie(...cookies);
  return true;
}

async function saveCookies(page) {
  ensureSessionDir();
  const cookies = await page.cookies();
  fs.writeFileSync(path.join(SESSION_DIR, "cookies.json"), JSON.stringify(cookies, null, 2));
}

async function launchBrowser() {
  ensureSessionDir();
  return await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: false,
    args: ["--no-sandbox", "--disable-setuid-sandbox", `--user-data-dir=${SESSION_DIR}/profile`],
  });
}

function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}

export async function publishInstagramPhoto(imageUrl, caption) {
  const IG_USERNAME = process.env.IG_USERNAME;
  const IG_PASSWORD = process.env.IG_PASSWORD;
  if (!IG_USERNAME || !IG_PASSWORD) {
    return "Instagram posting requires IG_USERNAME and IG_PASSWORD environment variables.";
  }

  let browser;
  try {
    let buffer;
    if (imageUrl.startsWith('http')) {
      const resp = await fetch(imageUrl);
      if (!resp.ok) return `Failed to fetch image: ${resp.statusText}`;
      buffer = Buffer.from(await resp.arrayBuffer());
    } else {
      buffer = fs.readFileSync(imageUrl);
    }
    const tmpPath = path.join(os.tmpdir(), `ig-post-${Date.now()}.jpg`);
    fs.writeFileSync(tmpPath, buffer);

    browser = await launchBrowser();
    const page = await browser.newPage();
    await page.setViewport({ width: 1366, height: 768 });

    // Try loading saved cookies first
    await getSavedCookies(page);

    await page.goto("https://www.instagram.com/", { waitUntil: "networkidle2", timeout: 30000 });
    await delay(3000);

    // Real login check: look for login form or feed
    const needsLogin = await page.evaluate(() => {
      return !!document.querySelector('input[name="email"]') || !!document.querySelector('input[name="username"]');
    });

    if (needsLogin) {
      console.log("No valid session, logging in...");
      await page.goto("https://www.instagram.com/accounts/login/", { waitUntil: "networkidle2", timeout: 30000 });
      await delay(2000);
      await page.waitForSelector('input[name="email"]', { timeout: 15000 });
      await page.type('input[name="email"]', IG_USERNAME, { delay: 40 });
      await page.type('input[name="pass"]', IG_PASSWORD, { delay: 40 });
      await page.click('div[aria-label="Log In"]');
      await delay(3000);

      const urlAfterLogin = page.url();

      // Check if we hit a challenge
      if (urlAfterLogin.includes('challenge') || urlAfterLogin.includes('recaptcha') || urlAfterLogin.includes('auth_platform')) {
        console.log("Captcha/challenge detected! Solve it in the browser window...");
        // Wait up to 120s for user to solve captcha
        for (let i = 0; i < 120; i++) {
          await delay(1000);
          const currentUrl = page.url();
          if (!currentUrl.includes('challenge') && !currentUrl.includes('recaptcha') && !currentUrl.includes('auth_platform') && !currentUrl.includes('login')) {
            console.log("Challenge solved!");
            break;
          }
        }
      }

      // Verify login by checking for feed elements or redirect
      await delay(3000);
      const stillOnLogin = await page.evaluate(() => !!document.querySelector('input[name="email"]'));
      if (stillOnLogin) {
        return "Instagram login failed. Check credentials or solve captcha manually.";
      }

      await saveCookies(page);
      console.log("Login cookies saved.");
    }
    // Navigate directly to create/select (upload page)
    await page.goto("https://www.instagram.com/create/select/", { waitUntil: "networkidle2", timeout: 20000 }).catch(() => {});
    await delay(3000);

    // Upload image to file input
    const fileInput = await page.waitForSelector('input[type="file"]', { timeout: 15000 }).catch(() => null);
    if (!fileInput) {
      await browser.close();
      return "Instagram: Could not find file upload input.";
    }
    await fileInput.uploadFile(tmpPath);
    console.log("Image uploaded to Instagram");
    await delay(4000);

    // Click "Next" button
    await page.evaluate(() => {
      for (const b of document.querySelectorAll('button')) {
        if (b.textContent.trim().toLowerCase() === 'next') { b.click(); return; }
      }
    });
    console.log("Clicked Next");
    await delay(4000);

    // Type caption in the textarea (on /create/details/)
    await page.evaluate(() => {
      for (const t of document.querySelectorAll('textarea')) {
        if (t.placeholder?.toLowerCase().includes('write') || t.placeholder?.toLowerCase().includes('caption')) {
          t.focus();
          t.click();
          return;
        }
      }
    });
    await delay(800);
    await page.keyboard.type(caption, { delay: 12 });
    await delay(1000);

    // Click "Share" button
    await page.evaluate(() => {
      for (const b of document.querySelectorAll('button')) {
        if (b.textContent.trim().toLowerCase() === 'share') { b.click(); return; }
      }
    });
    console.log("Clicked Share");
    await delay(8000);

    await browser.close();
    try { fs.unlinkSync(tmpPath); } catch(e) {}

    return JSON.stringify({ success: true, message: "Post published successfully to Instagram!" });
  } catch (error) {
    if (browser) try { await browser.close(); } catch(e) {}
    return `Instagram post failed: ${error.message}`;
  }
}

export { getInstagramRecentMedia as getInstagramPosts };
