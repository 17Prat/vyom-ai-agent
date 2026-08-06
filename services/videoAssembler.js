// services/videoAssembler.js
import path from 'path';
import fs from 'fs-extra';

/**
 * Assemble Reel with motion effects (Ken Burns effect)
 * Zoom-in, zoom-out, pan left/right, pan up/down, glide, static
 */
export async function assembleReel({ images, audio = null, duration, aspectRatio = '9:16', motionType = 'glide', motionPlan = null }) {
    const tempDir = path.join(process.cwd(), 'temp');
    const outputDir = path.join(tempDir, 'output');
    await fs.ensureDir(outputDir);
    const outputPath = path.join(outputDir, `reel_${Date.now()}.mp4`);
    
    // If no valid audio found, generate silent fallback WAV track
    if (!audio || !(await fs.pathExists(audio))) {
        console.log('⚠️ No valid audio narration found. Generating local silence fallback...');
        try {
            const { generateSilentAudioFallback } = await import('./ttsService.js');
            audio = await generateSilentAudioFallback(duration);
        } catch (err) {
            console.error("⚠️ Failed to generate fallback silent audio:", err.message);
            audio = null;
        }
    }
    
    // Per-image duration
    const imageDuration = parseFloat((duration / images.length).toFixed(2));
    
    // Create filter graphs — use per-scene motionPlan if provided, else single motionType
    const filters = images.map((image, index) => {
        const sceneMotion = (motionPlan && motionPlan[index]) ? motionPlan[index] : motionType;
        return createFilterWithMotion(index, imageDuration, aspectRatio, sceneMotion);
    });
    
    // Build complex filter
    const filterParts = filters.map(f => f.filter);
    const concatInputs = images.map((_, i) => `[v${i}]`).join('');
    const concatFilter = `${concatInputs}concat=n=${images.length}:v=1:a=0[outv]`;
    const allFilters = filterParts.join(';') + ';' + concatFilter;
    
    return new Promise(async (resolve, reject) => {
        const motionSummary = motionPlan ? motionPlan.join('→') : motionType;
        console.log(`🎬 Starting FFmpeg video assembly with motion: [${motionSummary}]...`);
        
        let ffmpeg;
        let ffmpegStatic;
        try {
            ffmpeg = (await import('fluent-ffmpeg')).default;
            ffmpegStatic = (await import('ffmpeg-static')).default;
            ffmpeg.setFfmpegPath(ffmpegStatic);
        } catch (err) {
            return reject(new Error("Missing dependencies: 'fluent-ffmpeg' or 'ffmpeg-static'. Please run 'npm install fluent-ffmpeg ffmpeg-static' in your terminal."));
        }

        let command = ffmpeg();
        
        // Add each image as input
        images.forEach((image) => {
            if (fs.existsSync(image)) {
                command = command.input(image).inputOptions(['-loop 1', `-t ${imageDuration}`]);
            }
        });
        
        // Add audio if it exists
        const hasAudio = audio && fs.existsSync(audio);
        if (hasAudio) {
            command = command.input(audio);
        }
        
        // Build output options
        const audioMap = hasAudio ? `-map ${images.length}:a` : '';
        const outputOptions = [
            '-map [outv]',
            audioMap,
            '-c:v libx264',
            '-preset medium',
            '-crf 23',
            '-pix_fmt yuv420p',
            '-movflags +faststart',
            `-t ${duration}`,
            '-y'
        ].filter(Boolean);
        
        command
            .complexFilter(allFilters)
            .outputOptions(outputOptions)
            .output(outputPath)
            .on('start', (cmdline) => {
                console.log(`🎬 FFmpeg started with motion effects: ${cmdline}`);
            })
            .on('end', () => {
                console.log(`✅ Reel with motion completed: ${outputPath}`);
                resolve(outputPath);
            })
            .on('error', (err) => {
                console.error('❌ FFmpeg Video assembly error:', err.message);
                reject(err);
            })
            .run();
    });
}

/**
 * Concatenate real AI video clips into one reel and mux narration audio.
 * Used for the realistic (non-slideshow) reel pipeline.
 */
