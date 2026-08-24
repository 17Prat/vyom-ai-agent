import dotenv from 'dotenv';
import OutreachDatabase from './utils/outreachDb.js';
import SearchService from './services/searchService.js';
import { askLLM } from './services/llmService.js';
import { getInstagramProfileInfo, sendInstagramMessage, getLatestIncomingInstagramMessage } from './services/instagramService.js';
import logger from './utils/logger.js';

dotenv.config();

const db = new OutreachDatabase();
const searchService = new SearchService();

const CONFIG = {
  dailyLimit: parseInt(process.env.INSTAGRAM_DAILY_LIMIT) || 10,
  minDelayBetweenMessages: 10000,
  maxDelayBetweenMessages: 20000,
  autoReplyEnabled: true
};

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

async function evaluateSuitability(profile) {
    const prompt = ` 
Analyze this Instagram profile and decide if they are suitable and positive to target for promoting our premium "Brahmand" app (Sanatan, heritage, temple architecture, and mantra jaap app).

Username: ${profile.username}
Bio: ${profile.bio || 'No Bio'}

Rules:
- Reply YES if they show genuine interest in Sanatan Dharma, Hindu culture, ancient temples, Indian history, heritage, spirituality, meditation, or positive Indian culture.
- Reply NO if they are highly political, commercial spam, negative, or completely unrelated to these topics.

Response MUST be exactly "YES" or "NO". No explanation.
`;

  try {
    const answer = await askLLM(prompt, 100);
    const cleanAnswer = answer.trim().toUpperCase();
    logger.info(`🤖 LLM Suitability for @${profile.username}: ${cleanAnswer}`);
    return {
      isSuitable: cleanAnswer.includes('YES'),
      score: cleanAnswer.includes('YES') ? 80 : 20,
      reasons: [cleanAnswer]
    };
  } catch (err) {
    logger.warn(`⚠️ LLM suitability failed for @${profile.username}, defaulting to YES`);
    return { isSuitable: true, score: 50, reasons: [] };
  }
}

async function generatePersonalizedMessage(profile) {
  const prompt = `
Write a premium, beautiful, and highly personalized Instagram direct message (DM) in Hinglish (Hindi written in Roman script) introducing the "Brahmand" app to the user described below.

User Profile Info:
Username: ${profile.username}
Bio: ${profile.bio || ''}

Rules for the message:
1. **Calm, Elegant, and Premium Brand Voice:** "Apple meets NASA meets Ancient Indian Wisdom".
2. **Never sound like spam, cheap marketing, or clickbait.** No fake urgency.
3. Keep it brief (under 3-4 sentences/lines).
4. Reference their profile or their bio/theme if relevant to temples, culture, history, or spirituality.
5. Softly suggest they check out "Brahmand" (a premium Sanatan, mantra jaap, and heritage app).
6. End with a polite, non-pushy invite to talk.

DO NOT include any placeholder text. Provide ONLY the finalized Hinglish text of the message.
`;

  try {
    const msg = await askLLM(prompt, 800);
    return msg.trim().replace(/^"(.*)"$/, '$1');
  } catch (error) {
    return `Namaste!\nAapka profile aur content dekha, Sanatan Sanskriti aur wisdom ko lekar aapka prayas sach mein adbhut hai. Humne ek premium app banaya hai 'Brahmand' jo ancient Indian wisdom, mantra jaap aur heritage ko explore karne mein help karta hai. Aapko ye pasand aayega. Ek baar zaroor check karein.`;
  }
}

async function verifyIncomingMessage(messageText) {
  const prompt = `
Determine if this Instagram DM requires a response about our Sanatan/heritage app "Brahmand".
Message: "${messageText}"

Rules:
- Reply YES if the message is a question, a greeting, shows interest, or is related to spirituality, Sanatan, temples, or our app.
- Reply NO if it is spam, negative, or completely unrelated text.

Answer only YES or NO.
`;

  try {
    const answer = await askLLM(prompt, 100);
    return answer.trim().toUpperCase().includes('YES');
  } catch (e) {
    return true;
  }
}

async function checkSentimentAndBlacklist(username, messageText) {
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
    logger.info(`🤖 Sentiment Analysis for @${username}: ${sentiment}`);
    
    if (sentiment.includes('NEGATIVE')) {
        db.addToBlacklist('instagram', username, `Negative reply: "${messageText}"`);
        return 'negative';
    }
    return sentiment.includes('POSITIVE') ? 'positive' : 'neutral';
  } catch (e) {
    return 'neutral';
  }
}

