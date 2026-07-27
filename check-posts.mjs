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

// Check each known post for timestamp
const codes = ['DbS8gxSGmX_','DbS8KX7Dvca','DbS7r39DnnV','DbS7glKDtZZ'];
for (const code of codes) {
  await page.goto('https://www.instagram.com/p/' + code + '/', { waitUntil: 'networkidle2', timeout: 15000 });
  await new Promise(r => setTimeout(r, 2000));
  const meta = await page.evaluate(() => {
    const m = document.querySelector('meta[property="og:description"]');
    const time = document.querySelector('time');
    return {
      desc: m?.content?.substring(0, 200) || '',
      time: time?.getAttribute('datetime') || '',
      timeText: time?.textContent || ''
    };
  });
  console.log(code + ' -> ' + meta.desc.substring(0, 120));
  console.log('  Time: ' + meta.time + ' (' + meta.timeText + ')');
}

await browser.close();
