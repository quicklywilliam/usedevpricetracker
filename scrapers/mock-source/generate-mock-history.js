import fs from 'fs/promises';
import path from 'path';

// Generate mock data for the past 7 days
const DAYS_OF_HISTORY = 7;

const queries = [
  { make: 'Hyundai', model: 'Ioniq 5' },
  { make: 'Tesla', model: 'Model 3' },
  { make: 'Kia', model: 'EV6' },
  { make: 'Volkswagen', model: 'ID.4' },
  { make: 'Nissan', model: 'Ariya' },
  { make: 'Ford', model: 'Mustang Mach-E' },
  { make: 'Chevrolet', model: 'Bolt EV' },
  { make: 'Chevrolet', model: 'Bolt EUV' },
  { make: 'Chevrolet', model: 'Equinox EV' },
  { make: 'Honda', model: 'Prologue' },
  { make: 'Audi', model: 'Q4 e-tron' }
];

function getDateDaysAgo(daysAgo) {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  return date.toISOString().split('T')[0];
}

function generateMockListing(query, basePrice, date) {
  // Add some random variation to prices over time
  const priceVariation = Math.floor(Math.random() * 2000) - 1000; // -$1000 to +$1000

  return {
    id: `mock-${query.make}-${query.model}-${date}-${Date.now()}`,
    make: query.make,
    model: query.model,
    year: 2023,
    trim: 'Base',
    price: basePrice + priceVariation,
    mileage: Math.floor(Math.random() * 50000),
    location: 'San Francisco, CA',
    url: `https://example.com/listing-${Date.now()}`,
    listing_date: date
  };
}

async function generateHistoricalData() {
  console.log(`Generating ${DAYS_OF_HISTORY} days of mock data...\n`);

  const basePrice = 30000;

  for (let daysAgo = DAYS_OF_HISTORY - 1; daysAgo >= 0; daysAgo--) {
    const date = getDateDaysAgo(daysAgo);
    console.log(`Generating data for ${date}...`);

    const allListings = [];

    for (const query of queries) {
      const listing = generateMockListing(query, basePrice, date);
      allListings.push(listing);
    }

    // Write to file
    const dirPath = path.join(process.cwd(), 'data', 'mock-source');
    const filePath = path.join(dirPath, `${date}.json`);

    await fs.mkdir(dirPath, { recursive: true });

    const fileData = {
      source: 'mock-source',
      scraped_at: new Date(date).toISOString(),
      listings: allListings
    };

    await fs.writeFile(filePath, JSON.stringify(fileData, null, 2));
    console.log(`  ✓ Created ${filePath} with ${allListings.length} listings`);
  }

  console.log('\n✓ Mock history generation complete!');
}

generateHistoricalData().catch(console.error);
