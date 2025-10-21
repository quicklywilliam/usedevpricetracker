#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { BaseScraper } from './lib/base-scraper.js';
import * as cheerio from 'cheerio';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Create scraper instances
const scrapers = {
  async CarMax() {
    // Use the actual CarMax scraper class
    class CarMaxValidator extends BaseScraper {
      constructor() {
        super('carmax', { useStealth: false, rateLimitMs: 3000 });
      }

      async validateListing(url) {
        try {
          await this.page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
          await this.page.waitForSelector('body', { timeout: 5000 });
          const html = await this.page.content();
          const $ = cheerio.load(html);

          // Try multiple selectors
          let titleText = $('[data-qa="vehicle-name"]').text().trim() ||
                         $('h1[data-qa*="title"]').text().trim() ||
                         $('h1.kmx-typography--display-2').text().trim() ||
                         $('h1').first().text().trim();

          if (!titleText || titleText === 'Access Denied') return null;

          const match = titleText.match(/^(\d{4})\s+([A-Za-z-]+)\s+(.+)$/i);
          if (match) {
            const make = match[2];
            const remaining = match[3];
            const modelParts = remaining.split(/\s+/).slice(0, 3);
            const model = modelParts.join(' ');
            return { make, model };
          }
          return null;
        } catch (error) {
          console.error(`  Error: ${error.message}`);
          return null;
        }
      }
    }

    const scraper = new CarMaxValidator();
    await scraper.launch();
    return scraper;
  },

  async Carvana() {
    class CarvanaValidator extends BaseScraper {
      constructor() {
        super('carvana', { useStealth: true, rateLimitMs: 3000 });
      }

      async validateListing(url) {
        try {
          await this.page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
          await this.page.waitForSelector('body', { timeout: 5000 });
          const html = await this.page.content();
          const $ = cheerio.load(html);

          // Try multiple selectors for Carvana's vehicle name
          const makeModelText = $('.line-clamp-2.self-end.text-text-strong').first().text().trim() ||
                                $('[class*="t-heading"]').first().text().trim() ||
                                $('title').text().trim().split('|')[0].trim();

          if (!makeModelText) return null;

          const match = makeModelText.match(/^(\d{4})\s+([A-Za-z-]+)\s+(.+)$/i);
          if (match) {
            return { make: match[2], model: match[3] };
          }
          return null;
        } catch (error) {
          console.error(`  Error: ${error.message}`);
          return null;
        }
      }
    }

    const scraper = new CarvanaValidator();
    await scraper.launch();
    return scraper;
  },

  async 'Platt Auto'() {
    class PlattValidator extends BaseScraper {
      constructor() {
        super('plattauto', { useStealth: true, rateLimitMs: 3000 });
      }

      async validateListing(url) {
        try {
          await this.page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
          await this.page.waitForSelector('body', { timeout: 5000 });
          const html = await this.page.content();
          const $ = cheerio.load(html);

          const titleText = $('h1.dws-vehicle-detail-title, h1').first().text().trim();
          if (!titleText) return null;

          const match = titleText.match(/^(\d{4})\s+([A-Za-z-]+)\s+(.+)$/i);
          if (match) {
            return { make: match[2], model: match[3] };
          }
          return null;
        } catch (error) {
          console.error(`  Error: ${error.message}`);
          return null;
        }
      }
    }

    const scraper = new PlattValidator();
    await scraper.launch();
    return scraper;
  }
};

async function validateAllData() {
  console.log('Starting data validation...\n');

  const dataDir = path.join(__dirname, '..', 'data');
  const sources = ['carmax', 'carvana', 'plattauto'];

  const results = {
    total: 0,
    validated: 0,
    mismatches: [],
    errors: []
  };

  for (const source of sources) {
    const sourceDir = path.join(dataDir, source);

    try {
      const files = await fs.readdir(sourceDir);
      const jsonFiles = files.filter(f => f.endsWith('.json'));

      for (const file of jsonFiles) {
        const filePath = path.join(sourceDir, file);
        const content = await fs.readFile(filePath, 'utf-8');
        const data = JSON.parse(content);

        console.log(`\nValidating ${source}/${file} (${data.listings.length} listings)...`);

        const location = data.listings[0]?.location;
        if (!location || !scrapers[location]) {
          console.log(`  ⚠ Unknown location: ${location}, skipping`);
          continue;
        }

        const scraper = await scrapers[location]();

        try {
          // Sample first 10 listings
          const sampleSize = Math.min(10, data.listings.length);
          const sampled = data.listings.slice(0, sampleSize);

          for (const listing of sampled) {
            results.total++;

            try {
              console.log(`  Checking ${listing.make} ${listing.model} (${listing.url})...`);
              const actual = await scraper.validateListing(listing.url);

              if (!actual) {
                results.errors.push({
                  file,
                  listing,
                  error: 'Could not extract make/model from detail page'
                });
                console.log(`    ⚠ Could not validate`);
                continue;
              }

              results.validated++;

              const expectedMake = listing.make.toLowerCase();
              const expectedModel = listing.model.toLowerCase();
              const actualMake = actual.make.toLowerCase();
              const actualModel = actual.model.toLowerCase();

              if (actualMake !== expectedMake || !actualModel.includes(expectedModel)) {
                results.mismatches.push({
                  file,
                  listing: {
                    url: listing.url,
                    expected: `${listing.make} ${listing.model}`,
                    actual: `${actual.make} ${actual.model}`
                  }
                });
                console.log(`    ✗ MISMATCH: Expected "${listing.make} ${listing.model}", got "${actual.make} ${actual.model}"`);
              } else {
                console.log(`    ✓ Match`);
              }

              await new Promise(resolve => setTimeout(resolve, 2000));
            } catch (error) {
              results.errors.push({
                file,
                listing,
                error: error.message
              });
              console.log(`    ✗ Error: ${error.message}`);
            }
          }
        } finally {
          await scraper.close();
        }
      }
    } catch (error) {
      console.error(`Error processing ${source}:`, error.message);
    }
  }

  console.log('\n\n=== Validation Summary ===');
  console.log(`Total listings checked: ${results.total}`);
  console.log(`Successfully validated: ${results.validated}`);
  console.log(`Mismatches found: ${results.mismatches.length}`);
  console.log(`Errors: ${results.errors.length}`);

  if (results.mismatches.length > 0) {
    console.log('\n=== Mismatches ===');
    results.mismatches.forEach(m => {
      console.log(`${m.file}: ${m.listing.url}`);
      console.log(`  Expected: ${m.listing.expected}`);
      console.log(`  Actual:   ${m.listing.actual}`);
    });
  }

  if (results.errors.length > 0) {
    console.log('\n=== Sample Errors ===');
    results.errors.slice(0, 5).forEach(e => {
      console.log(`${e.file}: ${e.listing?.url || 'unknown'}`);
      console.log(`  Error: ${e.error}`);
    });
  }
}

validateAllData().catch(console.error);
