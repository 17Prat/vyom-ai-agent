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

// Step 1: Click New post
const clicked = await page.evaluate(() => {
  for (const a of document.querySelectorAll('a')) {
    if (a.textContent.includes('New post')) { a.click(); return true; }
  }
  return false;
});
console.log("New post clicked:", clicked);
await delay(5000);
await page.screenshot({ path: "s1-dialog.png" });

// Check dialog state
const dialogInfo = await page.evaluate(() => {
  const dialogs = document.querySelectorAll('[role="dialog"]');
  return Array.from(dialogs).map(d => ({
    text: d.textContent?.substring(0, 150),
  }));
});
console.log("Dialogs:", JSON.stringify(dialogInfo));

// Check file input
let fileInput = await page.$('input[type="file"]');
console.log("File input immediately:", !!fileInput);

// If not found, wait more
if (!fileInput) {
  console.log("Waiting for file input...");
  fileInput = await page.waitForSelector('input[type="file"]', { timeout: 15000 }).catch(() => null);
  console.log("File input after wait:", !!fileInput);
}

if (fileInput) {
  // Step 2: Upload file
  const resp = await fetch('https://picsum.photos/800/800?r=' + Date.now());
  const buf = Buffer.from(await resp.arrayBuffer());
  const tmpPath = path.join(os.tmpdir(), 'ig-test-' + Date.now() + '.jpg');
  fs.writeFileSync(tmpPath, buf);
  console.log("Uploading file...");
  await fileInput.uploadFile(tmpPath);
  await delay(5000);
  await page.screenshot({ path: "s2-after-upload.png" });
  console.log("File uploaded");
} else {
  console.log("NO FILE INPUT");
  await browser.close();
  process.exit();
}

// Step 3: Check for "Next" button
const buttons1 = await page.evaluate(() => {
  return Array.from(document.querySelectorAll('button, div[role="button"]')).map(b => ({
    text: b.textContent?.trim()?.substring(0, 30),
    aria: b.getAttribute('aria-label') || '',
  })).filter(b => b.text || b.aria);
});
console.log("Buttons after upload:", JSON.stringify(buttons1, null, 2));

// Click Next
await page.evaluate(() => {
  for (const b of document.querySelectorAll('button, div[role="button"]')) {
    if (b.textContent?.toLowerCase().includes('next')) { b.click(); return; }
  }
});
await delay(3000);
await page.screenshot({ path: "s3-after-next1.png" });
console.log("After first Next URL:", page.url());

// Step 4: Check buttons again
const buttons2 = await page.evaluate(() => {
  return Array.from(document.querySelectorAll('button, div[role="button"]')).map(b => ({
    text: b.textContent?.trim()?.substring(0, 30),
    aria: b.getAttribute('aria-label') || '',
  })).filter(b => b.text || b.aria);
});
console.log("Buttons after next1:", JSON.stringify(buttons2, null, 2));

// Click Next again (for filters)
await page.evaluate(() => {
  for (const b of document.querySelectorAll('button, div[role="button"]')) {
    if (b.textContent?.toLowerCase().includes('next')) { b.click(); return; }
  }
});
await delay(3000);
await page.screenshot({ path: "s4-after-next2.png" });

// Step 5: Check for textbox (caption)
const textboxes = await page.evaluate(() => {
  return Array.from(document.querySelectorAll('div[role="textbox"]')).map(t => ({
    text: t.textContent?.substring(0, 30),
    placeholder: t.getAttribute('aria-label') || '',
  }));
});
console.log("Textboxes:", JSON.stringify(textboxes));

const buttons3 = await page.evaluate(() => {
  return Array.from(document.querySelectorAll('button, div[role="button"]')).map(b => ({
    text: b.textContent?.trim()?.substring(0, 40),
    aria: b.getAttribute('aria-label') || '',
  })).filter(b => b.text || b.aria);
});
console.log("Buttons after next2:", JSON.stringify(buttons3, null, 2));

// Type caption
const tb = await page.$('div[role="textbox"]');
if (tb) {
  await tb.click();
  await delay(500);
  await page.keyboard.type("🙏 Test post - Brahmand AI #automation", { delay: 20 });
  console.log("Caption typed");
}
await delay(1000);

// Click Share
await page.evaluate(() => {
  for (const b of document.querySelectorAll('button, div[role="button"]')) {
    const t = b.textContent?.toLowerCase() || '';
    if (t.includes('share')) { b.click(); console.log('Share clicked!'); return; }
  }
});
await delay(5000);
await page.screenshot({ path: "s5-after-share.png" });
console.log("Done!");

await browser.close();
try { fs.unlinkSync(tmpPath); } catch(e) {}
