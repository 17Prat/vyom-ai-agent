import dotenv from 'dotenv';
dotenv.config({ override: true });
import { IgApiClient } from 'instagram-private-api';
import fetch from 'node-fetch';

const ig = new IgApiClient();
ig.state.generateDevice(process.env.IG_USERNAME);
await ig.simulate.preLoginFlow();
await ig.account.login(process.env.IG_USERNAME, process.env.IG_PASSWORD);
console.log('✅ Logged in as:', process.env.IG_USERNAME);

const resp = await fetch('https://picsum.photos/800/800');
const buffer = Buffer.from(await resp.arrayBuffer());
console.log('✅ Image:', buffer.length, 'bytes');

try {
  const result = await ig.publish.photo({
    file: buffer,
    caption: '🙏 Test post from Brahmand AI - Automating Sanatan Dharma promotion! 🚩',
  });
  console.log('✅ SUCCESS! POSTED:', 'https://instagram.com/p/' + result.media.code);
  process.exit(0);
} catch (e) {
  console.error('❌', e.name, '-', e.message?.substring(0, 500));
  if (e.response?.body) {
    console.error('Body:', typeof e.response.body === 'object' ? JSON.stringify(e.response.body).substring(0,500) : String(e.response.body).substring(0,500));
  }
  process.exit(1);
}
