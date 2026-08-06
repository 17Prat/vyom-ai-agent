import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';
import os from 'os';

const CHROME_PATH = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const WA_SESSION_DIR = path.join(os.homedir(), '.brahmand-wa-session');

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

let waBrowser = null;
let waPage = null;

// ============================================================
// 1. GET OR CREATE PERSISTENT INSTANCE
// ============================================================
export async function getWhatsappInstance() {
    if (waBrowser && waPage) {
        try {
            await waPage.evaluate(() => 1);
            return { browser: waBrowser, page: waPage };
        } catch (e) {
            console.log("⚠️ WhatsApp instance died. Re-initializing...");
            try { await waBrowser.close(); } catch (err) {}
            waBrowser = null;
            waPage = null;
        }
    }

    console.log("🚀 Launching WhatsApp Web...");

    if (!fs.existsSync(WA_SESSION_DIR)) {
        fs.mkdirSync(WA_SESSION_DIR, { recursive: true });
    }

    waBrowser = await puppeteer.launch({
        executablePath: CHROME_PATH,
        headless: false,
        userDataDir: WA_SESSION_DIR,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--disable-web-security',
            '--disable-features=IsolateOrigins,site-per-process'
        ],
        defaultViewport: null
    });

    const pages = await waBrowser.pages();
    waPage = pages.length > 0 ? pages[0] : await waBrowser.newPage();
    await waPage.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    console.log("🌐 Navigating to WhatsApp Web...");
    await waPage.goto('https://web.whatsapp.com/', {
        waitUntil: 'domcontentloaded',
        timeout: 60000
    }).catch(() => {});

    return { browser: waBrowser, page: waPage };
}

// ============================================================
// 2. WAIT FOR LOGIN (QR SCAN)
// ============================================================
export async function waitForWhatsAppLogin(timeoutSeconds = 120) {
    const { page } = await getWhatsappInstance();

    console.log("⏳ Waiting for WhatsApp login...");

    let loggedIn = false;

    for (let i = 0; i < timeoutSeconds; i++) {
        const state = await page.evaluate(() => {
            const qr = document.querySelector('canvas[aria-label="Scan me!"]') ||
                       document.querySelector('div[data-ref]') ||
                       document.querySelector('[data-testid="qrcode"]') ||
                       document.querySelector('canvas') ||
                       document.querySelector('div[class*="qrcode"]');
            const chat = document.querySelector('div[contenteditable="true"]') ||
                         document.querySelector('div.lexical-rich-text-input') ||
                         document.querySelector('[data-testid="chat-list"]') ||
                         document.querySelector('#pane-side');
            const loading = document.querySelector('progress') ||
                           document.querySelector('[data-testid="loading"]') ||
                           document.querySelector('div[class*="loading"]');
            return { qr: !!qr, chat: !!chat, loading: !!loading };
        });

        if (state.qr) {
            console.log(`📸 QR Code visible — scan it with your phone. (Seconds waiting: ${i}s)`);
        }

        if (state.chat) {
            loggedIn = true;
            console.log("✅ WhatsApp logged in successfully!");
            break;
        }

        if (i % 10 === 0 && !state.qr) {
            console.log(`⏳ Waiting... ${i}s / ${timeoutSeconds}s`);
        }

        await delay(1000);
    }

    if (!loggedIn) {
        throw new Error("❌ Login timeout. Please scan QR code.");
    }

    return true;
}

// ============================================================
// 3. MAIN SEND FUNCTION
// ============================================================
export async function sendWhatsappMessage(recipient, messageText) {
    console.log(`📤 Sending to: "${recipient}"`);

    if (!recipient || recipient.trim() === '') {
        return JSON.stringify({ success: false, error: "Recipient is empty." });
    }

    try {
        const { page } = await getWhatsappInstance();

        // Ensure logged in
        await waitForWhatsAppLogin(120);

        // Clean recipient
        const cleanInput = recipient.trim();
        let digitsOnly = cleanInput.replace(/[^0-9]/g, "");
        
        // Auto India prefix if exactly 10 digits
        if (digitsOnly.length === 10) {
            digitsOnly = "91" + digitsOnly;
        }
        
        const isPhone = digitsOnly.length >= 7 && /^[0-9+\s-]+$/.test(cleanInput);

        // === TRY 1: Search by name (for contacts/numbers saved under names) ===
        const sentByName = await searchAndSend(page, cleanInput, messageText);
        if (sentByName) {
            return JSON.stringify({ success: true, message: `✅ Sent to "${cleanInput}"` });
        }

        // === TRY 2: Direct URL (fallback only for phone numbers if not found in search) ===
        if (isPhone) {
            const sentByUrl = await sendViaDirectUrl(page, digitsOnly, messageText);
            if (sentByUrl) {
                return JSON.stringify({ success: true, message: `✅ Sent to ${digitsOnly} via Direct URL` });
            }
        }

        return JSON.stringify({ success: false, error: `Could not send to "${recipient}".` });

    } catch (error) {
        console.error(`❌ Error:`, error.message);
        return JSON.stringify({ success: false, error: error.message });
    }
}

