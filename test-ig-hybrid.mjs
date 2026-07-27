import dotenv from 'dotenv';
dotenv.config({ override: true });
import { IgApiClient } from 'instagram-private-api';
import puppeteer from "puppeteer-core";
import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';

const CHROME_PATH = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const SESSION_DIR = "C:/Users/prarh/.brahmand-ig-session";
function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

// Step 1: Login via private API (works)
const ig = new IgApiClient();
ig.state.generateDevice(process.env.IG_USERNAME);
await ig.simulate.preLoginFlow();
await ig.account.login(process.env.IG_USERNAME, process.env.IG_PASSWORD);
console.log("✅ Private API logged in");

// Step 2: Upload image via browser (bypasses 412 error)
try { fs.rmSync(SESSION_DIR + '/profile', { recursive: true, force: true }); } catch(e) {}
const browser = await puppeteer.launch({
  executablePath: CHROME_PATH,
  headless: false,
  args: ["--no-sandbox"],
});
const page = await browser.newPage();
await page.setViewport({ width: 1366, height: 768 });

await page.goto("https://www.instagram.com/accounts/login/", { waitUntil: "networkidle2", timeout: 30000 });
await delay(2000);
await page.waitForSelector('input[name="email"]', { timeout: 20000 });
await page.type('input[name="email"]', process.env.IG_USERNAME, { delay: 40 });
await page.type('input[name="pass"]', process.env.IG_PASSWORD, { delay: 40 });
await page.click('div[aria-label="Log In"]');
await delay(3000);

let url = page.url();
if (url.includes('challenge') || url.includes('recaptcha') || url.includes('auth_platform')) {
  console.log("Captcha! Solve it in the browser...");
  for (let i = 0; i < 120; i++) {
    await delay(1000); url = page.url();
    if (!url.includes('challenge') && !url.includes('recaptcha') && !url.includes('auth_platform') && !url.includes('login')) break;
  }
}
await delay(3000);

const cookies = await page.cookies();
fs.writeFileSync(SESSION_DIR + "/cookies.json", JSON.stringify(cookies, null, 2));

// Step 3: Upload via browser
const img = await fetch('https://picsum.photos/800/800?r=' + Date.now());
const buf = Buffer.from(await img.arrayBuffer());
const b64 = buf.toString('base64');
const uid = String(Date.now());
const nm = uid + '_0_' + Math.floor(Math.random() * 9000000000 + 1000000000);

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
  return await up.json();
}, { b64, nm, uid });
console.log("Upload result:", uploadResult);
await browser.close();

if (!uploadResult.upload_id) {
  console.log("Upload failed");
  process.exit(1);
}

// Step 4: Configure via Private API (uses correct signing)
try {
  const result = await ig.media.configure({
    upload_id: uploadResult.upload_id,
    width: 800,
    height: 800,
    caption: '🙏 Test from Brahmand AI - Hybrid approach! 🚀',
  });
  console.log("✅ POSTED:", 'https://instagram.com/p/' + result.media.code);
} catch (e) {
  console.error('❌ Configure failed:', e.name, '-', e.message?.substring(0, 200));
}
