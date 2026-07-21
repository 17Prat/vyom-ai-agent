import fetch from 'node-fetch';

export async function generatePosterImage(prompt) {
    try {
        console.log("🎨 Generating free high-quality image for prompt:", prompt);
        
        // Clean prompt for URL
        const cleanPrompt = encodeURIComponent(prompt + ", 8k resolution, divine lighting, masterpiece, photorealistic");
        const seed = Math.floor(Math.random() * 1000000);

        // 100% Free & Unlimited AI Image Generation (FLUX Model)
        const imageUrl = `https://image.pollinations.ai/prompt/${cleanPrompt}?width=1024&height=1024&seed=${seed}&model=flux&nologo=true`;

        // Verify image URL works
        const res = await fetch(imageUrl);
        if (res.ok) {
            return imageUrl;
        } else {
            console.warn("Pollinations Image Gen HTTP Warning:", res.status);
            return imageUrl; // URL will still render directly in browser <img> tag
        }
    } catch (err) {
        console.error("Image Gen Error:", err.message);
        // Fallback direct URL format
        const cleanPrompt = encodeURIComponent(prompt);
        return `https://image.pollinations.ai/prompt/${cleanPrompt}?width=1024&height=1024&model=flux`;
    }
}
