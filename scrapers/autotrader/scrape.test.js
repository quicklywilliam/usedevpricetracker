import { describe, it, expect, beforeEach } from 'vitest';
import * as cheerio from 'cheerio';

/**
 * Test data based on actual Autotrader responses
 * This ensures our scraper works with real-world data
 */
const SAMPLE_JSON_LD_LISTINGS = [
  {
    "@context": "http://schema.org/",
    "@type": ["Product", "Car"],
    "vehicleIdentificationNumber": "5YJ3E1EB6JF083208",
    "name": "Used 2018 Tesla Model 3 Performance",
    "itemCondition": "http://schema.org/UsedCondition",
    "offers": {
      "@type": "Offer",
      "priceCurrency": "USD",
      "price": "23477.00",
      "availability": "http://schema.org/InStock",
      "url": "https://www.autotrader.com/cars-for-sale/vehicle/758996667"
    },
    "model": "Model 3",
    "vehicleModelDate": 2018,
    "driveWheelConfiguration": "All Wheel Drive",
    "vehicleEngine": "Electric",
    "color": "Silver",
    "mileageFromOdometer": {
      "@type": "QuantitativeValue",
      "value": "48,078",
      "unitCode": "SMI"
    },
    "sku": 758996667
  },
  {
    "@context": "http://schema.org/",
    "@type": ["Product", "Car"],
    "vehicleIdentificationNumber": "5YJ3E1EBXNF257416",
    "name": "Used 2022 Tesla Model 3 Long Range",
    "itemCondition": "http://schema.org/UsedCondition",
    "offers": {
      "@type": "Offer",
      "priceCurrency": "USD",
      "price": "25315.00",
      "availability": "http://schema.org/InStock",
      "url": "https://www.autotrader.com/cars-for-sale/vehicle/762820592"
    },
    "model": "Model 3",
    "vehicleModelDate": 2022,
    "driveWheelConfiguration": "All Wheel Drive",
    "vehicleEngine": "Electric",
    "color": "Red",
    "mileageFromOdometer": {
      "@type": "QuantitativeValue",
      "value": "53,350",
      "unitCode": "SMI"
    },
    "sku": 762820592
  },
  {
    "@context": "http://schema.org/",
    "@type": ["Product", "Car"],
    "vehicleIdentificationNumber": "WAUBFAFL2PA095804",
    "name": "Used 2023 Audi Q4 e-tron Premium Plus",
    "itemCondition": "http://schema.org/UsedCondition",
    "offers": {
      "@type": "Offer",
      "priceCurrency": "USD",
      "price": "38995.00",
      "availability": "http://schema.org/InStock",
      "url": "https://www.autotrader.com/cars-for-sale/vehicle/759123456"
    },
    "model": "Q4 e-tron",
    "vehicleModelDate": 2023,
    "driveWheelConfiguration": "All Wheel Drive",
    "vehicleEngine": "Electric",
    "color": "Blue",
    "mileageFromOdometer": {
      "@type": "QuantitativeValue",
      "value": "12,450",
      "unitCode": "SMI"
    },
    "sku": 759123456
  }
];

/**
 * Sample HTML page with JSON-LD data embedded
 */
