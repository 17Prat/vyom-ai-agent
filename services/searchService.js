import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

puppeteer.use(StealthPlugin());

class SearchService {
  constructor() {
    this.browser = null;
    this.page = null;
    this.cache = new Map();
    this.cacheTimeout = 3600000; 
  }

  async initialize() {
    if (!this.browser) {
      this.browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });
      this.page = await this.browser.newPage();
    }
    return this;
  }

  async searchInstagramProfiles(keyword, limit = 20) {
    const cacheKey = `instagram_${keyword}_${limit}`;
    if (this.cache.has(cacheKey)) {
      const cached = this.cache.get(cacheKey);
      if (Date.now() - cached.timestamp < this.cacheTimeout) {
        return cached.data;
      }
    }

    try {
      await this.initialize();
      const searchResults = await this.googleSearch(
        `site:instagram.com "${keyword}"`
      );
      
      const profiles = [];
      for (const result of searchResults.slice(0, limit)) {
        const username = this.extractInstagramUsername(result.url);
        if (username) {
          profiles.push({
            username,
            name: result.title ? result.title.split('(')[0].replace('Instagram', '').trim() : username,
            bio: result.snippet || ''
          });
        }
      }

      this.cache.set(cacheKey, {
        data: profiles,
        timestamp: Date.now()
      });

      return profiles;

    } catch (error) {
      console.error('Instagram search failed:', error);
      return [];
    }
  }

  async googleSearch(query, limit = 30) {
    try {
      await this.initialize();
      const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}&num=${limit}`;
      
      await this.page.goto(searchUrl, {
        waitUntil: 'networkidle2',
        timeout: 30000
      });

      const results = await this.page.evaluate(() => {
        const items = [];
        const elements = document.querySelectorAll('div.g');
        
        for (const el of elements) {
          const titleEl = el.querySelector('h3');
          const linkEl = el.querySelector('a');
          const snippetEl = el.querySelector('div.VwiC3b');
          
          if (titleEl && linkEl) {
            items.push({
              title: titleEl.textContent.trim(),
              url: linkEl.href,
              snippet: snippetEl ? snippetEl.textContent.trim() : ''
            });
          }
        }
        return items;
      });

      return results;

    } catch (error) {
      console.error('Google search failed:', error);
      return [];
    }
  }

  extractInstagramUsername(url) {
    const match = url.match(/instagram\.com\/([a-zA-Z0-9_\.]+)/);
    if (match) {
      const username = match[1].toLowerCase().trim();
      const excluded = ['p', 'reel', 'reels', 'stories', 'explore', 'accounts', 'developer', 'about', 'blog', 'jobs', 'help', 'privacy', 'terms', 'directory'];
      if (!excluded.includes(username)) {
        return username;
      }
    }
    return null;
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.page = null;
    }
  }
}

export async function searchWeb(query) {
  const service = new SearchService();
  try {
    const results = await service.googleSearch(query);
    if (!results || results.length === 0) {
      return "No results found.";
    }
    return results.map(r => `Title: ${r.title}\nURL: ${r.url}\nSnippet: ${r.snippet}\n---`).join('\n');
  } catch (error) {
    console.error("searchWeb failed:", error);
    return `Error performing web search: ${error.message}`;
  } finally {
    await service.close();
  }
}

export default SearchService;
