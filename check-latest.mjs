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

// Go to latest post directly
await page.goto('https://www.instagram.com/p/DbS8gxSGmX_/', { waitUntil: 'networkidle2', timeout: 30000 });
await new Promise(r => setTimeout(r, 3000));

const info = await page.evaluate(() => {
  const meta = document.querySelector('meta[property="og:description"]');
  const ogImage = document.querySelector('meta[property="og:image"]');
  const title = document.querySelector('title');
  const article = document.querySelector('article');
  return {
    ogDesc: meta?.content || '',
    ogImage: ogImage?.content || '',
    title: title?.textContent || '',
    articlePresent: !!article,
    bodyText: document.body.innerText.substring(0, 300),
  };
});
console.log('Latest post info:');
console.log('OG Desc:', info.ogDesc?.substring(0, 200));
console.log('OG Image:', info.ogImage?.substring(0, 80));
console.log('Title:', info.title?.substring(0, 100));
console.log('Body:', info.bodyText);

// Also check if there are more recent posts
console.log('\n--- Checking more posts by scrolling profile ---');
await page.goto('https://www.instagram.com/pratham_patel_18/', { waitUntil: 'networkidle2', timeout: 30000 });
await new Promise(r => setTimeout(r, 3000));
// Scroll multiple times
for (let i = 0; i < 5; i++) {
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await new Promise(r => setTimeout(r, 1500));
}

const allPosts = await page.evaluate(() => {
  const links = document.querySelectorAll('a[href*="/p/"]');
  return Array.from(links).slice(0, 9).map(a => ({
    href: a.href,
    img: a.querySelector('img')?.alt?.substring(0, 80) || ''
  }));
});
console.log('\nAll posts found:');
allPosts.forEach((p, i) => console.log(`${i+1}. ${p.href.split('/p/')[1]?.split('/')[0]} - ${p.img}`));

await browser.close();
