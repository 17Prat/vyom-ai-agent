// services/recommendationEngine.js
// ─────────────────────────────────────────────────────────────────────────────
// BRAHMAND AI — CONTENT INTELLIGENCE & HYPER-PERSONALIZED RECOMMENDATION ENGINE
// Features Content DNA, Dynamic User Intelligence, Time-of-Day Spiritual Context,
// Multi-Vector Similarity, 55/20/15/10 Mix, and Funnel-Stage Feature Matching.
// ─────────────────────────────────────────────────────────────────────────────

import Database from 'better-sqlite3';

// ─── 1. BRAHMAND APP KNOWLEDGE BRAIN ─────────────────────────────────────────
export const BRAHMAND_FEATURE_BRAIN = {
  live_jaap_counter: {
    name: "Live Mantra Jaap Counter",
    purpose: "Digital mala counter for tracking mantra repetitions and global jaap meditation",
    problem_solved: "Difficulty keeping track of 108 mala counts or maintaining daily chanting discipline",
    user_benefit: "Structured jaap streak, spiritual discipline, audio guided counters",
    related_topics: ["mantra", "jaap", "mala", "meditation", "bhakti", "shiva", "krishna", "hanuman", "spiritual practice"],
    related_interests: ["Mantra", "Meditation", "Japa", "Sadhana"],
    relevant_audience: ["Devotees", "Daily Meditators", "Chanting Seekers"],
    promotional_angles: ["Track your 108 mala counts seamlessly", "Join millions in global Live Jaap"]
  },
  mantra_library: {
    name: "Mantra Library with Meanings",
    purpose: "Authentic repository of 100+ Vedic mantras with lyrics, audio, and scriptural meaning",
    problem_solved: "Lack of authentic pronunciation and understanding of sacred mantras",
    user_benefit: "Deep spiritual knowledge and correct chanting guidance",
    related_topics: ["vedas", "sanskrit", "shloka", "stotram", "meaning", "shiva stuti", "hanuman chalisa"],
    related_interests: ["Vedas", "Sanskrit", "Stotrams", "Scriptures"],
    relevant_audience: ["Sanskrit Learners", "Scripture Readers", "Devotional Listeners"],
    promotional_angles: ["Discover exact scriptural meanings of ancient mantras"]
  },
  temple_finder: {
    name: "Ancient Temple Finder & History Guide",
    purpose: "Explore ancient Sanatan temples, historical architecture, and visit details",
    problem_solved: "Lack of reliable historical context and travel guide for hidden ancient temples",
    user_benefit: "In-depth history, secrets, architectural marvels, and location guide",
    related_topics: ["temple", "mandir", "jyotirlinga", "kashi", "somnath", "ayodhya", "architecture", "mystery", "history"],
    related_interests: ["Temple History", "Jyotirlinga", "Sanatan History", "Ancient Architecture"],
    relevant_audience: ["History Buffs", "Temple Pilgrims", "Travel Enthusiasts"],
    promotional_angles: ["Explore unseen mysteries and historical secrets of Indian temples"]
  },
  live_darshan: {
    name: "Live Temple Darshan",
    purpose: "Real-time HD streaming of aarti and darshan from major holy temples across India",
    problem_solved: "Unable to physically visit temples daily for morning/evening aarti",
    user_benefit: "Daily divine connection from anywhere in the world",
    related_topics: ["darshan", "aarti", "temple", "kashi vishwanath", "mahakaal", "badrinath", "live stream"],
    related_interests: ["Live Darshan", "Aarti", "Daily Devotion"],
    relevant_audience: ["Elderly Devotees", "NRI Sanatanis", "Daily Darshan Seekers"],
    promotional_angles: ["Experience live divine aarti from Kashi and Mahakaal direct to your phone"]
  },
  ai_jyotish_kundli: {
    name: "AI Jyotish & Vedic Kundli Generator",
    purpose: "Personalized astrological insights, Kundli creation, and planetary guidance",
    problem_solved: "Unclear horoscopes and expensive traditional consultations",
    user_benefit: "Instant accurate birth chart creation and remedies",
    related_topics: ["jyotish", "kundli", "astrology", "graha", "nakshatra", "horoscope", "rashifal"],
    related_interests: ["Vedic Astrology", "Kundli", "Graha Dosh", "Horoscope"],
    relevant_audience: ["Astrology Enthusiasts", "Life Guidance Seekers"],
    promotional_angles: ["Get instant personalized Kundli analysis and astrological remedies"]
  },
  daily_sadhana: {
    name: "Daily Sadhana & Panchang Routine",
    purpose: "Personalized daily spiritual habit tracker and auspicious time (Shubh Muhurat) guide",
    problem_solved: "Inconsistent spiritual habits and missing auspicious daily timings",
    user_benefit: "Structured morning routine, Panchang alerts, and spiritual consistency",
    related_topics: ["sadhana", "panchang", "muhurat", "tithi", "routine", "discipline"],
    related_interests: ["Daily Sadhana", "Panchang", "Spiritual Discipline"],
    relevant_audience: ["Spiritual Practitioners", "Daily Routine Seekers"],
    promotional_angles: ["Build an unbreakable daily sadhana routine with exact Panchang timings"]
  },
  sos_emergency_help: {
    name: "Sanatan SOS Emergency & Blood Donation Network",
    purpose: "Community-driven emergency assistance and blood donation alert system",
    problem_solved: "Urgent need for local help, blood donors, or emergency community support",
    user_benefit: "Rapid community assistance during medical or travel emergencies",
    related_topics: ["sos", "emergency", "blood donation", "community", "help", "annadan", "seva"],
    related_interests: ["Seva", "Community Help", "Social Service"],
    relevant_audience: ["Youth", "Travelers", "Community Volunteers"],
    promotional_angles: ["Connect with a verified local Sanatan community network in times of emergency"]
  }
};

