import puppeteer from "puppeteer-core";
import dotenv from 'dotenv';
dotenv.config({ override: true });

const CHROME_PATH = "C:/Program Files/Google/Chrome/Application/chrome.exe";

const browser = await puppeteer.launch({
  executablePath: CHROME_PATH,
  headless: false,
  args: ["--no-sandbox"],
});
const page = await browser.newPage();
await page.setViewport({ width: 1366, height: 768 });
await page.goto("https://www.instagram.com/accounts/login/", { waitUntil: "networkidle2", timeout: 30000 });
await new Promise(r => setTimeout(r, 2000));

// Login
await page.type('input[name="email"]', process.env.IG_USERNAME, { delay: 30 });
await page.type('input[name="pass"]', process.env.IG_PASSWORD, { delay: 30 });
await page.click('div[aria-label="Log In"]');
await new Promise(r => setTimeout(r, 5000));

console.log("After login URL:", page.url());

// Check what's on the page after login
const elements = await page.evaluate(() => {
  const result = [];
  // Look for navigation/sidebar elements
  document.querySelectorAll("a, svg, span, div[role=button]").forEach(el => {
    const aria = el.getAttribute("aria-label") || "";
    const text = el.textContent?.trim()?.substring(0, 30) || "";
    const href = el.getAttribute("href") || "";
    if (aria || (text && text.length < 30)) {
      result.push({ tag: el.tagName, aria, text, href: href?.substring(0, 50) });
    }
  });
  return result.slice(0, 40);
});
console.log("Elements:", JSON.stringify(elements, null, 2));

await browser.close();
