// services/dynamicReelEngine.js
// ─────────────────────────────────────────────────────────────────────────────
// BRAHMAND — DYNAMIC SCRIPT-TO-REEL ENGINE
// Reads the actual script (narration + scene descriptions) from the plan,
// analyzes it fully, then generates UNIQUE per-scene image prompts & motions.
// Jaisi script, waisi reel. ❌ No generic template. ✅ Script-driven visuals.
// ─────────────────────────────────────────────────────────────────────────────
import fs from 'fs-extra';
import path from 'path';
import fetch from 'node-fetch';
import { askLLM } from './llmService.js';
import { generateNarration } from './ttsService.js';
import { generatePollinationsVideo } from './pollinationsVideoService.js';
import { assembleReel, assembleVideoClips } from './videoAssembler.js';

const VALID_MOTIONS = ['zoom-in', 'zoom-out', 'pan-left', 'pan-right', 'glide', 'static'];

// nova-reel only accepts multiples of 6 seconds per clip (6s minimum)
const AI_CLIP_DURATION = 6;
const MAX_AI_CLIPS = 3; // 3 x 6s = 18s reel (fits 10-20s target)

// ─── Motion fallback heuristic (used if LLM forgets to specify) ──────────────
function pickMotionFromText(text) {
    const t = (text || '').toLowerCase();
    if (/battle|fight|war|attack|sword|army|ladai|yuddh|action|intense|charge/.test(t)) return 'zoom-in';
    if (/fort|kila|mountain|landscape|panorama|river|nadi|plain|valley|aerial/.test(t)) return 'pan-left';
    if (/enter|arrive|intro|beginning|pehla|first|approach|start|open/.test(t)) return 'pan-right';
    if (/victory|celebration|win|festival|reveal|jeet|triumph|glory|grand/.test(t)) return 'zoom-out';
    if (/emotion|love|spiritual|peace|devotion|bhakti|prayer|puja|blessing|aashirwad|grief/.test(t)) return 'glide';
    if (/end|final|conclusion|last|aakhri|close|message|call to action/.test(t)) return 'static';
    return 'glide';
}

// ─── Detect script type for better visual style prompting ───────────────────
function detectScriptType(scriptText) {
    const t = (scriptText || '').toLowerCase();
    if (/shivaji|rana|maharaj|rajput|warrior|sipahi|sena|talvar|kila|yuddh|battle|empire/.test(t))
        return 'warrior';
    if (/temple|mandir|aarti|puja|bhakti|prasad|devotion|darshan|murti|ram|krishna|shiva|devi/.test(t))
        return 'devotional';
    if (/festival|holi|diwali|navratri|celebration|dance|rang|utsav|mela/.test(t))
        return 'festival';
    if (/nature|forest|river|mountain|waterfall|sunrise|sky|jungle|wildlife/.test(t))
        return 'nature';
    if (/science|vigyan|space|universe|technology|research|discovery/.test(t))
        return 'science';
    return 'general';
}

// ─── Visual style prefix per script type ────────────────────────────────────
// Using hyperrealistic photography style for maximum realism in generated images
const STYLE_PREFIXES = {
    warrior_historical: 'ultra-realistic hyperrealistic photograph, historical Indian warrior epic battle scene, dramatic lighting, 8k DSLR, photorealistic,',
    devotional:         'ultra-realistic hyperrealistic photograph, sacred Indian temple divine atmosphere, soft golden light, 8k DSLR, photorealistic,',
    festival:           'ultra-realistic hyperrealistic photograph, vibrant Indian festival celebration, colorful joyful crowd, 8k DSLR, photorealistic,',
    nature:             'ultra-realistic hyperrealistic photograph, breathtaking Indian landscape nature, golden hour, 8k DSLR, National Geographic style,',
    science:            'ultra-realistic hyperrealistic photograph, futuristic science visualization, dramatic lighting, 8k DSLR, photorealistic,',
    general:            'ultra-realistic hyperrealistic photograph, professional photography, dramatic lighting, 8k DSLR, photorealistic,'
};