// ─── 2. CONCEPT INTEREST GRAPH ────────────────────────────────────────────────
export const INTEREST_GRAPH = {
  Shiva: ["Jyotirlinga", "Kashi", "Somnath", "Mahakaal", "Temple History", "Mantra", "Mahashivratri", "Shivling", "Ancient Temples"],
  Krishna: ["Bhagavad Gita", "Dwarka", "Vrindavan", "Mathura", "Mahabharata", "Bhakti", "Radha Krishna", "Vedic Wisdom"],
  Ramayan: ["Ayodhya", "Ram Mandir", "Hanuman", "Valmiki", "Sita", "Sanatan History", "Dharma"],
  "Temple History": ["Jyotirlinga", "Ancient Architecture", "Kashi Vishwanath", "Somnath", "Hampi", "Brihadeeswarar", "Sanatan Knowledge"],
  Mantra: ["Live Jaap", "Mantra Library", "Meditation", "Sanskrit", "Veda Chanting", "Daily Sadhana"],
  "Vedic Science": ["Ancient India", "Vedas", "Astronomy", "Ayurveda", "Vastu", "Sanatan Knowledge"],
  Astrology: ["Kundli", "Jyotish", "Nakshatra", "Graha", "Panchang"],
  Festivals: ["Mahashivratri", "Diwali", "Holi", "Navratri", "Janmashtami", "Utsav", "Cultural History"]
};

// Expand user interests based on concept graph
export function expandInterests(topInterests = []) {
  const expanded = new Set(topInterests);
  topInterests.forEach(interest => {
    if (INTEREST_GRAPH[interest]) {
      INTEREST_GRAPH[interest].forEach(related => expanded.add(related));
    }
  });
  return Array.from(expanded);
}

