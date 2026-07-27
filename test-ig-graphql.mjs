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
  args: ["--no-sandbox", "--disable-web-security"],
});
const page = await browser.newPage();
await page.setViewport({ width: 1366, height: 768 });

// Capture the actual network request when creating a post manually
const requests = [];
await page.setRequestInterception(true);
page.on('request', req => {
  if (req.url().includes('configure') || req.url().includes('create') || req.url().includes('upload')) {
    requests.push({
      url: req.url().substring(0, 200),
      method: req.method(),
      headers: JSON.stringify(req.headers()).substring(0, 300),
      postData: req.postData()?.substring(0, 300),
    });
  }
  req.continue();
});

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
  for (let i = 0; i < 120; i++) { await delay(1000); url = page.url(); if (!url.includes('challenge') && !url.includes('recaptcha') && !url.includes('auth_platform') && !url.includes('login')) break; }
}
await delay(3000);

await page.goto("https://www.instagram.com/", { waitUntil: "networkidle2", timeout: 30000 });
await delay(3000);

console.log("Now manually create a post in the browser window.");
console.log("I'll wait for you to complete the post creation...");
console.log("Press any key here after you click 'Share' in the browser...");
await new Promise(r => setTimeout(r, 60000));

console.log("Intercepted requests during post creation:");
requests.forEach((r, i) => {
  console.log(`\n${i+1}. ${r.method} ${r.url}`);
  if (r.postData) console.log('   POST:', r.postData.substring(0, 200));
});

await browser.close();