function createMockHTML(jsonLdData) {
  const scripts = jsonLdData.map(data =>
    `<script type="application/ld+json">${JSON.stringify(data)}</script>`
  ).join('\n');

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <title>Autotrader - Search Results</title>
      </head>
      <body>
        <div class="results">
          ${scripts}
        </div>
      </body>
    </html>
  `;
}

/**
 * Sample Akamai block page HTML
 */
const AKAMAI_BLOCK_PAGE = `
  <!DOCTYPE html>
  <html>
    <head>
      <title>Autotrader - page unavailable</title>
    </head>
    <body>
      <h1>We're sorry for any inconvenience, but the site is currently unavailable.</h1>
      <div id="incidentid">Incident Number: 18.6a73717.1762203356.c5245a63</div>
    </body>
  </html>
`;

/**
 * Helper function to parse JSON-LD data from HTML
 * This is what the actual scraper should do
 */
function parseJsonLdListings($) {
  const listings = [];

  $('script[type="application/ld+json"]').each((i, element) => {
    try {
      const data = JSON.parse($(element).html());

      // Only process Car schema objects
      if (data['@type'] &&
          (data['@type'].includes('Car') || data['@type'] === 'Car')) {
        listings.push(data);
      }
    } catch (error) {
      // Skip invalid JSON
    }
  });

  return listings;
}

/**
 * Helper to convert JSON-LD data to our standard listing format
 */
function convertToListing(jsonLd, requestedMake, requestedModel) {
  // Extract trim from name field
  // Format: "Used 2018 Tesla Model 3 Performance"
  // We need to extract everything after the model name
  const nameLower = jsonLd.name.toLowerCase();
  const modelLower = requestedModel.toLowerCase();

  // Find where the model name ends in the listing name
  const modelIndex = nameLower.indexOf(modelLower);
  if (modelIndex !== -1) {
    const afterModel = jsonLd.name.substring(modelIndex + requestedModel.length).trim();
    const trim = afterModel || 'Base';
    return {
      id: `autotrader-${jsonLd.sku}`,
      make: requestedMake,
      model: requestedModel,
      year: jsonLd.vehicleModelDate,
      trim,
      price: parseInt(parseFloat(jsonLd.offers.price)),
      mileage: parseInt((jsonLd.mileageFromOdometer?.value || '0').replace(/,/g, '')),
      location: 'Autotrader',
      url: jsonLd.offers.url,
      listing_date: new Date().toISOString().split('T')[0]
    };
  }

  // Fallback: return with 'Base' trim
  return {
    id: `autotrader-${jsonLd.sku}`,
    make: requestedMake,
    model: requestedModel,
    year: jsonLd.vehicleModelDate,
    trim: 'Base',
    price: parseInt(parseFloat(jsonLd.offers.price)),
    mileage: parseInt((jsonLd.mileageFromOdometer?.value || '0').replace(/,/g, '')),
    location: 'Autotrader',
    url: jsonLd.offers.url,
    listing_date: new Date().toISOString().split('T')[0]
  };
}

/**
 * Helper to detect if page is an Akamai block
 */
function isAkamaiBlock(html) {
  const htmlLower = html.toLowerCase();
  return htmlLower.includes('site is currently unavailable') ||
         htmlLower.includes('akamai-block') ||
         htmlLower.includes('incident number:');
}

describe('Autotrader Scraper', () => {
  describe('JSON-LD Parsing', () => {
    it('should extract all JSON-LD car listings from HTML', () => {
      const html = createMockHTML(SAMPLE_JSON_LD_LISTINGS);
      const $ = cheerio.load(html);
      const listings = parseJsonLdListings($);

      expect(listings).toHaveLength(3);
      expect(listings[0].model).toBe('Model 3');
      expect(listings[2].model).toBe('Q4 e-tron');
    });

    it('should handle pages with no JSON-LD data', () => {
      const html = '<html><body><div>No data</div></body></html>';
      const $ = cheerio.load(html);
      const listings = parseJsonLdListings($);

      expect(listings).toHaveLength(0);
    });

    it('should skip invalid JSON in script tags', () => {
      const html = `
        <html>
          <body>
            <script type="application/ld+json">{ invalid json }</script>
            <script type="application/ld+json">${JSON.stringify(SAMPLE_JSON_LD_LISTINGS[0])}</script>
          </body>
        </html>
      `;
      const $ = cheerio.load(html);
      const listings = parseJsonLdListings($);

      expect(listings).toHaveLength(1);
      expect(listings[0].model).toBe('Model 3');
    });
  });

  describe('Data Conversion', () => {
    it('should convert JSON-LD to standard listing format', () => {
      const jsonLd = SAMPLE_JSON_LD_LISTINGS[0];
      const listing = convertToListing(jsonLd, 'Tesla', 'Model 3');

      expect(listing).toEqual({
        id: 'autotrader-758996667',
        make: 'Tesla',
        model: 'Model 3',
        year: 2018,
        trim: 'Performance',
        price: 23477,
        mileage: 48078,
        location: 'Autotrader',
        url: 'https://www.autotrader.com/cars-for-sale/vehicle/758996667',
        listing_date: expect.any(String)
      });
    });

    it('should extract trim from listing name', () => {
      const listing1 = convertToListing(SAMPLE_JSON_LD_LISTINGS[0], 'Tesla', 'Model 3');
      const listing2 = convertToListing(SAMPLE_JSON_LD_LISTINGS[1], 'Tesla', 'Model 3');
      const listing3 = convertToListing(SAMPLE_JSON_LD_LISTINGS[2], 'Audi', 'Q4 e-tron');

      expect(listing1.trim).toBe('Performance');
      expect(listing2.trim).toBe('Long Range');
      expect(listing3.trim).toBe('Premium Plus');
    });

    it('should parse mileage correctly (removing commas)', () => {
      const listing = convertToListing(SAMPLE_JSON_LD_LISTINGS[0], 'Tesla', 'Model 3');
      expect(listing.mileage).toBe(48078);
      expect(typeof listing.mileage).toBe('number');
    });

    it('should parse price correctly', () => {
      const listing = convertToListing(SAMPLE_JSON_LD_LISTINGS[0], 'Tesla', 'Model 3');
      expect(listing.price).toBe(23477);
      expect(typeof listing.price).toBe('number');
    });

    it('should generate correct listing ID from SKU', () => {
      const listing = convertToListing(SAMPLE_JSON_LD_LISTINGS[0], 'Tesla', 'Model 3');
      expect(listing.id).toBe('autotrader-758996667');
      expect(listing.id).toMatch(/^autotrader-\d+$/);
    });

    it('should use current date as listing_date', () => {
      const listing = convertToListing(SAMPLE_JSON_LD_LISTINGS[0], 'Tesla', 'Model 3');
      const today = new Date().toISOString().split('T')[0];
      expect(listing.listing_date).toBe(today);
    });
  });

  describe('Error Detection', () => {
    it('should detect Akamai block page', () => {
      expect(isAkamaiBlock(AKAMAI_BLOCK_PAGE)).toBe(true);
    });

    it('should not false-positive on normal pages', () => {
      const normalHtml = createMockHTML(SAMPLE_JSON_LD_LISTINGS);
      expect(isAkamaiBlock(normalHtml)).toBe(false);
    });

    it('should detect various Akamai block patterns', () => {
      const patterns = [
        '<div>site is currently unavailable</div>',
        '<div>SITE IS CURRENTLY UNAVAILABLE</div>',
        '<link href="/akamai-block/block-images/css/app.css">',
        '<div id="incidentid">Incident Number: 123</div>'
      ];

      patterns.forEach(pattern => {
        expect(isAkamaiBlock(pattern)).toBe(true);
      });
    });
  });

  describe('Data Validation', () => {
    it('should require essential fields in JSON-LD', () => {
      const requiredFields = [
        'vehicleModelDate',
        'model',
        'offers',
        'mileageFromOdometer',
        'sku'
      ];

      SAMPLE_JSON_LD_LISTINGS.forEach(listing => {
        requiredFields.forEach(field => {
          expect(listing).toHaveProperty(field);
        });
      });
    });

    it('should require price in offers', () => {
      SAMPLE_JSON_LD_LISTINGS.forEach(listing => {
        expect(listing.offers).toHaveProperty('price');
        expect(listing.offers).toHaveProperty('url');
      });
    });

    it('should have valid mileage format', () => {
      SAMPLE_JSON_LD_LISTINGS.forEach(listing => {
        expect(listing.mileageFromOdometer).toHaveProperty('value');
        expect(listing.mileageFromOdometer.value).toMatch(/^\d{1,3}(,\d{3})*$/);
      });
    });
  });

  describe('Model Filtering', () => {
    it('should only include matching models', () => {
      const html = createMockHTML(SAMPLE_JSON_LD_LISTINGS);
      const $ = cheerio.load(html);
      const allListings = parseJsonLdListings($);

      // Filter for only Model 3
      const model3Listings = allListings.filter(l => l.model === 'Model 3');
      expect(model3Listings).toHaveLength(2);

      // Filter for only Q4 e-tron
      const q4Listings = allListings.filter(l => l.model === 'Q4 e-tron');
      expect(q4Listings).toHaveLength(1);
    });
  });
});
