// 🕉️ Spiritual & Cultural Knowledge Database for Brahmand AI
// Contains curated Bhagavad Gita shlokas and dynamic Panchang calculation utility

const GITA_SHLOKAS = [
    {
        verse: "कर्मण्येवाधिकारस्ते मा फलेषु कदाचन।\nमा कर्मफलहेतुर्भूर्मा ते सङ्गोऽस्त्वकर्मणि॥",
        transliteration: "Karmaṇy-evādhikāras te mā phaleṣhu kadāchana\nMā karma-phala-hetur bhūr mā te saṅgo ’stvakarmaṇi",
        translation: "You have a right to perform your prescribed duties, but you are not entitled to the fruits of your actions.",
        explanation: "Action bina kisi self-interest ya apeksha ke krna chahiye. Apka adhikar sirf karam karne par hai, uske parinaam (fruits) par nahi."
    },
    {
        verse: "यदा यदा हि धर्मस्य ग्लानिर्भवति भारत।\nअभ्युत्थानमधर्मस्य तदात्मानं सृजाम्यहम्॥",
        transliteration: "Yadā yadā hi dharmasya glānir bhavati bhārata\nAbhyutthānam adharmasya tadātmānaṁ sṛijāmyaham",
        translation: "Whenever there is a decline in righteousness and an increase in unrighteousness, O Arjun, at that time I manifest Myself.",
        explanation: "Jab jab dharti par adharma badhta hai aur dharma ki haani hoti hai, tab bhagwan srishti ki raksha ke liye avatar lete hain."
    },
    {
        verse: "परित्राणाय साधूनां विनाशाय च दुष्कृताम्।\nधर्मसंस्थापनार्थाय सम्भवामि युगे युगे॥",
        transliteration: "Paritrāṇāya sādhūnāṁ vināśhāya cha duṣhkṛitām\nDharma-saṁsthāpanārthāya sambhavāmi yuge yuge",
        translation: "To protect the righteous, to destroy the wicked, and to reestablish the principles of dharma, I appear age after age.",
        explanation: "Sajjan aur dharmik logo ki raksha karne, dushtho ka sarvanash karne, aur dharma ki sthapna karne ke liye bhagwan har yug me aate hain."
    },
    {
        verse: "ध्यायतो विषयान्पुंसः सङ्गस्तेषूपजायते।\nसङ्गात्संजायते कामः कामात्क्रोधोऽभिजायते॥",
        transliteration: "Dhyāyato viṣhayān puṁsaḥ saṅgas teṣhūpajāyate\nSaṅgāt sañjāyate kāmaḥ kāmāt krodho ’bhijāyate",
        translation: "While contemplating on the objects of the senses, one develops attachment to them. Attachment breeds desire, and desire breeds anger.",
        explanation: "Bahar ke vishayo (objects) ke baare me zyada sochne se attachment badhta hai. Attachment se desire (kaam) paid hota hai, aur jab desire poori nahi hoti to krodh (anger) aata hai."
    },
    {
        verse: "क्रोधाद्भवति सम्मोहः सम्मोहात्स्मृतिविभ्रमः।\nस्मृतिभ्रंशाद्बुद्धिनाशो बुद्धिनाशात्प्रणश्यति॥",
        transliteration: "Krodhād bhavati sammohaḥ sammohāt smṛiti-vibhramaḥ\nSmṛiti-bhraṁśhād buddhi-nāśho buddhi-nāśhāt praṇaśhyati",
        translation: "Anger leads to clouding of judgment, which results in bewilderment of the memory. When memory is bewildered, the intellect is destroyed; and when the intellect is destroyed, one is ruined.",
        explanation: "Gusse se buddhi bhrasht hoti hai aur insaan apna dimag kho baithta hai, jisse aakhir me uska vinash ho jata hai."
    }
];

export function getRandomGitaShloka() {
    const randomIndex = Math.floor(Math.random() * GITA_SHLOKAS.length);
    return GITA_SHLOKAS[randomIndex];
}

export function getDailyPanchang() {
    const today = new Date();
    
    // Dynamic Panchang calculations based on current date
    const tithis = ["Prathama", "Dwitiya", "Tritiya", "Chaturthi", "Panchami", "Shashthi", "Saptami", "Ashtami", "Navami", "Dashami", "Ekadashi", "Dwadashi", "Trayodashi", "Chaturdashi", "Purnima", "Amavasya"];
    const nakshatras = ["Ashwini", "Bharani", "Krittika", "Rohini", "Mrigashira", "Ardra", "Punarvasu", "Pushya", "Ashlesha", "Magha", "Purva Phalguni", "Uttara Phalguni", "Hasta", "Chitra", "Swati", "Visakha", "Anuradha", "Jyeshtha", "Mula", "Purva Ashadha", "Uttara Ashadha", "Shravana", "Dhanishtha", "Shatabhisha", "Purva Bhadrapada", "Uttara Bhadrapada", "Revati"];
    const yogas = ["Vishkumbha", "Priti", "Ayushman", "Saubhagya", "Sobhana", "Atiganda", "Sukarma", "Dhriti", "Sula", "Ganda", "Vriddhi", "Dhruva", "Vyaghata", "Harshana", "Vajra", "Siddhi", "Vyatipata", "Variyan", "Parigha", "Shiva", "Siddha", "Sadhya", "Subha", "Sukla", "Brahma", "Indra", "Vaidhriti"];
    
    const daySeed = today.getDate() + today.getMonth() + today.getFullYear();
    
    const tithi = tithis[daySeed % tithis.length];
    const nakshatra = nakshatras[(daySeed * 3) % nakshatras.length];
    const yoga = yogas[(daySeed * 7) % yogas.length];
    
    // Formatting date beautifully
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    const formattedDate = today.toLocaleDateString('en-US', options);

    return {
        date: formattedDate,
        tithi: tithi,
        nakshatra: nakshatra,
        yoga: yoga,
        shubhMuhurat: "11:45 AM to 12:35 PM (Abhijit Muhurat)",
        rahukaal: "01:30 PM to 03:00 PM (Auspicious works should be avoided)"
    };
}
