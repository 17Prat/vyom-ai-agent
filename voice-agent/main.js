import express from 'express';
import expressWs from 'express-ws';
import { config } from './config.js';
import { OpenAIRealtimeClient } from './voice.js';
import { initiateOutboundCall } from './outbound.js';
import { fetchUserProfile, logVoiceCall } from './memory.js';

const app = express();
expressWs(app);

app.use(express.json());

// Endpoint to start an outbound call to a user
app.post('/api/call', async (req, res) => {
    const { phone } = req.body;
    if (!phone) {
        return res.status(400).json({ error: "Phone number is required." });
    }

    console.log(`🚀 Starting Outbound Voice Call request for: ${phone}`);
    const host = req.get('host');
    const streamUrl = `wss://${host}/media-stream`;

    const result = await initiateOutboundCall(phone, streamUrl);
    res.json(result);
});

// WebSocket endpoint where Twilio media stream audio is received
app.ws('/media-stream', (ws) => {
    let openAiClient = null;
    let streamSid = null;
    let transcript = "";
    let startTime = Date.now();
    let phone = "Unknown Caller";

    console.log("🔊 Twilio media stream WebSocket connected.");

    // Instantiate the OpenAI Realtime Client
    openAiClient = new OpenAIRealtimeClient(
        (textChunk) => {
            // Received response text transcript from AI
            transcript += textChunk;
            process.stdout.write(textChunk);
        },
        (audioBase64) => {
            // Send AI synthesized audio chunk back to Twilio
            if (ws.readyState === ws.OPEN && streamSid) {
                ws.send(JSON.stringify({
                    event: "media",
                    streamSid: streamSid,
                    media: {
                        payload: audioBase64
                    }
                }));
            }
        }
    );

    const connected = openAiClient.connect();
    if (!connected) {
        console.log("🤖 Running in local agent mock simulator mode.");
    }

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            switch (data.event) {
                case "start":
                    streamSid = data.start.streamSid;
                    console.log(`Stream started. StreamSid: ${streamSid}`);
                    break;
                case "media":
                    // Forward inbound user audio chunk from Twilio to OpenAI
                    if (openAiClient) {
                        openAiClient.sendAudioChunk(data.media.payload);
                    }
                    break;
                case "stop":
                    console.log("Stream stopped.");
                    break;
            }
        } catch (e) {
            console.error("Error handling media stream message:", e.message);
        }
    });

    ws.on('close', () => {
        const duration = Math.round((Date.now() - startTime) / 1000);
        console.log(`\n🔴 Media stream disconnected. Duration: ${duration}s`);
        
        // Log final call details
        logVoiceCall(phone, duration, "Completed call.", transcript);

        if (openAiClient) {
            openAiClient.close();
        }
    });
});

app.listen(config.PORT, () => {
    console.log(`🎙️ Brahmand Voice Agent Server running on port ${config.PORT}`);
});
