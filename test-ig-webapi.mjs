import dotenv from 'dotenv';
dotenv.config({ override: true });
import Instagram from 'instagram-web-api';
import fs from 'fs';

const client = new Instagram({
  username: process.env.IG_USERNAME,
  password: process.env.IG_PASSWORD,
});

try {
  await client.login();
  console.log('✅ Web API logged in');

  const photo = fs.createReadStream('test-img.jpg');
  const result = await client.uploadPhoto({
    photo,
    caption: '🙏 Test from Brahmand AI 🤖 - Sanatan Dharma 🚩',
    post: 'feed',
  });
  console.log('✅ POSTED:', JSON.stringify(result).substring(0, 300));
} catch (e) {
  console.error('❌', e.name, '-', e.message?.substring(0, 500));
}
