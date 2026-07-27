import puppeteer from "puppeteer-core";
import dotenv from 'dotenv';
dotenv.config({ override: true });

const CHROME_PATH = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const SESSION_DIR = "C:/Users/prarh/.brahmand-ig-session";

const browser = await puppeteer.launch({
  executablePath: CHROME_PATH,
  headless: false,
  args: ["--no-sandbox", `--user-data-dir=${SESSION_DIR}/profile`],
});

const page = await browser.newPage();
await page.setViewport({ width: 1366, height: 768 });

// Load saved cookies
const fs = await import('fs');
const cookiePath = SESSION_DIR + "/cookies.json";
if (fs.existsSync(cookiePath)) {
  const cookies = JSON.parse(fs.readFileSync(cookiePath, "utf8"));
  await page.setCookie(...cookies);
  console.log("Loaded", cookies.length, "cookies");
}

await page.goto("https://www.instagram.com/pratham_patel_18/", { waitUntil: "networkidle2", timeout: 30000 });
await new Promise(r => setTimeout(r, 3000));

// Get posts visible on profile
const posts = await page.evaluate(() => {
  const links = document.querySelectorAll('a[href*="/p/"]');
  return Array.from(links).slice(0, 6).map(a => ({
    href: a.href,
    img: a.querySelector('img')?.alt?.substring(0, 100) || '',
  }));
});
console.log("Posts found:", posts.length);
posts.forEach((p, i) => console.log(i+1 + ":", p.href, "|", p.img?.substring(0, 60)));

await page.screenshot({ path: "debug-profile.png" });
console.log("Screenshot saved");

await browser.close();
