# Autotrader Scraper

Scraper for Autotrader.com using JSON-LD structured data extraction.

## Architecture

This scraper uses an HTTP client to fetch pages and parse JSON-LD (Schema.org) structured data embedded in the HTML. This approach is more reliable than using Puppeteer because:

1. **Akamai Protection**: Autotrader uses Akamai bot protection that aggressively blocks headless browsers
2. **Structured Data**: Autotrader embeds vehicle data in JSON-LD format which is easy to parse
3. **Reliability**: HTTP requests are less likely to be blocked than automated browsers

## Known Limitations

### Limited Listings Per Request

**Important**: This scraper only retrieves 3-10 listings per model due to Autotrader's architecture:

- Autotrader embeds only a subset of listings as JSON-LD in the initial HTML
- Full listings require JavaScript rendering, which triggers Akamai bot detection
- Other scrapers (CarMax, Carvana) can get 50+ listings; Autotrader is limited

**Why not use Puppeteer?**: Testing shows that even with stealth mode, Autotrader's Akamai protection blocks automated browsers consistently.

### Inconsistent JSON-LD Embedding

Not all vehicle models have JSON-LD data embedded:
- ✅ Works: Tesla Model 3, Hyundai Ioniq 5 (confirmed)
- ❌ No data: Audi Q4 e-tron (page exists but no JSON-LD)

When JSON-LD is not available, the scraper:
1. Detects the page has results (e.g., "13 matches")
2. Logs a warning about missing JSON-LD
3. Returns empty results without crashing

## Error Handling

The scraper fails early and provides clear error messages for:

1. **Akamai Blocks**: Detects block pages and throws specific error
2. **Missing Data**: Validates JSON-LD has all required fields before parsing
3. **Invalid Values**: Validates price, mileage, and year ranges
4. **No Results**: Distinguishes between "no listings" vs "page structure changed"

## Data Format

### Input JSON-LD Structure
```json
{
  "@type": ["Product", "Car"],
  "vehicleModelDate": 2022,
  "model": "Model 3",
  "name": "Used 2022 Tesla Model 3 Long Range",
  "offers": {
    "price": "25315.00",
    "url": "https://www.autotrader.com/cars-for-sale/vehicle/762820592"
  },
  "mileageFromOdometer": {
    "value": "53,350"
  },
  "sku": 762820592
}
```

### Output Listing Format
```json
{
  "id": "autotrader-762820592",
  "make": "Tesla",
  "model": "Model 3",
  "year": 2022,
  "trim": "Long Range",
  "price": 25315,
  "mileage": 53350,
  "location": "Autotrader",
  "url": "https://www.autotrader.com/cars-for-sale/vehicle/762820592",
  "listing_date": "2025-11-03"
}
```

## Trim Extraction

Trim is extracted from the `name` field by finding text after the model name:
- "Used 2022 Tesla Model 3 **Long Range**" → trim: "Long Range"
- "Used 2022 Tesla Model 3 **Performance**" → trim: "Performance"
- No trim specified → trim: "Base"

## Testing

Run tests with:
```bash
npm test scrapers/autotrader/scrape.test.js
```

Test coverage includes:
- JSON-LD parsing from HTML
- Data validation and conversion
- Akamai block detection
- Error handling for missing/invalid data
- Trim extraction from various formats

## Usage

```javascript
import { scrapeAutotrader } from './scrapers/autotrader/scrape.js';

const listings = await scrapeAutotrader({
  make: 'Tesla',
  model: 'Model 3'
});
```

## Future Improvements

If Autotrader's bot protection becomes less aggressive:
1. Switch to Puppeteer to get full listings
2. Implement infinite scroll to load more results
3. Add pagination support

For now, the HTTP client approach is the most reliable despite the limited results.