// ─── Build the full script text to feed LLM ─────────────────────────────────
function buildScriptContext(plan) {
    const parts = [];

    if (plan.title) parts.push(`TITLE: ${plan.title}`);
    if (plan.hook) parts.push(`HOOK: ${plan.hook}`);

    // Narration (with timestamps if available)
    if (plan.narration_with_timestamps) {
        parts.push(`\nFULL NARRATION SCRIPT:\n${plan.narration_with_timestamps}`);
    }

    // Per-scene narration from scenes array
    if (plan.scenes && plan.scenes.length > 0) {
        const sceneLines = plan.scenes.map((s, i) =>
            `Scene ${s.scene_number || i+1} (${s.duration_seconds || 10}s): ${s.narration || ''}`
        ).join('\n');
        parts.push(`\nSCENE NARRATIONS:\n${sceneLines}`);
    }

    return parts.join('\n').trim();
}

// ─── CORE: LLM Scene Planner — reads the full script ───────────────────────
async function generateScenePlan(plan, numScenes) {
    const scriptContext = buildScriptContext(plan);
    const scriptType = detectScriptType(scriptContext);
    const stylePrefix = STYLE_PREFIXES[scriptType];

    console.log(`  🔍 Script type detected: ${scriptType}`);

    const prompt = `
You are Brahmand — an expert Indian Instagram Reel director.

READ this script carefully, then create ${numScenes} unique scenes directly representing it.

SCRIPT:
${scriptContext}

SCRIPT TYPE: ${scriptType}
VISUAL STYLE: ${stylePrefix}

RULES:
1. Each scene MUST show something specific from the script (real names, real places, real events)
2. Image prompts: name REAL things — "Raigad fort", "Ram Lalla murti", "Holi gulal" etc.
3. Narration: from the actual script, max 12 words, punchy Hindi/Hinglish
4. motion_hint — MUST vary per scene: fight/action=zoom-in, landscape/fort=pan-left, arrival/intro=pan-right, victory/reveal=zoom-out, emotion/prayer=glide, closing=static
5. Image prompt = style prefix + specific scene description (keep total under 120 characters)
6. NO generic phrases like "spiritual atmosphere" or "a person meditating"

Return ONLY valid JSON array, no markdown:
[
  {
    "scene_number": 1,
    "description": "Exact script moment",
    "narration": "Max 12 word Hindi/Hinglish line",
    "visual_prompt": "${stylePrefix} [specific 60-char scene description from script]",
    "motion_hint": "pan-right"
  }
]
`;

    let raw = '';
    try {
        console.log('  🤖 Sending script to LLM for scene analysis...');
        raw = await askLLM(prompt, 3000);

        // Strip markdown code fences if LLM adds them
        raw = raw.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();

        // Extract JSON array — find first [ and last ]
        const arrayStart = raw.indexOf('[');
        const arrayEnd = raw.lastIndexOf(']');
        if (arrayStart === -1 || arrayEnd === -1) throw new Error('No JSON array in LLM response');

        const jsonStr = raw.substring(arrayStart, arrayEnd + 1);
        const parsed = JSON.parse(jsonStr);

        if (!Array.isArray(parsed) || parsed.length === 0) throw new Error('LLM returned empty scene array');
        
        console.log(`  ✅ LLM generated ${parsed.length} unique scenes from script`);
        return parsed;

    } catch (e) {
        console.warn(`  ⚠️ LLM scene plan failed (${e.message}), using smart script-aware fallback`);
        return buildScriptAwareFallback(plan, scriptType, stylePrefix, numScenes);
    }
}