// ============================================================
// 4. SEARCH AND SEND (BY NAME)
// ============================================================
async function searchAndSend(page, name, messageText) {
    try {
        console.log(`🔍 Searching contact: "${name}"...`);

        // Focus search box
        const searchFocused = await page.evaluate(() => {
            // Try specific WhatsApp Web search testids/attributes
            const searchSelectors = [
                'div[contenteditable="true"][data-tab="3"]',
                'div[contenteditable="true"][role="textbox"]',
                'div[contenteditable="true"]',
                '[data-testid="search-placeholder"]',
                '[data-testid="search"]',
                'input[placeholder*="Search"]',
                'div[placeholder*="Search"]',
                'div[class*="search"] div[contenteditable="true"]'
            ];

            for (const selector of searchSelectors) {
                const el = document.querySelector(selector);
                if (el) {
                    el.focus();
                    // Dispatch a click or focus event just in case
                    el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
                    return true;
                }
            }

            // Fallback: search within elements that look like search headers
            const inputs = Array.from(document.querySelectorAll('div[contenteditable="true"]'));
            for (const el of inputs) {
                if (el.closest('[role="search"]') || el.closest('header') || el.closest('[class*="search"]')) {
                    el.focus();
                    el.click();
                    return true;
                }
            }
            
            if (inputs.length > 0) {
                inputs[0].focus();
                inputs[0].click();
                return true;
            }
            return false;
        });

        if (!searchFocused) {
            console.log("❌ Search box not found.");
            return false;
        }

        await delay(300);

        // Clear search
        await page.keyboard.down('Control');
        await page.keyboard.press('A');
        await page.keyboard.up('Control');
        await page.keyboard.press('Backspace');
        await delay(300);

        // Type name
        await page.keyboard.type(name, { delay: 80 });
        await delay(2500);

        // Click on contact using robust row and title text content matching
        const clicked = await page.evaluate((searchName) => {
            const lowerSearch = searchName.toLowerCase().trim();
            
            // 1. Try finding elements with title attribute that matches the contact name
            const titleElements = Array.from(document.querySelectorAll('[title]'));
            for (const el of titleElements) {
                const titleText = el.getAttribute('title')?.trim().toLowerCase() || '';
                if (titleText.includes(lowerSearch)) {
                    el.click();
                    return true;
                }
            }

            // 2. Try matching rows
            const rows = document.querySelectorAll('[role="row"], [role="listitem"]');
            for (const row of rows) {
                const text = row.textContent?.trim() || '';
                if (text.toLowerCase().includes(lowerSearch)) {
                    // Try to click a clickable element inside row or the row itself
                    const clickable = row.querySelector('[clickable="true"]') || row.querySelector('div') || row;
                    clickable.click();
                    return true;
                }
            }

            // 3. Fallback: match any text block containing the name inside pane-side
            const sidebar = document.querySelector('div[id="pane-side"]') || document.body;
            const matches = Array.from(sidebar.querySelectorAll('*')).filter(el => {
                const title = el.getAttribute('title') || el.textContent || '';
                return title.trim().toLowerCase().includes(lowerSearch);
            });
            if (matches.length > 0) {
                const clickTarget = matches[0].closest('[role="row"]') || matches[0].closest('[role="listitem"]') || matches[0];
                clickTarget.click();
                return true;
            }
            return false;
        }, name);

        if (!clicked) {
            console.log(`❌ Contact "${name}" not found.`);
            return false;
        }

        await delay(2000);

        // Send message
        await typeAndSend(page, messageText);
        return true;

    } catch (error) {
        console.error(`❌ Search error:`, error.message);
        return false;
    }
}

// ============================================================
// 5. DIRECT URL (BY PHONE NUMBER)
// ============================================================
async function sendViaDirectUrl(page, phone, messageText) {
    try {
        const url = `https://web.whatsapp.com/send?phone=${phone}`;
        console.log(`🌐 Opening: ${url}`);

        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await delay(5000);

        // Check invalid number
        const invalid = await page.evaluate(() => {
            const divs = Array.from(document.querySelectorAll('div'));
            return divs.some(el => el.textContent?.includes('Phone number shared via url is invalid'));
        });

        if (invalid) {
            console.log(`❌ Invalid number: ${phone}`);
            return false;
        }

        // Wait for chat to load
        let loaded = false;
        for (let i = 0; i < 20; i++) {
            const hasInput = await page.evaluate(() => {
                return !!document.querySelector('div[contenteditable="true"]');
            });
            if (hasInput) {
                loaded = true;
                break;
            }
            await delay(1000);
        }

        if (!loaded) {
            console.log("❌ Chat not loaded.");
            return false;
        }

        await delay(2000);
        await typeAndSend(page, messageText);
        return true;

    } catch (error) {
        console.error(`❌ Direct URL error:`, error.message);
        return false;
    }
}

// ============================================================
// 6. TYPE AND SEND MESSAGE
// ============================================================
async function typeAndSend(page, messageText) {
    try {
        // Focus input
        const focused = await page.evaluate(() => {
            const inputs = Array.from(document.querySelectorAll('div[contenteditable="true"]'));
            for (const el of inputs) {
                const isSearch = el.closest('[role="search"]') ||
                                 el.closest('header') ||
                                 el.getAttribute('data-tab') === '3';
                if (!isSearch) {
                    el.focus();
                    return true;
                }
            }
            if (inputs.length > 0) {
                inputs[inputs.length - 1].focus();
                return true;
            }
            return false;
        });

        if (!focused) {
            console.log("❌ Input not focused.");
            return false;
        }

        await delay(300);

        // Type and send
        await page.keyboard.type(messageText, { delay: 50 });
        await delay(400);
        await page.keyboard.press('Enter');

        console.log("✅ Message sent!");
        await delay(2000);
        return true;

    } catch (error) {
        console.error(`❌ Type error:`, error.message);
        return false;
    }
}

// ============================================================
// 7. UTILITY FUNCTIONS
// ============================================================
export async function closeWhatsappBrowser() {
    if (waBrowser) {
        await waBrowser.close();
        waBrowser = null;
        waPage = null;
        console.log("🔒 Browser closed.");
    }
}

export function clearWhatsappSession() {
    if (fs.existsSync(WA_SESSION_DIR)) {
        fs.rmSync(WA_SESSION_DIR, { recursive: true, force: true });
        console.log("🧹 Session cleared.");
    }
}
