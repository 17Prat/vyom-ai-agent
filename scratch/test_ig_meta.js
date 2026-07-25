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
    const ig = new IgApiClient();
    ig.state.generateDevice(creds.username);
    await ig.simulate.preLoginFlow();
    const user = await ig.account.login(creds.username, creds.password);
    
    // Test current user details
    const current = await ig.account.currentUser();
    console.log("Current user username:", current.username);
    console.log("Current user media count:", current.media_count);

    // Let's test calling feed.user on current user's pk
    const feed = ig.feed.user(current.pk);
    const items = await feed.items();
    console.log("My posts items count:", items.length);

    // Let's also print raw response keys for the feed
    console.log("Feed item keys if any:", items.length > 0 ? Object.keys(items[0]) : "None");
}

test().catch(console.error);