// ─── Script-aware fallback (extracts real narration from plan scenes) ────────
function buildScriptAwareFallback(plan, scriptType, stylePrefix, numScenes) {
    const title = plan.title || 'Topic';
    const scenes = plan.scenes || [];
    const motions = ['zoom-in', 'pan-right', 'pan-left', 'glide', 'zoom-out', 'zoom-in', 'static'];

    // Use actual scene narrations from plan if available
    if (scenes.length > 0) {
        return scenes.slice(0, numScenes).map((s, i) => {
            const sceneText = s.narration || `Scene ${i+1} of ${title}`;
            return {
                scene_number: i + 1,
                description: sceneText,
                narration: sceneText.length > 80 ? sceneText.substring(0, 77) + '...' : sceneText,
                visual_prompt: `${stylePrefix} ${sceneText}, related to ${title}`,
                motion_hint: motions[i] || pickMotionFromText(sceneText)
            };
        });
    }

    // Last resort: generate from title only
    const fallbackScenes = [
        { d: 'Opening establishing shot', n: `${title} ki kahani shuru hoti hai...`, m: 'pan-right' },
        { d: 'Main subject reveal',       n: `Dekhiye ${title} ka asal sach!`,      m: 'zoom-in' },
        { d: 'Key event/detail',          n: `Yeh hai ${title} ka sabse bada raaz.`,m: 'glide' },
        { d: 'Emotional moment',          n: `${title} se judi ek anmol baat.`,     m: 'glide' },
        { d: 'Climax/peak moment',        n: `Aur phir hua ek adbhut pal!`,         m: 'zoom-out' },
        { d: 'Resolution',                n: `Isliye ${title} itna khaas hai.`,      m: 'zoom-in' },
        { d: 'Call to action',            n: `Share karo, yeh gyan sabko chahiye!`, m: 'static' },
    ];
    return fallbackScenes.slice(0, numScenes).map((t, i) => ({
        scene_number: i + 1,
        description: t.d,
        narration: t.n,
        visual_prompt: `${stylePrefix} ${t.d} related to ${title}, ultra-realistic cinematic`,
        motion_hint: t.m
    }));
}

// ─── Image download with retry + local fallback ──────────────────────────────
async function downloadImage(url, filepath) {
    const { default: fetch } = await import('node-fetch');
    let attempts = 3;
    while (attempts > 0) {
        try {
            // 60s timeout — Pollinations flux can be slow on first request
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 60000);
            const response = await fetch(url, { signal: controller.signal });
            clearTimeout(timeoutId);
            if (response.ok) {
                const buffer = await response.arrayBuffer();
                await fs.writeFile(filepath, Buffer.from(buffer));
                return;
            }
            console.warn(`  ⚠️ Image status ${response.status}, retrying...`);
        } catch (e) {
            console.warn(`  ⚠️ Image error: ${e.message}, retrying...`);
        }
        attempts--;
        if (attempts > 0) await new Promise(r => setTimeout(r, 3000)); // 3s between retries
    }
    // Fallback to local app icon
    const localIcon = path.join(process.cwd(), 'public', 'appicon.jpeg');
    if (fs.existsSync(localIcon)) {
        console.warn('  ⚠️ Using local appicon.jpeg fallback image.');
        await fs.copy(localIcon, filepath);
    } else {
        throw new Error('Image download failed and no local fallback found.');
    }
}

