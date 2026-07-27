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

// Go to own profile
await page.goto('https://www.instagram.com/pratham_patel_18/', { waitUntil: 'networkidle2', timeout: 30000 });
await new Promise(r => setTimeout(r, 4000));

const header = await page.evaluate(() => {
  const h = document.querySelector('header');
  return h ? h.innerText : 'no header';
});
console.log('Header:', header.substring(0, 500));

await page.evaluate(() => window.scrollTo(0, 400));
await new Promise(r => setTimeout(r, 2000));

const postLinks = await page.evaluate(() => {
  const links = document.querySelectorAll('a[href*="/p/"]');
  return Array.from(links).slice(0, 6).map(a => ({
    href: a.href,
    imgAlt: a.querySelector('img')?.alt?.substring(0, 120) || ''
  }));
});
console.log('\nPost links:');
postLinks.forEach((p, i) => {
  const shortCode = p.href.split('/p/')[1]?.split('/')[0] || '?';
  console.log(`${i+1}. ${shortCode} - ${p.imgAlt}`);
});

await browser.close();
