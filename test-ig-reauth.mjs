import puppeteer from "puppeteer-core";
import dotenv from 'dotenv';
dotenv.config({ override: true });
import fetch from 'node-fetch';
import fs from 'fs';

const CHROME_PATH = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const SESSION_DIR = "C:/Users/prarh/.brahmand-ig-session";
function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

// Clean old profile 
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
  console.log("Captcha! Solve it in browser window...");
  for (let i = 0; i < 120; i++) {
    await delay(1000);
    url = page.url();
    if (!url.includes('challenge') && !url.includes('recaptcha') && !url.includes('auth_platform') && !url.includes('login')) {
      console.log("Captcha solved!");
      break;
    }
  }
}
await delay(3000);

// Save cookies
const cookies = await page.cookies();
fs.writeFileSync(SESSION_DIR + "/cookies.json", JSON.stringify(cookies, null, 2));
console.log("✅ Cookies saved:", cookies.length, "- has sessionid:", cookies.some(c => c.name === 'sessionid'));

// Upload via browser fetch
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
  const upText = await up.text();
  let upJson;
  try { upJson = JSON.parse(upText); } catch(e) { return { error: 'upload_parse', raw: upText.substring(0, 100) }; }
  if (!upJson.upload_id) return { error: 'upload_fail', json: upJson };

  const csrf = (document.cookie.match(/csrftoken=([^;]+)/) || [])[1] || '';
  const cfg = await fetch('https://www.instagram.com/api/v1/media/configure/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-CSRFToken': csrf },
    body: new URLSearchParams({ upload_id: upJson.upload_id, caption: '🙏 Test from Brahmand AI! 🚀' }),
    credentials: 'include',
  });
  const cfgText = await cfg.text();
  let cfgJson;
  try { cfgJson = JSON.parse(cfgText); } catch(e) { cfgJson = { error: 'parse', raw: cfgText.substring(0, 100) }; }
  
  return { status: 'done', url: cfgJson.media?.code ? ('https://instagram.com/p/' + cfgJson.media.code) : 'unknown', upload: upJson, config: cfgJson };
}, { b64, nm, uid });

console.log("Result:", JSON.stringify(res, null, 2));
await browser.close();
