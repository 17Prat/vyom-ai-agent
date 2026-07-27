import puppeteer from "puppeteer-core";
import dotenv from 'dotenv';
dotenv.config({ override: true });
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
if (fs.existsSync(cookiePath)) {
  const cookies = JSON.parse(fs.readFileSync(cookiePath, "utf8"));
  await page.setCookie(...cookies);
  console.log("Loaded", cookies.length, "cookies");
}

await page.goto("https://www.instagram.com/", { waitUntil: "networkidle2", timeout: 30000 });
await new Promise(r => setTimeout(r, 3000));

console.log("URL:", page.url());

// Check login state
const hasLoginForm = await page.evaluate(() => !!document.querySelector('input[name="email"]'));
console.log("Has login form:", hasLoginForm);

if (!hasLoginForm) {
  // Go to create page
  await page.goto("https://www.instagram.com/create/select/", { waitUntil: "networkidle2", timeout: 20000 });
  await new Promise(r => setTimeout(r, 3000));
  console.log("create/select URL:", page.url());

  // Look for file input
  const hasFileInput = await page.evaluate(() => !!document.querySelector('input[type="file"]'));
  console.log("Has file input:", hasFileInput);

  // Look for all buttons
  const buttons = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('button, div[role="button"], a')).map(el => ({
      tag: el.tagName,
      text: el.textContent?.trim()?.substring(0, 40),
      href: el.getAttribute('href') || '',
      ariaLabel: el.getAttribute('aria-label') || '',
    })).filter(b => b.text || b.ariaLabel).slice(0, 20);
  });
  console.log("Buttons found:", JSON.stringify(buttons, null, 2));

  // Look for any "Create" or "New" buttons
  const createLinks = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('a[href*="create"], a[href*="select"]')).map(a => ({
      href: a.href,
      text: a.textContent?.trim(),
    }));
  });
  console.log("Create links:", JSON.stringify(createLinks));

  await page.screenshot({ path: "debug-create-page.png" });
  console.log("Screenshot saved");
}

await browser.close();
