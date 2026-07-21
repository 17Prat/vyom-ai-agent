import fetch from 'node-fetch';

export async function searchWeb(query) {
    try {
        console.log("🔍 Searching web for:", query);
        const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
        const res = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36'
            }
        });

        if (!res.ok) return null;

        const html = await res.text();
        const snippets = [];
        const regex = /<a class="result__snippet[^>]*>(.*?)<\/a>/g;
        let match;
        
        while ((match = regex.exec(html)) !== null && snippets.length < 5) {
            const cleanText = match[1].replace(/<[^>]+>/g, '').trim();
            if (cleanText) snippets.push(cleanText);
        }

        if (snippets.length === 0) return null;
        return snippets.join("\n\n");
    } catch (err) {
        console.error("Web Search Error:", err.message);
        return null;
    }
}
