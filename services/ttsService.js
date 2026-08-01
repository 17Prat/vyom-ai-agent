// services/ttsService.js
import path from 'path';
import fs from 'fs-extra';

/**
 * Free Text-to-Speech using Edge TTS (Microsoft)
 * No API key required
 */
export async function generateNarration(text, language = 'hi') {
    const tempDir = path.join(process.cwd(), 'temp');
    await fs.ensureDir(tempDir);
    const outputPath = path.join(tempDir, `narration_${Date.now()}.mp3`);
    
    // Voice mapping
    const voices = {
        'hi': 'hi-IN-SwaraNeural',    // Hindi female
        'en': 'en-US-JennyNeural',     // English female
        'hi-en': 'hi-IN-SwaraNeural'   // Hinglish
    };
    
    const voice = voices[language] || voices['hi'];
    
    try {
        console.log(`🎤 Synthesizing TTS voiceover using voice: "${voice}"...`);
        
        let EdgeTTS;
        try {
            const module = await import('edge-tts-universal');
            EdgeTTS = module.EdgeTTS || module.default;
        } catch (err) {
            throw new Error("Missing dependency: 'edge-tts-universal'. Run: npm install edge-tts-universal");
        }
        
        const tts = new EdgeTTS();
        
        // Try multiple API patterns (package version differs)
        let success = false;

        // Pattern 1: ttsPromise(text, outputPath, voice)
        if (!success && typeof tts.ttsPromise === 'function') {
            try {
                await tts.ttsPromise(text, outputPath, voice);
                success = true;
                console.log('✅ TTS done via ttsPromise()');
            } catch (e) { console.warn('  TTS pattern 1 failed:', e.message); }
        }

        // Pattern 2: synthesize(text, voice) → returns buffer → write to file
        if (!success && typeof tts.synthesize === 'function') {
            try {
                const buffer = await tts.synthesize(text, voice);
                if (buffer) {
                    await fs.writeFile(outputPath, buffer);
                    success = true;
                    console.log('✅ TTS done via synthesize()');
                }
            } catch (e) { console.warn('  TTS pattern 2 failed:', e.message); }
        }

        // Pattern 3: toFile(outputPath, text, { voice })
        if (!success && typeof tts.toFile === 'function') {
            try {
                await tts.toFile(outputPath, text, { voice });
                success = true;
                console.log('✅ TTS done via toFile()');
            } catch (e) { console.warn('  TTS pattern 3 failed:', e.message); }
        }

        // Pattern 4: generate(text, { voice }) → write stream
        if (!success && typeof tts.generate === 'function') {
            try {
                const audioData = await tts.generate(text, { voice });
                if (audioData) {
                    await fs.writeFile(outputPath, audioData instanceof Buffer ? audioData : Buffer.from(audioData));
                    success = true;
                    console.log('✅ TTS done via generate()');
                }
            } catch (e) { console.warn('  TTS pattern 4 failed:', e.message); }
        }

        // Pattern 5: saveToFile (original — may work on some versions)
        if (!success && typeof tts.saveToFile === 'function') {
            try {
                await tts.saveToFile(outputPath, text, { voice });
                success = true;
                console.log('✅ TTS done via saveToFile()');
            } catch (e) { console.warn('  TTS pattern 5 failed:', e.message); }
        }

        if (!success) throw new Error('All edge-tts-universal API patterns failed');

        console.log(`✅ TTS Audio saved: ${outputPath}`);
        return outputPath;

    } catch (error) {
        console.error('❌ Edge TTS Error:', error.message);
        console.warn('⚠️ TTS failed. Using silent audio fallback...');
        return await generateSilentAudio(calculateDuration(text));
    }

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
