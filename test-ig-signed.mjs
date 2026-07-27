import dotenv from 'dotenv';
dotenv.config({ override: true });
import { IgApiClient } from 'instagram-private-api';
import puppeteer from "puppeteer-core";
import fetch from 'node-fetch';
import crypto from 'crypto';
import fs from 'fs';

const CHROME_PATH = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const SESSION_DIR = "C:/Users/prarh/.brahmand-ig-session";
function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

// Get signature key from private API
const ig = new IgApiClient();
ig.state.generateDevice(process.env.IG_USERNAME);
await ig.simulate.preLoginFlow();
await ig.account.login(process.env.IG_USERNAME, process.env.IG_PASSWORD);
console.log("✅ Private API logged in");
const sigKey = ig.state.signatureKey;
const sigVersion = ig.state.signatureVersion;
console.log("sigKey:", sigKey?.substring(0, 20));
console.log("sigVersion:", sigVersion);

// Browser login
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
  console.log("Captcha! Solve it...");
  for (let i = 0; i < 120; i++) { await delay(1000); url = page.url(); if (!url.includes('challenge') && !url.includes('recaptcha') && !url.includes('auth_platform') && !url.includes('login')) break; }
}
await delay(3000);
await page.goto("https://www.instagram.com/", { waitUntil: "networkidle2", timeout: 30000 });
await delay(3000);

// Upload image
const img = await fetch('https://picsum.photos/800/800?r=' + Date.now());
const buf = Buffer.from(await img.arrayBuffer());
const b64 = buf.toString('base64');
const uid = String(Date.now());
const nm = uid + '_0_' + Math.floor(Math.random() * 9000000000 + 1000000000);

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
  const j = await r.json();
  return j.upload_id;
}, { b64, nm, uid });

if (!upRes) { console.log("Upload failed"); await browser.close(); process.exit(); }
console.log("✅ Upload done, ID:", upRes);

// Configure with signed body via browser
// We pass the sigKey and sigVersion to the browser context
const cfgRes = await page.evaluate(async ({ uid, sigKey, sigVersion }) => {
  // HMAC-SHA256 signature
  async function hmacSha256(key, data) {
    const enc = new TextEncoder();
    const keyData = enc.encode(key);
    const msgData = enc.encode(data);
    const cryptoKey = await crypto.subtle.importKey('raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const sig = await crypto.subtle.sign('HMAC', cryptoKey, msgData);
    return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  const payload = JSON.stringify({
    upload_id: uid,
    caption: '🚀 Test from Brahmand AI - Signed!',
    source_type: '4',
    device_id: 'android-' + Math.random().toString(36).substring(2, 15),
    _csrftoken: (document.cookie.match(/csrftoken=([^;]+)/) || [])[1] || '',
    _uuid: crypto.randomUUID(),
  });

  const signature = await hmacSha256(sigKey, payload);
  const formData = new URLSearchParams();
  formData.append('ig_sig_key_version', sigVersion);
  formData.append('signed_body', signature + '.' + payload);

  const r = await fetch('https://www.instagram.com/api/v1/media/configure/', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'X-CSRFToken': (document.cookie.match(/csrftoken=([^;]+)/) || [])[1] || '',
      'X-Requested-With': 'XMLHttpRequest',
    },
    body: formData,
    credentials: 'include',
  });
  const text = await r.text();
  const ct = r.headers.get('content-type') || '';
  return { status: r.status, ct, text: text.substring(0, 500) };
}, { uid: upRes, sigKey, sigVersion });

console.log("Configure:", JSON.stringify(cfgRes));

if (cfgRes.status === 200 && cfgRes.ct?.includes('json')) {
  try { const j = JSON.parse(cfgRes.text); console.log("✅ POSTED!", j.media?.code || JSON.stringify(j)); } catch(e) {}
}

await browser.close();
