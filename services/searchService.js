import fetch from 'node-fetch';

export async function searchWeb(query) {
    try {
        console.log("🔍 Searching web for:", query);
        let snippets = [];

        // Simple Google scrape strategy
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
