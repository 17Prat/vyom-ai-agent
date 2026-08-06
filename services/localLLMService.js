let ollamaAvailable = false;

// Check if Ollama is running
export async function checkOllama() {
    try {
        const { default: ollama } = await import('ollama');
        await ollama.list();
        ollamaAvailable = true;
        console.log("✅ Ollama is running!");
        return true;
    } catch (error) {
        console.warn("⚠️ Ollama not running or ollama npm package not installed. Install from https://ollama.com");
        ollamaAvailable = false;
        return false;
    }
}

export async function getLocalAIResponse(messages) {
    try {
        // Check if Ollama is available
        if (!ollamaAvailable) {
            await checkOllama();
        }

        if (!ollamaAvailable) {
            throw new Error("Ollama not available");
        }

        const { default: ollama } = await import('ollama');
        console.log("🧠 Using Local LLM (Ollama)...");

        const response = await ollama.chat({
            model: 'llama3.2:1b', // ya 'llama3.1:8b' for better quality
            messages: messages,
            stream: false,
            options: {
                temperature: 0.8,
                top_p: 0.9,
                num_predict: 256
            }
        });

        return {
            text: response.message.content,
            model: 'Ollama (Local)',
            success: true
        };
    } catch (error) {
        console.error("❌ Local LLM Error:", error.message);
        return {
            text: null,
            model: 'Ollama (Local)',
            success: false,
            error: error.message
        };
    }
}

