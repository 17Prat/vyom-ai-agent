import puppeteer from "puppeteer-core";
import fs from 'fs';

const CHROME_PATH = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const SESSION_DIR = "C:/Users/prarh/.brahmand-ig-session";

const browser = await puppeteer.launch({
  executablePath: CHROME_PATH,
  headless: true,
  args: ["--no-sandbox", "--headless=new"],
});
const page = await browser.newPage();

const cookiePath = SESSION_DIR + "/cookies.json";
const cookies = JSON.parse(fs.readFileSync(cookiePath, "utf8"));
await page.setCookie(...cookies);

await page.goto("https://www.instagram.com/pratham_patel_18/", { waitUntil: "networkidle2", timeout: 30000 });
await new Promise(r => setTimeout(r, 3000));

const posts = await page.evaluate(() => {
  const links = document.querySelectorAll('a[href*="/p/"]');
  return Array.from(links).slice(0, 5).map(a => ({
    href: a.href,
    img: a.querySelector('img')?.alt?.substring(0, 80) || '',
  }));
});
console.log("Posts found:", posts.length);
posts.forEach((p, i) => console.log((i+1) + ":", p.href, "|", p.img));
await browser.close();
