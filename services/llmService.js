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

    // Try Groq first (fastest)
    const groqKey = process.env.GROQ_API_KEY || process.env.GROQ_API_KEY_2;
    if (groqKey) {
        try {
            const { Groq } = await import('groq-sdk');
            const groq = new Groq({ apiKey: groqKey });
            const res = await groq.chat.completions.create({
                model: 'llama-3.3-70b-versatile',
                messages,
                max_tokens: maxTokens,
                temperature: 0.7
            });
            return res.choices[0].message.content;
        } catch (e) {
            console.warn('⚠️ Groq LLM call failed:', e.message);
        }
    }

    // Try Anthropic Claude
    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    if (anthropicKey) {
        try {
            const Anthropic = (await import('@anthropic-ai/sdk')).default;
            const client = new Anthropic({ 
                apiKey: anthropicKey,
                baseURL: 'https://api.anthropic.com' // Bypass global environment variable conflicts
            });
            const res = await client.messages.create({
                model: 'claude-sonnet-4-5',
                max_tokens: maxTokens,
                messages: [{ role: 'user', content: prompt }]
            });
            return res.content[0].text;
        } catch (e) {
            console.warn('⚠️ Anthropic LLM call failed:', e.message);
        }
    }

    // Try LLM Gateway last
    const gatewayKey = process.env.LLM_GATEWAY_API_KEY;
    if (gatewayKey) {
        try {
            const res = await fetch('https://api.llmgateway.io/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${gatewayKey}`
                },
                body: JSON.stringify({ model: 'gemini-2.5-flash', messages, max_tokens: maxTokens, temperature: 0.7 })
            });
            const data = await res.json();
            return data.choices?.[0]?.message?.content || '';
        } catch (e) {
            console.warn('⚠️ Gateway LLM call failed:', e.message);
        }
    }

    throw new Error('All LLM providers failed — check your API keys in .env');
}
