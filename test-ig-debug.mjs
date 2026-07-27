import puppeteer from "puppeteer-core";

const CHROME_PATH = "C:/Program Files/Google/Chrome/Application/chrome.exe";

const browser = await puppeteer.launch({
  executablePath: CHROME_PATH,
  headless: false,
  args: ["--no-sandbox"],
});
const page = await browser.newPage();
await page.setViewport({ width: 1366, height: 768 });

await page.goto("https://www.instagram.com/accounts/login/", { waitUntil: "networkidle2", timeout: 30000 });
await new Promise(r => setTimeout(r, 3000));

// Screenshot to see what's on the page
await page.screenshot({ path: "debug-ig.png" });
console.log("Screenshot saved as debug-ig.png");

// Get all input elements on the page
const inputs = await page.evaluate(() => {
  return Array.from(document.querySelectorAll("input")).map(i => ({
    name: i.name,
    type: i.type,
    placeholder: i.placeholder,
    id: i.id,
  }));
});
console.log("Inputs found:", JSON.stringify(inputs));

// Get page HTML title
const title = await page.title();
console.log("Page title:", title);

// Check if we're on a challenge page
console.log("URL:", page.url());

await browser.close();
