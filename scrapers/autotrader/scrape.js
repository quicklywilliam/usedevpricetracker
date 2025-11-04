import axios from 'axios';
import { BaseScraper } from '../lib/base-scraper.js';

class AutotraderScraper extends BaseScraper {
  constructor() {
    // Use API-based approach instead of HTML scraping
    // This bypasses Akamai protection and gets all listings as clean JSON
    super('autotrader', { useStealth: false, rateLimitMs: 2000 });
    this.useHttpClient = true;
    this.baseUrl = 'https://www.autotrader.com';
    this.zip = '97201'; // Default ZIP for searches
  }

  /**
   * Override launch to skip browser when using HTTP client
   */
  async launch() {
    // No browser needed - using APIs only
  }

  /**
   * Override close to handle HTTP-only mode
   */
  async close() {
    // Nothing to close
  }

  /**
   * Resolve make/model to Autotrader's official codes
   * Primary: Keywords API (autocomplete suggestions)
   * Fallback: GenAI API (direct search interpretation)
   */
  async getModelCodes(make, model) {
    const searchTerm = `used ${make} ${model}`;

    console.log(`    Looking up model codes for "${searchTerm}"...`);

    // Try Keywords API first (what provides autocomplete suggestions)
    try {
      const keywordsUrl = `${this.baseUrl}/collections/lcServices/rest/lsc/marketplace/suggested/keywords/${encodeURIComponent(searchTerm)}`;
      const keywordsResponse = await axios.get(keywordsUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
        }
      });