export async function assembleVideoClips({ clips, audio = null, totalDuration, aspectRatio = '9:16' }) {
    const tempDir = path.join(process.cwd(), 'temp');
    const outputDir = path.join(tempDir, 'output');
    await fs.ensureDir(outputDir);
    const outputPath = path.join(outputDir, `ai_reel_${Date.now()}.mp4`);

    if (!clips || clips.length === 0) {
        throw new Error('No video clips provided to assembleVideoClips');
    }

    // Filter to existing clips only
    const existingClips = clips.filter(c => fs.existsSync(c));
    if (existingClips.length === 0) {
        throw new Error('None of the provided video clips exist on disk');
    }

    return new Promise(async (resolve, reject) => {
        let ffmpeg;
        let ffmpegStatic;
        try {
            ffmpeg = (await import('fluent-ffmpeg')).default;
            ffmpegStatic = (await import('ffmpeg-static')).default;
            ffmpeg.setFfmpegPath(ffmpegStatic);
        } catch (err) {
            return reject(new Error("Missing dependencies: 'fluent-ffmpeg' or 'ffmpeg-static'. Please run 'npm install fluent-ffmpeg ffmpeg-static' in your terminal."));
        }

        const perClipDuration = parseFloat((totalDuration / existingClips.length).toFixed(2));

        let command = ffmpeg();
        existingClips.forEach((clip) => {
            command = command.input(clip).inputOptions(['-t', String(perClipDuration)]);
        });

        const hasAudio = audio && fs.existsSync(audio);
        if (hasAudio) {
            command = command.input(audio);
        }

        // Scale every clip to uniform 1080x1920, normalize fps, then concat
        const filterParts = existingClips.map((_, i) => {
            return `[${i}:v]scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30[vc${i}]`;
        });
        const concatInputs = existingClips.map((_, i) => `[vc${i}]`).join('');
        const concatFilter = `${concatInputs}concat=n=${existingClips.length}:v=1:a=0[outv]`;

        const audioMap = hasAudio ? `-map ${existingClips.length}:a` : '';
        const outputOptions = [
            '-map [outv]',
            audioMap,
            '-c:v libx264',
            '-preset medium',
            '-crf 23',
            '-pix_fmt yuv420p',
            '-movflags +faststart',
            `-t ${totalDuration}`,
            '-y'
        ].filter(Boolean);

        command
            .complexFilter(filterParts.join(';') + ';' + concatFilter)
            .outputOptions(outputOptions)
            .output(outputPath)
            .on('start', (cmdline) => {
                console.log(`🎬 FFmpeg clip concat started: ${cmdline}`);
            })
            .on('end', () => {
                console.log(`✅ AI reel (real motion clips) compiled: ${outputPath}`);
                resolve(outputPath);
            })
            .on('error', (err) => {
                console.error('❌ FFmpeg clip concat error:', err.message);
                reject(err);
            })
            .run();
    });
}

/**
 * Create FFmpeg filter with motion effects
 * Motion types: zoom-in, zoom-out, pan-left, pan-right, glide, static
 */
