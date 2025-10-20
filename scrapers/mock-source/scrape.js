import fs from 'fs/promises';
import { writeJsonFile } from '../lib/file-writer.js';

export async function scrapeMockSource() {
  console.log('Scraping mock-source...');

  // Read tracked models
  const configPath = 'config/tracked-models.json';
  const configData = await fs.readFile(configPath, 'utf-8');
  const config = JSON.parse(configData);

  const listings = [];

  // Generate fake listings for each tracked model
  config.queries.forEach((query, idx) => {
    const basePrice = 30000 + (idx * 5000);
    listings.push({
      id: `mock-${idx + 1}`,
      make: query.make,
      model: query.model,
      year: 2023,
      trim: 'Base',
      price: basePrice + Math.floor(Math.random() * 5000),
      mileage: Math.floor(Math.random() * 50000),
      location: 'San Francisco, CA',
      url: `https://example.com/listing-${idx + 1}`,
      listing_date: new Date().toISOString().split('T')[0]
    });
  });

  const result = {
    source: 'mock-source',
    scraped_at: new Date().toISOString(),
    listings
  };

  await writeJsonFile('mock-source', result);

  return result;
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  scrapeMockSource().catch(console.error);
}
