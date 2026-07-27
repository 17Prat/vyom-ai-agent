import puppeteer from "puppeteer-core";
import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import os from 'os';

const CHROME_PATH = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const SESSION_DIR = "C:/Users/prarh/.brahmand-ig-session";
function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

const browser = await puppeteer.launch({
  executablePath: CHROME_PATH,
  headless: true,
  args: ["--no-sandbox", "--headless=new"],
});
const page = await browser.newPage();
await page.setViewport({ width: 1366, height: 768 });

// Intercept network requests to see cookies
await page.setRequestInterception(true);
page.on('request', interceptedRequest => {
  if (interceptedRequest.url().includes('rupload_igphoto')) {
    const headers = interceptedRequest.headers();
    console.log('Upload request cookies present:', !!headers['cookie']);
    console.log('Cookie prefix:', (headers['cookie'] || '').substring(0, 100));
  }
  interceptedRequest.continue();
});

const cookies = JSON.parse(fs.readFileSync(SESSION_DIR + "/cookies.json", "utf8"));
await page.setCookie(...cookies);

await page.goto("https://www.instagram.com/", { waitUntil: "networkidle2", timeout: 30000 });
await delay(3000);

const imgResp = await fetch('https://picsum.photos/800/800?r=' + Date.now());
const imgBuffer = Buffer.from(await imgResp.arrayBuffer());
const base64 = imgBuffer.toString('base64');
const uploadId = String(Date.now());
const name = uploadId + '_0_' + Math.floor(Math.random() * 9000000000 + 1000000000);

const result = await page.evaluate(async ({ base64, name, uploadId }) => {
  const binaryStr = atob(base64);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);

  const upResp = await fetch('https://www.instagram.com/rupload_igphoto/' + name, {
    method: 'POST',
    headers: {
      'X-Entity-Type': 'image/jpeg',
      'X-Entity-Name': name,
      'X-Entity-Length': bytes.byteLength,
      'Content-Type': 'application/octet-stream',
      'Offset': '0',
      'X-Instagram-Rupload-Params': JSON.stringify({
        retry_context: JSON.stringify({ num_step_auto_retry: 0, num_reupload: 0, num_step_manual_retry: 0 }),
        media_type: '1',
        upload_id: uploadId,
        xsharing_user_ids: JSON.stringify([]),
        image_compression: JSON.stringify({ lib_name: 'moz', lib_version: '3.1.m', quality: '80' }),
      }),
    },
    body: bytes,
    credentials: 'include',
  });
  const upText = await upResp.text();
  return { status: upResp.status, body: upText.substring(0, 200) };
}, { base64, name, uploadId });

console.log("Result:", JSON.stringify(result));
await browser.close();