      if (keywordsResponse.data && keywordsResponse.data.length > 0) {
        const searchTermLower = searchTerm.toLowerCase();
        const modelWords = model.toLowerCase().split(/\s+/);

        // Filter valid results with codes
        const validResults = keywordsResponse.data.filter(item =>
          item.codes && item.codes.makeCode && item.codes.modelCode
        );

        // First, try to find an exact match
        let match = validResults.find(item =>
          (item.name || '').toLowerCase() === searchTermLower
        );

        // If no exact match, find the shortest match that contains our model words
        if (!match) {
          const relevantMatches = validResults.filter(item => {
            const nameLower = (item.name || '').toLowerCase();
            // Must contain all significant words from the model
            return modelWords.every(word =>
              word.length <= 2 || nameLower.includes(word)  // Skip short words like "ev"
            );
          });

          // Pick the shortest match (most specific, least extra content)
          if (relevantMatches.length > 0) {
            match = relevantMatches.reduce((shortest, item) =>
              item.name.length < shortest.name.length ? item : shortest
            );
          }
        }

        if (match) {
          const makeCode = match.codes.makeCode[0];
          const modelCode = match.codes.modelCode[0];
          console.log(`    ✓ Found codes: makeCode=${makeCode}, modelCode=${modelCode} (via Keywords API: "${match.name}")`);
          return { makeCode, modelCode };
        }
      }
    } catch (error) {
      console.log(`    Keywords API failed, trying GenAI...`);
    }

    // Fallback: Try GenAI API
    try {
      const genaiUrl = `${this.baseUrl}/genai-keyword-search/query`;
      const genaiResponse = await axios.get(genaiUrl, {
        params: {
          source: 'atcHp',
          message: searchTerm
        },
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
        }
      });

      if (genaiResponse.data && genaiResponse.data.makeCode) {
        const makeCodeObj = genaiResponse.data.makeCode;
        const makeCode = Object.keys(makeCodeObj)[0];
        const modelCodeObj = makeCodeObj[makeCode];
        const modelCode = Object.keys(modelCodeObj)[0];

        if (makeCode && modelCode) {
          console.log(`    ✓ Found codes: makeCode=${makeCode}, modelCode=${modelCode} (via GenAI API)`);
          return { makeCode, modelCode };
        }
      }
    } catch (error) {
      // Both APIs failed
    }

    throw new Error(`Model "${make} ${model}" not found on Autotrader`);
  }

  /**
   * Fetch listings from Autotrader Listing API
   */
  async fetchListings(makeCode, modelCode, startRecord = 0, numRecords = 100) {
    const url = `${this.baseUrl}/rest/lsc/listing`;

    try {
      const response = await axios.get(url, {
        params: {
          searchRadius: 50,
          makeCode,
          modelCode,
          zip: this.zip,
          numRecords,
          firstRecord: startRecord,
          sortBy: 'relevance',
          listingType: 'USED'
        },
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
        }
      });

      if (!response.data || !response.data.listings) {
        throw new Error('Invalid response format from Listing API');
      }

      return {
        listings: response.data.listings,
        totalResultCount: response.data.totalResultCount || 0
      };
    } catch (error) {
      throw new Error(`Failed to fetch listings: ${error.message}`);
    }
  }

  /**
   * Convert API listing to standard format
   */
  convertToListing(apiListing, requestedMake, requestedModel) {
    // Extract data from API response
    const id = apiListing.id;
    const year = apiListing.year;
    const trim = apiListing.trim?.name || 'Base';
    const vin = apiListing.vin;

    // Parse mileage (API returns string like "68,203")
    const mileageStr = apiListing.mileage?.value || apiListing.specifications?.mileage?.value || '0';
    const mileage = parseInt(mileageStr.replace(/,/g, ''));

    // Parse price
    const price = parseInt(apiListing.pricingDetail?.salePrice || 0);

    // Build listing URL
    const url = `${this.baseUrl}/cars-for-sale/vehicle/${id}`;

    // Validate listing has reasonable data
    if (!price || price < 1000 || price > 500000) {
      throw new Error(`Invalid price: ${price}`);
    }

    if (mileage < 0 || mileage > 500000) {
      throw new Error(`Invalid mileage: ${mileage}`);
    }

    if (!year || year < 2010 || year > new Date().getFullYear() + 1) {
      throw new Error(`Invalid year: ${year}`);
    }

    if (!id) {
      throw new Error('Missing listing ID');
    }

    return {
      id: `autotrader-${id}`,
      make: requestedMake,
      model: requestedModel,
      year,
      trim,
      price,
      mileage,
      location: 'Autotrader',
      url,
      listing_date: new Date().toISOString().split('T')[0],
      vin: vin || undefined
    };
  }

  /**
   * Scrape a specific model using Autotrader APIs
   */
  async scrapeModel(query) {
    try {
      // Step 1: Look up model codes using Smart Search API
      const { makeCode, modelCode } = await this.getModelCodes(query.make, query.model);

      // Step 2: Fetch listings using Listing API
      console.log(`    Fetching listings...`);
      const result = await this.fetchListings(makeCode, modelCode);

      console.log(`    Found ${result.totalResultCount} total listings`);

      // Step 3: Convert to standard format
      const listings = [];
      for (const apiListing of result.listings) {
        try {
          const listing = this.convertToListing(apiListing, query.make, query.model);
          listings.push(listing);
        } catch (error) {
          console.error(`    ⚠ Warning: Skipping invalid listing:`, error.message);
        }
      }

      // Check if we need to fetch more listings (pagination)
      const exceededMax = result.totalResultCount > 100;

      if (exceededMax) {
        console.log(`    ⓘ Note: ${result.totalResultCount} total listings available, returning first 100`);
      }

      console.log(`    Returning ${listings.length} valid listings`);

      return {
        listings,
        exceededMax
      };
    } catch (error) {
      throw new Error(`Failed to scrape Autotrader for ${query.make} ${query.model}: ${error.message}`);
    }
  }
}

export async function scrapeAutotrader(query) {
  const scraper = new AutotraderScraper();
  await scraper.launch();

  try {
    return await scraper.scrapeQuery(query);
  } finally {
    await scraper.close();
  }
}
