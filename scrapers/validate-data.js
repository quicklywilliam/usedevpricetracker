#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { scrapeCarMax } from './carmax/scrape.js';
import { scrapeCarvana } from './carvana/scrape.js';
import { scrapePlattAuto } from './plattauto/scrape.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Map source names to scraper classes
const scraperMap = {
  'CarMax': {
    createScraper: async () => {
      const puppeteer = await import('puppeteer');
      const browser = await puppeteer.default.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });
      const page = await browser.newPage();
      await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

      return {
        async validateListing(url) {
          try {
            await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
            await page.waitForSelector('body', { timeout: 5000 });

            const html = await page.content();
            const cheerio = await import('cheerio');
            const $ = cheerio.load(html);

            const titleText = $('h1.vehicle-title, h1[class*="title"]').text().trim();
            if (!titleText) return null;

            const match = titleText.match(/^(\d{4})\s+([A-Za-z-]+)\s+(.+?)(?:\s+\w+(?:\s+\w+)*)?$/i);
            if (match) {
              const make = match[2];
              const remaining = match[3];
              const modelParts = remaining.split(/\s+/).slice(0, 3);
              const model = modelParts.join(' ');
              return { make, model };
            }
            return null;
          } catch (error) {
            console.error(`Error validating ${url}:`, error.message);
            return null;
          }
        },
        async close() {
          await browser.close();
        }
      };
    }
  },
  'Carvana': {
    createScraper: async () => {
      const puppeteer = await import('puppeteer');
      const puppeteerExtra = await import('puppeteer-extra');
      const StealthPlugin = (await import('puppeteer-extra-plugin-stealth')).default;

      puppeteerExtra.default.use(StealthPlugin());
      const browser = await puppeteerExtra.default.launch({ headless: true });
      const page = await browser.newPage();

      return {
        async validateListing(url) {
          try {
            await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
            await page.waitForSelector('body', { timeout: 5000 });

            const html = await page.content();
            const cheerio = await import('cheerio');
            const $ = cheerio.load(html);

            const makeModelText = $('[data-qa="base-vehicle-name"]').text().trim();
            if (!makeModelText) return null;

            const match = makeModelText.match(/^(\d{4})\s+([A-Za-z-]+)\s+(.+)$/i);
            if (match) {
              return { make: match[2], model: match[3] };
            }
            return null;
          } catch (error) {
            console.error(`Error validating ${url}:`, error.message);
            return null;
          }
        },
        async close() {
          await browser.close();
        }
      };
    }
  },
  'Platt Auto': {
    createScraper: async () => {
      const puppeteer = await import('puppeteer');
      const puppeteerExtra = await import('puppeteer-extra');
      const StealthPlugin = (await import('puppeteer-extra-plugin-stealth')).default;

      puppeteerExtra.default.use(StealthPlugin());
      const browser = await puppeteerExtra.default.launch({ headless: true });
      const page = await browser.newPage();

      return {
        async validateListing(url) {
          try {
            await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
            await page.waitForSelector('body', { timeout: 5000 });

            const html = await page.content();
            const cheerio = await import('cheerio');
            const $ = cheerio.load(html);

            const titleText = $('h1.dws-vehicle-detail-title, h1').first().text().trim();
            if (!titleText) return null;

            const match = titleText.match(/^(\d{4})\s+([A-Za-z-]+)\s+(.+)$/i);
            if (match) {
              return { make: match[2], model: match[3] };
            }
            return null;
          } catch (error) {
            console.error(`Error validating ${url}:`, error.message);
            return null;
          }
        },
        async close() {
          await browser.close();
        }
      };
    }
  }
};

async function validateAllData() {
  console.log('Starting data validation...\n');

  // Read all data files
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

        // Get appropriate scraper for this source
        const location = data.listings[0]?.location;
        if (!location || !scraperMap[location]) {
          console.log(`  ⚠ Unknown location: ${location}, skipping`);
          continue;
        }

        const scraper = await scraperMap[location].createScraper();

        try {
          // Validate a sample of listings (to avoid taking forever)
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

              // Normalize for comparison
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

              // Rate limiting
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

  // Print summary
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
    console.log('\n=== Errors ===');
    results.errors.forEach(e => {
      console.log(`${e.file}: ${e.listing?.url || 'unknown'}`);
      console.log(`  Error: ${e.error}`);
    });
  }
}

validateAllData().catch(console.error);
