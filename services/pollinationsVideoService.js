import fs from 'fs';
import path from 'path';
import os from 'os';
import dotenv from 'dotenv';

dotenv.config();

export async function generatePollinationsVideo(promptText, duration = 4, model = 'nova-reel', aspectRatio = '9:16', audio = false, ignoreFallback = false) {
  const apiKey = process.env.POLLINATIONS_API_KEY;
  const seed = Math.floor(Math.random() * 1000000);
  
  // Format the prompt for URL encoding
  const encodedPrompt = encodeURIComponent(promptText);
  
  // Build the generation URL
  let url = `https://gen.pollinations.ai/video/${encodedPrompt}?model=${model}&duration=${duration}&aspect_ratio=${aspectRatio}&audio=${audio}&seed=${seed}&nologo=true`;
  
  if (apiKey) {
    url += `&key=${apiKey}`;
  }
  
  console.log(`🎬 Requesting Pollinations Video Generation... URL: ${url.replace(apiKey || '', '***')}`);
  
  try {
    let res = await fetch(url);
    
    // Fallback: If authenticated request fails (e.g. 402 Payment Required or rate-limited), try without key (free tier)
    if (!res.ok && apiKey) {
      console.warn("⚠️ Authenticated video generation failed. Retrying in anonymous free tier...");
      const urlWithoutKey = url.replace(`&key=${apiKey}`, '');
      res = await fetch(urlWithoutKey);
    }
    
    if (!res.ok) {
      const errText = await res.text();
      if (res.status === 401 || errText.includes("Authentication required")) {
        console.warn("⚠️ Pollinations video model requires paid authorization key. Falling back to dynamic image synthesis & FFmpeg pan motion layout...");
        // Fallback: Dynamically generate an image asset for this scene and compile it to video
        const { generatePosterImage } = await import('./mediaService.js');
        const { assembleReel } = await import('./videoAssembler.js');
        
        const imageUrl = await generatePosterImage(promptText);
        const outputDir = path.join(process.cwd(), 'temp', 'video_fallbacks');
        await fs.promises.mkdir(outputDir, { recursive: true });
        
        const tempImgPath = path.join(outputDir, `fallback_${Date.now()}.jpg`);
        const imageRes = await fetch(imageUrl);
        const imageBuffer = Buffer.from(await imageRes.arrayBuffer());
        await fs.promises.writeFile(tempImgPath, imageBuffer);
        
        const compiledVideoPath = await assembleReel({
          images: [tempImgPath],
          duration: duration,
          aspectRatio: aspectRatio,
          motionType: 'glide'
        });
        
        console.log(`💾 Fallback video synthesized successfully: ${compiledVideoPath}`);
        return compiledVideoPath;
      }
      throw new Error(`Pollinations Video Gen failed (Status ${res.status}): ${errText}`);
    }
    
    // Download the video binary
    const buffer = Buffer.from(await res.arrayBuffer());
    
    // Save to temp file
    const localPath = path.join(os.tmpdir(), `pollinations-video-${Date.now()}.mp4`);
    fs.writeFileSync(localPath, buffer);
    
    console.log(`💾 Pollinations video saved locally: ${localPath} (${buffer.length} bytes)`);
    return localPath;
    
  } catch (err) {
    console.error("❌ Pollinations Video Gen Error:", err.message);
    throw err;
  }
}
