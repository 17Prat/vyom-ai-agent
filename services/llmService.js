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

    // 🟢 PRIMARY 1: Try NVIDIA NIM (High Performance Llama 3.3 / Mistral / DeepSeek R1)
    const nvidiaKey = process.env.NVIDIA_API_KEY;
    if (nvidiaKey) {
        try {
            for (const nvidiaModel of [
                'meta/llama-3.1-70b-instruct',
                'meta/llama-3.1-8b-instruct'
            ]) {
                try {
                    const res = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                            "Authorization": `Bearer ${nvidiaKey}`
                        },
                        body: JSON.stringify({
                            model: nvidiaModel,
                            messages,
                            max_tokens: maxTokens,
                            temperature: 0.7
                        }),
                        signal: AbortSignal.timeout(12000)
                    });
                    if (res.ok) {
                        const data = await res.json();
                        const text = data.choices?.[0]?.message?.content;
                        if (text) return text;
                    } else {
                        const errText = await res.text();
                        console.warn(`⚠️ NVIDIA model ${nvidiaModel} failed (${res.status}):`, errText);
                    }
                } catch (err) {
                    console.warn(`⚠️ NVIDIA model ${nvidiaModel} failed:`, err.message);
                }
            }
        } catch (e) {
            console.warn('⚠️ NVIDIA LLM call failed:', e.message);
        }
    }

    // 🚀 IMMEDIATE FALLBACK: Try OpenRouter (if NVIDIA fails or disabled)
    const openrouterKey = process.env.OPENROUTER_API_KEY;
    if (openrouterKey) {
        try {
            for (const model of ['meta-llama/llama-3.3-70b-instruct:free', 'meta-llama/llama-3.3-70b-instruct', 'google/gemini-2.0-flash-exp:free', 'deepseek/deepseek-r1:free']) {
                try {
                    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${openrouterKey}`
                        },
                        body: JSON.stringify({ model, messages, max_tokens: maxTokens, temperature: 0.7 })
                    });
                    const data = await res.json();
                    if (data.choices?.[0]?.message?.content) {
                        return data.choices[0].message.content;
                    }
                } catch (e) {
                    console.warn(`⚠️ OpenRouter model ${model} failed:`, e.message);
                }
            }
        } catch (e) {
            console.warn('⚠️ OpenRouter LLM call failed:', e.message);
        }
    }


    // Try Groq (fastest)
    const groqKey = process.env.GROQ_API_KEY || process.env.GROQ_API_KEY_2;
    if (groqKey) {
        try {
            const { Groq } = await import('groq-sdk');
            const groq = new Groq({ apiKey: groqKey });
            const groqModels = ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'llama-3.2-3b-preview', 'mixtral-8x7b-32768', 'gemma2-9b-it'];
            for (const model of groqModels) {
                try {
                    const res = await groq.chat.completions.create({
                        model,
                        messages,
                        max_tokens: maxTokens,
                        temperature: 0.7
                    });
                    if (res.choices?.[0]?.message?.content) {
                        return res.choices[0].message.content;
                    }
                } catch (err) {
                    console.warn(`⚠️ Groq model ${model} failed:`, err.message);
                }
            }
        } catch (e) {
            console.warn('⚠️ Groq LLM call failed:', e.message);
        }
    }

    // Try Cerebras (ultra-fast and free)
    const cerebrasKey = process.env.CEREBRAS_API_KEY;
    if (cerebrasKey) {
        try {
            const Cerebras = (await import('@cerebras/cerebras_cloud_sdk')).default;
            const client = new Cerebras({ apiKey: cerebrasKey });
            for (const cerebrasModel of ['llama3.3-70b', 'llama3.1-8b', 'llama-3.3-70b', 'llama-3.1-8b']) {
                try {
                    const res = await client.chat.completions.create({
                        model: cerebrasModel,
                        messages,
                        max_tokens: maxTokens,
                        temperature: 0.7
                    });
                    if (res.choices?.[0]?.message?.content) {
                        return res.choices[0].message.content;
                    }
                } catch (err) {
                    console.warn(`⚠️ Cerebras model ${cerebrasModel} failed:`, err.message);
                }
            }
        } catch (e) {
            console.warn('⚠️ Cerebras LLM call failed:', e.message);
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
            const claudeModels = [
                'claude-3-5-sonnet-20241022',
                'claude-3-5-haiku-20241022',
                'claude-3-7-sonnet-20250219',
                'claude-3-5-sonnet-latest',
                'claude-3-haiku-20240307'
            ];
            for (const claudeModel of claudeModels) {
                try {
                    const res = await client.messages.create({
                        model: claudeModel,
                        max_tokens: maxTokens,
                        messages: [{ role: 'user', content: prompt }]
                    });
                    if (res.content?.[0]?.text) {
                        return res.content[0].text;
                    }
                } catch (err) {
                    console.warn(`⚠️ Claude model ${claudeModel} failed:`, err.message);
                }
            }
        } catch (e) {
            console.warn('⚠️ Anthropic LLM call failed:', e.message);
        }
    }

    // Try OpenAI
    const openAIKey = process.env.OPENAI_API_KEY;
    if (openAIKey) {
        try {
            const res = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${openAIKey}`
                },
                body: JSON.stringify({ model: 'gpt-4o-mini', messages, max_tokens: maxTokens, temperature: 0.7 })
            });
            const data = await res.json();
            if (data.choices?.[0]?.message?.content) {
                return data.choices[0].message.content;
            }
        } catch (e) {
            console.warn('⚠️ OpenAI LLM call failed:', e.message);
        }
    }

    // Try Google Gemini (Free Tier Key)
    const geminiKey = process.env.GEMINI_API_KEY;
    if (geminiKey) {
        for (const model of ['gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-1.5-pro']) {
            try {
                const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`;
                const res = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }] })
                });
                const data = await res.json();
                const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
                if (text) return text;
            } catch (e) {
                console.warn(`⚠️ Gemini model ${model} failed:`, e.message);
            }
        }
    }

    // Try GitHub Models (Free GPT-4o / GPT-4o-mini with free GitHub Personal Access Token)
    const ghToken = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
    if (ghToken) {
        for (const model of ['gpt-4o-mini', 'gpt-4o', 'Meta-Llama-3.3-70B-Instruct']) {
            try {
                const res = await fetch('https://models.inference.ai.azure.com/chat/completions', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${ghToken}`
                    },
                    body: JSON.stringify({ model, messages, max_tokens: maxTokens, temperature: 0.7 })
                });
                const data = await res.json();
                if (data.choices?.[0]?.message?.content) {
                    return data.choices[0].message.content;
                }
            } catch (e) {
                console.warn(`⚠️ GitHub Models ${model} failed:`, e.message);
            }
        }
    }


    // Ultimate Zero-Config Free Fallback: Pollinations AI Text
    try {
        console.log('🌸 Pollinations AI Text Fallback (Free Tier)...');
        const res = await fetch('https://text.pollinations.ai/openai', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ messages, model: 'openai', temperature: 0.7 })
        });
        const data = await res.json();
        const text = data.choices?.[0]?.message?.content;
        if (text) return text;
    } catch (e) {
        console.warn('⚠️ Pollinations AI Text fallback failed:', e.message);
    }

    throw new Error('All LLM providers failed — please verify your API keys in .env');
}
 