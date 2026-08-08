import { maxunSearcher } from './services/maxunService.js';

async function runDemoSearch() {
  console.log("🔍 Starting Maxun Search Demo...");
  try {
    // Create a search robot
    const robot = await maxunSearcher.create(
      'Tech News Search',
      {
        query: 'artificial intelligence 2025',
        mode: 'discover',
        limit: 5
      }
    );
    
    console.log("🤖 Search Robot created successfully:", robot);
  } catch (error) {
    console.error("❌ Search Demo Error:", JSON.stringify(error, null, 2) || error);
  }
}

runDemoSearch();
