#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function runAllScrapers() {
  // Check for --source argument
  const sourceArg = process.argv.find(arg => arg.startsWith('--source='));
  const targetSource = sourceArg ? sourceArg.split('=')[1] : null;

  // Check for --models argument (comma-separated list)
  const modelsArg = process.argv.find(arg => arg.startsWith('--models='));
  const targetModels = modelsArg ? modelsArg.split('=')[1].split(',').map(m => m.trim()) : null;

  // Check for --limit argument
  const limitArg = process.argv.find(arg => arg.startsWith('--limit='));
  const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) : null;

  if (targetSource) {
    console.log(`Starting scraper run for ${targetSource}...\n`);
  } else {
    console.log('Starting scraper run...\n');
  }

  if (targetModels) {
    console.log(`Filtering models: ${targetModels.join(', ')}\n`);
  }

  if (limit) {
    console.log(`Limiting to ${limit} vehicles per model\n`);
  }

  // Read tracked models
  const configPath = path.join(__dirname, '..', 'config', 'tracked-models.json');
  const configData = await fs.readFile(configPath, 'utf-8');
  let { queries } = JSON.parse(configData);

  // Filter queries if --models is specified
  if (targetModels) {
    queries = queries.filter(q => {
      const modelName = q.model.toLowerCase().replace(/\s+/g, '');
      return targetModels.some(tm =>
        modelName.includes(tm.toLowerCase().replace(/\s+/g, '')) ||
        tm.toLowerCase().replace(/\s+/g, '').includes(modelName)
      );
    });
  }

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

      // Skip if targeting specific source and this isn't it
      if (targetSource && entry.name !== targetSource) {
        continue;
      }

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
        const options = limit ? { limit } : {};
        await scraper.fn(query, options);
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
