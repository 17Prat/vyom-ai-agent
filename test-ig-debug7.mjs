import puppeteer from "puppeteer-core";
import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import os from 'os';

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
await delay(4000);

// Try keyboard shortcut: Ctrl+N (Cmd+N on Mac) - no standard shortcut for new post
// Try pressing 'C' key for create
await page.keyboard.press('KeyC');
await delay(2000);
const dialog1 = await page.evaluate(() => !!document.querySelector('[role="dialog"]'));
console.log("After C key, has dialog:", dialog1);

// Navigate to the create URL directly (this is client-side routed)
await page.goto("https://www.instagram.com/create/", { waitUntil: "networkidle2", timeout: 15000 }).catch(() => {});
await delay(3000);
console.log("URL after /create/:", page.url());
await page.screenshot({ path: "debug-create.png" });

// Try URL with different paths
await page.goto("https://www.instagram.com/create-select/", { waitUntil: "networkidle2", timeout: 15000 }).catch(() => {});
await delay(2000);
console.log("URL after /create-select/:", page.url());

// Try clicking the + icon in the story area
const storyBtn = await page.evaluate(() => {
  const btns = document.querySelectorAll('button, div[role="button"]');
  for (const b of btns) {
    if (b.textContent?.includes('Create') || b.getAttribute('aria-label')?.includes('Create story')) {
      b.click(); return 'story';
    }
  }
  return 'none';
});
console.log("Story button clicked:", storyBtn);
await delay(3000);
console.log("Has dialog:", await page.evaluate(() => !!document.querySelector('[role="dialog"]')));

await browser.close();
