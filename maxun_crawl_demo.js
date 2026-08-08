import { maxunCrawler } from './services/maxunService.js';

async function runDemoCrawl() {
  console.log("🕸️ Starting Maxun Crawl Demo...");
  try {
    // Create a crawler robot
    const robot = await maxunCrawler.create(
      'Brahmand Demo Crawler',
      'https://example.com',
      {
        mode: 'domain',
        limit: 5,
        useSitemap: true,
        followLinks: true
      }
    );
    
    console.log("🤖 Crawl Robot created successfully:", robot);
  } catch (error) {
    console.error("❌ Crawl Demo Error:", JSON.stringify(error, null, 2) || error);
  }
}

runDemoCrawl();
