import { IgApiClient } from 'instagram-private-api';
import fs from 'fs';

const configPath = 'C:\\Users\\prarh\\AppData\\Roaming\\Claude\\claude_desktop_config.json';

function getCredentials() {
    if (fs.existsSync(configPath)) {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        const env = config?.mcpServers?.['mcp-instagram']?.env;
        return { username: env.IG_USERNAME, password: env.IG_PASSWORD };
    }
    return null;
}

async function test() {
    const creds = getCredentials();
    console.log("Credentials:", creds.username);
    const ig = new IgApiClient();
    ig.state.generateDevice(creds.username);
    
    console.log("Logging in...");
    await ig.simulate.preLoginFlow();
    const user = await ig.account.login(creds.username, creds.password);
    console.log("Logged in user PK:", user.pk);

    console.log("Testing user feed (loggedInUser.pk)...");
    const feed = ig.feed.user(user.pk);
    const items = await feed.items();
    console.log("Feed items count:", items.length);
    if (items.length > 0) {
        console.log("First item code:", items[0].code);
        console.log("First item caption:", items[0].caption?.text);
    } else {
        console.log("No items returned from feed.user(user.pk)");
    }
}

test().catch(console.error);
