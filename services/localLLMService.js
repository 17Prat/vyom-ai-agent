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

    const assistantMessages = history.filter(m => m.role === 'assistant');
    const lastAssistantMessage = assistantMessages.length > 0 ? assistantMessages[assistantMessages.length - 1].content : '';
    const lastAssistantMessageLower = lastAssistantMessage.toLowerCase();

    const isYesOrOk = /^(yes|ok|okay|haan|sure|ha|haa|yep|yeah|indeed|correct|speaking|yes please|go ahead|ask)$/i.test(msg);

    // Context check: If bot previously offered installation/features and user says ok/yes
    if (isYesOrOk && lastAssistantMessageLower.includes('hanuman chalisa') && lastAssistantMessageLower.includes('daily')) {
        return {
            text: "Bahut sundar! 🙏 Brahmand App mein aapko ek dedicated Chanting aur Jaap section milega jahan aap Hanuman Chalisa ke sath-sath aur bhi kai mantras aur stotras (jaise Gayatri Mantra, Mahamrityunjaya Mantra) ko counter aur music audio ke sath chant kar sakte hain.\n\nKya aap ise try karna chahenge? Main download link bhej deta hoon! 😊",
            model: 'Fallback (Ecosystem)',
            success: true
        };
    }

    if (isYesOrOk && (lastAssistantMessageLower.includes('personalize your journey') || lastAssistantMessageLower.includes('visiting temples'))) {
        return {
            text: "Aap inme se kisi bhi option ko select kar sakte hain—jaise temples, chanting, ya scriptures. Chaliye, main aapko app ke sabse popular feature 'Live Jaap Counter' ke baare mein batata hoon jo mantra jaap ko automatically track karta hai.\n\nKya main aapko iske baare mein bataun? 😊",
            model: 'Fallback (Ecosystem)',
            success: true
        };
    }

    if (isYesOrOk && (lastAssistantMessageLower.includes('install') || lastAssistantMessageLower.includes('download') || lastAssistantMessageLower.includes('bataun'))) {
        if (lastAssistantMessageLower.includes('install') || lastAssistantMessageLower.includes('download')) {
            return {
                text: "Bahut achha! 🎉 Main app install karne mein aapki help karta hoon.\n\n**Brahmand App Install Kaise Karein:**\n\n**For Android (Google Play Store):**\n1. Play Store kholiye aur search karein: **Brahmand AI**\n2. **Install** button tap karein.\n3. Link: https://play.google.com/store/apps/details?id=com.brahmand.app\n\n**For iOS (Apple App Store):**\n1. App Store kholiye aur search karein: **Brahmand AI**\n2. **Get / Download** button tap karein.\n3. Link: https://apps.apple.com/app/brahmand-app/id6765467224\n\nInstall karne ke baad explore karein aur apna experience zaroor batayein! 😊\n\nKya install karne mein koi problem ho rahi hai?",
                model: 'Fallback (Ecosystem)',
                success: true
            };
        }
        if (lastAssistantMessageLower.includes('jaap counter') || lastAssistantMessageLower.includes('chanting')) {
            return {
                text: "Bahut achha! 🙏\n\n**Live Jaap Counter** Brahmand App ka ek feature hai jo aapke mantra jaap ko track karta hai.\n\n**Ye kaise kaam karta hai:**\nAap jaap shuru karein, app automatically count karta hai.\n\n**Iska kya fayda hai:**\nAapko count ka stress nahi hai. App quietly track karta hai, aap sirf devotion mein rahein.\n\nKya main aapko iske baare mein aur detail bataun? 😊",
                model: 'Fallback (Ecosystem)',
                success: true
            };
        }
    }

    // Specific feature explanations (Ecosystem and detailed responses)
    if (msg.match(/hanuman chalisa/)) {
        return {
            text: "Hanuman Chalisa bhagwan Hanuman ko samarpit ek bahut hi prasidh stotra hai. Isme 40 chaupaiyan hain aur yeh Tulsidas ji ne likha tha. Iska paath karne se mann shant hota hai aur sankat door hote hain.\n\nMain aapki isko aur acche se jaan ne mein madad kar sakta hoon. Kya aap daily Hanuman Chalisa ka paath karte hain? 😊",
            model: 'Fallback (Ecosystem)',
            success: true
        };
    }

    if (msg.match(/temple finder|find temple|nearby temple|temples|mandir|location/)) {
        return {
            text: "Bahut achha sawal! 🙏\n\n**Temple Finder**\n\n**Ye kya hai:**\nBrahmand App ka ek special location-based feature jo aapko nearby temples ki lists dikhata hai.\n\n**Ye kaise kaam karta hai:**\nApp aapki geographic GPS coordinates location scan karta hai aur surrounding radius ke saare temples list karta hai.\n\n**Iska kya fayda hai:**\nKisi bhi naye sheher mein travel karte waqt aap aasaani se mandiron ki detail, timing, aur directions pa sakte hain.\n\n**Ise kaise use karein:**\nHome screen kholiye → 'Temple Finder' icon select karein → Nearby temples search results screen par locate karein.\n\n**Related Features:**\n1. **Live Darshan** — live mandir streamings\n2. **AI Jyotish** — personalized birth chart calculations\n\nKya main aapko in related features ke baare mein bataun? 😊",
            model: 'Fallback (Ecosystem)',
            success: true
        };
    }

    if (msg.match(/jaap counter|jaap|chant|mala|counter|meditation/)) {
        return {
            text: "Bahut achha sawal! 🙏\n\n**Live Jaap Counter**\n\n**Ye kya hai:**\nChanting tracking utility jo aapke dynamic mantra count ko real-time measure karti hai.\n\n**Ye kaise kaam karta hai:**\nChanting start karte hi Mala count increase hota hai aur details database mein compile hoti hain.\n\n**Iska kya fayda hai:**\nJaap karte waqt counting yaad rakhne ki tension door hoti hai, aur focus devotion par rehta hai.\n\n**Ise kaise use karein:**\nApp kholiye → 'Live Jaap Counter' select karein → Mantra list choose karke start button press karein.\n\n**Related Features:**\n1. **Mantra Library** — 100+ mantras meanings ke sath\n2. **Daily Sadhana** — daily tracking routines\n\nKya main aapko in related features ke baare mein bataun? 😊",
            model: 'Fallback (Ecosystem)',
            success: true
        };
    }

    if (msg.match(/ai jyotish|jyotish|astrology|kundli|horoscope|panchang|muhurat|stars|planetary/)) {
        return {
            text: "Bahut achha sawal! 🙏\n\n**AI Jyotish**\n\n**Ye kya hai:**\nSpiritual guidance feature jo smart artificial intelligence analysis standard provide karta hai.\n\n**Ye kaise kaam karta hai:**\nAap apni birth details aur doubts input karte hain, aur system instant astrological details check karke reply deta hai.\n\n**Iska kya fayda hai:**\nPersonalized kundli aur daily life queries ke answers bina manual pandit consultant ke milte hain.\n\n**Ise kaise use karein:**\nApp login karein → 'AI Jyotish' select karein → Apni request query text box mein write karke submit karein.\n\n**Related Features:**\n1. **Kundli Generator** — D1 & D9 charts generations\n2. **Rashifal** — daily Moon predictions\n\nKya main aapko in related features ke baare mein bataun? 😊",
            model: 'Fallback (Ecosystem)',
            success: true
        };
    }

    if (msg.match(/sos|emergency|help|broadcasting|rescue|danger|accident|volunteers/)) {
        return {
            text: "Bahut achha sawal! 🙏\n\n**SOS Emergency Help**\n\n**Ye kya hai:**\nEk real-time geofenced emergency notification system jo local area volunteers ko alerts bhejta hai.\n\n**Ye kaise kaam karta hai:**\nJab aap SOS trigger karte hain, toh app aapki location scan karke 1-10KM ke radius mein registered volunteers ko rescue notifications bhejta hai.\n\n**Iska kya fayda hai:**\nAccident, medical emergency, ya kisi bhi danger situation mein aapko local community volunteers se instant physical support mil jata hai.\n\n**Ise kaise use karein:**\nApp home screen par big red 'SOS' button tap karein → details confirm karke broadcast trigger karein.\n\n**Related Features:**\n1. **Blood Donation** — volunteer blood matching network\n2. **Annadan** — emergency food sharing module\n\nKya main aapko in related features ke baare mein bataun? 😊",
            model: 'Fallback (Ecosystem)',
            success: true
        };
    }

    if (msg.match(/blood|donation|donor|hospital/)) {
        return {
            text: "Bahut achha sawal! 🙏\n\n**Blood Donation Volunteer Registry**\n\n**Ye kya hai:**\nEk live volunteer database network jo blood donors aur matching requests ko local area mein link karta hai.\n\n**Ye kaise kaam karta hai:**\nDonors apna blood group aur location details register karte hain. Emergency aane par, search filters local matching donors ko instantly request alert notification bhejte hain.\n\n**Iska kya fayda hai:**\nHospital emergency ke waqt bina delays ke aapko local, verified blood donors mil sakte hain aur aap kisi ki jaan bacha sakte hain.\n\n**Ise kaise use karein:**\nApp menu mein 'Blood Donation' icon select karein → Donor banne ke liye register karein ya request create karein.\n\n**Related Features:**\n1. **SOS Emergency** — location-based rescue broadcast\n2. **Annadan** — food donation network\n\nKya main aapko in related features ke baare mein bataun? 😊",
            model: 'Fallback (Ecosystem)',
            success: true
        };
    }

    if (msg.match(/annadan|food|meal|donate food|feed/)) {
        return {
            text: "Bahut achha sawal! 🙏\n\n**Annadan Feed Program**\n\n**Ye kya hai:**\nEk resource management feature jo food donors, restaurants, aur local mandiron ko connect karta hai.\n\n**Ye kaise kaam karta hai:**\nDonors leftover ya fresh food supply listing post karte hain. Nearby NGOs aur temple volunteers list dhoondh kar needy locations tak food distribute karte hain.\n\n**Iska kya fayda hai:**\nFood waste reduce hota hai aur local area mein bhookhe logo tak poshtik bhojan aasaani se pahunch jata hai.\n\n**Ise kaise use karein:**\nApp screen par 'Annadan' module tap karein → Food donate karein ya distributor volunteer request log karein.\n\n**Related Features:**\n1. **Financial Help / Charity** — verified temple donations\n2. **SOS Help** — local volunteer networking\n\nKya main aapko in related features ke baare mein bataun? 😊",
            model: 'Fallback (Ecosystem)',
            success: true
        };
    }

    if (msg.match(/passport|sl id|identity|profile|points|achievements|card/)) {
        return {
            text: "Bahut achha sawal! 🙏\n\n**Sanatan Passport (SL ID)**\n\n**Ye kya hai:**\nDevotees ke liye ek uniquely generated digital profile status card jo unke spiritual achievements record karta hai.\n\n**Ye kaise kaam karta hai:**\nApp mein aapki daily sadhana, jaap counts, temple visits, aur volunteering records automatic points mein update hokar aapke levels increase karte hain.\n\n**Iska kya fayda hai:**\nAapki spiritual consistency build hoti hai, aur community verification (jaise local circles entry) mein unique SL ID help karti hai.\n\n**Ise kaise use karein:**\nApp dashboard par 'My Profile' or 'Sanatan Passport' section tap karke card view, Gotra, aur milestones details access karein.\n\n**Related Features:**\n1. **Live Jaap Counter** — track daily jaap to gain passport points\n2. **Achievements & Badges** — download certificates for spiritual milestones\n\nKya main aapko in related features ke baare mein bataun? 😊",
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

     const userTurnsCount = history.filter(m => m.role === 'user').length;
     const isNo = /^(no|nhi|nahi|not now|busy|later|stop|exit|never)$/i.test(msg) || msg.match(/\b(no|nhi|nahi|busy)\b/);

    // Initial check: if no conversation history, prompt greeting.
    if (userTurnsCount === 0) {
        return {
            text: "Hey! Good to see you. This is Brahmand — am I talking to Pratham?",
            model: 'Fallback (Script)',
            success: true
        };
    }

    // Context-driven Conversation Script progression
    if (lastAssistantMessageLower.includes('talking to pratham') || lastAssistantMessageLower.includes('speaking with pratham')) {
        if (isNo) {
            return {
                text: "I completely understand. Thank you for your time. Have a wonderful day. 🙏",
                model: 'Fallback (Script)',
                success: true
            };
        }
        return {
            text: "Awesome, Pratham! 🙏 Great to connect with you. I promise this won't be a sales call — just a genuine conversation. Do you have 2 minutes?",
            model: 'Fallback (Script)',
            success: true
        };
    }

    if (lastAssistantMessageLower.includes('2 minutes') || lastAssistantMessageLower.includes('two minutes')) {
        if (isNo) {
            return {
                text: "No problem at all! Jab aap free ho tab connect karenge. Have a blessed day! Har Har Mahadev! 🙏",
                model: 'Fallback (Script)',
                success: true
            };
        }
        return {
            text: "Perfect! 😊 Quick question — do you follow any spiritual practice? Like chanting, temple visits, or reading scriptures?",
            model: 'Fallback (Script)',
            success: true
        };
    }

    if (lastAssistantMessageLower.includes('spiritual practice')) {
        if (msg.match(/temple|visit|mandir/)) {
            return {
                text: "That's wonderful, Pratham! 🙏 Visiting temples regularly brings a different kind of peace.\n\nHave you ever been to a new city and struggled to find a temple nearby? Timings, aarti schedule, directions?",
                model: 'Fallback (Script)',
                success: true
            };
        }
        if (msg.match(/scriptures|gita|read|book|library/)) {
            return {
                text: "That's wonderful, Pratham! 🙏 Reading scriptures is a great way to gain wisdom.\n\nDo you usually read scriptures from a physical book or on your phone?",
                model: 'Fallback (Script)',
                success: true
            };
        }
        if (msg.match(/astrology|jyotish|kundli|horoscope/)) {
            return {
                text: "Interesting! Do you already have your Kundli, or have you never created one? 📊",
                model: 'Fallback (Script)',
                success: true
            };
        }
        return {
            text: "That's wonderful, Pratham! 🙏 Hanuman Chalisa is powerful.\n\nDo you ever lose track of how many times you've chanted? Like, you start but forget the count?",
            model: 'Fallback (Script)',
            success: true
        };
    }

    if (lastAssistantMessageLower.includes('forget the count') || lastAssistantMessageLower.includes('lose track')) {
        return {
            text: "I totally get that! 😊 That's exactly why Brahmand App has a **Live Jaap Counter**. It automatically tracks every chant — you just focus on devotion. No stress about counting.\n\nWould that be helpful for you?",
            model: 'Fallback (Script)',
            success: true
        };
    }

    if (lastAssistantMessageLower.includes('would that be helpful for you')) {
        return {
            text: "Glad to hear that! 🙏\n\nAnother thing — have you ever been to a new city and struggled to find a temple nearby? Timings, aarti schedule, directions?",
            model: 'Fallback (Script)',
            success: true
        };
    }

    if (lastAssistantMessageLower.includes('timings, aarti schedule, directions')) {
        return {
            text: "Right! That's why we built **Temple Finder**. It shows you nearby temples, their timings, aarti schedules, and even gives you directions.\n\nPlus, **Live Darshan** — you can watch live aarti from home.\n\nWould that make your travels easier?",
            model: 'Fallback (Script)',
            success: true
        };
    }

    if (lastAssistantMessageLower.includes('would that make your travels easier')) {
        return {
            text: "Awesome! 🙏\n\nOne more thing — do you ever seek spiritual guidance? Like — what should I do about my career? Relationship? Health?",
            model: 'Fallback (Script)',
            success: true
        };
    }

    if (lastAssistantMessageLower.includes('career? relationship? health')) {
        return {
            text: "I understand. 😊 Brahmand App has **AI Jyotish**. You ask any question — AI gives you guidance based on Bhagavad Gita and Vedic astrology. Completely free, completely instant.\n\nAnd you can also generate your **Kundli** for free. Birth chart, planets, houses, dosha analysis — everything.\n\nWould you like to try that?",
            model: 'Fallback (Script)',
            success: true
        };
    }

    if (lastAssistantMessageLower.includes('would you like to try that')) {
        return {
            text: "Yes, 100% free! 🙏 No limits, no payments.\n\nThere's also a **Vedic Library** — 100+ scriptures. Gita, Ramayan, Vedas, Upanishads. Offline reading, bookmarks, dark mode, translations.\n\nDo you enjoy reading scriptures?",
            model: 'Fallback (Script)',
            success: true
        };
    }

    if (lastAssistantMessageLower.includes('do you enjoy reading scriptures')) {
        return {
            text: "I get it. 🙏 Vedic Library lets you read chapter by chapter. Bookmark where you stopped. Reading history saves automatically. And dark mode for night reading — no eye strain.\n\nDo you think that would help you read more?",
            model: 'Fallback (Script)',
            success: true
        };
    }

    if (lastAssistantMessageLower.includes('help you read more')) {
        return {
            text: "Awesome! 😊\n\nAnd one more thing — do you ever want to help people? Like emergencies, blood donation, or food donation?",
            model: 'Fallback (Script)',
            success: true
        };
    }

    if (lastAssistantMessageLower.includes('emergencies, blood donation, or food donation')) {
        return {
            text: "That's beautiful, Pratham! 🙏\n\nBrahmand App has **SOS Emergency** — one click help request. Nearby volunteers get alerted instantly.\n\n**Blood Donation** — donor registry, emergency alerts.\n**Annadan** — food donation and distribution.\n\nWould you like to be part of this community?",
            model: 'Fallback (Script)',
            success: true
        };
    }

    if (lastAssistantMessageLower.includes('would you like to be part of this community')) {
        return {
            text: "That's wonderful! 🙏 You're a real blessing.\n\nThere's also **Community Circles** — you can create your own group. Invite people, share posts, chat, organize events.\n\nAnd **Sanatan Passport** — your spiritual identity card. SL ID, badges, jaap stats, karma progress. Share your spiritual journey with the world.\n\nWould you like to create your spiritual identity?",
            model: 'Fallback (Script)',
            success: true
        };
    }

    if (lastAssistantMessageLower.includes('would you like to create your spiritual identity')) {
        return {
            text: "I'm glad you like it, Pratham! 😊\n\nAnd finally — **Spiritual Reels & Posts**. You can create and share content — reels, images, text posts. Like, comment, share — just like social media. Daily quotes, panchang, festival updates — everything.\n\nWould that keep you connected daily?",
            model: 'Fallback (Script)',
            success: true
        };
    }

    if (lastAssistantMessageLower.includes('would that keep you connected daily')) {
        return {
            text: "Absolutely! I'd check it every day.\n\nOne last thing — **Jaap Leaderboard** and **Global Live Counter**. You can see how many people are chanting right now. How many mantras have been chanted globally. You can contribute too!\n\nPlus **Live Spiritual Rooms** — chant with people worldwide. Public rooms, private rooms, group chanting.\n\nWould you like to be part of a global chanting community?",
            model: 'Fallback (Script)',
            success: true
        };
    }

    if (lastAssistantMessageLower.includes('part of a global chanting community')) {
        return {
            text: "I'm so happy to hear that, Pratham! 🎉\n\nNow — would you like to download the app and start your journey?",
            model: 'Fallback (Script)',
            success: true
        };
    }

    if (lastAssistantMessageLower.includes('start your journey') || lastAssistantMessageLower.includes('download the app')) {
        if (isNo) {
            return {
                text: "🙏 Thank you, Pratham!\n\nBrahmand App will make your spiritual journey more meaningful. Stay connected, stay blessed.\n\n**Har Har Mahadev! 🚩**",
                model: 'Fallback (Script)',
                success: true
            };
        }
        return {
            text: "Bahut achha! 🎉 Main app install karne mein aapki help karta hoon.\n\n**Brahmand App Install Kaise Karein:**\n\n**For Android (Google Play Store):**\n1. Play Store kholiye aur search karein: **Brahmand AI**\n2. **Install** button tap karein.\n3. Link: https://play.google.com/store/apps/details?id=com.brahmand.app\n\n**For iOS (Apple App Store):**\n1. App Store kholiye aur search karein: **Brahmand AI**\n2. **Get / Download** button tap karein.\n3. Link: https://apps.apple.com/app/brahmand-app/id6765467224\n\nInstall karne ke baad explore karein aur apna experience zaroor batayein! 😊\n\nKya install karne mein koi problem ho rahi hai?",
            model: 'Fallback (Script)',
            success: true
        };
    }

    // Chanting path & Specific Mantras (Checked BEFORE generic Devata name matching)
    if (msg.match(/om namah|gayatri|hare krishna|mahamrityunjaya/)) {
        if (msg.includes('hare krishna')) {
            return {
                text: "Bahut sundar! 🙏 Hare Krishna mahamantra bahut hi prasidh aur shaktishali mantra hai. Iske jaap se mann shant hota hai aur bhagwan Krishna ki kripa prapt hoti hai.\n\nKya aap daily Hare Krishna mahamantra ka jaap karte hain?\n\n**Agar aapko chanting mein interest hai toh Brahmand App ke yeh features useful ho sakte hain:**\n1. **Live Jaap Counter** — mantra jaap track karne ke liye\n2. **Mantra Library** — 100+ mantras with meaning\n3. **Daily Sadhana** — daily spiritual routine tracker\n\n**Kya main aapko in features ke baare mein bataun?**\n\n**Aur kya aap kisi aur mantra ka bhi jaap karte hain?** 😊",
                model: 'Fallback (Professional)',
                success: true
            };
        }
        return {
            text: "Beautiful choice! Many devotees tell us that during longer Jaap sessions they sometimes lose track of their count. Has that ever happened to you?",
            model: 'Fallback (Professional)',
            success: true
        };
    }

    if (msg.match(/chant|mantra|jaap|chants/)) {
        return {
            text: "That's wonderful. 🙏 Maintaining a daily chanting routine takes real dedication. May I ask... Which mantra do you usually chant? 📿",
            model: 'Fallback (Professional)',
            success: true
        };
    }

    // Temple / Devotion Branches
    if (msg.match(/temple|visiting temples|explore/)) {
        return {
            text: "That's wonderful. Visiting temples regularly brings a different kind of peace. May I ask... Is there a particular temple you visit most often? 🌸",
            model: 'Fallback (Professional)',
            success: true
        };
    }

    if (msg.match(/siddhivinayak|shiv|shiva|bholenath|mahadew|krishna|kanha|ram|rama|hanuman|devi|durga/)) {
        if (msg.match(/shiv|shiva|bholenath/)) {
            return {
                text: "Bahut achhi choice. 🙏 Shiv mandiron ka apna ek alag spiritual mahatva hota hai. Kashi Vishwanath, Mahakaleshwar, aur Kedarnath sabse famous Shiv mandiron mein se hain.\n\nKya aap inme se kisi ke baare mein jaanna chahte hain?\n\n**Agar aapko temples mein interest hai toh Brahmand App ke yeh features useful ho sakte hain:**\n1. **Temple Finder** — nearby temples dhoondhne ke liye\n2. **Live Darshan** — mandiron ke live aarti aur darshan dekhiye\n3. **AI Jyotish** — mandir se related spiritual guidance\n\n**Kya main aapko in features ke baare mein bataun?** 😊",
                model: 'Fallback (Professional)',
                success: true
            };
        }
        return {
            text: `That's one of the most loved temples. Have you ever travelled somewhere and wished you could easily find nearby temples?`,
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

    if (msg.match(/\b(never|no|nhi|nahi|not yet)\b/)) {
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

    if (msg.match(/phone|mobile|digital|phno|phon/)) {
        return {
            text: "Bahut achha sawal! 🙏\n\n**Vedic Library (Scriptures)**\n\n**Ye kya hai:**\nEk comprehensive digitised repository jo Sanatan scriptures and books store karta hai.\n\n**Ye kaise kaam karta hai:**\nChapters categories aur bookmark progress tracking sync logic ke sath local reading memory create karte hain.\n\n**Iska kya fayda hai:**\nBhagavad Gita aur Ramayana jaise texts offline progress memory ke sath mobile par aasaani se padhe ja sakte hain.\n\n**Ise kaise use karein:**\nApp home dashboard par jaakar 'Vedic Library' tab touch karein aur apni favorite scripture select karein.\n\n**Related Features:**\n1. **Live Jaap Counter** — track your chanting repetitions\n2. **Daily Sadhana** — log your daily spiritual goals\n\nKya main aapko in related features ke baare mein bataun? 😊",
            model: 'Fallback (Professional)',
            success: true
        };
    }

    // Dynamic Download & Guide Installation
    if (msg.match(/aur kya|other features|aur kuch|useful/)) {
        return {
            text: "Brahmand (Sanatan Lok) App aapki daily spiritual aur community life ko simple aur strong banane ke liye ek complete ecosystem hai. Isme aapko ye benefits milte hain:\n\n1. 📿 **Live Jaap Counter & Rooms** — bina counting ke stress ke mantra jaap karein aur live groups mein pure desh ke devotees ke sath chant karein.\n2. 🗺️ **Temple Finder & Live Darshan** — aas-paas ke mandiron ka aarti timing jaanein aur ghar baithe live darshan aur aarti attend karein.\n3. 🌌 **Sanatan Passport (SL ID)** — gotra aur daily milestones track karke apni digital spiritual identity build karein.\n4. 🔮 **Kundli, Panchang & AI Jyotish** — daily auspicious Muhurat, Kundli details, aur AI se instant spiritual guidance paayein.\n5. 📚 **Vedic Library** — Bhagavad Gita aur sacred scriptures ko reading progress aur bookmarks ke sath bina distraction padhein.\n6. 🚨 **Emergency SOS & Help** — local area mein 1-10KM radius mein volunteers se emergency help paayein aur Blood Donation or Annadan mein support karein.\n7. 🤝 **Community Circles & Jobs** — spiritual groups (Circles) join karein aur temple-related volunteering or jobs search karein.\n\nAap inme se kis feature ke baare mein aur details jaan na chahenge? Ya phir main aapko app download karne ka link bhejoon? 😊",
            model: 'Fallback (Ecosystem List)',
            success: true
        };
    }

    if (isYesOrOk || msg.match(/okay|install|download|de do|bhejo/)) {
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
        text: "Main aapki isko aur acche se jaan ne mein madad kar sakta hoon. Kya aap Brahmand App ke features aur ecosystem ke baare mein jaan na chahte hain? 😊",
        model: 'Fallback (Professional)',
        success: true
    };
}
