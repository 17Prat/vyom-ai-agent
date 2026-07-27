import puppeteer from "puppeteer-core";
import fs from 'fs';

const CHROME_PATH = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const SESSION_DIR = "C:/Users/prarh/.brahmand-ig-session";

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

const browser = await puppeteer.launch({
  executablePath: CHROME_PATH,
  headless: false,
  args: ["--no-sandbox", `--user-data-dir=${SESSION_DIR}/profile`],
});
const page = await browser.newPage();
await page.setViewport({ width: 1366, height: 768 });

const cookies = JSON.parse(fs.readFileSync(SESSION_DIR + "/cookies.json", "utf8"));
await page.setCookie(...cookies);

await page.goto("https://www.instagram.com/", { waitUntil: "networkidle2", timeout: 30000 });
await delay(6000);

console.log("URL:", page.url());

// Get ALL visible text on the page (limited)
const bodyText = await page.evaluate(() => document.body?.innerText?.substring(0, 1000));
console.log("Body text:", bodyText);

// Check for any popup/dialog that might be covering the feed
const overlays = await page.evaluate(() => {
  const all = document.querySelectorAll('div[role="dialog"], div[role="presentation"], div[style*="fixed"], div[style*="absolute"]');
  return Array.from(all).slice(0, 5).map(el => ({
    role: el.getAttribute('role') || '',
    text: el.textContent?.trim()?.substring(0, 100),
    style: (el.getAttribute('style') || '').substring(0, 60),
    class: (el.className || '').substring(0, 40),
  }));
});
console.log("Overlays:", JSON.stringify(overlays, null, 2));

// Check for sidebar specifically
const sidebarLinks = await page.evaluate(() => {
  const sidebar = document.querySelector('div[style*="sidebar"]') || document.querySelector('nav') || document.querySelector('main');
  if (!sidebar) return 'No sidebar/main found';
  return Array.from(sidebar.querySelectorAll('a, svg[aria-label]')).slice(0, 15).map(el => ({
    tag: el.tagName,
    text: el.textContent?.trim()?.substring(0, 30),
    aria: el.getAttribute('aria-label') || '',
    href: el.getAttribute('href') || '',
  }));
});
console.log("Main elements:", JSON.stringify(sidebarLinks, null, 2));

// Try to click "Not now" if there's a save-login dialog
await page.evaluate(() => {
  const buttons = document.querySelectorAll('button, div[role="button"]');
  for (const b of buttons) {
    const t = b.textContent?.toLowerCase() || '';
    if (t.includes('not now') || t.includes('save info')) { b.click(); console.log('Clicked Not now'); return; }
  }
});
await delay(2000);

// Now try clicking New post
const clicked = await page.evaluate(() => {
  for (const a of document.querySelectorAll('a')) {
    if (a.textContent.includes('New post')) { a.click(); return true; }
  }
  return false;
});
console.log("New post clicked:", clicked);
await delay(5000);

const hasDialog = await page.evaluate(() => !!document.querySelector('[role="dialog"]'));
const hasInput = await page.evaluate(() => !!document.querySelector('input[type="file"]'));
console.log("Has dialog:", hasDialog, "| Has file input:", hasInput);

await page.screenshot({ path: "debug-final.png" });
await browser.close();
