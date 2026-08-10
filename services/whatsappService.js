import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';
import os from 'os';
import fetch from 'node-fetch';

const CHROME_PATH = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const WA_SESSION_DIR = path.join(os.homedir(), '.brahmand-wa-session');

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Helper to check if WhatsApp chat window with contact is already open
async function isChatOpen(page, contactName) {
    try {
        return await page.evaluate((name) => {
            const header = document.querySelector('#main header');
            if (!header) return false;
            const text = header.textContent || '';
            return text.toLowerCase().includes(name.toLowerCase());
        }, contactName);
    } catch (e) {
        return false;
    }
}

let waBrowser = null;
let waPage = null;

// Helper to download remote URL files to temp directory for uploading
async function downloadTempFile(url) {
    try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Failed to download: ${res.statusText}`);
        const buffer = await res.buffer();
        const ext = path.extname(new URL(url).pathname) || '.jpg';
        const tmpPath = path.join(os.tmpdir(), `wa-attach-${Date.now()}${ext}`);
        fs.writeFileSync(tmpPath, buffer);
        return tmpPath;
    } catch (e) {
        console.error("Failed to download temp media file for WA:", e.message);
        return null;
    }
}

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

    const isHeadless = process.env.WHATSAPP_HEADLESS === 'true';
    console.log(`- WhatsApp Headless Mode: ${isHeadless ? "ON" : "OFF"}`);

    waBrowser = await puppeteer.launch({
        executablePath: CHROME_PATH,
        headless: isHeadless,
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
// 3. MAIN SEND FUNCTION (WITH MEDIA SUPPORT)
// ============================================================
export async function sendWhatsappMessage(recipient, messageText, mediaPath = null) {
    console.log(`📤 Sending to: "${recipient}" (Media: ${mediaPath || "None"})`);

    if (!recipient || recipient.trim() === '') {
        return JSON.stringify({ success: false, error: "Recipient is empty." });
    }

    let localTempPath = null;
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

        // Pre-download media if URL
        if (mediaPath && mediaPath.startsWith('http')) {
            console.log(`📥 Downloading remote attachment URL: ${mediaPath}`);
            localTempPath = await downloadTempFile(mediaPath);
        } else if (mediaPath) {
            localTempPath = mediaPath;
        }

        // === TRY 1: Search by name (for contacts/numbers saved under names) ===
        let targetMatched = true;
        const alreadyOpen = await isChatOpen(page, cleanInput);
        if (alreadyOpen) {
            console.log(`⚡ Chat for "${cleanInput}" is already open. Skipping search.`);
        } else {
            targetMatched = await searchContact(page, cleanInput);
        }
        
        // === TRY 2: Direct URL (fallback only for phone numbers if not found in search) ===
        if (!targetMatched && isPhone) {
            const loadedDirect = await openDirectUrl(page, digitsOnly);
            if (!loadedDirect) {
                 return JSON.stringify({ success: false, error: `Could not load chat for "${recipient}".` });
            }
        } else if (!targetMatched) {
            return JSON.stringify({ success: false, error: `Contact "${recipient}" not found.` });
        }

        // === ATTACH MEDIA & SEND ===
        if (localTempPath && fs.existsSync(localTempPath)) {
            console.log(`📎 Uploading file to WhatsApp: "${localTempPath}"`);
            
            // Upload file to file input
            const fileInputHandle = await page.waitForSelector('input[type="file"]', { timeout: 10000 });
            if (fileInputHandle) {
                await fileInputHandle.uploadFile(localTempPath);
                await delay(3000); // Wait for preview frame to render

                // Type caption if messageText exists
                if (messageText) {
                    await page.keyboard.type(messageText);
                    await delay(500);
                }

                // Press Enter to share media
                await page.keyboard.press('Enter');
                await delay(3000);
                
                // Clean up temp file
                if (mediaPath && mediaPath.startsWith('http') && fs.existsSync(localTempPath)) {
                    fs.unlinkSync(localTempPath);
                }
                return JSON.stringify({ success: true, message: `✅ Sent media attachment to "${recipient}" successfully.` });
            }
        }

        // Standard Text Send
        await typeAndSend(page, messageText);
        return JSON.stringify({ success: true, message: `✅ Sent text message to "${recipient}" successfully.` });

    } catch (error) {
        console.error(`❌ WhatsApp Send Error:`, error.message);
        if (localTempPath && mediaPath && mediaPath.startsWith('http') && fs.existsSync(localTempPath)) {
            try { fs.unlinkSync(localTempPath); } catch(e) {}
        }
        return JSON.stringify({ success: false, error: error.message });
    }
}

// ============================================================
// 4. SEARCH CONTACT
// ============================================================
async function searchContact(page, name) {
    try {
        console.log(`🔍 Searching contact: "${name}"...`);

        // Wait for search box to load in DOM
        let searchSelector = 'div[contenteditable="true"][data-tab="3"]';
        try {
            await page.waitForSelector(searchSelector, { timeout: 8000 });
        } catch (e) {
            // Try specific sidebar fallbacks
            const fallbacks = [
                '#side div[contenteditable="true"]',
                'div[role="search"] div[contenteditable="true"]',
                '[data-testid="chat-list-search"]',
                '[data-testid="search-placeholder"]'
            ];
            for (const fb of fallbacks) {
                try {
                    await page.waitForSelector(fb, { timeout: 1500 });
                    searchSelector = fb;
                    break;
                } catch (err) {}
            }
        }

        const searchFocused = await page.evaluate((sel) => {
            const el = document.querySelector(sel);
            if (el) {
                el.focus();
                el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
                return true;
            }
            return false;
        }, searchSelector);

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

        // Click on contact using native ElementHandle click simulation
        const contactRowHandle = await page.evaluateHandle((searchName) => {
            const lowerSearch = searchName.toLowerCase().trim();
            const titleElements = Array.from(document.querySelectorAll('[title]'));
            for (const el of titleElements) {
                const titleText = el.getAttribute('title')?.trim().toLowerCase() || '';
                if (titleText.includes(lowerSearch)) {
                    return el.closest('[role="row"]') || el.closest('[role="listitem"]') || el;
                }
            }

            const rows = document.querySelectorAll('[role="row"], [role="listitem"]');
            for (const row of rows) {
                const text = row.textContent?.trim() || '';
                if (text.toLowerCase().includes(lowerSearch)) {
                    return row;
                }
            }
            return null;
        }, name);

        const contactRow = contactRowHandle.asElement();
        if (!contactRow) {
            console.log(`❌ Contact "${name}" not found in list.`);
            return false;
        }

        console.log("📍 Click target found. Simulating native click...");
        await contactRow.click();
        await delay(3000); // Wait for chat window to load
        return true;

    } catch (error) {
        console.error(`❌ Search error:`, error.message);
        return false;
    }
}

// ============================================================
// 5. DIRECT URL NAVIGATION
// ============================================================
async function openDirectUrl(page, phone) {
    try {
        const url = `https://web.whatsapp.com/send?phone=${phone}`;
        console.log(`🌐 Opening direct chat link: ${url}`);

        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await delay(5000);

        const invalid = await page.evaluate(() => {
            const divs = Array.from(document.querySelectorAll('div'));
            return divs.some(el => el.textContent?.includes('Phone number shared via url is invalid'));
        });

        if (invalid) {
            console.log(`❌ Invalid number: ${phone}`);
            return false;
        }

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
            console.log("❌ Direct chat input failed to load.");
            return false;
        }

        await delay(2000);
        return true;

    } catch (error) {
        console.error(`❌ Direct URL navigation error:`, error.message);
        return false;
    }
}

