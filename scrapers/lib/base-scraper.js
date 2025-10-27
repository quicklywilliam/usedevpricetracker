import puppeteer from 'puppeteer';
import { RateLimiter } from './rate-limiter.js';
import { appendListings } from './file-writer.js';

/**
 * Base scraper that handles browser management and common logic
 * Each scraper just needs to implement a scrapeModel function
 */
export class BaseScraper {
  constructor(sourceName, options = {}) {
    this.sourceName = sourceName;
    this.useStealth = options.useStealth || false;
    this.rateLimitMs = options.rateLimitMs || 3000;
    this.rateLimiter = new RateLimiter(this.rateLimitMs);
    this.browser = null;
    this.page = null;
  }

  async launch() {
    // Dynamic import for stealth plugin if needed
    if (this.useStealth) {
      const puppeteerExtra = (await import('puppeteer-extra')).default;
      const StealthPlugin = (await import('puppeteer-extra-plugin-stealth')).default;
      puppeteerExtra.use(StealthPlugin());

      this.browser = await puppeteerExtra.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });
    } else {
      this.browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });
    }

    this.page = await this.browser.newPage();

    // Set realistic viewport and user agent
    await this.page.setViewport({ width: 1920, height: 1080 });
    await this.page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
    }
  }

  async scrapeQuery(query) {
    console.log(`  Scraping ${query.make} ${query.model}...`);

    await this.rateLimiter.waitIfNeeded();

    try {
      const result = await this.scrapeModel(query);

      // Handle both old format (array) and new format (object with listings and exceededMax)
      const listings = Array.isArray(result) ? result : result.listings;
      const exceededMax = result.exceededMax || false;

      await appendListings(
        this.sourceName,
        listings,
        exceededMax,
        exceededMax ? { make: query.make, model: query.model } : null
      );

      console.log(`  ✓ Found ${listings.length} listings`);
      return listings;
    } catch (error) {
      console.error(`  ✗ Error:`, error.message);
      return [];
    }
  }

  /**
   * Override this method in your scraper
   * Should return an array of listings for the given query
   */
  async scrapeModel(query) {
    throw new Error('scrapeModel must be implemented by subclass');
  }
}