// ─── Generate all scene images from the scene plan ──────────────────────────
async function generateSceneImages(scenePlan) {
    const outputDir = path.join(process.cwd(), 'temp', 'reel_frames');
    await fs.ensureDir(outputDir);
    
    // Clear old frames
    const existing = await fs.readdir(outputDir).catch(() => []);
    for (const f of existing) {
        await fs.remove(path.join(outputDir, f)).catch(() => {});
    }

    const imagePaths = [];

    for (let i = 0; i < scenePlan.length; i++) {
        const scene = scenePlan[i];
        // Build a clean, short, URL-safe prompt
        // Remove em dash and other problematic characters
        const rawPrompt = (scene.visual_prompt || `Cinematic scene ${i+1}`);
        const cleanedPrompt = rawPrompt
            .replace(/[—–]/g, ',')           // em/en dash → comma
            .replace(/["'`]/g, '')            // remove quotes
            .replace(/\s+/g, ' ')             // normalize spaces
            .trim();
        // Keep total prompt under 180 chars to avoid URL length issues and timeouts
        const trimmedPrompt = cleanedPrompt.length > 180 ? cleanedPrompt.substring(0, 177) + '...' : cleanedPrompt;
        const cleanPrompt = encodeURIComponent(trimmedPrompt);
        const seed = Math.floor(Math.random() * 999999) + 1;

        const imageUrl = `https://image.pollinations.ai/prompt/${cleanPrompt}?width=1080&height=1920&model=flux&seed=${seed}&nologo=true&enhance=true`;

        console.log(`  → Scene ${i+1}/${scenePlan.length}: [${scene.motion_hint || 'glide'}] ${trimmedPrompt.substring(0, 75)}...`);

        const imagePath = path.join(outputDir, `scene_${String(i+1).padStart(3, '0')}.jpg`);
        await downloadImage(imageUrl, imagePath);
        imagePaths.push(imagePath);
    }

    return imagePaths;
}

// ─── Generate REAL AI motion video clips per scene (nova-reel, not slideshow) ─
async function generateSceneVideoClips(scenePlan) {
    const outputDir = path.join(process.cwd(), 'temp', 'ai_clips');
    await fs.ensureDir(outputDir);

    // Clear old clips
    const existing = await fs.readdir(outputDir).catch(() => []);
    for (const f of existing) {
        await fs.remove(path.join(outputDir, f)).catch(() => {});
    }

    const clipPaths = [];

    for (let i = 0; i < scenePlan.length; i++) {
        const scene = scenePlan[i];
        // Build a clean, short, URL-safe prompt
        const rawPrompt = (scene.visual_prompt || `Cinematic scene ${i+1}`);
        const cleanedPrompt = rawPrompt
            .replace(/[—–]/g, ',')           // em/en dash → comma
            .replace(/["'`]/g, '')            // remove quotes
            .replace(/\s+/g, ' ')             // normalize spaces
            .trim();
        // Keep total prompt under 180 chars to avoid URL length issues and timeouts
        const trimmedPrompt = cleanedPrompt.length > 180 ? cleanedPrompt.substring(0, 177) + '...' : cleanedPrompt;

        console.log(`  🎬 Scene ${i+1}/${scenePlan.length}: Generating REAL AI motion clip (${AI_CLIP_DURATION}s, nova-reel)...`);

        // ignoreFallback=true → throw if AI video gen fails (no silent slideshow substitution)
        const clipPath = await generatePollinationsVideo(trimmedPrompt, AI_CLIP_DURATION, 'nova-reel', '9:16', false, true);
        const finalPath = path.join(outputDir, `clip_${String(i+1).padStart(3, '0')}.mp4`);
        await fs.copy(clipPath, finalPath).catch(async () => {
            await fs.move(clipPath, finalPath).catch(() => {});
        });
        clipPaths.push(finalPath);
        console.log(`  ✅ Clip ${i+1} saved: ${finalPath}`);
    }

    return clipPaths;
}

// ─── Main export: generateDynamicReel ───────────────────────────────────────
export async function generateDynamicReel(plan, options = {}) {
    const {
        duration = 40,
        language = 'hi',
        aspectRatio = '9:16',
        numScenes = 6
    } = options;

    const title = plan.title || plan.topic || 'India';
    console.log(`\n🎬 Dynamic Reel Engine — Topic: "${title}"`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    // STEP 1: LLM reads the FULL SCRIPT and builds per-scene plan
    // If the plan already contains scenes (e.g. from user edits on the UI), use them directly!
    let scenePlan = plan.scenes;
    if (!scenePlan || scenePlan.length === 0) {
        console.log('📝 Step 1: LLM analyzing full script to build scene plan...');
        scenePlan = await generateScenePlan(plan, numScenes);
    } else {
        console.log('📝 Step 1: Using pre-planned/user-edited storyboard scenes...');
        // Ensure motion_hint is populated or has a fallback
        scenePlan = scenePlan.map((s, i) => ({
            ...s,
            motion_hint: s.motion_hint || pickMotionFromText(s.narration || s.description)
        }));
    }
    console.log(`✅ ${scenePlan.length} unique scenes planned:`);
    scenePlan.forEach((s, i) => console.log(`  Scene ${i+1}: [${s.motion_hint || 'glide'}] ${s.description || s.narration}`));

    // STEP 2: Generate REAL AI motion video clips per scene (falls back to image slideshow if AI video fails)
    console.log('\n🎬 Step 2: Generating REAL AI motion video clips per scene...');
    let sceneClips = [];
    let sceneImages = null;
    try {
        const clipPlan = scenePlan.slice(0, MAX_AI_CLIPS);
        sceneClips = await generateSceneVideoClips(clipPlan);
        console.log(`✅ ${sceneClips.length} real AI motion clips generated (${sceneClips.length * AI_CLIP_DURATION}s total)`);
    } catch (clipErr) {
        console.warn(`⚠️ Real AI video generation failed (${clipErr.message}). Falling back to image slideshow...`);
        sceneImages = await generateSceneImages(scenePlan);
    }

    // STEP 3: Validate motion types (ensure all are valid)
    const motionTypes = scenePlan.map(s => {
        const hint = (s.motion_hint || '').toLowerCase().trim();
        return VALID_MOTIONS.includes(hint) ? hint : pickMotionFromText(s.description);
    });
    console.log(`\n🎥 Motion plan: ${motionTypes.join(' → ')}`);

    // STEP 4: TTS narration from the actual scene narration lines
    console.log('\n🎤 Step 3: Generating TTS narration from script...');
    let audioPath = null;
    try {
        // Use real narration lines from scene plan (these come from the actual script)
        const fullNarration = scenePlan.map(s => s.narration).filter(Boolean).join(' ... ');
        console.log(`  Narration: "${fullNarration.substring(0, 100)}..."`);
        audioPath = await generateNarration(fullNarration, language);
        console.log('  ✅ TTS narration generated');
    } catch (e) {
        console.warn(`  ⚠️ TTS failed, using silent audio: ${e.message}`);
    }

    // Dynamic duration calculation: Match the approximate duration of the generated voiceover audio
    let compileDuration = duration;
    if (audioPath && fs.existsSync(audioPath)) {
        try {
            const fullText = scenePlan.map(s => s.narration).filter(Boolean).join(' ');
            const wordCount = fullText.split(/\s+/).length;
            const approxDuration = Math.max(5, Math.ceil(wordCount / 3)); // Average speaking rate: 3 words per second
            compileDuration = approxDuration;
            console.log(`  📊 Detected approximate voiceover duration: ${compileDuration}s based on script word count (${wordCount} words).`);
        } catch (err) {
            console.warn('  ⚠️ Failed to calculate dynamic audio duration:', err.message);
        }
    }

    // STEP 5: Assemble the reel — real AI clips concatenated, or Ken Burns fallback
    let videoPath = null;
    try {
        if (sceneClips.length > 0) {
            console.log(`\n🎬 Step 4: Concatenating ${sceneClips.length} real AI motion clips + narration via FFmpeg...`);
            const totalDuration = sceneClips.length * AI_CLIP_DURATION;
            videoPath = await assembleVideoClips({
                clips: sceneClips,
                audio: audioPath,
                totalDuration: totalDuration,
                aspectRatio: aspectRatio
            });
            console.log(`\n✅ Dynamic Reel compiled (REAL AI motion) & saved → ${videoPath}`);
        } else {
            console.log(`\n🎬 Step 4: Assembling reel locally via FFmpeg (Ken Burns fallback)...`);
            const { assembleReel: assembleReelFn } = await import('./videoAssembler.js');
            videoPath = await assembleReelFn({
                images: sceneImages,
                audio: audioPath,
                duration: compileDuration,
                aspectRatio: aspectRatio,
                motionType: 'glide',
                motionPlan: motionTypes
            });
            console.log(`\n✅ Fallback reel compiled via FFmpeg & saved → ${videoPath}`);
        }
    } catch (renderErr) {
        console.error("❌ FFmpeg reel assembly failed:", renderErr.message);
        throw renderErr;
    }
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    return {
        videoPath,
        audioPath,
        scenePlan,
        sceneImages,
        sceneClips,
        motionTypes,
        scriptType: detectScriptType(buildScriptContext(plan))
    };
}
