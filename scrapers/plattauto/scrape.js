import * as cheerio from 'cheerio';
import { BaseScraper } from '../lib/base-scraper.js';
import { MIN_VEHICLES } from '../lib/config.js';

class PlattAutoScraper extends BaseScraper {
  constructor() {
    super('plattauto', { useStealth: true, rateLimitMs: 5000 });
  }

  async validateListing(url) {
    // Navigate to the detail page and extract actual make/model
    try {
      await this.page.goto(url, {
        waitUntil: 'networkidle2',
        timeout: 30000
      });

      await this.page.waitForSelector('body', { timeout: 5000 });

      const html = await this.page.content();
      const $ = cheerio.load(html);

      // Platt Auto detail page structure
      const titleText = $('h1.dws-vehicle-detail-title, h1').first().text().trim();

      if (!titleText) {
        return null;
      }

      // Format: "2024 Honda Prologue" or similar
      const match = titleText.match(/^(\d{4})\s+([A-Za-z-]+)\s+(.+)$/i);

      if (match) {
        const make = match[2];
        const model = match[3];

        return { make, model };
      }

      return null;
    } catch (error) {
      console.error(`Error validating ${url}:`, error.message);
      return null;
    }
  }

  detectStatus({ html, finalUrl, originalUrl, wasRedirected }) {
    // Platt Auto redirects to homepage when listing is sold
    if (wasRedirected && (finalUrl === 'https://www.plattauto.com/' || finalUrl === 'https://www.plattauto.com/inventory/')) {
      return 'sold';
    }

    // If page loads normally, listing is still available
    return 'available';
  }

  async scrapeModel(query, options = {}) {
    const targetCount = options.limit || MIN_VEHICLES;
    const allListings = [];
    const maxPages = 100; // High enough to get to MIN_VEHICLES

    for (let pageNum = 1; pageNum <= maxPages && allListings.length < targetCount; pageNum++) {
      const searchUrl = buildSearchUrl(query.make, query.model, pageNum);

      await this.page.goto(searchUrl, {
        waitUntil: 'networkidle2',
        timeout: 30000
      });

      // Extra delay to let JavaScript fully render
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Try to wait for listings, but don't fail if they don't appear
      try {
        await this.page.waitForSelector('.dws-vehicle-listing-item', { timeout: 20000 });
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error) {
        // Selector didn't appear - might be no results or slow page load
        // Try waiting a bit longer and proceed anyway
        await new Promise(resolve => setTimeout(resolve, 3000));
      }

      const html = await this.page.content();
      const $ = cheerio.load(html);
      const pageListings = parseListings($, query.make, query.model);

      if (pageListings.length === 0) break;
      allListings.push(...pageListings);

      // Stop if we've reached the target count
      if (allListings.length >= targetCount) break;
      if (pageListings.length < 10) break;
    }

    // Return object with listings and exceeded flag
    return {
      listings: allListings,
      exceededMax: allListings.length >= targetCount
    };
  }
}

export async function scrapePlattAuto(query, options = {}) {
  const scraper = new PlattAutoScraper();
  await scraper.launch();

  try {
    return await scraper.scrapeQuery(query, options);
  } finally {
    await scraper.close();
  }
}

function buildSearchUrl(make, model, pageNum = 1) {
  // Platt Auto search URL format with pagination
  // Example: https://www.plattauto.com/inventory/?keyword=ioniq+5&page_no=1
  const searchTerm = `${model}`.toLowerCase().replace(/\s+/g, '+');
  return `https://www.plattauto.com/inventory/?keyword=${searchTerm}&page_no=${pageNum}`;
}

function parseListings($, make, model) {
  const listings = [];
  const seenIds = new Set();

  // Platt Auto listings
  $('.dws-vehicle-listing-item').each((i, element) => {
    try {
      const $card = $(element);

      // Extract price
      const priceText = $card.find('.dws-vehicle-price-value').text().trim();
      const price = parseInt(priceText.replace(/[$,]/g, ''));

      // Extract year/make/model from title
      const titleText = $card.find('.dws-vehicle-listing-item-title').text().trim();

      // Filter: only include if title contains the make and model we're looking for
      const titleLower = titleText.toLowerCase();
      const makeLower = make.toLowerCase();
      const modelLower = model.toLowerCase();

      if (!titleLower.includes(makeLower) || !titleLower.includes(modelLower)) {
        return; // Skip this listing, it's not the model we want
      }

      // Format is typically "2023 Hyundai Ioniq 5 SEL"
      const yearMatch = titleText.match(/^(\d{4})/);
      const year = yearMatch ? parseInt(yearMatch[1]) : null;

      // Extract mileage
      const mileageText = $card.find('.dws-vehicle-field-mileage').text().trim();
      const mileageMatch = mileageText.match(/(\d+(?:,\d+)*)/);
      const mileage = mileageMatch ? parseInt(mileageMatch[1].replace(/,/g, '')) : null;

      // Extract trim (remove "Trim " prefix if present)
      const trimText = $card.find('.dws-vehicle-field-trim').text().trim().replace(/\s+/g, ' ');
      const trim = trimText.replace(/^Trim\s+/i, '') || null;

      // Extract URL
      const linkElement = $card.find('.dws-vehicle-listing-item-title a').first();
      const urlPath = linkElement.attr('href');
      const url = urlPath ? (urlPath.startsWith('http') ? urlPath : `https://www.plattauto.com${urlPath}`) : null;

      // Extract stock number and VIN
      const stockText = $card.find('.dws-vehicle-field-stock-number').text().trim().replace(/\s+/g, ' ');
      const vinText = $card.find('.dws-vehicle-field-vin').text().trim().replace(/\s+/g, ' ').replace(/^VIN\s+/i, '');
      const vin = vinText || null;
      const id = stockText || vinText;
      if (!id) {
        console.error(`    ⚠ Warning: Could not extract stock number or VIN from listing`);
        return; // Skip listings without valid IDs
      }

      // Skip duplicates - some listings appear multiple times in the DOM
      if (seenIds.has(id)) {
        return;
      }

      seenIds.add(id);
      listings.push({
        id,
        vin,
        make,
        model,
        year,
        trim,
        price: price || null,
        mileage,
        location: 'Platt Auto',
        url,
        listing_date: new Date().toISOString().split('T')[0]
      });
    } catch (error) {
      console.error('    Error parsing listing:', error.message);
    }
  });

  return listings;
}
