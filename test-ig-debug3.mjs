import puppeteer from "puppeteer-core";
import dotenv from 'dotenv';
dotenv.config({ override: true });
import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import os from 'os';

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
if (fs.existsSync(cookiePath)) {
  const cookies = JSON.parse(fs.readFileSync(cookiePath, "utf8"));
  await page.setCookie(...cookies);
}

// Step 1: Go to Instagram
await page.goto("https://www.instagram.com/", { waitUntil: "networkidle2", timeout: 30000 });
await new Promise(r => setTimeout(r, 3000));
console.log("Step 1 - Homepage URL:", page.url());
await page.screenshot({ path: "debug1-home.png" });
console.log("  Screenshot: debug1-home.png");

// Step 2: Navigate to create/select
await page.goto("https://www.instagram.com/create/select/", { waitUntil: "networkidle2", timeout: 20000 }).catch(e => console.log("  Nav error:", e.message?.substring(0, 50)));
await new Promise(r => setTimeout(r, 3000));
console.log("Step 2 - Create/select URL:", page.url());
await page.screenshot({ path: "debug2-create-select.png" });
console.log("  Screenshot: debug2-create-select.png");

// Step 3: Check file input
const hasFileInput = await page.evaluate(() => !!document.querySelector('input[type="file"]'));
console.log("Step 3 - Has file input:", hasFileInput);

// Check what's on the page
const pageText = await page.evaluate(() => document.body?.innerText?.substring(0, 500));
console.log("Page text:", pageText);

await browser.close();
