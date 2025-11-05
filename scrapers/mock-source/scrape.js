import { appendListings } from '../lib/file-writer.js';

export async function scrapeMockSource(query, options = {}) {
  // Generate a fake listing for the model
  const basePrice = 30000;
  const listing = {
    id: `mock-${query.make}-${query.model}-${Date.now()}`,
    make: query.make,
    model: query.model,
    year: 2023,
    trim: 'Base',
    price: basePrice + Math.floor(Math.random() * 5000),
    mileage: Math.floor(Math.random() * 50000),
    location: 'San Francisco, CA',
    url: `https://example.com/listing-${Date.now()}`,
    listing_date: new Date().toISOString().split('T')[0]
  };

  await appendListings('mock-source', [listing]);
  return [listing];
}
