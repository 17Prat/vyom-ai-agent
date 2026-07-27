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

// Go to profile and scroll to load more posts
await page.goto('https://www.instagram.com/pratham_patel_18/', { waitUntil: 'networkidle2', timeout: 30000 });
await new Promise(r => setTimeout(r, 5000));

// Scroll multiple times to load all posts
let prevCount = 0;
for (let s = 0; s < 8; s++) {
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await new Promise(r => setTimeout(r, 2000));
  const count = await page.evaluate(() => document.querySelectorAll('a[href*="/p/"]').length);
  console.log('Scroll ' + (s+1) + ': ' + count + ' posts visible');
  if (count === prevCount && s > 2) break;
  prevCount = count;
}

// Get ALL post links with alt text
const allPosts = await page.evaluate(() => {
  const links = document.querySelectorAll('a[href*="/p/"]');
  return Array.from(links).map(a => ({
    href: a.href,
    alt: a.querySelector('img')?.alt?.substring(0, 200) || ''
  }));
});

console.log('\nAll posts on profile (' + allPosts.length + ' total):');
allPosts.forEach((p, i) => {
  const code = p.href.split('/p/')[1]?.split('/')[0] || '?';
  console.log((i+1) + '. ' + code + ' - ' + p.alt);
});

await browser.close();
