// services/llmService.js
// Lightweight LLM helper for use in services (not index.js scoped)
// Tries Groq → Anthropic → Gateway in priority order

import dotenv from 'dotenv';
dotenv.config();

/**
 * Ask the LLM a single question and get a text response
 * Used for dynamic scene planning in the reel engine
 */
export async function askLLM(prompt, maxTokens = 1500) {
    const messages = [
        {
            role: 'system',
            content: `Tu Brahmand AI Agent hai — ek expert Indian Instagram Reel director aur visual storyteller.
Tera kaam: Di gayi script ko poori tarah padhna, samajhna, aur uske hisaab se ek UNIQUE reel banana.
Jaisi script, waisi reel. Koi generic template nahi chalega.
- Warrior script → fort, sword, battle, glory visuals
- Devotional script → temple, aarti, murti, divine light visuals
- Festival script → rang, dhol, dance, celebration visuals
Jab JSON respond karo to SIRF valid JSON do — koi explanation ya markdown fences nahi.`
        },
        { role: 'user', content: prompt }
    ];

    const providers = [
        {
            url: 'https://api.groq.com/openai/v1/chat/completions',
            key: process.env.GROQ_API_KEY,
            model: 'llama-3.3-70b-versatile'
        },
        {
            url: 'https://api.anthropic.com/v1/messages',
            key: process.env.ANTHROPIC_API_KEY,
            model: 'claude-3-5-sonnet-20241022',
            isAnthropic: true
        }
    ];

    for (const provider of providers) {
        if (!provider.key) continue;
        try {
            const body = provider.isAnthropic 
                ? { model: provider.model, max_tokens: maxTokens, messages: [{ role: 'user', content: prompt }] }
                : { model: provider.model, messages, max_tokens: maxTokens };

            const response = await fetch(provider.url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${provider.key}`,
                    ...(provider.isAnthropic && { 'x-api-key': provider.key, 'anthropic-version': '2023-06-01' })
                },
                body: JSON.stringify(body)
            });

            const data = await response.json();
            if (response.ok) return provider.isAnthropic ? data.content[0].text : data.choices[0].message.content;
        } catch (e) { console.error(`Provider failed: ${provider.url}`); }
    }

    // Zero-config Pollinations AI Fallback
    const res = await fetch(`https://text.pollinations.ai/?seed=${Date.now()}&json=true`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages })
    });
    return await res.text();
}