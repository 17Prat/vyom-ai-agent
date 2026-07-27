import puppeteer from "puppeteer-core";
import dotenv from 'dotenv';
dotenv.config({ override: true });
import fetch from 'node-fetch';
import fs from 'fs';

const CHROME_PATH = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const SESSION_DIR = "C:/Users/prarh/.brahmand-ig-session";
function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

try { fs.rmSync(SESSION_DIR + '/profile', { recursive: true, force: true }); } catch(e) {}

const browser = await puppeteer.launch({
  executablePath: CHROME_PATH,
  headless: false,
  args: ["--no-sandbox"],
});
const page = await browser.newPage();
await page.setViewport({ width: 1366, height: 768 });

// Login
await page.goto("https://www.instagram.com/accounts/login/", { waitUntil: "networkidle2", timeout: 30000 });
await delay(2000);
await page.waitForSelector('input[name="email"]', { timeout: 20000 });
await page.type('input[name="email"]', process.env.IG_USERNAME, { delay: 40 });
await page.type('input[name="pass"]', process.env.IG_PASSWORD, { delay: 40 });
await page.click('div[aria-label="Log In"]');
await delay(3000);

let url = page.url();
if (url.includes('challenge') || url.includes('recaptcha') || url.includes('auth_platform')) {
  console.log("Captcha! Solve it...");
  for (let i = 0; i < 120; i++) {
    await delay(1000); url = page.url();
    if (!url.includes('challenge') && !url.includes('recaptcha') && !url.includes('auth_platform') && !url.includes('login')) break;
  }
}
await delay(3000);

const cookies = await page.cookies();
fs.writeFileSync(SESSION_DIR + "/cookies.json", JSON.stringify(cookies, null, 2));
console.log("✅ Cookies saved:", cookies.length);

// Upload
const img = await fetch('https://picsum.photos/800/800?r=' + Date.now());
const buf = Buffer.from(await img.arrayBuffer());
const b64 = buf.toString('base64');
const uid = String(Date.now());
const nm = uid + '_0_' + Math.floor(Math.random() * 9000000000 + 1000000000);

const res = await page.evaluate(async ({ b64, nm, uid }) => {
  const s = atob(b64), b = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i);

  const up = await fetch('https://www.instagram.com/rupload_igphoto/' + nm, {
    method: 'POST',
    headers: {
      'X-Entity-Type': 'image/jpeg',
      'X-Entity-Name': nm,
      'X-Entity-Length': b.byteLength,
      'Content-Type': 'application/octet-stream',
      'Offset': '0',
      'X-Instagram-Rupload-Params': JSON.stringify({
        retry_context: JSON.stringify({ a:0, b:0, c:0 }),
        media_type: '1',
        upload_id: uid,
        xsharing_user_ids: '[]',
        image_compression: JSON.stringify({ lib_name: 'moz', lib_version: '3.1.m', quality: '80' }),
      }),
    },
    body: b,
    credentials: 'include',
  });

  const result = { uploadStatus: up.status };
  try { result.upload = await up.json(); } catch(e) { result.upload = { error: 'parse' }; }

  // Get csrf from meta tag or cookie
  const csrf = (document.cookie.match(/csrftoken=([^;]+)/) || [])[1] || '';

  // Try configure with more headers and form data
  const cfg = await fetch('https://www.instagram.com/api/v1/media/configure/', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'X-CSRFToken': csrf,
      'X-Requested-With': 'XMLHttpRequest',
      'Referer': 'https://www.instagram.com/create/detail/',
      'Origin': 'https://www.instagram.com',
    },
    body: new URLSearchParams({
      upload_id: result.upload?.upload_id || uid,
      caption: '🙏 Test from Brahmand AI! 🚀',
      source_type: '4',
      device: '{"manufacturer":"Google","model":"Pixel 7","android_version":33,"android_release":"13"}',
      _csrftoken: csrf,
      _uuid: '00000000-0000-0000-0000-000000000000',
    }),
    credentials: 'include',
  });

  result.cfgStatus = cfg.status;
  result.cfgHeaders = {};
  for (const [k, v] of cfg.headers) result.cfgHeaders[k] = v;
  const cfgText = await cfg.text();
  result.cfgBody = cfgText.substring(0, 300);

  return result;
}, { b64, nm, uid });

console.log("Result:", JSON.stringify(res, null, 2));
await browser.close();
