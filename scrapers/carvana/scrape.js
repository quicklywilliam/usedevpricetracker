import * as cheerio from 'cheerio';
import { BaseScraper } from '../lib/base-scraper.js';

class CarvanaScraper extends BaseScraper {
  constructor() {
    super('carvana', { useStealth: true, rateLimitMs: 3000 });
  }

  async scrapeModel(query) {
    const allListings = [];
    const searchUrl = buildSearchUrl(query.make, query.model);

    await this.page.goto(searchUrl, {
      waitUntil: 'networkidle2',
      timeout: 30000
    });

    // Wait for listings to appear
    await this.page.waitForSelector('[data-qa="result-tile"]', { timeout: 10000 });

    let hasMorePages = true;
    const maxPages = 15;
    let pageNum = 0;

    while (hasMorePages && pageNum < maxPages) {
      pageNum++;

      await new Promise(resolve => setTimeout(resolve, 1000));

      // Get page HTML and parse
      const html = await this.page.content();
      const $ = cheerio.load(html);
      const pageListings = parseListings($, query.make, query.model);

      allListings.push(...pageListings);

      // Check for next page button
      const nextButton = await this.page.evaluateHandle(() => {
        const btn = document.querySelector('[data-qa="next-page"]');
        return btn && !btn.disabled ? btn : null;
      });

      if ((await nextButton.jsonValue()) !== null) {
        await this.page.evaluate(() => {
          const btn = document.querySelector('[data-qa="next-page"]');
          btn.click();
        });
        await new Promise(resolve => setTimeout(resolve, 2000));
      } else {
        hasMorePages = false;
      }
    }

    return allListings;
  }
}

export async function scrapeCarvana(query) {
  const scraper = new CarvanaScraper();
  await scraper.launch();

  try {
    return await scraper.scrapeQuery(query);
  } finally {
    await scraper.close();
  }
}

function buildSearchUrl(make, model) {
  // Carvana uses a filter-based URL with base64-encoded JSON
  // Example: https://www.carvana.com/cars/filters?cvnaid=eyJmaWx0ZXJzIjp7Im1ha2VzIjpbeyJuYW1lIjoiTmlzc2FuIiwicGFyZW50TW9kZWxzIjpbeyJuYW1lIjoiQXJpeWEifV19XX19

  const filterObject = {
    filters: {
      makes: [
        {
          name: make,
          parentModels: [
            {
              name: model
            }
          ]
        }
      ]
    }
  };

  // Base64 encode the JSON
  const jsonString = JSON.stringify(filterObject);
  const base64 = Buffer.from(jsonString).toString('base64');

  return `https://www.carvana.com/cars/filters?cvnaid=${base64}`;
}

function parseListings($, make, model) {
  const listings = [];

  // Carvana result tiles
  $('[data-qa="result-tile"]').each((i, element) => {
    try {
      const $card = $(element);

      // Extract price
      const priceText = $card.find('[data-qa="price"]').text().trim();
      const price = parseInt(priceText.replace(/[$,]/g, ''));

      // Extract make/model/year from title
      const makeModelText = $card.find('[data-qa="make-model"]').text().trim();

      // Format is typically "2023 Tesla Model 3"
      const yearMatch = makeModelText.match(/^(\d{4})/);
      const year = yearMatch ? parseInt(yearMatch[1]) : 0;

      // Try to extract trim and mileage from the combined field
      // Format is typically: "SE Sport Utility 4D • 12K mi"
      const trimMileageText = $card.find('[data-qa="trim-mileage"]').text().trim();

      let trim = 'Base';
      let mileage = 0;

      if (trimMileageText) {
        // Split by bullet point to separate trim from mileage
        const parts = trimMileageText.split('•').map(s => s.trim());
        trim = parts[0] || 'Base';

        // Extract mileage from second part
        const mileageText = parts[1] || '';
        const mileageMatch = mileageText.match(/(\d+(?:,\d+)*)(K?)/i);
        if (mileageMatch) {
          mileage = parseInt(mileageMatch[1].replace(/,/g, ''));
          // If it has K, multiply by 1000
          if (mileageMatch[2] && mileageMatch[2].toUpperCase() === 'K') {
            mileage *= 1000;
          }
        }
      } else {
        // Fallback: try to extract from makeModelText
        const trimMatch = makeModelText.match(/^\d{4}\s+\w+\s+[\w\s-]+\s+(.+)$/i);
        trim = trimMatch ? trimMatch[1] : 'Base';

        // Fallback: try to find mileage from old selector
        const oldMileageText = $card.find('[data-qa="mileage"]').text().trim();
        const oldMileageMatch = oldMileageText.match(/(\d+(?:,\d+)*)/);
        mileage = oldMileageMatch ? parseInt(oldMileageMatch[1].replace(/,/g, '')) * 1000 : 0;
      }

      // Extract URL
      const linkElement = $card.find('a').first();
      const urlPath = linkElement.attr('href');
      const url = urlPath ? (urlPath.startsWith('http') ? urlPath : `https://www.carvana.com${urlPath}`) : '';

      // Generate ID from URL or index
      const idMatch = urlPath?.match(/\/(\d+)$/);
      const id = idMatch ? `carvana-${idMatch[1]}` : `carvana-${i}`;

      if (price && year) {
        listings.push({
          id,
          make,
          model,
          year,
          trim,
          price,
          mileage,
          location: 'Carvana',
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
  scrapeCarvana({ make: 'Hyundai', model: 'Ioniq 5' }).catch(console.error);
}
