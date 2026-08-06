import twilio from 'twilio';
import { config } from './config.js';

export async function initiateOutboundCall(toPhone, streamUrl) {
    if (!config.TWILIO_ACCOUNT_SID || !config.TWILIO_AUTH_TOKEN || !config.TWILIO_FROM_NUMBER) {
        console.warn("⚠️ Twilio configuration is missing. Outbound call will run in mock simulation mode.");
        return { success: true, callSid: "MOCK_CALL_12345", simulated: true };
    }

    const client = twilio(config.TWILIO_ACCOUNT_SID, config.TWILIO_AUTH_TOKEN);

    // Build Twilio XML to connect call to websocket stream url
    const twiml = new twilio.twiml.VoiceResponse();
    const connect = twiml.connect();
    connect.stream({
        url: streamUrl
    });

    try {
        const call = await client.calls.create({
            twiml: twiml.toString(),
            to: toPhone,
            from: config.TWILIO_FROM_NUMBER
        });
        console.log(`📞 Outbound call successfully initiated to ${toPhone}. Call SID: ${call.sid}`);
        return { success: true, callSid: call.sid };
    } catch (err) {
        console.error("❌ Twilio Outbound Call Error:", err.message);
        return { success: false, error: err.message };
    }
}
