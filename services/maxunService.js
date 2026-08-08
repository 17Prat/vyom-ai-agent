import { Extract, Scrape, Crawl, Search } from 'maxun-sdk';
import dotenv from 'dotenv';
dotenv.config();

const apiKey = process.env.MAXUN_API_KEY || 'maxun_api_key_here';
const baseUrl = process.env.MAXUN_BASE_URL; // If undefined, SDK defaults to http://localhost:8080/api/sdk

// Initialize the Maxun SDK components
export const maxunExtractor = new Extract({ apiKey, baseUrl });
export const maxunScraper = new Scrape({ apiKey, baseUrl });
export const maxunCrawler = new Crawl({ apiKey, baseUrl });
export const maxunSearcher = new Search({ apiKey, baseUrl });

console.log("🕷️ Maxun SDK Components initialized successfully!");
