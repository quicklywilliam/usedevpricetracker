import * as cheerio from 'cheerio';
import { BaseScraper } from '../lib/base-scraper.js';

class CarMaxScraper extends BaseScraper {
  constructor() {
    super('carmax', { useStealth: false, rateLimitMs: 3000 });
  }

  async scrapeModel(query) {
    const allListings = [];
    const searchUrl = buildSearchUrl(query.make, query.model);

    await this.page.goto(searchUrl, {
      waitUntil: 'networkidle2',
      timeout: 30000
    });

    // Wait for page body and give time for dynamic content
    await this.page.waitForSelector('body', { timeout: 5000 });
    await new Promise(resolve => setTimeout(resolve, 2000));

    let hasMorePages = true;
    const maxPages = 15;
    let pageNum = 0;

    while (hasMorePages && pageNum < maxPages) {
      pageNum++;

      // Wait a bit for content to render
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Get page HTML and parse
      const html = await this.page.content();
      const $ = cheerio.load(html);
      const pageListings = parseListings($, query.make, query.model);

      allListings.push(...pageListings);

      // Check for "Load More" button
      const loadMoreButton = await this.page.$('[data-test="loadMoreButton"]');
      if (loadMoreButton) {
        await loadMoreButton.click();
        await new Promise(resolve => setTimeout(resolve, 2000));
      } else {
        hasMorePages = false;
      }
    }

    return allListings;
  }
}

export async function scrapeCarMax(query) {
  const scraper = new CarMaxScraper();
  await scraper.launch();

  try {
    return await scraper.scrapeQuery(query);
  } finally {
    await scraper.close();
  }
}

function buildSearchUrl(make, model) {
  // CarMax search URL format
  // For most models: https://www.carmax.com/cars/tesla/model-3
  // For models with "EV" suffix or special characters, use search parameter

  // Check if model contains "EV" as a separate word or special characters
  if (model.match(/\s+EV$/i) || model.includes('.')) {
    // Use search parameter format
    const searchTerm = `${make} ${model}`.toLowerCase().replace(/\s+/g, '+');
    return `https://www.carmax.com/cars?search=${searchTerm}`;
  }

  // Use path format for standard models
  const makeSlug = make.toLowerCase().replace(/\s+/g, '-');
  const modelSlug = model.toLowerCase().replace(/\s+/g, '-');
  return `https://www.carmax.com/cars/${makeSlug}/${modelSlug}`;
}

function parseListings($, make, model) {
  const listings = [];

  // CarMax car tiles
  $('article.scct--car-tile').each((i, element) => {
    try {
      const $card = $(element);

      // Extract stock ID from data-id attribute
      const stockId = $card.attr('data-id') || `carmax-${i}`;

      // Extract price
      const priceText = $card.find('.scct--price-miles-info--price').text().trim();
      const price = parseInt(priceText.replace(/[$,*]/g, ''));

      // Extract mileage (format: "47K mi" -> 47000)
      const mileageText = $card.find('.scct--price-miles-info--mileage').text().trim();
      const mileageMatch = mileageText.match(/(\d+(?:\.\d+)?)(K?)/i);
      let mileage = 0;
      if (mileageMatch) {
        mileage = parseFloat(mileageMatch[1]);
        if (mileageMatch[2].toUpperCase() === 'K') {
          mileage *= 1000;
        }
      }

      // Extract year and trim from title
      const titleText = $card.find('.scct--make-model-info').text().trim();
      const yearMatch = titleText.match(/^(\d{4})/);
      const year = yearMatch ? parseInt(yearMatch[1]) : 0;

      // Validate that this listing matches the model we're searching for
      // This filters out suggestions like "Equinox" when searching for "Equinox EV"
      const titleLower = titleText.toLowerCase();
      const modelLower = model.toLowerCase();
      if (!titleLower.includes(modelLower)) {
        return; // Skip this listing - doesn't match the requested model
      }

      // Extract trim from model-trim span
      const trimText = $card.find('.scct--make-model-info--model-trim').text().trim();
      // Format is usually "Model Trim", extract just the trim part
      const trimParts = trimText.split(' ');
      const trim = trimParts.length > 1 ? trimParts.slice(1).join(' ') : 'Base';

      // Extract URL
      const linkElement = $card.find('a.scct--make-model-info-link').first();
      const urlPath = linkElement.attr('href');
      const url = urlPath ? `https://www.carmax.com${urlPath}` : '';

      if (price && year) {
        listings.push({
          id: stockId,
          make,
          model,
          year,
          trim,
          price,
          mileage: Math.round(mileage),
          location: 'CarMax',
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
  scrapeCarMax({ make: 'Hyundai', model: 'Ioniq 5' }).catch(console.error);
}
