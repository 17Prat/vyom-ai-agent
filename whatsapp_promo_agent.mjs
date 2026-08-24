import dotenv from 'dotenv';
import { sendWhatsappMessage, getLatestIncomingWhatsappMessage } from './services/whatsappService.js';
import { askLLM } from './services/llmService.js';
import { hasBeenContacted, isBlacklisted, logOutreach, blacklistUser, recordResponse, getDailyOutreachCount } from './utils/outreachDb.js';

dotenv.config();

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function verifyIncomingMessage(messageText) {
    const prompt = `
Determine if this WhatsApp message requires a response about our Sanatan/heritage app "Brahmand".
Message: "${messageText}"

Rules:
- Reply YES if the message is a question, a greeting, shows interest, or is related to spirituality, Sanatan, temples, or our app.
- Reply NO if it is a random forward, spam, emoji-only, or totally unrelated text.

Answer only YES or NO.
`;

    try {
        const answer = await askLLM(prompt, 100);
        return answer.trim().toUpperCase().includes('YES');
    } catch (e) {
        return true;
    }
}

async function checkSentimentAndBlacklist(contactName, messageText) {
    const prompt = `
Analyze the sentiment of this user's message regarding our outreach.
Message: "${messageText}"

Rules:
- Reply "NEGATIVE" if they ask us to stop messaging them, say "unsubscribe", call us spam, show anger, or refuse politely (e.g. "not interested", "stop").
- Reply "POSITIVE" if they show interest, ask a question, say thanks, or are polite.
- Reply "NEUTRAL" otherwise.

Answer ONLY with one word: POSITIVE, NEGATIVE, or NEUTRAL.
`;

    try {
        const result = await askLLM(prompt, 100);
        const sentiment = result.trim().toUpperCase();
        console.log(`🤖 Sentiment Analysis for "${contactName}": ${sentiment}`);
        
        if (sentiment.includes('NEGATIVE')) {
            blacklistUser('whatsapp', contactName, `Negative reply: "${messageText}"`);
            return 'negative';
        }
        return sentiment.includes('POSITIVE') ? 'positive' : 'neutral';
    } catch (e) {
        return 'neutral';
    }
}

async function handleAutoReply(contactName) {
    console.log(`🤖 Starting Upgraded WhatsApp Agent for: "${contactName}"...`);
    console.log(`Polling every 10 seconds. Press Ctrl+C to stop.`);

    let lastSeenMessageText = null;

    while (true) {
        try {
            // Check blacklist
            if (isBlacklisted('whatsapp', contactName)) {
                console.log(`🚫 "${contactName}" is blacklisted. Stopping auto-reply loop.`);
                break;
            }

            const res = await getLatestIncomingWhatsappMessage(contactName);
            if (res.error) {
                console.log(`⚠️ Error checking messages: ${res.error}`);
            } else if (res.lastMessage) {
                const { lastMessage, isIncoming, chatHistory } = res;

                if (isIncoming && lastMessage !== lastSeenMessageText) {
                    console.log(`📥 New message from "${contactName}": "${lastMessage}"`);
                    
                    // Check sentiment & handle blacklist
                    const sentiment = await checkSentimentAndBlacklist(contactName, lastMessage);
                    recordResponse('whatsapp', contactName, lastMessage, sentiment);

                    if (sentiment === 'negative') {
                        console.log(`🚫 "${contactName}" blacklisted. No further replies will be sent.`);
                        break;
                    }

                    // Verify if reply is needed
                    const shouldReply = await verifyIncomingMessage(lastMessage);
                    if (!shouldReply) {
                        console.log(`⏭️ Message ignored (unrelated/spam).`);
                        lastSeenMessageText = lastMessage;
                        continue;
                    }

                    console.log(`🧠 Drafting contextual reply based on user message...`);
                    const prompt = `
You are the Brahmand App AI representative. You are having a warm, respectful, and natural chat with "${contactName}" on WhatsApp.
They just sent: "${lastMessage}"

Here is the recent chat history context:
${chatHistory.map(h => `${h.isIncoming ? contactName : 'Me'}: ${h.text}`).join('\n')}

About Brahmand App:
- It is a premium Sanatan, Indian culture, temple architecture, and mantra jaap app.
- Key features: exploring scientific secrets of ancient temples, mantra count tracker (Jaap), daily dharma quotes, and sacred scriptures.
- Website / Download: https://brahmand.app

Rules to generate response:
1. Read the user's message carefully and address their question directly.
2. **If they ask what Brahmand is:** Explain it elegantly as a platform for temple science and spiritual growth.
3. **If they show interest or ask for a link:** Share the website URL (https://brahmand.app) in a calm, non-pushy way.
4. **If they say thank you/greeting:** Respond politely.
5. Language: Premium Hinglish (Hindi in Roman script).
6. Tone: Extremely respectful, humble, calm ("Apple meets ancient Indian wisdom").
7. Length: 1-2 sentences. No emojis spam.

Provide ONLY the text of the reply. No quotes.
`;
                    const replyText = await askLLM(prompt, 500);
                    console.log(`📤 Sending auto-reply: "${replyText.trim()}"`);

                    await sendWhatsappMessage(contactName, replyText.trim());
                    lastSeenMessageText = lastMessage;
                }
            }
        } catch (e) {
            console.error(`❌ Error in auto-reply loop:`, e.message);
        }

        await delay(10000);
    }
}

