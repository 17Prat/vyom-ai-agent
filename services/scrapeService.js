import fetch from 'node-fetch';

export async function scrapeWebsite(url) {
    console.log("🕸️ Scrape request for URL:", url);
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
