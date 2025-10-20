import fs from 'fs/promises';
import * as cheerio from 'cheerio';
import puppeteer from 'puppeteer';
import { RateLimiter } from '../lib/rate-limiter.js';
import { writeJsonFile } from '../lib/file-writer.js';

export async function scrapeCarMax() {
  console.log('Scraping CarMax...');

  // Read tracked models
  const configPath = 'config/tracked-models.json';
  const configData = await fs.readFile(configPath, 'utf-8');
  const config = JSON.parse(configData);

  const rateLimiter = new RateLimiter(3000);
  const listings = [];

  // Launch browser once for all queries
  console.log('  Launching browser...');
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const page = await browser.newPage();

    // Set realistic viewport and user agent
    await page.setViewport({ width: 1920, height: 1080 });
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    for (const query of config.queries) {
      console.log(`  Searching for ${query.make} ${query.model}...`);

      await rateLimiter.waitIfNeeded();

      try {
        // Build CarMax search URL
        const searchUrl = buildSearchUrl(query.make, query.model);
        console.log(`  URL: ${searchUrl}`);

        // Navigate to the page
        await page.goto(searchUrl, {
          waitUntil: 'networkidle2',
          timeout: 30000
        });

        // Wait for search results to load
        await page.waitForSelector('body', { timeout: 5000 });

        // Wait a bit more for dynamic content
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Save screenshot and HTML for debugging
        await page.screenshot({ path: 'debug-carmax.png', fullPage: true });
        const html = await page.content();
        await fs.writeFile('debug-carmax.html', html);
        console.log(`  Saved debug-carmax.png and debug-carmax.html`);

        const $ = cheerio.load(html);

        // Parse listings from search results
        const pageListings = parseListings($, query.make, query.model);
        listings.push(...pageListings);

        console.log(`  Found ${pageListings.length} listings`);
      } catch (error) {
        console.error(`  Error scraping ${query.make} ${query.model}:`, error.message);
      }
    }
  } finally {
    await browser.close();
  }

  const result = {
    source: 'carmax',
    scraped_at: new Date().toISOString(),
    listings
  };

  await writeJsonFile('carmax', result);

  return result;
}

function buildSearchUrl(make, model) {
  // CarMax search URL format
  // Example: https://www.carmax.com/cars/tesla/model-3
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
      const mileageText = $card.find('.scct--price-miles-info--miles').text().trim();
      const mileageMatch = mileageText.match(/(\d+)K/);
      const mileage = mileageMatch ? parseInt(mileageMatch[1]) * 1000 : 0;

      // Extract year from make-model text
      const yearMakeText = $card.find('.scct--make-model-info--year-make').text().trim();
      const yearMatch = yearMakeText.match(/(\d{4})/);
      const year = yearMatch ? parseInt(yearMatch[1]) : null;

      // Extract trim from model-trim text
      const modelTrimText = $card.find('.scct--make-model-info--model-trim').text().trim();
      const trim = modelTrimText.replace(model, '').trim() || 'Base';

      // Extract location
      const locationText = $card.find('.scct--store-transfer-info--transfer').text().trim();
      const location = locationText.replace('Test drive today at', '').replace('CarMax', '').trim();

      // Extract URL
      const linkElement = $card.find('a[href^="/car/"]').first();
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
          mileage: mileage || 0,
          location: location || 'Unknown',
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
  scrapeCarMax().catch(console.error);
}
