import puppeteer from "puppeteer-core";
import fs from 'fs';

const CHROME_PATH = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const SESSION_DIR = "C:/Users/prarh/.brahmand-ig-session";

const browser = await puppeteer.launch({
  executablePath: CHROME_PATH,
  headless: false,
  args: ["--no-sandbox", `--user-data-dir=${SESSION_DIR}/profile`],
});
const page = await browser.newPage();
await page.setViewport({ width: 1366, height: 768 });

const cookiePath = SESSION_DIR + "/cookies.json";
const cookies = JSON.parse(fs.readFileSync(cookiePath, "utf8"));
await page.setCookie(...cookies);

await page.goto("https://www.instagram.com/", { waitUntil: "networkidle2", timeout: 30000 });
await new Promise(r => setTimeout(r, 5000));
console.log("URL:", page.url());

// Find the Create button (the + icon in the sidebar)
const createBtn = await page.evaluate(() => {
  const all = document.querySelectorAll('a, div[role="button"], svg, span');
  const results = [];
  for (const el of all) {
    const aria = el.getAttribute('aria-label') || '';
    const text = el.textContent?.trim() || '';
    const href = el.getAttribute('href') || '';
    const role = el.getAttribute('role') || '';
    if (aria.toLowerCase().includes('new') || aria.toLowerCase().includes('create') || text === '+' || text.includes('Create')) {
      results.push({ tag: el.tagName, aria, text: text.substring(0, 30), href: href.substring(0, 50), role });
    }
  }
  return results;
});
console.log("Create buttons:", JSON.stringify(createBtn, null, 2));

// Also look for sidebar links
const sidebarLinks = await page.evaluate(() => {
  const nav = document.querySelector('nav') || document.querySelector('[role="navigation"]');
  if (!nav) return 'No nav found';
  return Array.from(nav.querySelectorAll('a, div[role="button"]')).map(a => ({
    text: a.textContent?.trim()?.substring(0, 30),
    href: a.getAttribute('href') || '',
    aria: a.getAttribute('aria-label') || '',
  }));
});
console.log("Sidebar:", JSON.stringify(sidebarLinks, null, 2));

await page.screenshot({ path: "debug-feed.png" });
console.log("Screenshot saved");

await browser.close();
