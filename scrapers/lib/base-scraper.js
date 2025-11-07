import puppeteer from 'puppeteer';
import { RateLimiter } from './rate-limiter.js';
import { appendListings } from './file-writer.js';
import { loadPreviousData, findMissingListings, validateMissingListings } from './status-validator.js';
import { validateListings, shouldFailSource, formatValidationErrors } from './listing-validator.js';
import { normalizeTrim } from './trim-normalizer.js';

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

  async scrapeQuery(query, options = {}) {
    console.log(`  Scraping ${query.make} ${query.model}...`);

    await this.rateLimiter.waitIfNeeded();

    try {
      const result = await this.scrapeModel(query, options);

      // Handle both old format (array) and new format (object with listings and exceededMax)
      const listings = Array.isArray(result) ? result : result.listings;
      const exceededMax = result.exceededMax || false;

      // Validate all listings
      const validation = validateListings(listings, query);

      // Log validation results
      if (validation.stats.invalid > 0) {
        console.error(`    ⚠ Warning: Skipping ${validation.stats.invalid} invalid listing(s)`);
      }

      // Check if source should fail based on validation
      if (shouldFailSource(validation.stats)) {
        const errorMsg = formatValidationErrors(validation.stats);
        throw new Error(errorMsg);
      }

      // Validate missing listings for this model (only for valid listings)
      const validatedListings = await this.validateMissingListingsForModel(query, validation.validListings);

      // Normalize trims for all listings using VIN decoding
      const normalizedValidListings = await Promise.all(
        validation.validListings.map(async (listing) => {
          const normalized_trim = await normalizeTrim({
            vin: listing.vin,
            make: query.make,
            model: query.model,
            trim: listing.trim,
            source: this.sourceName
          });
          return { ...listing, normalized_trim };
        })
      );

      const normalizedValidatedListings = await Promise.all(
        validatedListings.map(async (listing) => {
          const normalized_trim = await normalizeTrim({
            vin: listing.vin,
            make: query.make,
            model: query.model,
            trim: listing.trim,
            source: this.sourceName
          });
          return { ...listing, normalized_trim };
        })
      );

      // Combine current valid listings with validated (selling/sold) listings
      const allListings = [...normalizedValidListings, ...normalizedValidatedListings];

      await appendListings(
        this.sourceName,
        allListings,
        exceededMax,
        exceededMax ? { make: query.make, model: query.model } : null
      );

      console.log(`  ✓ Found ${normalizedValidListings.length} listings (${normalizedValidatedListings.length} validated)`);
      return allListings;
    } catch (error) {
      console.error(`  ✗ Error:`, error.message);
      throw error; // Re-throw so run-all.js can handle it
    }
  }

  async validateMissingListingsForModel(query, currentListings) {
    // Check if subclass has detectStatus method
    if (typeof this.detectStatus !== 'function') {
      return []; // Skip validation if not implemented
    }

    // Load previous data
    const previousData = loadPreviousData(this.sourceName);
    if (!previousData || !previousData.listings) {
      return [];
    }

    // Filter previous listings for this specific model
    const previousModelListings = previousData.listings.filter(
      l => l.make === query.make && l.model === query.model
    );

    if (previousModelListings.length === 0) {
      return [];
    }

    // Find missing listings (present in previous but not in current)
    const missingListings = findMissingListings(previousModelListings, currentListings);

    if (missingListings.length === 0) {
      return [];
    }

    console.log(`  Validating ${missingListings.length} missing ${query.make} ${query.model} listings...`);

    // Validate each missing listing
    return await validateMissingListings(
      this.page,
      missingListings,
      this.detectStatus.bind(this),
      this.rateLimitMs
    );
  }

  /**
   * Override this method in your scraper
   * Should return an array of listings for the given query
   */
  async scrapeModel(query) {
    throw new Error('scrapeModel must be implemented by subclass');
  }
}