async function main() {
    const args = process.argv.slice(2);
    const modeIndex = args.indexOf('--send');
    const autoIndex = args.indexOf('--auto-reply');

    if (modeIndex !== -1 && args[modeIndex + 1]) {
        const recipient = args[modeIndex + 1];
        const messageText = args.slice(modeIndex + 2).join(' ') || `Pranam ${recipient} ji 🙏\nKaise hain aap? 😊 Ek chhoti si baat poochni thi… kya aapko kabhi mandiron se judi purani shastra-vidya aur unke peeche chhupe adhyatmik vigyan ke baare mein jaanne ka mann hua hai?`;

        // Safety Governor Check
        const dailyCount = getDailyOutreachCount('whatsapp');
        const DAILY_LIMIT = 25;
        if (dailyCount >= DAILY_LIMIT) {
            console.log(`\n⚠️ Safety Governor: WhatsApp daily promo limit of ${DAILY_LIMIT} reached (Sent today: ${dailyCount}).`);
            console.log(`👉 Pausing execution to protect your WhatsApp account from being banned.`);
            process.exit(0);
        }

        // Blacklist check
        if (isBlacklisted('whatsapp', recipient)) {
            console.log(`🚫 "${recipient}" is blacklisted. Skipping send.`);
            process.exit(0);
        }

        if (hasBeenContacted('whatsapp', recipient)) {
            console.log(`⏭️ "${recipient}" has already received a promotional message in database. Skipping.`);
            process.exit(0);
        }

        console.log(`🚀 Sending promo message to: "${recipient}"`);
        const result = await sendWhatsappMessage(recipient, messageText);
        
        try {
            const parsed = JSON.parse(result);
            if (parsed.success) {
                logOutreach('whatsapp', recipient, 'sent', messageText);
            } else {
                logOutreach('whatsapp', recipient, 'failed', parsed.error || 'unknown');
            }
        } catch(e) {
            logOutreach('whatsapp', recipient, 'unknown', result);
        }
        
        console.log(result);
        process.exit(0);
    } else if (autoIndex !== -1 && args[autoIndex + 1]) {
        const contact = args[autoIndex + 1];
        await handleAutoReply(contact);
    } else {
        console.log(`
Brahmand WhatsApp Promo & Auto-Reply Agent (Upgraded)

Usage:
  node whatsapp_promo_agent.mjs --send <contact_name_or_number> "<message>"
  node whatsapp_promo_agent.mjs --auto-reply <contact_name>
`);
        process.exit(0);
    }
}

main().catch(err => {
    console.error("Fatal Error in WhatsApp Agent:", err);
});