async function handleAutoReply(username) {
  logger.info(`🤖 Starting Smart Instagram Auto-Reply loop for: @${username}...`);
  logger.info(`Polling every 15 seconds. Press Ctrl+C to stop.`);

  let lastSeenMessageText = null;

  while (true) {
    try {
      if (db.isBlacklisted('instagram', username)) {
          logger.info(`🚫 @${username} is blacklisted. Stopping auto-reply loop.`);
          break;
      }

      const res = await getLatestIncomingInstagramMessage(username);
      if (res.error) {
          logger.warn(`⚠️ Error checking messages: ${res.error}`);
      } else if (res.lastMessage) {
          const { lastMessage, isIncoming, chatHistory } = res;

          if (isIncoming && lastMessage !== lastSeenMessageText) {
              logger.info(`📥 New message from @${username}: "${lastMessage}"`);
              
              // Smart Filter: Emoji Reaction
              const isEmojiOnly = /^[\p{Extended_Pictographic}\s]+$/u.test(lastMessage.trim());
              if (isEmojiOnly) {
                  logger.info(`✨ Single emoji reaction detected. Replying with a respectful gesture.`);
                  await sendInstagramMessage(username, "🙏");
                  lastSeenMessageText = lastMessage;
                  continue;
              }

              // Smart Filter: Short Response
              const lowerMsg = lastMessage.trim().toLowerCase();
              if (['ok', 'okay', 'hmmm', 'hmm', 'nice', 'cool', 'good'].includes(lowerMsg)) {
                  logger.info(`✨ Short acknowledgement detected. Sending soft closing gesture.`);
                  await sendInstagramMessage(username, "Pranam! 🙏");
                  lastSeenMessageText = lastMessage;
                  continue;
              }

              const sentiment = await checkSentimentAndBlacklist(username, lastMessage);
              
              let contact = db.getContactByUsername('instagram', username);
              if (contact) {
                db.updateContact(contact.id, { status: sentiment === 'negative' ? 'BLACKLISTED' : 'REPLIED' });
              }

              if (sentiment === 'negative') {
                  logger.info(`🚫 @${username} blacklisted. No further replies will be sent.`);
                  break;
              }

              const shouldReply = await verifyIncomingMessage(lastMessage);
              if (!shouldReply) {
                  logger.info(`⏭️ Message ignored (unrelated/spam).`);
                  lastSeenMessageText = lastMessage;
                  continue;
              }

              logger.info(`🧠 Drafting reply...`);
              const prompt = `
You are the Brahmand App AI representative. You are having a warm, respectful, and natural chat with @${username} on Instagram DMs.
They just sent: "${lastMessage}"

Here is the recent chat history context:
${chatHistory.map(h => `${h.isIncoming ? username : 'Me'}: ${h.text}`).join('\n')}

About Brahmand App:
- It is a premium Sanatan, Indian culture, temple architecture, and mantra jaap app.
- Key features: exploring scientific secrets of ancient temples, mantra count tracker (Jaap), daily dharma quotes, and sacred scriptures.
- Website / Download: https://brahmand.app

Rules to generate response:
1. Read the user's message carefully and address their question directly.
2. If they ask what Brahmand is: Explain it elegantly.
3. If they show interest or ask for a link: Share https://brahmand.app in a calm way.
4. Tone: Extremely respectful, humble, calm ("Apple meets ancient Indian wisdom").
5. Language: Hinglish (Hindi in Roman script).
6. Length: 1-2 sentences.

Provide ONLY the text of the reply. No quotes.
`;
              const replyText = await askLLM(prompt, 500);
              logger.info(`📤 Sending auto-reply: "${replyText.trim()}"`);

              await sendInstagramMessage(username, replyText.trim());
              lastSeenMessageText = lastMessage;
          }
      }
    } catch (e) {
        logger.error(`❌ Error in auto-reply loop: ${e.message}`);
    }

    await delay(15000);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const isDryRun = args.includes('--dry-run');
  const sendIndex = args.indexOf('--send');
  const autoIndex = args.indexOf('--auto-reply');

  // Safety Governor Check
  if (!isDryRun) {
    const dailyCount = db.getDailyCount('instagram');
    if (dailyCount >= CONFIG.dailyLimit) {
      logger.warn(`⚠️ Safety Governor: Instagram daily outreach limit of ${CONFIG.dailyLimit} reached.`);
      logger.warn(`👉 Pausing campaign execution to prevent account suspension.`);
      process.exit(0);
    }
  }

  if (sendIndex !== -1 && args[sendIndex + 1]) {
    const targetUsername = args[sendIndex + 1];
    const messageText = args.slice(sendIndex + 2).join(' ') || "Namaste!";
    
    if (db.isBlacklisted('instagram', targetUsername)) {
      logger.warn(`🚫 @${targetUsername} is blacklisted. Skipping send.`);
      process.exit(0);
    }

    logger.info(`🚀 Sending custom Instagram DM to @${targetUsername}...`);
    const result = await sendInstagramMessage(targetUsername, messageText);
    logger.info(result);
    process.exit(0);
  } else if (autoIndex !== -1 && args[autoIndex + 1]) {
    const targetUsername = args[autoIndex + 1];
    await handleAutoReply(targetUsername);
    process.exit(0);
  } else {
    // Normal Campaign
    const userQuery = args.find(a => !a.startsWith('--'));
    const query = userQuery || 'sanatan dharma';
    
    logger.info(`🚀 Starting Upgraded Smart Instagram Outreach Campaign...`);
    logger.info(`Search Query: "${query}"`);

    const profiles = await searchService.searchInstagramProfiles(query, 5);
    if (profiles.length === 0) {
      logger.warn("❌ No profiles discovered.");
      return;
    }

    for (const profile of profiles) {
      if (db.isBlacklisted('instagram', profile.username)) continue;
      if (db.hasBeenContacted('instagram', profile.username, 24)) continue;

      const suitability = await evaluateSuitability(profile);
      if (!suitability.isSuitable) continue;

      const message = await generatePersonalizedMessage(profile);
      logger.info(`💬 Generated DM for @${profile.username}:\n${message}`);

      if (!isDryRun) {
        const contact = db.createContact({
          platform: 'instagram',
          platformId: profile.username,
          username: profile.username,
          name: profile.name,
          bio: profile.bio,
          score: suitability.score
        });

        const result = await sendInstagramMessage(profile.username, message);
        logger.info(`DM Result: ${result}`);
        
        db.incrementDailyCount('instagram');
        db.logMessage({
          contactId: contact.id,
          platform: 'instagram',
          direction: 'OUTGOING',
          content: message,
          status: 'SENT'
        });
        
        const delayMs = CONFIG.minDelayBetweenMessages + Math.random() * (CONFIG.maxDelayBetweenMessages - CONFIG.minDelayBetweenMessages);
        await delay(delayMs);
      }
    }
  }
  db.close();
}

main().catch(err => {
  logger.error("Fatal Campaign Error:", err);
});