export function getFallbackResponse(messages) {
    const history = Array.isArray(messages) ? messages : [{ role: 'user', content: messages }];
    const lastUserMessage = history.filter(m => m.role === 'user').pop()?.content || '';
    const msg = lastUserMessage.toLowerCase().trim();

    // Specific feature explanations (Ecosystem and detailed responses)
    if (msg.match(/hanuman chalisa/)) {
        return {
            text: "Hanuman Chalisa bhagwan Hanuman ko samarpit ek bahut hi prasidh stotra hai. Isme 40 chaupaiyan hain aur yeh Tulsidas ji ne likha tha. Iska paath karne se mann shant hota hai aur sankat door hote hain.\n\nKya aap daily Hanuman Chalisa ka paath karte hain? 😊",
            model: 'Fallback (Ecosystem)',
            success: true
        };
    }

    if (msg.match(/temple finder/)) {
        return {
            text: "Bahut achha sawal! 🙏\n\n**Temple Finder** Brahmand App ka ek feature hai jo aapko aapke aas-paas ke mandiron ko dhoondhne mein help karta hai.\n\n**Ye kaise kaam karta hai:**\nApp aapki location use karta hai aur nearby temples dikhata hai — unki timing, aarti schedule, aur directions sab kuch.\n\n**Iska kya fayda hai:**\nJab bhi aap kisi naye sheher mein jaate hain, toh aap easily nearby temples dhoondh sakte hain.\n\n**Related features jo aapko pasand aa sakte hain:**\n1. **Live Darshan** — mandiron ke live aarti aur darshan\n2. **AI Jyotish** — mandir se related spiritual guidance\n\nKya main aapko in related features ke baare mein bataun? 😊",
            model: 'Fallback (Ecosystem)',
            success: true
        };
    }

    if (msg.match(/jaap counter|jaap/)) {
        return {
            text: "Bahut achha sawal! 🙏\n\n**Live Jaap Counter** Brahmand App ka ek feature hai jo aapke mantra jaap ko track karta hai.\n\n**Ye kaise kaam karta hai:**\nAap jaap shuru karein, app automatically count karta hai.\n\n**Iska kya fayda hai:**\nAapko count ka stress nahi hota. App quietly track karta hai, aap fully focused rehte hain.\n\n**Related features jo aapko pasand aa sakte hain:**\n1. **Mantra Library** — 100+ mantras with meaning\n2. **AI Jyotish** — personalised spiritual guidance\n\nKya main aapko in related features ke baare mein bataun? 😊",
            model: 'Fallback (Ecosystem)',
            success: true
        };
    }

    if (msg.match(/ai jyotish/)) {
        return {
            text: "Bahut achha sawal! 🙏\n\n**AI Jyotish** Brahmand App ka ek feature hai jo AI ki madad se personalised spiritual guidance deta hai.\n\n**Ye kaise kaam karta hai:**\nAap apni kundli ya sawal daalein, AI analysis karta hai aur aapko detailed guidance deta.\n\n**Related features jo aapko pasand aa sakte hain:**\n1. **Kundli Generator** — detailed kundli analysis\n2. **Rashifal** — daily horoscope updates\n\nKya main aapko in related features ke baare mein bataun? 😊",
            model: 'Fallback (Ecosystem)',
            success: true
        };
    }

    // Check if user is asking general questions first (USER QUESTIONS ALWAYS COME FIRST)
    if (msg.match(/what can i do|how does it work|features|explain|what is it|what is this|kya hai|kya kar sakta/)) {
        return {
            text: "It depends on what you're looking for. 😊 Some people use Brahmand to find nearby temples and watch Live Darshan. Others use it for daily Panchang, Kundli, AI Jyotish, or mantra chanting. Many people also read the Bhagavad Gita, while some join the community to help during emergencies (SOS). What would be most useful for you? ✨",
            model: 'Fallback (Human Framework)',
            success: true
        };
    }

    // Count user turns to determine conversation stage
    const userTurnsCount = history.filter(m => m.role === 'user').length;

    // Stage 1: Greeting
    if (userTurnsCount === 1) {
        if (msg.match(/yes|haan|yeah|speaking/)) {
            return {
                text: "Wonderful! Thank you for taking my call. My name is Brahmand and I'm calling from the Brahmand Team. Don't worry, this isn't a marketing call. I just wanted to share something that many people interested in Sanatan have found genuinely useful. Is this a good time to talk for about two minutes?",
                model: 'Fallback (Human Framework)',
                success: true
            };
        }
        if (msg.match(/busy|later|after/)) {
            return {
                text: "No problem at all. When would be a better time for me to call you back? 📅",
                model: 'Fallback (Human Framework)',
                success: true
            };
        }
        if (msg.match(/no|na|busy/)) {
            return {
                text: "I completely understand. Thank you for your time. Have a wonderful day. 🙏",
                model: 'Fallback (Human Framework)',
                success: true
            };
        }
        // Initial fallback start:
        return {
            text: "Hello! Good afternoon. Am I speaking with Pratham?",
            model: 'Fallback (Professional)',
            success: true
        };
    }

    // Stage 2: Small Talk / Discovery
    if (userTurnsCount === 2) {
        if (msg.match(/yes|haan|sure|ok|okay|two minutes|chalo/)) {
            return {
                text: "Before I explain anything, I'd like to know a little about you. That way I don't recommend something that's not useful. Can I ask you one quick question? 😊",
                model: 'Fallback (Professional)',
                success: true
            };
        }
        if (msg.match(/tomorrow|evening|after|pm|am/)) {
            return {
                text: "Got it, I have scheduled a callback for you. Have a blessed day! Har Har Mahadev! 🙏",
                model: 'Fallback (Professional)',
                success: true
            };
        }
    }

    // Stage 3: Lifestyle Discovery
    if (userTurnsCount === 3) {
        if (msg.match(/sure|ok|okay|yes|haan|go ahead|ask/)) {
            return {
                text: "What's something you enjoy the most—visiting temples, chanting mantras, reading scriptures, or learning about astrology? 🕉️",
                model: 'Fallback (Professional)',
                success: true
            };
        }
    }

    // Stage 4: Temple / Devotion Branches
    if (msg.match(/temple|visiting temples|explore/)) {
        return {
            text: "That's wonderful. Visiting temples regularly brings a different kind of peace. May I ask... Is there a particular temple you visit most often? 🌸",
            model: 'Fallback (Professional)',
            success: true
        };
    }

    if (msg.match(/siddhivinayak|shiv|shiva|bholenath|mahadew|krishna|kanha|ram|rama|hanuman|devi|durga/)) {
        return {
            text: `That's one of the most loved temples. Have you ever travelled somewhere and wished you could easily find nearby temples?`,
            model: 'Fallback (Professional)',
            success: true
        };
    }

    if (msg.match(/yes|haan|felt that way|always|often/)) {
        // Find if they are on Temple Path or Chanting Path
        const hasTempleInHistory = history.some(m => m.content.toLowerCase().includes('temple'));
        if (hasTempleInHistory) {
            return {
                text: "We heard the same thing from many devotees. That's why Brahmand includes a Temple Finder that helps you discover nearby temples wherever you are. Would something like that be useful for you? 😊",
                model: 'Fallback (Professional)',
                success: true
            };
        }
        
        return {
            text: "You're definitely not alone. That's exactly why one of our most loved features is the Live Jaap Counter. It quietly keeps track of every chant, so instead of worrying about the count, you can stay completely focused on your devotion. Would you like me to explain how it works?",
            model: 'Fallback (Professional)',
            success: true
        };
    }

    // Chanting path
    if (msg.match(/chant|mantra|jaap|chants/)) {
        return {
            text: "That's wonderful. 🙏 Maintaining a daily chanting routine takes real dedication. May I ask... Which mantra do you usually chant? 📿",
            model: 'Fallback (Professional)',
            success: true
        };
    }

    if (msg.match(/om namah|gayatri|hare krishna|mahamrityunjaya/)) {
        return {
            text: "Beautiful choice! Many devotees tell us that during longer Jaap sessions they sometimes lose track of their count. Has that ever happened to you?",
            model: 'Fallback (Professional)',
            success: true
        };
    }

    // Astrology path
    if (msg.match(/astrology|kundli|jyotish|horoscope|panchang/)) {
        return {
            text: "Interesting! Do you already have your Kundli, or have you never created one? 📊",
            model: 'Fallback (Professional)',
            success: true
        };
    }

    if (msg.match(/never|no|nhi|nahi|not yet/)) {
        return {
            text: "Many people told us they wanted quick spiritual guidance without searching through multiple websites. That's exactly why we created AI Jyotish to help generate your Kundli and get Panchang details in one place. Does that sound useful? 😊",
            model: 'Fallback (Professional)',
            success: true
        };
    }

    // Scriptures path
    if (msg.match(/scriptures|gita|library|reading/)) {
        return {
            text: "That's wonderful. Do you usually read scriptures from a physical book or on your phone?",
            model: 'Fallback (Professional)',
            success: true
        };
    }

    if (msg.match(/phone|mobile|digital/)) {
        return {
            text: "Then you'll appreciate Brahmand's Vedic Library, where scriptures like the Gita and Ramayana are organized for easy reading and progress tracking. Would something like that be useful?",
            model: 'Fallback (Professional)',
            success: true
        };
    }

    // Dynamic Download & Guide Installation
    if (msg.match(/aur kya|other features|aur kuch|useful/)) {
        return {
            text: "Brahmand (Sanatan Lok) app mein ye sabhi features milte hain:\n\n• **Sanatan Passport & SL ID**\n• **Ekant & Live Group Jaap Rooms**\n• **Temple Finder & Live Darshan**\n• **Kundli, Panchang & AI Jyotish**\n• **Vedic Scripture Library (Gita & Ramayana)**\n• **Community Feed, Circles & Messaging**\n• **Reels & Media Upload**\n• **Emergency SOS & Annadan Help**\n• **Local Jobs & Vendor Directory**\n\nKya aap ise download karke try karna chahenge? Main link bhej deta hoon! 😊",
            model: 'Fallback (Ecosystem List)',
            success: true
        };
    }

    if (msg.match(/okay|install|download|de do|bhejo/)) {
        return {
            text: "Perfect. I'm sending you the download link now. Please let me know once the installation starts. 📱",
            model: 'Fallback (Professional)',
            success: true
        };
    }

    // Step-by-step Setup
    if (msg.match(/started|installing|downloading/)) {
        return {
            text: "Great! Open the Play Store, tap Install, and let me know once the installation is complete. I'll wait.",
            model: 'Fallback (Professional)',
            success: true
        };
    }

    if (msg.match(/complete|done|installed/)) {
        return {
            text: "Excellent! Open the app. Enter your mobile number, and you will receive an OTP. Please enter it to create your Sanatan Passport.",
            model: 'Fallback (Professional)',
            success: true
        };
    }

    // Personalization & Devata mapping
    if (msg.match(/entered|otp|passport|done setup/)) {
        return {
            text: "Perfect! Your Sanatan Passport has been created. Before we begin, I'd like to personalize your experience. May I ask... Who's your Ishta Devata? (Shiva, Krishna, Hanuman, Ram, or Durga?)",
            model: 'Fallback (Professional)',
            success: true
        };
    }

    if (msg.match(/shiva|krishna|hanuman|ram|durga/)) {
        return {
            text: `Wonderful. I'll prioritize ${lastUserMessage}-related content, temples, mantras and recommendations for you. Thank you for your time today! I hope Brahmand becomes a valuable companion in your spiritual journey. Har Har Mahadev! 🙏`,
            model: 'Fallback (Professional)',
            success: true
        };
    }

    // Defaults
    return {
        text: "I understand. I think the Brahmand App could genuinely be useful for your spiritual practices. Would you like me to help you install it? 😊",
        model: 'Fallback (Professional)',
        success: true
    };
}
