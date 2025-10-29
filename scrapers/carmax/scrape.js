import * as cheerio from 'cheerio';
import { BaseScraper } from '../lib/base-scraper.js';
import { MIN_VEHICLES } from '../lib/config.js';

class CarMaxScraper extends BaseScraper {
  constructor() {
    super('carmax', { useStealth: false, rateLimitMs: 3000 });
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

      // CarMax detail page has title like "2023 Tesla Model 3 Long Range"
      const titleText = $('h1.vehicle-title, h1[class*="title"]').text().trim();

      if (!titleText) {
        return null;
      }

      // Parse year, make, model from title
      // Format: "2023 Tesla Model 3 Long Range"
      const match = titleText.match(/^(\d{4})\s+([A-Za-z-]+)\s+(.+?)(?:\s+\w+(?:\s+\w+)*)?$/i);

      if (match) {
        const make = match[2];
        // Model can be multi-word (e.g., "Model 3", "Mustang Mach-E")
        // Extract everything after make until we hit the trim
        const remaining = match[3];

        // For simple case, take first 1-3 words as model
        const modelParts = remaining.split(/\s+/).slice(0, 3);
        const model = modelParts.join(' ');

        return { make, model };
      }

      return null;
    } catch (error) {
      console.error(`Error validating ${url}:`, error.message);
      return null;
    }
  }

  detectStatus({ html, statusCode }) {
    const htmlLower = html.toLowerCase();

    // Check for sold status first (before reserved, since page might have both keywords)
    if (htmlLower.includes('sold\n') || htmlLower.includes('>sold<') ||
        statusCode === 404 || htmlLower.includes('page not found') ||
        htmlLower.includes('this car is sold') || htmlLower.includes('vehicle has been sold')) {
      return 'sold';
    }

    // Check for reserved status
    if (htmlLower.includes('reserved') || htmlLower.includes('this car is on hold')) {
      return 'selling';
    }

    // If page loads normally with vehicle details, it's available
    return 'available';
  }

  async scrapeModel(query) {
    const allListings = [];
    const seenIds = new Set();
    const searchUrl = buildSearchUrl(query.make, query.model);

    await this.page.goto(searchUrl, {
      waitUntil: 'networkidle2',
      timeout: 30000
    });

    // Wait for page body and give time for dynamic content
    await this.page.waitForSelector('body', { timeout: 5000 });
    await new Promise(resolve => setTimeout(resolve, 2000));

    let hasMorePages = true;
    const maxPages = 100; // High enough to get to 250 vehicles
    let pageNum = 0;

    while (hasMorePages && pageNum < maxPages && allListings.length < MIN_VEHICLES) {
      pageNum++;

      // Wait a bit for content to render
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Get page HTML and parse
      const html = await this.page.content();
      const $ = cheerio.load(html);
      const pageListings = parseListings($, query.make, query.model);

      // Deduplicate - only add listings we haven't seen before
      for (const listing of pageListings) {
        if (!seenIds.has(listing.id)) {
          seenIds.add(listing.id);
          allListings.push(listing);
        }
      }

      // Stop if we've reached the minimum
      if (allListings.length >= MIN_VEHICLES) {
        hasMorePages = false;
        break;
      }

      // Check for "See more matches" button
      const loadMoreButton = await this.page.$('#see-more-button');

      if (loadMoreButton) {
        await loadMoreButton.click();
        await new Promise(resolve => setTimeout(resolve, 3000));
      } else {
        hasMorePages = false;
      }
    }

    // Return object with listings and exceeded flag
    return {
      listings: allListings,
      exceededMax: allListings.length >= MIN_VEHICLES
    };
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

      // Extract stock ID from data-id attribute - required for tracking
      const stockId = $card.attr('data-id');
      if (!stockId) {
        console.error(`    ⚠ Warning: Could not extract stock ID from listing`);
        return; // Skip listings without valid IDs
      }

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

      // Extract trim from model-trim span first (needed for validation)
      const trimText = $card.find('.scct--make-model-info--model-trim').text().trim();

      // Validate that this listing matches the model we're searching for
      // This filters out suggestions like "Equinox" when searching for "Equinox EV"
      const titleLower = titleText.toLowerCase();
      const modelLower = model.toLowerCase();
      const trimLower = trimText.toLowerCase();

      if (!titleLower.includes(modelLower)) {
        return; // Skip this listing - doesn't match the requested model
      }

      // For models ending in "EV", verify the trim also contains "EV"
      // This prevents "Equinox LT" from matching "Equinox EV" searches
      if (model.toUpperCase().endsWith(' EV')) {
        if (!trimLower.includes('ev')) {
          return; // Skip - trim doesn't contain EV, this is likely the gas model
        }
      }

      // Format trim: usually "Model Trim", extract just the trim part
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
