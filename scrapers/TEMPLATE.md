# Creating a New Scraper

Creating a new scraper is simple! Follow these steps:

## 1. Create Your Scraper Directory

```bash
mkdir scrapers/your-source-name
```

## 2. Create config.json

```json
{
  "enabled": true,
  "source_name": "your-source-name",
  "rate_limit_delay_ms": 3000
}
```

## 3. Create scrape.js

### Option A: Simple Scraper (No Browser Needed)

```javascript
import { appendListings } from '../lib/file-writer.js';

export async function scrapeYourSource(query) {
  // Your scraping logic here
  const listings = [];

  // ... fetch and parse listings for query.make and query.model ...

  await appendListings('your-source-name', listings);
  return listings;
}
```

### Option B: Browser-Based Scraper

```javascript
import * as cheerio from 'cheerio';
import { BaseScraper } from '../lib/base-scraper.js';

class YourSourceScraper extends BaseScraper {
  constructor() {
    super('your-source-name', {
      useStealth: true,  // Use stealth mode to avoid detection
      rateLimitMs: 3000  // Delay between requests
    });
  }

  async scrapeModel(query) {
    const listings = [];
    const searchUrl = `https://example.com/search?q=${query.make}+${query.model}`;

    // Navigate to search page
    await this.page.goto(searchUrl, {
      waitUntil: 'networkidle2',
      timeout: 30000
    });

    // Wait for listings to load
    await this.page.waitForSelector('.car-listing', { timeout: 10000 });

    // Get and parse page HTML
    const html = await this.page.content();
    const $ = cheerio.load(html);

    // Extract listings
    $('.car-listing').each((i, element) => {
      const $card = $(element);

      listings.push({
        id: $card.attr('data-id') || `source-${i}`,
        make: query.make,
        model: query.model,
        year: parseInt($card.find('.year').text()),
        trim: $card.find('.trim').text() || 'Base',
        price: parseInt($card.find('.price').text().replace(/[$,]/g, '')),
        mileage: parseInt($card.find('.mileage').text().replace(/[,mi]/g, '')),
        location: 'Your Source',
        url: $card.find('a').attr('href'),
        listing_date: new Date().toISOString().split('T')[0]
      });
    });

    return listings;
  }
}

export async function scrapeYourSource(query) {
  const scraper = new YourSourceScraper();
  await scraper.launch();

  try {
    return await scraper.scrapeQuery(query);
  } finally {
    await scraper.close();
  }
}
```

## 4. Test Your Scraper

```bash
node scrapers/your-source-name/scrape.js
```

## 5. Add to Frontend

Edit these files to display your new source:

- `src/services/dataLoader.js` - Add source name to array
- `src/components/DetailChart.jsx` - Add color for source
- `src/components/ListingsTable.jsx` - Add badge color
- `src/components/ListingsTable.css` - Add badge styling

## Tips

- The `BaseScraper` handles browser management, rate limiting, and file writing
- Just implement `scrapeModel(query)` and return an array of listings
- Use `useStealth: true` if the site uses Cloudflare or bot detection
- The scraper will be automatically discovered by `run-all.js`
- Each listing must have: id, make, model, year, trim, price, mileage, location, url, listing_date
