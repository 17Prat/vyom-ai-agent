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

// Login
await page.goto('https://www.instagram.com/accounts/login/', { waitUntil: 'networkidle2', timeout: 30000 });
await new Promise(r => setTimeout(r, 2000));
await page.type('input[name="email"]', process.env.IG_USERNAME, { delay: 30 });
await page.type('input[name="pass"]', process.env.IG_PASSWORD, { delay: 30 });
await page.click('div[aria-label="Log In"]');
await new Promise(r => setTimeout(r, 3000));
if (page.url().includes('challenge') || page.url().includes('recaptcha')) {
  console.log('Captcha! Solve...');
  for (let i = 0; i < 120; i++) {
    await new Promise(r => setTimeout(r, 1000));
    if (!page.url().includes('challenge') && !page.url().includes('recaptcha') && !page.url().includes('login')) break;
  }
}
await new Promise(r => setTimeout(r, 3000));

// Go to profile
await page.goto('https://www.instagram.com/pratham_patel_18/', { waitUntil: 'networkidle2', timeout: 30000 });
await new Promise(r => setTimeout(r, 3000));
await page.evaluate(() => window.scrollTo(0, 500));
await new Promise(r => setTimeout(r, 2000));

// Find posts
const posts = await page.evaluate(() => {
  const links = document.querySelectorAll('a[href*="/p/"]');
  return Array.from(links).slice(0, 6).map(a => ({
    href: a.href,
    img: a.querySelector('img')?.src || '',
    alt: a.querySelector('img')?.alt?.substring(0, 100) || ''
  }));
});
console.log('Posts found:', posts.length);
if (posts.length > 0) {
  console.log('Latest post URL:', posts[0].href);
  console.log('Latest post alt:', posts[0].alt);
} else {
  console.log('No posts found with /p/ selector. Trying alt approach...');
  // Try to find posts by images inside the grid
  const gridImgs = await page.evaluate(() => {
    const imgs = document.querySelectorAll('img[alt*="photo"], img[alt*="Picture"], img[src*="cdninstagram"]');
    return Array.from(imgs).slice(0, 6).map(img => ({
      src: img.src,
      alt: img.alt?.substring(0, 80)
    }));
  });
  console.log('Grid images:', JSON.stringify(gridImgs, null, 2));
}

await browser.close();
