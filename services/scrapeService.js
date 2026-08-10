import FirecrawlApp from '@mendable/firecrawl-js';
import fetch from 'node-fetch';
import { maxunScraper, maxunScraper2 } from './maxunService.js';
import dotenv from 'dotenv';
dotenv.config();

const firecrawl = process.env.FIRECRAWL_API_KEY ? new FirecrawlApp({ apiKey: process.env.FIRECRAWL_API_KEY }) : null;

// Robust helper to extract scrape results from various Maxun response structures
function extractScraperContent(runResult) {
    if (!runResult) return null;
    if (runResult.results) return runResult.results;
    if (runResult.data) {
        if (runResult.data.textData && Object.keys(runResult.data.textData).length > 0) {
            return runResult.data.textData;
        }
        if (runResult.data.listData && runResult.data.listData.length > 0) {
            return runResult.data.listData;
        }
    }
    return null;
}

export async function scrapeWebsite(url) {
    console.log("🕸️ Scrape request for URL:", url);

    // === STRATEGY 1: Firecrawl ===
    if (firecrawl) {
        try {
            console.log("🔥 Using Firecrawl for high-quality scraping...");
            const scrapeResult = await firecrawl.scrapeUrl(url, {
                formats: ['markdown']
            });
            if (scrapeResult.success && scrapeResult.markdown) {
                return scrapeResult.markdown.substring(0, 5000);
            }
        } catch (e) {
            console.warn("🔥 Firecrawl failed, trying Jina Reader...", e.message);
        }
    }

    // === STRATEGY 2: Jina Reader (Zero-Config Markdown Scraper) ===
    try {
        console.log("🌐 Using Jina Reader for markdown extraction...");
        const jinaUrl = `https://r.jina.ai/${url}`;
        const jinaRes = await fetch(jinaUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36'
            },
            timeout: 10000 // 10s timeout
        });
        if (jinaRes.ok) {
            const markdown = await jinaRes.text();
            if (markdown && markdown.trim().length > 100) {
                console.log("✅ Jina Reader scraping succeeded.");
                return markdown.substring(0, 5000);
            }
        }
    } catch (e) {
        console.warn("🌐 Jina Reader failed, trying Maxun Scraper...", e.message);
    }

    // === STRATEGY 3: Maxun Scraper (Headless Cloud Agent - Primary Key) ===
    if (process.env.MAXUN_API_KEY && process.env.MAXUN_API_KEY !== 'maxun_api_key_here') {
        try {
            console.log("🕷️ Running Maxun Scraper Agent (Primary Key) for URL:", url);
            const robot = await maxunScraper.create(`Scrape-${Date.now()}`, {
                url: url
            });
            const runResult = await robot.run();
            const content = extractScraperContent(runResult);
            if (content) {
                console.log("✅ Maxun Scraper (Primary) finished successfully.");
                return JSON.stringify(content).substring(0, 5000);
            }
        } catch (maxunErr) {
            console.warn("⚠️ Maxun Primary Scraper failed, trying Secondary Key...", maxunErr.message);
            
            // === STRATEGY 3.5: Maxun Scraper (Headless Cloud Agent - Secondary Key Fallback) ===
            if (maxunScraper2) {
                try {
                    console.log("🕷️ Running Maxun Scraper Agent (Secondary Key) for URL:", url);
                    const robot = await maxunScraper2.create(`Scrape-${Date.now()}`, {
                        url: url
                    });
                    const runResult = await robot.run();
                    const content = extractScraperContent(runResult);
                    if (content) {
                        console.log("✅ Maxun Scraper (Secondary) finished successfully.");
                        return JSON.stringify(content).substring(0, 5000);
                    }
                } catch (maxunErr2) {
                    console.warn("⚠️ Maxun Secondary Scraper also failed, falling back to basic fetch...", maxunErr2.message);
                }
            }
        }
    }

    // === STRATEGY 4: Fallback Simple Fetch Scraper ===
    try {
        const fetchRes = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36'
            }
        });
        if (!fetchRes.ok) return "Failed to retrieve website contents.";
        const text = await fetchRes.text();
        
        const cleanText = text.replace(/<script\b[^<]*>([\s\S]*?)<\/script>/gi, '')
                             .replace(/<style\b[^<]*>([\s\S]*?)<\/style>/gi, '')
                             .replace(/<[^>]+>/g, ' ')
                             .replace(/\s+/g, ' ')
                             .substring(0, 4000);
        return cleanText;
    } catch (err) {
        console.error("Scrape Error:", err.message);
        return "An error occurred while scraping the website.";
    }
}
