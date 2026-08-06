import WebSocket from 'ws';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from './config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SYSTEM_PROMPT = fs.readFileSync(path.join(__dirname, 'system_prompt.md'), 'utf-8');

export class OpenAIRealtimeClient {
    constructor(onTextResponse, onAudioResponse) {
        this.onTextResponse = onTextResponse;
        this.onAudioResponse = onAudioResponse;
        this.ws = null;
    }

    connect() {
        if (!config.OPENAI_API_KEY) {
            console.warn("⚠️ OPENAI_API_KEY is not set. Realtime agent will run in Mock Mode.");
            return false;
        }

        const url = "wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-10-01";
        
        this.ws = new WebSocket(url, {
            headers: {
                "Authorization": `Bearer ${config.OPENAI_API_KEY}`,
                "OpenAI-Beta": "realtime=v1"
            }
        });

        this.ws.on('open', () => {
            console.log("⚡ Connected to OpenAI Realtime API.");
            this.sendSessionUpdate();
        });

        this.ws.on('message', (data) => {
            try {
                const event = JSON.parse(data);
                this.handleEvent(event);
            } catch (err) {
                console.error("Error parsing WS message:", err);
            }
        });

        this.ws.on('close', () => {
            console.log("🔌 OpenAI Realtime connection closed.");
        });

        this.ws.on('error', (err) => {
            console.error("❌ OpenAI Realtime Error:", err.message);
        });

        return true;
    }

    sendSessionUpdate() {
        const sessionEvent = {
            type: "session.update",
            session: {
                modalities: ["text", "audio"],
                instructions: SYSTEM_PROMPT,
                voice: "alloy", // alloy, echo, shimmer, etc.
                input_audio_format: "g711_ulaw",
                output_audio_format: "g711_ulaw",
                turn_detection: {
                    type: "server_vad",
                    threshold: 0.5,
                    prefix_padding_ms: 300,
                    silence_duration_ms: 500
                }
            }
        };
        this.ws.send(JSON.stringify(sessionEvent));
    }

    handleEvent(event) {
        switch (event.type) {
            case "response.audio_transcript.delta":
                if (this.onTextResponse) {
                    this.onTextResponse(event.delta);
                }
                break;
            case "response.audio.delta":
                if (this.onAudioResponse) {
                    // event.delta is base64 g711_ulaw audio chunk
                    this.onAudioResponse(event.delta);
                }
                break;
            case "error":
                console.error("OpenAI Realtime session error:", event.error);
                break;
        }
    }

    sendAudioChunk(base64Audio) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({
                type: "input_audio_buffer.append",
                audio: base64Audio
            }));
        }
    }

    close() {
        if (this.ws) {
            this.ws.close();
        }
    }
}