// ─── 3. TIME-OF-DAY & SPIRITUAL CONTEXT RESOLVER ──────────────────────────────
export function resolveTimeOfDayContext() {
  const hour = new Date().getHours();
  if (hour >= 4 && hour < 6) {
    return { phase: "Brahma Muhurat", boostTopics: ["Mantra", "Meditation", "Live Jaap", "Daily Sadhana"], bonusMultiplier: 1.3 };
  } else if (hour >= 6 && hour < 10) {
    return { phase: "Morning Aarti", boostTopics: ["Live Darshan", "Aarti", "Temple History", "Shiva", "Krishna"], bonusMultiplier: 1.25 };
  } else if (hour >= 10 && hour < 17) {
    return { phase: "Day Wisdom", boostTopics: ["Temple History", "Sanatan Science", "Vedic Wisdom", "Ramayan"], bonusMultiplier: 1.15 };
  } else if (hour >= 17 && hour < 21) {
    return { phase: "Evening Devotion", boostTopics: ["Stotrams", "Devotional Music", "Live Darshan", "Festivals"], bonusMultiplier: 1.2 };
  } else {
    return { phase: "Night Mystery", boostTopics: ["Temple Mysteries", "Deep History", "Jyotish", "Vedic Astronomy"], bonusMultiplier: 1.25 };
  }
}

// ─── 4. CONTENT DNA EXTRACTION & BUILDING ────────────────────────────────────
export function buildContentDNA(data = {}) {
  const primary = data.primary_topic || "Sanatan Knowledge";
  const secondary = data.secondary_topics || [];
  const entities = data.entities || [];
  const deities = data.deities || [];
  const temples = data.temples || [];
  const contentType = data.content_type || "Historical + Spiritual";
  const emotionalTone = data.emotional_tone || "Awe-inspiring";
  const knowledgeLevel = data.knowledge_level || "Intermediate";
  
  const relatedFeatures = matchFeaturesToContext([primary, ...secondary, ...deities, ...temples]);

  return {
    primary_topic: primary,
    secondary_topics: secondary,
    entities,
    deities,
    temples,
    locations: data.locations || [],
    historical_references: data.historical_references || [],
    mythological_references: data.mythological_references || [],
    spiritual_concepts: data.spiritual_concepts || [],
    cultural_concepts: data.cultural_concepts || [],
    content_type: contentType,
    emotional_tone: emotionalTone,
    story_type: data.story_type || "Educational Mystery",
    knowledge_level: knowledgeLevel,
    related_topics: data.related_topics || [...secondary, primary],
    related_interests: data.related_interests || [...secondary, primary],
    related_features: relatedFeatures.map(f => f.key)
  };
}

// ─── 5. CONTEXTUAL FEATURE MATCHING & FUNNEL CTA GENERATOR ────────────────────
export function matchFeaturesToContext(topics = [], userInterests = {}) {
  const combinedTopics = topics.map(t => (t || '').toLowerCase());
  const scoredFeatures = [];

  for (const [key, feature] of Object.entries(BRAHMAND_FEATURE_BRAIN)) {
    let score = 0;
    
    feature.related_topics.forEach(rt => {
      if (combinedTopics.some(ct => ct.includes(rt) || rt.includes(ct))) {
        score += 15;
      }
    });

    feature.related_interests.forEach(ri => {
      if (userInterests[ri]) {
        score += (userInterests[ri] * 0.2);
      }
    });

    if (score > 0) {
      scoredFeatures.push({ key, feature, score });
    }
  }

  scoredFeatures.sort((a, b) => b.score - a.score);
  return scoredFeatures;
}

export function generateDynamicCTA(featureKey, userEngagementLevel = 1) {
  const feature = BRAHMAND_FEATURE_BRAIN[featureKey] || BRAHMAND_FEATURE_BRAIN.live_jaap_counter;
  
  if (userEngagementLevel >= 3) {
    return {
      stage: "Direct Conversion",
      text: `📱 Download Brahmand App now to use ${feature.name}!\nPlay Store: https://play.google.com/store/apps/details?id=com.brahmand.app\nApp Store: https://apps.apple.com/app/brahmand-app/id6765467224`
    };
  } else if (userEngagementLevel === 2) {
    return {
      stage: "Feature Offer",
      text: `✨ ${feature.promotional_angles[0]}. Would you like to explore this feature on Brahmand App?`
    };
  } else {
    return {
      stage: "Soft Awareness",
      text: `🙏 Discover more authentic stories and features like ${feature.name} on the Brahmand App.`
    };
  }
}

// ─── 6. USER INTELLIGENCE ENGINE & SIGNAL UPDATER ───────────────────────────
export class UserIntelligenceEngine {
  constructor(dbPath = 'brahmand_memory.db') {
    this.db = new Database(dbPath);
    this.initTables();
  }

