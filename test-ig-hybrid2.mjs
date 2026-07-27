import dotenv from 'dotenv';
dotenv.config({ override: true });
import { IgApiClient } from 'instagram-private-api';
import puppeteer from "puppeteer-core";
import fetch from 'node-fetch';

const CHROME_PATH = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const SESSION_DIR = "C:/Users/prarh/.brahmand-ig-session";
function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

// Private API login
const ig = new IgApiClient();
ig.state.generateDevice(process.env.IG_USERNAME);
await ig.simulate.preLoginFlow();
await ig.account.login(process.env.IG_USERNAME, process.env.IG_PASSWORD);
console.log("✅ Private API logged in");

// Browser login - same session for upload
try { 
  const fs = await import('fs');
  fs.rmSync(SESSION_DIR + '/profile', { recursive: true, force: true }); 
} catch(e) {}

const browser = await puppeteer.launch({
  executablePath: CHROME_PATH,
  headless: false,
  args: ["--no-sandbox"],
});
const page = await browser.newPage();
await page.setViewport({ width: 1366, height: 768 });

// Go to login, authenticate
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

// Navigate to feed page to ensure proper session
await page.goto("https://www.instagram.com/", { waitUntil: "networkidle2", timeout: 30000 });
await delay(3000);

// Try changing the fetch request to use page.evaluate with fetch that includes credentials
const img = await fetch('https://picsum.photos/800/800?r=' + Date.now());
const buf = Buffer.from(await img.arrayBuffer());
const b64 = buf.toString('base64');
const uid = String(Date.now());
const nm = uid + '_0_' + Math.floor(Math.random() * 9000000000 + 1000000000);

// Execute in the same page (already logged in, on instagram.com)
const uplResult = await page.evaluate(async ({ b64, nm, uid }) => {
  const s = atob(b64), b = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i);

  // Use XMLHttpRequest instead of fetch - more likely to send cookies properly
  return await new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', 'https://www.instagram.com/rupload_igphoto/' + nm, true);
    xhr.setRequestHeader('X-Entity-Type', 'image/jpeg');
    xhr.setRequestHeader('X-Entity-Name', nm);
    xhr.setRequestHeader('X-Entity-Length', b.byteLength);
    xhr.setRequestHeader('Content-Type', 'application/octet-stream');
    xhr.setRequestHeader('Offset', '0');
    xhr.setRequestHeader('X-Instagram-Rupload-Params', JSON.stringify({
      retry_context: JSON.stringify({ a:0, b:0, c:0 }),
      media_type: '1',
      upload_id: uid,
      xsharing_user_ids: '[]',
      image_compression: JSON.stringify({ lib_name: 'moz', lib_version: '3.1.m', quality: '80' }),
    }));
    xhr.withCredentials = true;
    xhr.onload = () => resolve({ status: xhr.status, text: xhr.responseText?.substring(0, 200) });
    xhr.onerror = () => resolve({ error: xhr.statusText });
    // Convert Uint8Array to ArrayBuffer for XHR
    xhr.send(b.buffer);
  });
}, { b64, nm, uid });
console.log("Upload result:", uplResult);

if (uplResult.status === 200) {
  // Parse upload_id and configure via private API
  let upJson;
  try { upJson = JSON.parse(uplResult.text); } catch(e) {}
  
  if (upJson?.upload_id) {
    console.log("✅ Upload success! Configuring via private API...");
    try {
      const result = await ig.media.configure({
        upload_id: upJson.upload_id,
        width: 800,
        height: 800,
        caption: '🙏 Test from Brahmand AI - Hybrid approach 2.0! 🚀',
      });
      console.log("✅ POSTED!", 'https://instagram.com/p/' + result.media.code);
    } catch (e) {
      console.error('❌ Configure failed:', e.message?.substring(0, 200));
    }
  }
}

await browser.close();