function createFilterWithMotion(index, duration, aspectRatio, motionType) {
    const width = 1080;
    const height = 1920;
    
    // Scale image to fit with padding
    const scaleFilter = `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30`;
    
    let motionFilter = '';
    const frames = Math.ceil(duration * 30);
    
    switch (motionType) {
        case 'zoom-in':
            // Smooth zoom-in from 1.0 to 1.35 over the entire scene duration
            motionFilter = `zoompan=z='1.0+0.35*(on/${frames})':x='(iw-iw/zoom)/2':y='(ih-ih/zoom)/2':d=1:fps=30:s=${width}x${height}`;
            break;
            
        case 'zoom-out':
            // Smooth zoom-out from 1.35 to 1.0 over the entire scene duration
            motionFilter = `zoompan=z='1.35-0.35*(on/${frames})':x='(iw-iw/zoom)/2':y='(ih-ih/zoom)/2':d=1:fps=30:s=${width}x${height}`;
            break;
            
        case 'pan-left':
            // Steady zoom at 1.3, smooth pan from right-to-left across the full duration
            motionFilter = `zoompan=z='1.30':x='(iw-iw/zoom)*(1.0-on/${frames})':y='(ih-ih/zoom)/2':d=1:fps=30:s=${width}x${height}`;
            break;
            
        case 'pan-right':
            // Steady zoom at 1.3, smooth pan from left-to-right across the full duration
            motionFilter = `zoompan=z='1.30':x='(iw-iw/zoom)*(on/${frames})':y='(ih-ih/zoom)/2':d=1:fps=30:s=${width}x${height}`;
            break;
            
        case 'glide':
            // Smooth diagonal glide (both zoom-in and slow pan down-right) across the full duration
            motionFilter = `zoompan=z='1.0+0.25*(on/${frames})':x='(iw-iw/zoom)*(on/${frames})':y='(ih-ih/zoom)*(on/${frames})':d=1:fps=30:s=${width}x${height}`;
            break;
            
        default: // 'static'
            motionFilter = `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30`;
            break;
    }
    
    // Apply scaling first, then zoompan, and scale again to target resolution
    if (motionType !== 'static') {
        motionFilter = `${scaleFilter},${motionFilter},scale=${width}:${height}`;
    }
    
    return {
        filter: `[${index}:v]${motionFilter}[v${index}]`,
        type: motionType
    };
}

/**
 * Simple zoom-in for each scene (Ken Burns style) - Stable Fallback
 */
export async function assembleReelSimple({ images, audio = null, duration }) {
    const tempDir = path.join(process.cwd(), 'temp');
    const outputDir = path.join(tempDir, 'output');
    await fs.ensureDir(outputDir);
    const outputPath = path.join(outputDir, `reel_${Date.now()}.mp4`);
    
    // If no valid audio found, generate silent fallback WAV track
    if (!audio || !(await fs.pathExists(audio))) {
        try {
            const { generateSilentAudioFallback } = await import('./ttsService.js');
            audio = await generateSilentAudioFallback(duration);
        } catch (err) {
            audio = null;
        }
    }
    
    const imageDuration = parseFloat((duration / images.length).toFixed(2));
    const frames = Math.ceil(imageDuration * 30);
    
    // Create a simple filter with zoompan for each image
    let filterParts = images.map((_, i) => {
        return `[${i}:v]scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30,zoompan=z='min(zoom+0.0015,1.3)':d=${frames}:fps=30:s=1080x1920[v${i}]`;
    });
    
    const concatInputs = images.map((_, i) => `[v${i}]`).join('');
    const concatFilter = `${concatInputs}concat=n=${images.length}:v=1:a=0[outv]`;
    const allFilters = filterParts.join(';') + ';' + concatFilter;
    
    return new Promise(async (resolve, reject) => {
        let ffmpeg;
        let ffmpegStatic;
        try {
            ffmpeg = (await import('fluent-ffmpeg')).default;
            ffmpegStatic = (await import('ffmpeg-static')).default;
            ffmpeg.setFfmpegPath(ffmpegStatic);
        } catch (err) {
            return reject(err);
        }

        let command = ffmpeg();
        
        images.forEach((image) => {
            if (fs.existsSync(image)) {
                command = command.input(image).inputOptions(['-loop 1', `-t ${imageDuration}`]);
            }
        });
        
        const hasAudio = audio && fs.existsSync(audio);
        if (hasAudio) {
            command = command.input(audio);
        }
        
        const audioMap = hasAudio ? `-map ${images.length}:a` : '';
        const outputOptions = ['-map [outv]', audioMap, '-c:v libx264', '-preset medium', '-crf 23', '-pix_fmt yuv420p', '-movflags +faststart', `-t ${duration}`, '-y'].filter(Boolean);
        
        command
            .complexFilter(allFilters)
            .outputOptions(outputOptions)
            .output(outputPath)
            .on('end', () => resolve(outputPath))
            .on('error', (err) => reject(err))
            .run();
    });
}
