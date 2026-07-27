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

const cookies = JSON.parse(fs.readFileSync(SESSION_DIR + "/cookies.json", "utf8"));
await page.setCookie(...cookies);

await page.goto("https://www.instagram.com/", { waitUntil: "networkidle2", timeout: 30000 });
await new Promise(r => setTimeout(r, 5000));

// Option A: Click the "New post" link
console.log("Option A: Clicking 'New post' link...");
const clicked = await page.evaluate(() => {
  const links = document.querySelectorAll('a');
  for (const a of links) {
    if (a.textContent.includes('New post')) {
      a.click();
      return true;
    }
  }
  return false;
});
console.log("Clicked link:", clicked);
await new Promise(r => setTimeout(r, 5000));
console.log("URL after click:", page.url());
await page.screenshot({ path: "debug-after-click.png" });

// Check for file input
const hasInput = await page.evaluate(() => !!document.querySelector('input[type="file"]'));
console.log("Has file input:", hasInput);

// Check for any visible dialog/modal
const dialogs = await page.evaluate(() => {
  return Array.from(document.querySelectorAll('[role="dialog"], [role="presentation"]')).map(d => ({
    role: d.getAttribute('role'),
    text: d.textContent?.substring(0, 100),
  }));
});
console.log("Dialogs:", JSON.stringify(dialogs));

await browser.close();
