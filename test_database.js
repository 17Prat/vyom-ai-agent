import { saveMessage, getSessionHistory } from './utils/database.js';

console.log("💾 ==================================================");
console.log("💾 SQLITE PERSISTENT MEMORY TEST RUNNER");
console.log("💾 ==================================================\n");

const testSessionId = `test_session_${Date.now()}`;

try {
    console.log(`1. Saving test messages to session: ${testSessionId}...`);
    saveMessage(testSessionId, 'user', 'Hello Brahmand AI, can you hear me?');
    saveMessage(testSessionId, 'assistant', 'Yes, Namaste! I can hear you clearly.');
    saveMessage(testSessionId, 'user', 'Tell me a Gita shloka.');
    console.log("✅ Messages saved successfully.");

    console.log("\n2. Retrieving history from SQLite database...");
    const history = getSessionHistory(testSessionId, 5);

    if (history.length === 3) {
        console.log("✅ History retrieved successfully! Length: 3");
        console.log("--------------------------------------------------");
        history.forEach((msg, index) => {
            console.log(`[${index + 1}] ${msg.role.toUpperCase()}: ${msg.content}`);
        });
        console.log("--------------------------------------------------");
        console.log("\n🎉 TEST SUCCESSFUL! SQLite persistent memory is fully functional.");
    } else {
        throw new Error(`Expected 3 messages, but got ${history.length}`);
    }
} catch (error) {
    console.error("❌ Test Failed:", error.message);
}

console.log("\n💾 ==================================================");
