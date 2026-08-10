import { Extract, Scrape, Crawl, Search } from 'maxun-sdk';
import dotenv from 'dotenv';
dotenv.config();

const apiKey = process.env.MAXUN_API_KEY || 'maxun_api_key_here';
const apiKey2 = process.env.MAXUN_API_KEY_2 || '';
const baseUrl = process.env.MAXUN_BASE_URL; // If undefined, SDK defaults to http://localhost:8080/api/sdk

// Initialize the Maxun SDK components (Primary)
export const maxunExtractor = new Extract({ apiKey, baseUrl });
export const maxunScraper = new Scrape({ apiKey, baseUrl });
export const maxunCrawler = new Crawl({ apiKey, baseUrl });
export const maxunSearcher = new Search({ apiKey, baseUrl });

// Initialize secondary fallbacks if available
export const maxunScraper2 = apiKey2 ? new Scrape({ apiKey: apiKey2, baseUrl }) : null;
export const maxunSearcher2 = apiKey2 ? new Search({ apiKey: apiKey2, baseUrl }) : null;

console.log("🕷️ Maxun SDK Components (Primary & Secondary Fallbacks) initialized successfully!");
