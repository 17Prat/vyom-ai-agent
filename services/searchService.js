import fetch from 'node-fetch';
import { maxunSearcher, maxunSearcher2 } from './maxunService.js';

// Robust helper to extract results array from various Maxun response structures
function extractSearchResults(runResult) {
    if (!runResult) return null;
    if (runResult.results && Array.isArray(runResult.results)) {
        return runResult.results;
    }
    if (runResult.data && runResult.data.searchData) {
        for (const key of Object.keys(runResult.data.searchData)) {
            const searchBlock = runResult.data.searchData[key];
            if (searchBlock && searchBlock.results && Array.isArray(searchBlock.results)) {
                return searchBlock.results;
            }
        }
    }
    return null;
}

export async function searchWeb(query) {
    try {
        console.log("🔍 Searching web for:", query);
        console.log("DEBUG: MAXUN_API_KEY is:", process.env.MAXUN_API_KEY);

        // === STRATEGY 1: Maxun Search Robot (Primary Key) ===
        if (process.env.MAXUN_API_KEY && process.env.MAXUN_API_KEY !== 'maxun_api_key_here') {
            try {
                console.log("🕷️ Running Maxun Search Robot (Primary Key)...");
                const robot = await maxunSearcher.create(`Search-${Date.now()}`, {
                    query: query,
                    mode: 'discover',
                    limit: 5
                });

                const runResult = await robot.run();
                const results = extractSearchResults(runResult);
                if (results && results.length > 0) {
                    console.log(`✅ Maxun Search (Primary) returned ${results.length} results.`);
                    const snippets = results.map(item => {
                        const title = item.title || item.name || '';
                        const desc = item.description || item.snippet || '';
                        const url = item.url || '';
                        return `${title}\n${desc}\n(Source: ${url})`;
                    });
                    return snippets.join("\n\n");
                }
            } catch (maxunErr) {
                console.warn("⚠️ Maxun Primary Key failed, trying Secondary Key...", maxunErr.message || maxunErr);
                
                // === STRATEGY 1.5: Maxun Search Robot (Secondary Key Fallback) ===
                if (maxunSearcher2) {
                    try {
                        console.log("🕷️ Running Maxun Search Robot (Secondary Key)...");
                        const robot = await maxunSearcher2.create(`Search-${Date.now()}`, {
                            query: query,
                            mode: 'discover',
                            limit: 5
                        });

                        const runResult = await robot.run();
                        console.log("DEBUG: Secondary Key runResult structure:", JSON.stringify(runResult).substring(0, 500));
                        const results = extractSearchResults(runResult);
                        if (results && results.length > 0) {
                            console.log(`✅ Maxun Search (Secondary) returned ${results.length} results.`);
                            const snippets = results.map(item => {
                                const title = item.title || item.name || '';
                                const desc = item.description || item.snippet || '';
                                const url = item.url || '';
                                return `${title}\n${desc}\n(Source: ${url})`;
                            });
                            return snippets.join("\n\n");
                        } else {
                            console.warn("⚠️ Maxun Search (Secondary) returned empty results list:", runResult);
                        }
                    } catch (maxunErr2) {
                        console.warn("⚠️ Maxun Secondary Key also failed, falling back to Google...", maxunErr2.message || maxunErr2);
                    }
                }
            }
        }

        // === STRATEGY 2: Local Google Scrape Fallback ===
        let snippets = [];
        try {
            const googleUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
            const res = await fetch(googleUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36'
                }
            });

            if (res.ok) {
                const html = await res.text();
                // Simple regex to extract snippets from google search
                const regex = /<div class="BNeawe s3v9rd AP7Wnd">(.*?)<\/div>/g;
                let match;

                while ((match = regex.exec(html)) !== null && snippets.length < 5) {
                    const cleanText = match[1].replace(/<[^>]+>/g, '').trim();
                    if (cleanText && cleanText.length > 20) snippets.push(cleanText);
                }

                // If the first regex doesn't work, try another common class
                if (snippets.length === 0) {
                     const regex2 = /<div class="VwiC3b yXK7lf MUxGbd yDYNvb lyLwlc lEBKkf".*?>(.*?)<\/div>/g;
                     while ((match = regex2.exec(html)) !== null && snippets.length < 5) {
                        const cleanText = match[1].replace(/<[^>]+>/g, '').trim();
                        if (cleanText && cleanText.length > 20) snippets.push(cleanText);
                     }
                }
            }
        } catch(e) {
            console.warn("Google fetch failed", e.message);
        }

        // Final check
        if (snippets.length === 0) return "No results found on the web.";
        return snippets.join("\n\n");

    } catch (err) {
        console.error("Web Search Error:", err.message);
        return "An error occurred while searching.";
    }
}
