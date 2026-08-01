// services/reelEngine.js
import fs from 'fs-extra';
import path from 'path';
import fetch from 'node-fetch';
import { generateNarration } from './ttsService.js';
import { assembleReel } from './videoAssembler.js';

/**
 * Complete Reel Generation Pipeline — 100% Free
 * No API keys required
 */
export async function generateCompleteReel(plan, options = {}) {
    const {
        duration = 40, // seconds
        language = 'hi',
        aspectRatio = '9:16',
        motionType = 'glide'
    } = options;

    const title = plan.title || 'Instagram Reel';
    const scenes = plan.scenes || [];
    
    console.log(`🎬 Starting Reel Generation for: "${title}" (Motion: ${motionType})`);

    // ============ STEP 1: Generate Scene Images ============
    console.log('🖼️ Step 1: Generating scene images via Pollinations Flux (Free)...');
    const sceneImages = await generateSceneImages(scenes);
    
    // ============ STEP 2: Generate Audio Narration ============
    console.log('🎤 Step 2: Generating audio narration via Edge TTS (Free)...');
    let audioPath = null;
    try {
        // Extract the full narration text from the scenes
        const fullNarration = scenes.map(s => s.narration).join(' ');
        audioPath = await generateNarration(fullNarration, language);
    } catch (error) {
        console.warn('⚠️ TTS narration failed, continuing with silent/fallback audio track:', error.message);
    }
    
    // ============ STEP 3: Assemble Video ============
    console.log('🎬 Step 3: Assembling final reel video locally via FFmpeg...');
    const videoPath = await assembleReel({
        images: sceneImages,
        audio: audioPath,
        duration: duration,
        aspectRatio: aspectRatio,
        motionType: motionType
    });
    
    console.log('✅ Reel generation complete!');
    return {
        videoPath,
        audioPath,
        sceneImages
    };
}

// ============ IMAGE GENERATION ============
async function generateSceneImages(scenes) {
    const imagePaths = [];
    const outputDir = path.join(process.cwd(), 'temp', 'reel_frames');
    await fs.ensureDir(outputDir);
    
    for (let i = 0; i < scenes.length; i++) {
        const scene = scenes[i];
        const visualPrompt = scene.visual_prompt || `Cinematic image for scene ${i+1}`;
        console.log(`  → Generating image ${i+1}/${scenes.length}: ${visualPrompt.substring(0, 50)}...`);
        
        // Use Pollinations free image generation
        const imageUrl = await generateFreeImage(visualPrompt);
        const imagePath = path.join(outputDir, `scene_${String(i+1).padStart(3, '0')}.jpg`);
        
        // Download and save image
        await downloadImage(imageUrl, imagePath);
        imagePaths.push(imagePath);
    }
    
    return imagePaths;
}

// ============ FREE IMAGE GENERATION ============
async function generateFreeImage(prompt) {
    // Keep it short and sweet to avoid extremely long URL queries causing 500 status on Pollinations
    const simplifiedPrompt = prompt.split(',')[0].substring(0, 80);
    const cleanPrompt = encodeURIComponent(simplifiedPrompt + ", cinematic lighting, 8k resolution");
    const uniqueId = Math.floor(Math.random() * 1000000);
    
    // Check if authenticated key exists
    const apiKey = process.env.POLLINATIONS_API_KEY;
    if (apiKey) {
        return `https://image.pollinations.ai/prompt/${cleanPrompt}?width=1080&height=1920&model=flux&seed=${uniqueId}&nologo=true&key=${apiKey}`;
    }
    return `https://image.pollinations.ai/prompt/${cleanPrompt}?width=1080&height=1920&model=flux&seed=${uniqueId}&nologo=true`;
}

// ============ DOWNLOAD HELPER ============
async function downloadImage(url, filepath) {
    let attempts = 3;
    while (attempts > 0) {
        try {
            console.log(`🎬 Downloading image asset (Attempts left: ${attempts})...`);
            const response = await fetch(url);
            if (response.ok) {
                const buffer = await response.arrayBuffer();
                await fs.writeFile(filepath, Buffer.from(buffer));
                return;
            }
            console.warn(`⚠️ Download returned status ${response.status}. Retrying...`);
        } catch (e) {
            console.warn(`⚠️ Download error: ${e.message}. Retrying...`);
        }
        attempts--;
        if (attempts > 0) {
            // Exponential backoff
            await new Promise(resolve => setTimeout(resolve, 1500));
        }
    }
    
    // Final fail-safe: Copy local appicon.jpeg to the frames directory so the video builder succeeds
    const localIconPath = path.join(process.cwd(), 'public', 'appicon.jpeg');
    if (fs.existsSync(localIconPath)) {
        console.warn("⚠️ All Pollinations image downloads failed. Falling back to local appicon.jpeg to prevent build crash.");
        await fs.copy(localIconPath, filepath);
    } else {
        throw new Error(`Failed to download image and no local fallback icon found at: ${localIconPath}`);
    }
}