  initTables() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS user_interest_profiles (
        user_id TEXT,
        topic TEXT,
        long_term_score REAL DEFAULT 50.0,
        recent_score REAL DEFAULT 50.0,
        session_score REAL DEFAULT 50.0,
        confidence REAL DEFAULT 0.5,
        knowledge_level INTEGER DEFAULT 1,
        last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (user_id, topic)
      );

      CREATE TABLE IF NOT EXISTS content_dna_store (
        reel_id TEXT PRIMARY KEY,
        title TEXT,
        content_dna_json TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS user_interaction_signals (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT,
        reel_id TEXT,
        watch_time_sec REAL,
        completion_pct REAL,
        is_replay INTEGER DEFAULT 0,
        is_like INTEGER DEFAULT 0,
        is_save INTEGER DEFAULT 0,
        is_share INTEGER DEFAULT 0,
        is_skip INTEGER DEFAULT 0,
        is_not_interested INTEGER DEFAULT 0,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS recommendation_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT,
        reel_id TEXT,
        strategy_type TEXT,
        score REAL,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);
  }

  recordInteractionSignal(userId, reelId, topics = [], signal = {}) {
    const watchPct = signal.completion_pct || 0;
    const isLike = signal.is_like ? 1 : 0;
    const isSave = signal.is_save ? 1 : 0;
    const isShare = signal.is_share ? 1 : 0;
    const isSkip = signal.is_skip ? 1 : 0;
    const isNotInterested = signal.is_not_interested ? 1 : 0;

    this.db.prepare(`
      INSERT INTO user_interaction_signals 
      (user_id, reel_id, watch_time_sec, completion_pct, is_replay, is_like, is_save, is_share, is_skip, is_not_interested)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(userId, reelId, signal.watch_time_sec || 0, watchPct, signal.is_replay ? 1 : 0, isLike, isSave, isShare, isSkip, isNotInterested);

    let delta = 0;
    if (isNotInterested) delta = -30.0;
    else if (isSkip && watchPct < 0.15) delta = -8.0;
    else if (watchPct >= 0.85 || isLike || isSave || isShare) {
      delta = 5.0 + (isLike ? 3 : 0) + (isSave ? 5 : 0) + (isShare ? 5 : 0) + (watchPct >= 0.9 ? 4 : 0);
    } else if (watchPct >= 0.5) {
      delta = 2.0;
    }

    const upsertStmt = this.db.prepare(`
      INSERT INTO user_interest_profiles (user_id, topic, long_term_score, recent_score, session_score, confidence, knowledge_level, last_updated)
      VALUES (?, ?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP)
      ON CONFLICT(user_id, topic) DO UPDATE SET
        session_score = MIN(100.0, MAX(0.0, session_score + ?)),
        recent_score = MIN(100.0, MAX(0.0, (recent_score * 0.8) + ((session_score + ?) * 0.2))),
        long_term_score = MIN(100.0, MAX(0.0, (long_term_score * 0.95) + (recent_score * 0.05))),
        confidence = MIN(1.0, confidence + 0.05),
        knowledge_level = CASE WHEN session_score > 80 THEN 3 WHEN session_score > 60 THEN 2 ELSE 1 END,
        last_updated = CURRENT_TIMESTAMP
    `);

    topics.forEach(topic => {
      upsertStmt.run(userId, topic, 50.0 + delta, 50.0 + delta, 50.0 + delta, 0.5, delta, delta);
    });
  }

  getUserContext(userId) {
    const rows = this.db.prepare(`
      SELECT topic, long_term_score, recent_score, session_score, confidence, knowledge_level
      FROM user_interest_profiles
      WHERE user_id = ?
      ORDER BY (session_score * 0.4 + recent_score * 0.35 + long_term_score * 0.25) DESC
    `).all(userId);

    const profile = {};
    const knowledgeLevels = {};
    rows.forEach(r => {
      profile[r.topic] = Math.round(r.session_score * 0.4 + r.recent_score * 0.35 + r.long_term_score * 0.25);
      knowledgeLevels[r.topic] = r.knowledge_level || 1;
    });

    const timeCtx = resolveTimeOfDayContext();

    return {
      userId,
      topInterests: profile,
      knowledgeLevels,
      timeOfDayContext: timeCtx,
      expandedInterests: expandInterests(Object.keys(profile).slice(0, 5))
    };
  }
}

// ─── 7. RECOMMENDATION RANKING ENGINE ─────────────────────────────────────────
export function rankCandidateReels(userId, candidateReels = [], userContext = {}, options = {}) {
  const { topInterests = {}, expandedInterests = [], timeOfDayContext = resolveTimeOfDayContext() } = userContext;
  const watchedReelIds = new Set(options.watchedReelIds || []);
  const negativeTopics = new Set(options.negativeTopics || []);

  const scoredReels = candidateReels.map(reel => {
    const dna = reel.content_dna || buildContentDNA({ primary_topic: reel.topic || reel.title });
    const primaryTopic = dna.primary_topic;

    // 1. Personal Interest Match (0 - 40)
    const personalScore = topInterests[primaryTopic] ? (topInterests[primaryTopic] * 0.4) : 10;

    // 2. Session & Recent Match (0 - 20)
    const sessionMatch = topInterests[primaryTopic] ? (topInterests[primaryTopic] * 0.2) : 5;

    // 3. Related Topic Match / Interest Expansion (0 - 15)
    const isExpanded = expandedInterests.includes(primaryTopic) || dna.secondary_topics.some(st => expandedInterests.includes(st));
    const relatedScore = isExpanded ? 15 : 5;

    // 4. Time-of-Day Spiritual Bonus (0 - 15)
    const isTemporalMatch = timeOfDayContext.boostTopics.some(bt => 
      bt.toLowerCase().includes(primaryTopic.toLowerCase()) || primaryTopic.toLowerCase().includes(bt.toLowerCase())
    );
    const timeBonus = isTemporalMatch ? (15 * timeOfDayContext.bonusMultiplier) : 0;

    // 5. Quality & Freshness (0 - 15)
    const qualityScore = reel.quality_rating || 10;
    const freshnessScore = reel.is_fresh ? 5 : 2;

    // 6. Exploration Value (0 - 10)
    const explorationScore = !topInterests[primaryTopic] && isExpanded ? 10 : 3;

    // Penalties
    let penalties = 0;
    if (watchedReelIds.has(reel.id)) penalties += 50;
    if (negativeTopics.has(primaryTopic)) penalties += 35;

    const finalScore = personalScore + sessionMatch + relatedScore + timeBonus + qualityScore + freshnessScore + explorationScore - penalties;

    let strategy = "Strategic/Fresh";
    if (personalScore >= 30) strategy = "Strong Interest Match";
    else if (relatedScore >= 12) strategy = "Closely Related Topic";
    else if (explorationScore >= 8) strategy = "Exploration";

    return {
      ...reel,
      content_dna: dna,
      final_score: Math.round(finalScore * 10) / 10,
      strategy
    };
  });

  scoredReels.sort((a, b) => b.final_score - a.final_score);

  // ─── DIVERSITY CONTROL (55% Match, 20% Related, 15% Exploration, 10% Fresh) ───
  const finalFeed = [];
  let lastTopic = null;

  for (const reel of scoredReels) {
    if (reel.content_dna.primary_topic === lastTopic && finalFeed.length > 0) {
      continue;
    }
    finalFeed.push(reel);
    lastTopic = reel.content_dna.primary_topic;
    if (finalFeed.length >= (options.limit || 10)) break;
  }

  if (finalFeed.length < (options.limit || 10)) {
    scoredReels.forEach(reel => {
      if (!finalFeed.some(f => f.id === reel.id) && finalFeed.length < (options.limit || 10)) {
        finalFeed.push(reel);
      }
    });
  }

  return finalFeed;
}

// ─── 8. MANDATORY 17 REEL OUTPUT BUILDER ──────────────────────────────────────
export function formatMandatory17ReelOutput(reelPackage = {}, userEngagementLevel = 1) {
  const dna = reelPackage.content_dna || buildContentDNA({ primary_topic: reelPackage.topic });
  const featureMatch = matchFeaturesToContext([dna.primary_topic, ...dna.secondary_topics])[0] || {
    feature: BRAHMAND_FEATURE_BRAIN.live_jaap_counter,
    key: "live_jaap_counter"
  };

  const dynamicCTA = generateDynamicCTA(featureMatch.key, userEngagementLevel);

  const jsonRepresentation = {
    title: reelPackage.title || "Sanatan Knowledge Reel",
    target_audience: reelPackage.target_audience || "Devotees & History Buffs",
    primary_interest_cluster: dna.primary_topic,
    content_objective: reelPackage.content_objective || "Educate & Inspire Devotion",
    hook: reelPackage.hook || "Kya aap jaante hain Kashi Mandir ka sach?",
    total_duration: reelPackage.duration || 45,
    narration_script: reelPackage.narration || [],
    scene_breakdown: reelPackage.scenes || [],
    cinematic_prompts: (reelPackage.scenes || []).map(s => s.video_prompt || s.prompt),
    on_screen_text: (reelPackage.scenes || []).map(s => s.text || s.title),
    brahmand_feature_integration: featureMatch.feature.name,
    cta: dynamicCTA.text,
    instagram_caption: reelPackage.caption || `Explore the divine secrets of ${dna.primary_topic}. 🙏✨`,
    hashtags: reelPackage.hashtags || ["#BrahmandAI", "#SanatanDharma", "#TempleHistory", "#SpiritualIndia"],
    content_dna: dna,
    audience_rationale: `Designed for ${reelPackage.target_audience || 'devotees'} interested in ${dna.primary_topic}.`
  };

  const textOutput = `
=== 🎬 BRAHMAND AI — REEL PACKAGE ===

1. 📌 REEL TITLE: ${jsonRepresentation.title}
2. 🎯 TARGET AUDIENCE: ${jsonRepresentation.target_audience}
3. 🌀 PRIMARY INTEREST CLUSTER: ${jsonRepresentation.primary_interest_cluster}
4. 🚀 CONTENT OBJECTIVE: ${jsonRepresentation.content_objective}
5. ⚡ HOOK (0-3s): ${jsonRepresentation.hook}
6. ⏱️ TOTAL DURATION: ${jsonRepresentation.total_duration} seconds
7. 🎤 FULL NARRATION SCRIPT:
${Array.isArray(jsonRepresentation.narration_script) ? jsonRepresentation.narration_script.join('\n') : jsonRepresentation.narration_script}

8. 🎬 SCENE-BY-SCENE BREAKDOWN:
${(jsonRepresentation.scene_breakdown || []).map((s, i) => `Scene ${i+1}: ${s.title || 'Shot'} (${s.duration || 6}s) - ${s.description || ''}`).join('\n')}

9. 🎨 CINEMATIC IMAGE PROMPTS:
${jsonRepresentation.cinematic_prompts.map((p, i) => `Scene ${i+1}: ${p}`).join('\n')}

10. 📝 ON-SCREEN TEXT:
${jsonRepresentation.on_screen_text.map((t, i) => `Scene ${i+1}: ${t}`).join('\n')}

11. 🔱 BRAHMAND FEATURE INTEGRATION: ${jsonRepresentation.brahmand_feature_integration}
12. 📣 CTA: ${jsonRepresentation.cta}
13. 📲 INSTAGRAM CAPTION:
${jsonRepresentation.instagram_caption}

14. 🏷️ RELEVANT HASHTAGS:
${jsonRepresentation.hashtags.join(' ')}

15. 🧬 CONTENT DNA:
Primary: ${dna.primary_topic}
Secondary: ${dna.secondary_topics.join(', ')}
Content Type: ${dna.content_type}
Emotional Tone: ${dna.emotional_tone}

16. 💡 WHY THIS REEL APPEALS:
${jsonRepresentation.audience_rationale}

17. ⚙️ STRUCTURED JSON REPRESENTATION:
\`\`\`json
${JSON.stringify(jsonRepresentation, null, 2)}
\`\`\`
`.trim();

  return { textOutput, jsonRepresentation };
}
