import fetch from 'node-fetch';
import dotenv from 'dotenv';
dotenv.config();

/**
 * 📁 Real Master Screenshot Poster Router
 * Maps user queries directly to authentic real app screenshot master poster files stored in public/posters/
 */
export function getLocalPosterForPrompt(prompt) {
    if (!prompt || typeof prompt !== 'string') {
        return '/posters/poster_master_cinematic_ad.jpg';
    }

    const lower = prompt.toLowerCase();

    // 1. EMERGENCY SOS MASTER POSTER (Real Emergency SOS screen in 3D Phone Showcase)
    if (lower.includes('sos') || lower.includes('emergency') || lower.includes('safety') || lower.includes('medical') || lower.includes('accident')) {
        return '/posters/poster_master_sos.jpg';
    }

    // 2. BRAHMAND PASSPORT MASTER POSTER (Real Passport screen in 3D Phone Showcase)
    if (lower.includes('passport')) {
        return '/posters/poster_master_passport.jpg';
    }

    // 3. MY KRISHN AI CHAT MASTER POSTER (Real My Krishn screen in 3D Phone Showcase)
    if (lower.includes('krishn') || lower.includes('gita')) {
        return '/posters/poster_master_krishn.jpg';
    }

    // 4. HANUMAN CHALISA / LIVE JAAP POSTER
    if (lower.includes('jaap') || lower.includes('hanuman') || lower.includes('chalisa') || lower.includes('mantra')) {
        return '/posters/poster_10_hanuman_chalisa_jaap.jpg';
    }

    // 5. COMMUNITY / SEVA / HELP POSTER
    if (lower.includes('community') || lower.includes('seva') || lower.includes('blood') || lower.includes('help')) {
        return '/posters/poster_5_help_community_grid.jpg';
    }

    // 6. 360 FEATURE WHEEL POSTER
    if (lower.includes('wheel') || lower.includes('360')) {
        return '/posters/poster_4_feature_wheel.jpg';
    }

    // 7. PROFILE & SETTINGS POSTER
    if (lower.includes('profile') || lower.includes('setting') || lower.includes('kyc')) {
        return '/posters/poster_7_profile_settings.jpg';
    }

    // 8. HOME FEED POSTER
    if (lower.includes('home') || lower.includes('feed')) {
        return '/posters/poster_9_home_feed.jpg';
    }

    // 9. MASTER CINEMATIC PROMOTIONAL SHOWCASE POSTER
    return '/posters/poster_master_cinematic_ad.jpg';
}

export async function generatePosterImage(prompt) {
    console.log("📁 Serving Authentic Real UI Screenshot Master Poster for:", prompt);
    const posterUrl = getLocalPosterForPrompt(prompt);
    console.log("✅ Real Master Poster Image URL Served:", posterUrl);
    return posterUrl;
}

export async function generateFreeVideoAsset(promptText) {
    const posterUrl = getLocalPosterForPrompt(promptText);
    return {
        success: true,
        assetUrl: posterUrl,
        type: "real_app_screenshot_poster",
        note: "Served authentic app master poster from local storage."
    };
}

export async function generateFreeVideo(prompt) {
    const posterUrl = getLocalPosterForPrompt(prompt);
    return {
        success: true,
        type: "real_app_screenshot_poster",
        url: posterUrl,
        note: "Served authentic app master poster from local storage."
    };
}

export async function createSlideshowVideo(images, audioUrl, outputPath) {
    return outputPath;
}
