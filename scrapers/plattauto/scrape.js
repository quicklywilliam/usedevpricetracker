import * as cheerio from 'cheerio';
import { BaseScraper } from '../lib/base-scraper.js';

class PlattAutoScraper extends BaseScraper {
  constructor() {
    super('plattauto', { useStealth: true, rateLimitMs: 3000 });
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

  async scrapeModel(query) {
    const allListings = [];
    const maxPages = 10;

    for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
      const searchUrl = buildSearchUrl(query.make, query.model, pageNum);

      await this.page.goto(searchUrl, {
        waitUntil: 'networkidle2',
        timeout: 30000
      });

      await this.page.waitForSelector('.dws-vehicle-listing-item', { timeout: 10000 });
      await new Promise(resolve => setTimeout(resolve, 1000));

      const html = await this.page.content();
      const $ = cheerio.load(html);
      const pageListings = parseListings($, query.make, query.model);

      if (pageListings.length === 0) break;
      allListings.push(...pageListings);
      if (pageListings.length < 10) break;
    }

    return allListings;
  }
}

export async function scrapePlattAuto(query) {
  const scraper = new PlattAutoScraper();
  await scraper.launch();

  try {
    return await scraper.scrapeQuery(query);
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
      const year = yearMatch ? parseInt(yearMatch[1]) : 0;

      // Extract mileage
      const mileageText = $card.find('.dws-vehicle-field-mileage').text().trim();
      const mileageMatch = mileageText.match(/(\d+(?:,\d+)*)/);
      const mileage = mileageMatch ? parseInt(mileageMatch[1].replace(/,/g, '')) : 0;

      // Extract trim (remove "Trim " prefix if present)
      const trimText = $card.find('.dws-vehicle-field-trim').text().trim().replace(/\s+/g, ' ');
      const trim = trimText.replace(/^Trim\s+/i, '') || 'Base';

      // Extract URL
      const linkElement = $card.find('.dws-vehicle-listing-item-title a').first();
      const urlPath = linkElement.attr('href');
      const url = urlPath ? (urlPath.startsWith('http') ? urlPath : `https://www.plattauto.com${urlPath}`) : '';

      // Extract stock number or VIN for ID
      const stockText = $card.find('.dws-vehicle-field-stock-number').text().trim().replace(/\s+/g, ' ');
      const vinText = $card.find('.dws-vehicle-field-vin').text().trim().replace(/\s+/g, ' ');
      const id = stockText || vinText || `plattauto-${i}`;

      // Skip duplicates - some listings appear multiple times in the DOM
      if (seenIds.has(id)) {
        return;
      }

      if (price && year) {
        seenIds.add(id);
        listings.push({
          id,
          make,
          model,
          year,
          trim,
          price,
          mileage: mileage || 0,
          location: 'Platt Auto',
          url,
          listing_date: new Date().toISOString().split('T')[0]
        });
      }
    } catch (error) {
      console.error('    Error parsing listing:', error.message);
    }
  });

  return listings;
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  scrapePlattAuto({ make: 'Hyundai', model: 'Ioniq 5' }).catch(console.error);
}
