import puppeteer from 'puppeteer-core';
import dotenv from 'dotenv';
dotenv.config();

const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: false,
  args: ['--no-sandbox'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1366, height: 768 });

await page.goto('https://www.instagram.com/accounts/login/', { waitUntil: 'networkidle2', timeout: 30000 });
await new Promise(r => setTimeout(r, 2000));
await page.type('input[name="email"]', process.env.IG_USERNAME, { delay: 30 });
await page.type('input[name="pass"]', process.env.IG_PASSWORD, { delay: 30 });
await page.click('div[aria-label="Log In"]');
await new Promise(r => setTimeout(r, 3000));
if (page.url().includes('challenge') || page.url().includes('recaptcha')) {
  console.log('Captcha...');
  for (let i = 0; i < 120; i++) {
    await new Promise(r => setTimeout(r, 1000));
    if (!page.url().includes('challenge') && !page.url().includes('recaptcha') && !page.url().includes('login')) break;
  }
}
await new Promise(r => setTimeout(r, 3000));

// Go to profile and get exact post count
await page.goto('https://www.instagram.com/pratham_patel_18/', { waitUntil: 'networkidle2', timeout: 30000 });
await new Promise(r => setTimeout(r, 4000));

// Get post count from the header (the number before "posts")
const postCount = await page.evaluate(() => {
  const spans = document.querySelectorAll('span');
  for (const s of spans) {
    const text = s.textContent.trim();
    if (text.match(/^\d+ posts?$/)) return text;
  }
  const headerText = document.querySelector('header')?.innerText || '';
  const m = headerText.match(/(\d+)\s*posts?/);
  return m ? m[0] : 'not found';
});
console.log('Post count:', postCount);

// Scroll to find ALL loaded posts
await page.evaluate(() => window.scrollTo(0, 800));
await new Promise(r => setTimeout(r, 2000));

// Check what the latest post is
const latest = await page.evaluate(() => {
  const links = document.querySelectorAll('a[href*="/p/"]');
  if (links.length === 0) return 'none';
  const first = links[0];
  const img = first.querySelector('img');
  return {
    href: first.href,
    alt: img?.alt?.substring(0, 150) || 'no alt'
  };
});
console.log('Latest post:', JSON.stringify(latest));

await browser.close();
