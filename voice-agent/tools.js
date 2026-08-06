import { sendWhatsappMessage } from '../services/whatsappService.js';
import { saveUserProfile } from './memory.js';

export const voiceAgentTools = {
    // 1. Send SMS/WhatsApp link
    sendAppDownloadLink: {
        description: "Sends the Brahmand App download link via WhatsApp or SMS to the user.",
        parameters: {
            type: "object",
            properties: {
                phone: { type: "string", description: "Phone number of the recipient" },
                channel: { type: "string", enum: ["whatsapp", "sms"], description: "Medium to send link" }
            },
            required: ["phone"]
        },
        execute: async ({ phone, channel = "whatsapp" }) => {
            console.log(`📞 [Voice Agent Tool] Sending download link to ${phone} via ${channel}`);
            const message = "Namaskar! Here is your download link for the Brahmand App: https://brahmand.app/download. Explore Live Darshan, Jaap Counter, and AI Guru. Har Har Mahadev!";
            
            if (channel === "whatsapp") {
                try {
                    const result = await sendWhatsappMessage(phone, message);
                    return { success: true, details: JSON.parse(result) };
                } catch (err) {
                    return { success: false, error: err.message };
                }
            }
            return { success: true, message: `Mock SMS sent successfully to ${phone}.` };
        }
    },

    // 2. Schedule callback
    scheduleCallback: {
        description: "Schedules a callback when the user is busy or requests to talk later.",
        parameters: {
            type: "object",
            properties: {
                phone: { type: "string", description: "User phone number" },
                timeString: { type: "string", description: "Time of call, e.g. 'tomorrow 4 PM', 'evening'" }
            },
            required: ["phone", "timeString"]
        },
        execute: async ({ phone, timeString }) => {
            console.log(`📅 [Voice Agent Tool] Callback scheduled for ${phone} at: ${timeString}`);
            return { success: true, message: `Callback successfully scheduled at ${timeString}` };
        }
    },

    // 3. Save profile preferences
    updateUserInterest: {
        description: "Updates user's profile interest or preferred deity based on details gathered in call.",
        parameters: {
            type: "object",
            properties: {
                phone: { type: "string" },
                name: { type: "string" },
                interest_level: { type: "string", enum: ["High", "Medium", "Low", "Not Interested"] },
                favorite_deity: { type: "string" },
                app_installed: { type: "boolean" }
            },
            required: ["phone"]
        },
        execute: async ({ phone, name, interest_level, favorite_deity, app_installed }) => {
            console.log(`💾 [Voice Agent Tool] Updating profile for ${phone}`);
            saveUserProfile(phone, { name, interest_level, favorite_deity, app_installed });
            return { success: true, message: "Profile updated successfully" };
        }
    }
};
