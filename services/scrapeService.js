import FirecrawlApp from '@mendable/firecrawl-js';
import fetch from 'node-fetch';
import dotenv from 'dotenv';
dotenv.config();

const firecrawl = process.env.FIRECRAWL_API_KEY ? new FirecrawlApp({ apiKey: process.env.FIRECRAWL_API_KEY }) : null;

export async function scrapeWebsite(url) {
    console.log("🕸️ Scrape request for URL:", url);

    // Attempt Firecrawl for clean markdown extraction
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
            console.warn("🔥 Firecrawl failed, falling back to basic fetch scrape...", e.message);
        }
    }

    // Fallback simple fetch scraper
    try {
        const fetchRes = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36'
            }
        });
        if (!fetchRes.ok) return null;
        const text = await fetchRes.text();
        
        const cleanText = text.replace(/<script\b[^<]*>([\s\S]*?)<\/script>/gi, '')
                             .replace(/<style\b[^<]*>([\s\S]*?)<\/style>/gi, '')
                             .replace(/<[^>]+>/g, ' ')
                             .replace(/\s+/g, ' ')
                             .substring(0, 4000);
        return cleanText;
    } catch (err) {
        console.error("Scrape Error:", err.message);
        return null;
    }
}
