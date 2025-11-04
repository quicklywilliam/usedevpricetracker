import * as cheerio from 'cheerio';
import { BaseScraper } from '../lib/base-scraper.js';
import { MIN_VEHICLES } from '../lib/config.js';

class CarvanaScraper extends BaseScraper {
  constructor() {
    super('carvana', { useStealth: true, rateLimitMs: 3000 });
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

      // Carvana detail page structure
      const makeModelText = $('[data-qa="base-vehicle-name"]').text().trim();

      if (!makeModelText) {
        return null;
      }

      // Format: "2024 Honda Prologue" or "2023 Tesla Model 3"
      const match = makeModelText.match(/^(\d{4})\s+([A-Za-z-]+)\s+(.+)$/i);

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

  detectStatus({ html }) {
    const htmlLower = html.toLowerCase();

    // Check for purchase in progress or pending
    if (htmlLower.includes('purchase in progress') || htmlLower.includes('purchase pending') || htmlLower.includes('another customer started purchasing')) {
      return 'selling';
    }

    // Check for not available
    if (htmlLower.includes('is no longer available') || htmlLower.includes('not available')) {
      return 'sold';
    }

    // If page loads normally with vehicle details, it's available
    return 'available';
  }

  async scrapeModel(query) {
    const allListings = [];

    // Use the search box - let Carvana's autocomplete handle regularization
    // This is more robust than constructing filter URLs
    await this.page.goto('https://www.carvana.com', {
      waitUntil: 'networkidle2',
      timeout: 30000
    });

    // Find and use the search box
    await this.page.waitForSelector('input[placeholder*="Search"]', { timeout: 10000 });

    // Type the full search query (make + model)
    const searchQuery = `${query.make} ${query.model}`;
    await this.page.type('input[placeholder*="Search"]', searchQuery);

    // Wait a bit for autocomplete to appear
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Press Enter to search
    await this.page.keyboard.press('Enter');

    // Wait for results page to load
    await this.page.waitForSelector('[data-qa="result-tile"]', { timeout: 10000 });

    let hasMorePages = true;
    const maxPages = 100; // High enough to get to 250 vehicles
    let pageNum = 0;

    while (hasMorePages && pageNum < maxPages && allListings.length < MIN_VEHICLES) {
      pageNum++;

      await new Promise(resolve => setTimeout(resolve, 1000));

      // Get page HTML and parse
      const html = await this.page.content();
      const $ = cheerio.load(html);

      const pageListings = parseListings($, query.make, query.model);

      allListings.push(...pageListings);

      // Stop if we've reached the minimum
      if (allListings.length >= MIN_VEHICLES) {
        hasMorePages = false;
        break;
      }

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

    // Return object with listings and exceeded flag
    return {
      listings: allListings,
      exceededMax: allListings.length >= MIN_VEHICLES
    };
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

function parseListings($, make, model) {
  const listings = [];

  // Find the "WE DIDN'T FIND MANY MATCHES" heading to separate relevant from irrelevant results
  // Results above this heading are relevant, results below are not
  const didntFindHeading = $('*').filter((i, el) => {
    const text = $(el).text().trim();
    return text.includes("WE DIDN'T FIND MANY MATCHES") || text.includes("WE DIDN'T FIND");
  }).first();

  const didntFindIndex = didntFindHeading.length > 0
    ? didntFindHeading.index()
    : Number.MAX_SAFE_INTEGER;

  // Track non-matching results above the heading - this indicates search isn't working
  let nonMatchingAboveHeading = 0;
  let totalAboveHeading = 0;

  // Process all result tiles
  $('[data-qa="result-tile"]').each((i, element) => {
    try {
      const $card = $(element);
      const cardIndex = $card.index();

      // Extract make/model/year from title
      const makeModelText = $card.find('[data-qa="make-model"]').text().trim();

      // Check if this listing matches what we're looking for
      // Use flexible matching - check against our requested model
      const makeModelLower = makeModelText.toLowerCase();
      const modelLower = model.toLowerCase();
      const makeLower = make.toLowerCase();

      const normalizedMakeModel = makeModelLower.replace(/\s+/g, ' ');
      const normalizedModel = modelLower.replace(/\s+/g, ' ');

      // Match if the make is correct and the model appears in the listing
      // This handles "IONIQ 5" matching "ioniq 5", "Mach-E" matching "mach-e", etc.
      const isMatch = makeModelLower.includes(makeLower) &&
                      normalizedMakeModel.includes(normalizedModel);

      // Track results above the "didn't find" heading
      if (cardIndex < didntFindIndex) {
        totalAboveHeading++;
        if (!isMatch) {
          nonMatchingAboveHeading++;
        }
      }

      // Skip results below the "didn't find" heading
      if (cardIndex >= didntFindIndex) {
        return; // Skip non-relevant results
      }

      // Skip non-matching results (defensive validation)
      if (!isMatch) {
        return;
      }

      // Extract price
      const priceText = $card.find('[data-qa="price"]').text().trim();
      const price = parseInt(priceText.replace(/[$,]/g, ''));

      // Extract year
      const yearMatch = makeModelText.match(/^(\d{4})/);
      const year = yearMatch ? parseInt(yearMatch[1]) : 0;

      // Extract trim/mileage
      const trimMileageText = $card.find('[data-qa="trim-mileage"]').text().trim();

      // Parse trim and mileage from the combined field
      // Format is typically: "SE Sport Utility 4D • 12K mi"

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

      // Extract vehicle ID from URL - required for tracking
      const idMatch = urlPath?.match(/\/vehicle\/(\d+)/);
      if (!idMatch) {
        console.error(`    ⚠ Warning: Could not extract vehicle ID from URL: ${urlPath}`);
        return; // Skip listings without valid IDs
      }
      const id = `carvana-${idMatch[1]}`;

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

  // Defensive check: if we found many non-matching results above the heading,
  // Carvana's search isn't working properly for this model
  if (totalAboveHeading > 0 && nonMatchingAboveHeading / totalAboveHeading > 0.5) {
    console.error(`    ⚠ Warning: ${nonMatchingAboveHeading}/${totalAboveHeading} results above heading don't match ${make} ${model}`);
    console.error(`    This indicates Carvana's search may not support this model name format`);
  }

  return listings;
}
