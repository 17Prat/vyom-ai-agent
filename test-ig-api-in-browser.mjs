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
  headless: false,
  args: ["--no-sandbox", `--user-data-dir=${SESSION_DIR}/profile`],
});
const page = await browser.newPage();
await page.setViewport({ width: 1366, height: 768 });

const cookies = JSON.parse(fs.readFileSync(SESSION_DIR + "/cookies.json", "utf8"));
await page.setCookie(...cookies);

// Go to Instagram homepage to establish session
await page.goto("https://www.instagram.com/", { waitUntil: "networkidle2", timeout: 30000 });
await delay(3000);

// Download the image and convert to base64
const imgResp = await fetch('https://picsum.photos/800/800?r=' + Date.now());
const imgBuffer = Buffer.from(await imgResp.arrayBuffer());
const base64 = imgBuffer.toString('base64');
const uploadId = String(Date.now());
const name = uploadId + '_0_' + Math.floor(Math.random() * 9000000000 + 1000000000);

// Execute the upload inside the browser using its own cookies/session
const result = await page.evaluate(async ({ base64, name, uploadId }) => {
  // Convert base64 to ArrayBuffer
  const binaryStr = atob(base64);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }
  const contentLength = bytes.byteLength;

  const ruploadParams = JSON.stringify({
    retry_context: JSON.stringify({ num_step_auto_retry: 0, num_reupload: 0, num_step_manual_retry: 0 }),
    media_type: '1',
    upload_id: uploadId,
    xsharing_user_ids: JSON.stringify([]),
    image_compression: JSON.stringify({ lib_name: 'moz', lib_version: '3.1.m', quality: '80' }),
  });

  try {
    const resp = await fetch('https://www.instagram.com/rupload_igphoto/' + name, {
      method: 'POST',
      headers: {
        'X-Entity-Type': 'image/jpeg',
        'X-Entity-Name': name,
        'X-Entity-Length': contentLength,
        'Content-Type': 'application/octet-stream',
        'Content-Length': contentLength,
        'Offset': '0',
        'X-Instagram-Rupload-Params': ruploadParams,
      },
      body: bytes,
      credentials: 'include',
    });
    const text = await resp.text();
    return { status: resp.status, body: text.substring(0, 500) };
  } catch (e) {
    return { error: e.message };
  }
}, { base64, name, uploadId });

console.log("Upload result:", JSON.stringify(result));
await browser.close();
