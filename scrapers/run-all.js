#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function runAllScrapers() {
  console.log('Starting scraper run...\n');

  // Read tracked models
  const configPath = path.join(__dirname, '..', 'config', 'tracked-models.json');
  const configData = await fs.readFile(configPath, 'utf-8');
  const { queries } = JSON.parse(configData);

  // Get list of available scrapers
  const scrapersDir = __dirname;
  const entries = await fs.readdir(scrapersDir, { withFileTypes: true });

  const scrapers = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name === 'lib') continue;

    const scraperConfigPath = path.join(scrapersDir, entry.name, 'config.json');
    const scrapePath = path.join(scrapersDir, entry.name, 'scrape.js');

    try {
      await fs.access(scraperConfigPath);
      await fs.access(scrapePath);

      const scraperConfig = JSON.parse(await fs.readFile(scraperConfigPath, 'utf-8'));

      if (scraperConfig.enabled) {
        const scraper = await import(scrapePath);
        const scraperFn = Object.values(scraper).find(v => typeof v === 'function');

        if (scraperFn) {
          scrapers.push({
            name: entry.name,
            fn: scraperFn
          });
        }
      } else {
        console.log(`⊘ Skipping ${entry.name} (disabled in config)`);
      }
    } catch (error) {
      console.log(`⊘ Skipping ${entry.name} (${error.message})`);
    }
  }

  const results = {
    succeeded: [],
    failed: []
  };

  // Iterate models first, then sources
  for (const query of queries) {
    console.log(`\n=== Processing ${query.make} ${query.model} ===\n`);

    for (const scraper of scrapers) {
      try {
        console.log(`  Running ${scraper.name}...`);
        await scraper.fn(query);
        results.succeeded.push(`${scraper.name}:${query.make} ${query.model}`);
      } catch (error) {
        console.error(`  ✗ ${scraper.name} failed:`, error.message);
        results.failed.push(`${scraper.name}:${query.make} ${query.model}`);
      }
    }
  }

  // Summary
  console.log('\n--- Summary ---');
  console.log(`✓ Succeeded: ${results.succeeded.length}`);
  console.log(`✗ Failed: ${results.failed.length}`);
  if (results.failed.length > 0) {
    console.log(`Failed: ${results.failed.join(', ')}`);
  }

  return results;
}

runAllScrapers().catch(console.error);
