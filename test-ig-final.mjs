import dotenv from 'dotenv';
dotenv.config({ override: true });
import { publishInstagramPhoto } from './services/instagramService.js';

const r = await publishInstagramPhoto(
  'https://image.pollinations.ai/prompt/A%20beautiful%20Hindu%20temple%20at%20sunrise%2C%20golden%20light%2C%20divine%20atmosphere%2C%204K?width=1024&height=1024&seed=162953&model=flux&nologo=true',
  '🙏 जय श्री राम! Beautiful Hindu temple at sunrise. Sanatan Dharma ki glory. 🚩\n\n#SanatanDharma #HinduTemple #BrahmandAI'
);
console.log(r);
process.exit(0);
