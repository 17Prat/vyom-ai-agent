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

await page.goto("https://www.instagram.com/", { waitUntil: "networkidle2", timeout: 30000 });
await delay(3000);

const img = await fetch('https://picsum.photos/800/800?r=' + Date.now());
const buf = Buffer.from(await img.arrayBuffer());
const b64 = buf.toString('base64');
const uid = String(Date.now());
const nm = uid + '_0_' + Math.floor(Math.random() * 9000000000 + 1000000000);

// Upload
const upRes = await page.evaluate(async ({ b64, nm, uid }) => {
  const s = atob(b64), b = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i);
  const r = await fetch('https://www.instagram.com/rupload_igphoto/' + nm, {
    method: 'POST',
    headers: {
      'X-Entity-Type': 'image/jpeg',
      'X-Entity-Name': nm,
      'X-Entity-Length': b.byteLength,
      'Content-Type': 'application/octet-stream',
      'Offset': '0',
      'X-Instagram-Rupload-Params': JSON.stringify({ retry_context: '{}', media_type: '1', upload_id: uid, xsharing_user_ids: '[]', image_compression: '{}' }),
    },
    body: b,
    credentials: 'include',
  });
  return { status: r.status, ct: r.headers.get('content-type'), text: (await r.text()).substring(0, 200) };
}, { b64, nm, uid });
console.log("Upload result:", JSON.stringify(upRes));

let uploadId = null;
try { const j = JSON.parse(upRes.text); uploadId = j.upload_id; } catch(e) {}
if (!uploadId) { console.log("Upload failed"); await browser.close(); process.exit(); }

// Configure - try different approaches
const cfgRes = await page.evaluate(async ({ uid }) => {
  const csrf = (document.cookie.match(/csrftoken=([^;]+)/) || [])[1] || '';
  const body = new URLSearchParams();
  body.append('upload_id', uid);
  body.append('caption', '🚀 Test from Brahmand AI!');

  // Approach 1: Simple fetch
  const r = await fetch('https://www.instagram.com/api/v1/media/configure/', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'X-CSRFToken': csrf,
    },
    body,
    credentials: 'include',
  });
  return { status: r.status, ct: r.headers.get('content-type'), text: (await r.text()).substring(0, 500) };
}, { uid: uploadId });
console.log("Configure result:", JSON.stringify(cfgRes));

if (cfgRes.status === 200 && cfgRes.ct?.includes('json')) {
  try { const j = JSON.parse(cfgRes.text); console.log("✅ POSTED!", j.media?.code || JSON.stringify(j)); } catch(e) {}
}

await browser.close();
