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

// Go to feed
await page.goto("https://www.instagram.com/", { waitUntil: "networkidle2", timeout: 30000 });
await delay(3000);

const img = await fetch('https://picsum.photos/800/800?r=' + Date.now());
const buf = Buffer.from(await img.arrayBuffer());
const b64 = buf.toString('base64');
const uid = String(Date.now());
const nm = uid + '_0_' + Math.floor(Math.random() * 9000000000 + 1000000000);

// BOTH upload + configure in same browser session
const result = await page.evaluate(async ({ b64, nm, uid }) => {
  const s = atob(b64), b = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i);

  const api = async (method, url, data) => {
    return new Promise(resolve => {
      const xhr = new XMLHttpRequest();
      xhr.open(method, url, true);
      xhr.withCredentials = true;
      if (data instanceof FormData || data instanceof URLSearchParams) {
        // Don't set Content-Type for FormData
      } else if (typeof data === 'object') {
        xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
      }
      xhr.onload = () => resolve({ status: xhr.status, text: xhr.responseText });
      xhr.onerror = () => resolve({ error: xhr.statusText });
      xhr.send(data);
    });
  };

  // Step 1: Upload
  const rupload = JSON.stringify({
    retry_context: JSON.stringify({ a:0, b:0, c:0 }),
    media_type: '1',
    upload_id: uid,
    xsharing_user_ids: '[]',
    image_compression: JSON.stringify({ lib_name: 'moz', lib_version: '3.1.m', quality: '80' }),
  });

  const up = await api('POST', 'https://www.instagram.com/rupload_igphoto/' + nm, b.buffer);
  // Manually set headers that can't be set via XHR normally
  // We need to send customized headers - let's use fetch with proper mode
  return { step: 'needs_upload' };
}, { b64, nm, uid });

// Fetch with proper headers (browser context preserves cookies)
const uploadResult = await page.evaluate(async ({ b64, nm, uid }) => {
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
  try { return await up.json(); } catch(e) { return { error: 'json_parse_fail', text: (await up.text()).substring(0, 100) }; }
}, { b64, nm, uid });
console.log("Upload:", JSON.stringify(uploadResult));

if (uploadResult.upload_id) {
  // Step 2: Configure - use fetch with form data
  const csrf = await page.evaluate(() => {
    return (document.cookie.match(/csrftoken=([^;]+)/) || [])[1] || '';
  });

  const cfgResult = await page.evaluate(async ({ uid, csrf }) => {
    const params = new URLSearchParams();
    params.append('upload_id', uid);
    params.append('caption', '🙏 Test from Brahmand AI - Full browser approach! 🚀');
    params.append('source_type', '4');

    const cfg = await fetch('https://www.instagram.com/api/v1/media/configure/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-CSRFToken': csrf,
        'X-Requested-With': 'XMLHttpRequest',
        'Referer': 'https://www.instagram.com/create/detail/',
      },
      body: params,
      credentials: 'include',
    });
    const text = await cfg.text();
    try { return JSON.parse(text); } catch(e) { return { error: 'parse', raw: text.substring(0, 200), status: cfg.status }; }
  }, { uid: uploadResult.upload_id, csrf });
  console.log("Configure:", JSON.stringify(cfgResult));

  if (cfgResult.media?.code) {
    console.log("✅ POSTED!", 'https://instagram.com/p/' + cfgResult.media.code);
  }
}

await browser.close();
