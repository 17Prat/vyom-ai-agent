import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';
import os from 'os';

const CHROME_PATH = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const WA_SESSION_DIR = path.join(os.homedir(), '.brahmand-wa-session');

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function sendWhatsappMessage(recipient, messageText) {
  console.log(`🚀 Initializing WhatsApp Web for recipient: "${recipient}"...`);
  
  const isPhoneNumber = /^[+0-9\s-]+$/.test(recipient.trim()) && recipient.replace(/[^0-9]/g, "").length >= 7;
  const cleanNumber = isPhoneNumber ? recipient.replace(/[^0-9]/g, "") : null;

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: false, // Must be false so user can see QR code if login is needed
    userDataDir: WA_SESSION_DIR,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu'
    ]
  });

  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36');

  try {
    let targetUrl = 'https://web.whatsapp.com/';
    if (isPhoneNumber) {
      targetUrl = `https://web.whatsapp.com/send?phone=${cleanNumber}&text=${encodeURIComponent(messageText)}`;
    }
    
    console.log(`Navigating to WhatsApp Web...`);
    await page.goto(targetUrl, { waitUntil: 'networkidle2', timeout: 60000 }).catch(() => {});
    await delay(5000);

    // Monitor for QR Code or Chat box loading
    let loggedIn = false;
    let qrVisible = false;

    // Check for up to 150 seconds (2.5 minutes)
    const totalSeconds = 150;
    for (let i = 0; i < totalSeconds; i++) {
      const state = await page.evaluate(() => {
        const qrCanvas = document.querySelector('canvas[aria-label="Scan me!"]') || document.querySelector('div[data-ref]');
        const chatInput = document.querySelector('div[contenteditable="true"]') || document.querySelector('div.lexical-rich-text-input');
        const progress = document.querySelector('progress');
        const invalidPopup = Array.from(document.querySelectorAll('div')).find(el => el.textContent?.includes('Phone number shared via url is invalid'));

        return {
          qr: !!qrCanvas,
          chat: !!chatInput,
          loading: !!progress,
          invalid: !!invalidPopup
        };
      });

      if (isPhoneNumber && state.invalid) {
        console.log(`❌ WhatsApp error: Phone number ${cleanNumber} is invalid.`);
        await browser.close();
        return JSON.stringify({ success: false, error: `Phone number ${cleanNumber} is invalid on WhatsApp.` });
      }

      if (state.qr && !qrVisible) {
        qrVisible = true;
        console.log(`📸 WhatsApp login required! Please scan the QR Code on the opened browser window.`);
      }

      if (i % 10 === 0) {
        console.log(`⏳ Waiting for WhatsApp Web session... (${totalSeconds - i} seconds remaining)`);
      }

      if (state.chat) {
        loggedIn = true;
        console.log(`✅ WhatsApp Web loaded successfully.`);
        break;
      }

      await delay(1000);
    }

    if (!loggedIn) {
      await browser.close();
      return JSON.stringify({ success: false, error: "WhatsApp login timed out. QR Code scanning failed or connection is slow." });
    }

    await delay(3000);

    if (isPhoneNumber) {
      // Focus chat textbox and press Enter
      await page.evaluate(() => {
        const textbox = document.querySelector('div[contenteditable="true"]');
        if (textbox) textbox.focus();
      });
      await delay(1000);
      await page.keyboard.press('Enter');
      console.log(`✅ Message sent to WhatsApp number: ${cleanNumber}`);
    } else {
      // Recipient is a contact name (e.g. 'Kirti')
      console.log(`🔍 Searching for contact name: "${recipient}"...`);
      
      // Locate the search box
      const searchInputHandle = await page.evaluateHandle(() => {
        const textboxes = Array.from(document.querySelectorAll('div[contenteditable="true"]'));
        const search = textboxes.find(el => el.getAttribute('data-tab') === '3' || el.closest('[role="search"]') || el.getAttribute('title')?.toLowerCase().includes('search'));
        return search || textboxes[0];
      });

      const searchInput = searchInputHandle.asElement();
      if (!searchInput) {
        throw new Error("Could not find WhatsApp search box.");
      }

      await searchInput.focus();
      // Clear search box using keyboard select all + backspace
      await page.keyboard.down('Control');
      await page.keyboard.press('A');
      await page.keyboard.up('Control');
      await page.keyboard.press('Backspace');
      await delay(500);

      // Type the name
      await searchInput.type(recipient, { delay: 150 });
      await delay(3000); // Wait for filter

      // Locate and click the contact in search results
      const contactClicked = await page.evaluate((name) => {
        const sidebar = document.querySelector('div[id="pane-side"]') || document.body;
        const elements = Array.from(sidebar.querySelectorAll('span[title], div[title], span'));
        
        // Exact case-insensitive title match first
        const match = elements.find(el => {
          const text = (el.getAttribute('title') || el.textContent || '').trim().toLowerCase();
          return text === name.toLowerCase();
        });

        if (match) {
          let clickable = match;
          while (clickable && clickable !== document.body) {
            const role = clickable.getAttribute('role');
            if (role === 'row' || role === 'button' || clickable.classList.contains('_ak8q') || clickable.classList.contains('lhggkp7q')) {
              clickable.click();
              return true;
            }
            clickable = clickable.parentElement;
          }
          match.click();
          return true;
        }

        // Substring fallback search
        const allRows = Array.from(sidebar.querySelectorAll('div[role="listitem"], div[role="row"]'));
        for (const row of allRows) {
          if (row.textContent.toLowerCase().includes(name.toLowerCase())) {
            row.click();
            return true;
          }
        }
        return false;
      }, recipient);

      if (!contactClicked) {
        await browser.close();
        console.log(`❌ Contact "${recipient}" not found in WhatsApp chat list.`);
        return JSON.stringify({ success: false, error: `Contact "${recipient}" not found in WhatsApp chat list.` });
      }

      console.log(`💬 Chat opened for "${recipient}". Sending message...`);
      await delay(2000);

      // Focus main text input box and type message
      await page.evaluate(() => {
        const textboxes = Array.from(document.querySelectorAll('div[contenteditable="true"]'));
        const mainInput = textboxes.find(el => el.getAttribute('data-tab') !== '3' && !el.closest('[role="search"]'));
        if (mainInput) mainInput.focus();
      });
      await delay(500);

      // Type the messageText and press Enter
      await page.keyboard.type(messageText, { delay: 50 });
      await delay(500);
      await page.keyboard.press('Enter');
      console.log(`✅ Message sent to contact "${recipient}"`);
    }

    // Wait 3 seconds to ensure delivery
    await delay(3000);
    await browser.close();
    return JSON.stringify({ success: true, message: `WhatsApp message sent to ${recipient}` });

  } catch (error) {
    console.error(`❌ WhatsApp sender failed:`, error.message);
    try { await browser.close(); } catch(e) {}
    return JSON.stringify({ success: false, error: error.message });
  }
}