// ============================================================
// 6. TYPE AND SEND MESSAGE
// ============================================================
async function typeAndSend(page, messageText) {
    try {
        console.log("⏳ Waiting for chat input field to load...");
        
        const selectors = [
            'footer div[contenteditable="true"]',
            'div[contenteditable="true"][data-tab="10"]',
            'div[contenteditable="true"][title*="message"]',
            'div[contenteditable="true"][title*="संदेश"]',
            'div[contenteditable="true"][role="textbox"]'
        ];

        let activeSelector = null;
        for (const sel of selectors) {
            try {
                await page.waitForSelector(sel, { timeout: 2000 });
                activeSelector = sel;
                break;
            } catch (e) {
                // Try next
            }
        }

        if (!activeSelector) {
            console.log("⚠️ No specific input selector loaded, trying generic fallback...");
            activeSelector = 'div[contenteditable="true"]';
        }

        const focused = await page.evaluate((sel) => {
            const el = document.querySelector(sel);
            if (el) {
                el.focus();
                el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
                return true;
            }
            return false;
        }, activeSelector);

        if (!focused) {
            console.log("❌ Input not focused. Saving debug screenshot to temp/wa_error.png...");
            const tempDir = path.join(process.cwd(), 'temp');
            if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
            await page.screenshot({ path: path.join(tempDir, 'wa_error.png') });
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
        console.error(`❌ Type and send error:`, error.message);
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

// ============================================================
// 8. CHECK LATEST INCOMING MESSAGES FOR AUTO-REPLY
// ============================================================
export async function getLatestIncomingWhatsappMessage(contactName) {
    console.log(`📥 Checking WhatsApp messages for: "${contactName}"`);
    try {
        const { page } = await getWhatsappInstance();
        await waitForWhatsAppLogin(120);

        let targetMatched = true;
        const alreadyOpen = await isChatOpen(page, contactName);
        if (alreadyOpen) {
            console.log(`⚡ Chat for "${contactName}" is already open. Skipping search.`);
        } else {
            targetMatched = await searchContact(page, contactName);
        }
        if (!targetMatched) {
            return { error: `Contact "${contactName}" not found.` };
        }

        // Wait for chat messages container to be populated
        await page.waitForSelector('div[class*="message-"]', { timeout: 8000 }).catch(() => {});

        // Extract chat history (incoming vs outgoing message bubbles)
        const chatHistory = await page.evaluate(() => {
            const bubbles = Array.from(document.querySelectorAll('div[class*="message-in"], div[class*="message-out"]'));
            return bubbles.map(el => {
                const isIncoming = el.className.includes('message-in');
                // Extract text from the standard copyable WhatsApp message container
                const textEl = el.querySelector('span[class*="selectable-text"], div[class*="copyable-text"] span');
                const text = textEl ? textEl.textContent.trim() : '';
                return { isIncoming, text };
            }).filter(h => h.text !== '');
        });

        if (chatHistory.length === 0) {
            return { lastMessage: null, isIncoming: false, chatHistory: [] };
        }

        const lastMsg = chatHistory[chatHistory.length - 1];
        return {
            lastMessage: lastMsg.text,
            isIncoming: lastMsg.isIncoming,
            chatHistory: chatHistory.slice(-10) // return last 10 messages context
        };

    } catch (e) {
        console.error("❌ WhatsApp message check failed:", e.message);
        return { error: e.message };
    }
}
