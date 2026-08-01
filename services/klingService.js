import fetch from 'node-fetch';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs-extra';

dotenv.config();

/**
 * Generates video programmatically using JSON2Video API (json2video.com)
 * Docs Studied: POST to /v2/movies, check status asynchronously, download result.
 */
export async function generateJson2Video(scenes, audioUrl, totalDuration) {
    const apiKey = process.env.JSON2VIDEO_API_KEY;
    if (!apiKey || apiKey === 'your_json2video_api_key_here') {
        throw new Error("❌ JSON2VIDEO_API_KEY is missing or not configured in .env file.");
    }

    console.log("🎬 Formatting payload for JSON2Video API...");

    // Format elements per scene
    const formattedScenes = scenes.map((scene, index) => {
        const duration = scene.duration_seconds || parseFloat((totalDuration / scenes.length).toFixed(2));
        const elements = [];

        // 1. Add visual element (Image or Video)
        if (scene.image_url) {
            const motion = scene.motion_hint || "glide";
            const element = {
                type: "image",
                src: scene.image_url,
                duration: duration
            };
            
            // Map our motion types to official JSON2Video pan and zoom parameters
            if (motion === 'zoom-in') {
                element.zoom = 5;
            } else if (motion === 'zoom-out') {
                element.zoom = -5;
            } else if (motion === 'pan-left') {
                element.pan = "left";
            } else if (motion === 'pan-right') {
                element.pan = "right";
            } else if (motion === 'glide') {
                element.zoom = 3;
                element.pan = "bottom-right";
            }
            
            elements.push(element);
        }

        return {
            duration: duration,
            elements: elements
        };
    });

    // Create the global movie payload structure
    const payload = {
        resolution: "instagram-story", // 1080x1920 9:16 aspect ratio
        quality: "high",
        scenes: formattedScenes
    };

    // If audio narration is present and is a public URL, add it as a global element overlaying the timeline.
    // Note: JSON2Video requires a publicly accessible HTTP/HTTPS URL. Local file paths will fail.
    if (audioUrl && (audioUrl.startsWith('http://') || audioUrl.startsWith('https://'))) {
        payload.elements = [{
            type: "audio",
            src: audioUrl,
            start: 0,
            duration: totalDuration
        }];
    }

    console.log("🚀 Sending POST request to JSON2Video API v2...");
    
    const response = await fetch("https://api.json2video.com/v2/movies", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "x-api-key": apiKey
        },
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`JSON2Video API POST request failed: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    const projectId = data.project;
    console.log(`✅ Project created successfully! Project ID: ${projectId}. Polling status...`);

    // Poll status: queued -> running -> done
    const maxPollAttempts = 40;
    const pollIntervalMs = 5000; // Poll every 5s

    for (let attempt = 1; attempt <= maxPollAttempts; attempt++) {
        await new Promise(resolve => setTimeout(resolve, pollIntervalMs));

        console.log(`🔍 Polling JSON2Video status (Attempt ${attempt}/${maxPollAttempts})...`);
        const statusResponse = await fetch(`https://api.json2video.com/v2/movies?project=${projectId}`, {
            headers: { "x-api-key": apiKey }
        });

        if (!statusResponse.ok) {
            console.warn(`⚠️ Status poll returned ${statusResponse.status}. Continuing...`);
            continue;
        }

        const statusData = await statusResponse.json();
        const movie = statusData.movie;

        if (movie.status === 'done') {
            console.log(`🎉 Video rendering complete! Video URL: ${movie.url}`);
            return movie.url;
        } else if (movie.status === 'error') {
            throw new Error(`❌ Video rendering failed on JSON2Video side: ${movie.message || 'Unknown error'}`);
        } else {
            console.log(`⏳ Render status: ${movie.status} (${movie.progress || 0}% progress)`);
        }
    }

    throw new Error("❌ Timeout waiting for JSON2Video to render.");
}
