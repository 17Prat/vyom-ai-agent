// services/ttsService.js
import path from 'path';
import fs from 'fs-extra';
import { Communicate } from 'edge-tts-universal';

/**
 * Free Text-to-Speech using Edge TTS (Microsoft) with Google TTS fallback.
 * No API key required.
 */
export async function generateNarration(text, language = 'hi') {
    const tempDir = path.join(process.cwd(), 'temp');
    await fs.ensureDir(tempDir);
    const outputPath = path.join(tempDir, `narration_${Date.now()}.mp3`);
    
    if (!text || !text.trim()) {
        return await generateSilentAudio(5);
    }
    
    const cleanText = text.trim();

    // Voice mapping for Edge TTS
    const voices = {
        'hi': 'hi-IN-SwaraNeural',     // Hindi female
        'en': 'en-US-JennyNeural',     // English female
        'hi-en': 'hi-IN-SwaraNeural'   // Hinglish
    };
    
    const voice = voices[language] || voices['hi'];
    
    // 1. Try Microsoft Edge TTS via Communicate from edge-tts-universal
    try {
        console.log(`🎤 Synthesizing TTS voiceover using Edge TTS voice: "${voice}"...`);
        const communicate = new Communicate(cleanText, { voice });
        const audioChunks = [];
        for await (const chunk of communicate.stream()) {
            if (chunk.type === 'audio' && chunk.data) {
                audioChunks.push(chunk.data);
            }
        }
        if (audioChunks.length > 0) {
            const fullBuffer = Buffer.concat(audioChunks);
            await fs.writeFile(outputPath, fullBuffer);
            console.log(`✅ Edge TTS Audio saved successfully: ${outputPath} (${fullBuffer.length} bytes)`);
            return outputPath;
        }
        throw new Error('Edge TTS returned no audio chunks');
    } catch (edgeErr) {
        console.warn(`⚠️ Edge TTS failed: ${edgeErr.message}. Trying Google TTS fallback...`);
    }

    // 2. Fallback: Google Translate TTS API
    try {
        const fallbackPath = await generateGoogleTTS(cleanText, language, outputPath);
        return fallbackPath;
    } catch (googleErr) {
        console.warn(`⚠️ Google TTS failed: ${googleErr.message}. Using silent audio fallback...`);
    }

    // 3. Last Resort: Silent Audio
    return await generateSilentAudio(calculateDuration(cleanText));
}

/**
 * Helper to generate speech using Google Translate TTS API
 */
async function generateGoogleTTS(text, language = 'hi', outputPath) {
    const lang = (language === 'en') ? 'en' : 'hi';
    const chunks = splitTextIntoChunks(text, 150);
    const audioBuffers = [];

    for (const chunk of chunks) {
        const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(chunk)}&tl=${lang}&client=tw-ob`;
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });
        if (!response.ok) {
            throw new Error(`Google TTS request failed with status ${response.status}`);
        }
        const arrayBuffer = await response.arrayBuffer();
        audioBuffers.push(Buffer.from(arrayBuffer));
    }

    const fullBuffer = Buffer.concat(audioBuffers);
    await fs.writeFile(outputPath, fullBuffer);
    console.log(`✅ Google TTS Audio saved successfully: ${outputPath} (${fullBuffer.length} bytes)`);
    return outputPath;
}

/**
 * Split text into chunks by space/punctuation without exceeding maxLen
 */
function splitTextIntoChunks(text, maxLen = 150) {
    const sentences = text.match(/[^.!?।\n]+[.!?।\n]?/g) || [text];
    const chunks = [];
    let currentChunk = '';

    for (const sentence of sentences) {
        if ((currentChunk + sentence).length <= maxLen) {
            currentChunk += sentence;
        } else {
            if (currentChunk.trim()) chunks.push(currentChunk.trim());
            if (sentence.length > maxLen) {
                // If sentence alone is longer than maxLen, split by words
                const words = sentence.split(/\s+/);
                currentChunk = '';
                for (const word of words) {
                    if ((currentChunk + ' ' + word).length <= maxLen) {
                        currentChunk += (currentChunk ? ' ' : '') + word;
                    } else {
                        if (currentChunk.trim()) chunks.push(currentChunk.trim());
                        currentChunk = word;
                    }
                }
            } else {
                currentChunk = sentence;
            }
        }
    }
    if (currentChunk.trim()) {
        chunks.push(currentChunk.trim());
    }
    return chunks;
}

function calculateDuration(text) {
    // Average speaking rate: 3 words per second
    const wordCount = text.split(/\s+/).length;
    return Math.max(5, Math.ceil(wordCount / 3));
}

async function generateSilentAudio(duration) {
    const tempDir = path.join(process.cwd(), 'temp');
    await fs.ensureDir(tempDir);
    const outputPath = path.join(tempDir, `silent_${Date.now()}.mp3`);
    try {
        const fallbackPath = await generateSilentAudioFallback(duration);
        await fs.copy(fallbackPath, outputPath);
    } catch (fallbackErr) {
        console.error("⚠️ WAV fallback failed:", fallbackErr.message);
    }
    return outputPath;
}

export async function generateSilentAudioFallback(duration) {
    const tempDir = path.join(process.cwd(), 'temp');
    await fs.ensureDir(tempDir);
    const outputPath = path.join(tempDir, `silent_fallback_${Date.now()}.mp3`);
    
    const sampleRate = 44100;
    const channels = 2;
    const bitsPerSample = 16;
    const bytesPerSample = bitsPerSample / 8;
    const totalSamples = sampleRate * channels * duration;
    const dataLength = totalSamples * bytesPerSample;
    
    // Create WAV header + silent data buffer
    const header = Buffer.alloc(44);
    header.write('RIFF', 0);
    header.writeUInt32LE(36 + dataLength, 4);
    header.write('WAVE', 8);
    header.write('fmt ', 12);
    header.writeUInt32LE(16, 16); // PCM format
    header.writeUInt16LE(1, 20); // Audio format (PCM)
    header.writeUInt16LE(channels, 22);
    header.writeUInt32LE(sampleRate, 24);
    header.writeUInt32LE(sampleRate * channels * bytesPerSample, 28);
    header.writeUInt16LE(channels * bytesPerSample, 32);
    header.writeUInt16LE(bitsPerSample, 34);
    header.write('data', 36);
    header.writeUInt32LE(dataLength, 40);
    
    const silentData = Buffer.alloc(dataLength, 0);
    const wavData = Buffer.concat([header, silentData]);
    
    await fs.writeFile(outputPath, wavData);
    console.log(`✅ Fallback silent audio created: ${outputPath}`);
    return outputPath;
}

