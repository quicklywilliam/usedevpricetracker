export async function loadAllData() {
  // For local dev, fetch from /data directory
  // For production, fetch from GitHub raw URL or relative path

  const sources = ['carmax', 'carvana', 'plattauto'];

  // Add mock-source in development mode only
  if (import.meta.env.DEV) {
    sources.push('mock-source');
  }

  const dates = getLast7Days();

  const promises = [];

  const baseUrl = import.meta.env.BASE_URL || '/';

  for (const source of sources) {
    for (const date of dates) {
      const url = `${baseUrl}data/${source}/${date}.json`;
      promises.push(
        fetch(url)
          .then(r => r.ok ? r.json() : null)
          .catch(() => null)
      );
    }
  }

  const results = await Promise.all(promises);
  return results.filter(r => r !== null);
}

function getLast7Days() {
  const dates = [];
  for (let i = 0; i < 7; i++) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    dates.push(date.toISOString().split('T')[0]);
  }
  return dates;
}

export function getModelKey(listing) {
  return `${listing.make} ${listing.model}`;
}

export function calculateAveragePrice(listings) {
  if (listings.length === 0) return 0;
  const sum = listings.reduce((acc, l) => acc + l.price, 0);
  return Math.round(sum / listings.length);
}

export function calculatePriceStats(listings) {
  if (listings.length === 0) return null;
  const prices = listings.map(l => l.price);
  return {
    min: Math.min(...prices),
    max: Math.max(...prices),
    avg: calculateAveragePrice(listings)
  };
}

export function findNewListings(allData) {
  if (allData.length === 0) return [];

  // Get all unique dates and sort them (most recent first)
  const dates = [...new Set(allData.map(d => d.scraped_at.split('T')[0]))].sort().reverse();

  if (dates.length < 2) {
    // If we only have one date, all listings are "new"
    return allData
      .flatMap(d => d.listings.map(listing => ({ ...listing, source: d.source })))
      .sort((a, b) => b.price - a.price);
  }

  const mostRecentDate = dates[0];
  const previousDate = dates[1];

  // Get all listings from most recent date (include source)
  const recentListings = allData
    .filter(d => d.scraped_at.startsWith(mostRecentDate))
    .flatMap(d => d.listings.map(listing => ({ ...listing, source: d.source })));

  // Get all listings from previous date
  const previousListings = allData
    .filter(d => d.scraped_at.startsWith(previousDate))
    .flatMap(d => d.listings);

  // Create a Set of previous IDs for fast lookup
  const previousIds = new Set(previousListings.map(l => l.id));

  // Find listings that exist in recent but not in previous
  const newListings = recentListings.filter(l => !previousIds.has(l.id));

  // Sort by price (descending)
  return newListings.sort((a, b) => b.price - a.price);
}

export function findListingsWithPriceChanges(allData) {
  if (allData.length === 0) return [];

  // Get all unique dates and sort them (most recent first)
  const dates = [...new Set(allData.map(d => d.scraped_at.split('T')[0]))].sort().reverse();

  if (dates.length < 2) {
    return [];
  }

  const mostRecentDate = dates[0];
  const previousDate = dates[1];

  // Get all listings from most recent date (include source)
  const recentListings = allData
    .filter(d => d.scraped_at.startsWith(mostRecentDate))
    .flatMap(d => d.listings.map(listing => ({ ...listing, source: d.source })));

  // Get all listings from previous date (include source and create map)
  const previousListingsMap = new Map();
  allData
    .filter(d => d.scraped_at.startsWith(previousDate))
    .flatMap(d => d.listings.map(listing => ({ ...listing, source: d.source })))
    .forEach(listing => {
      previousListingsMap.set(listing.id, listing);
    });

  // Find listings that exist in both and have price changes
  const changedListings = recentListings
    .filter(listing => {
      const previousListing = previousListingsMap.get(listing.id);
      return previousListing && previousListing.price !== listing.price;
    })
    .map(listing => {
      const previousListing = previousListingsMap.get(listing.id);
      return {
        ...listing,
        priceChange: listing.price - previousListing.price,
        previousPrice: previousListing.price
      };
    });

  // Sort by absolute price change (descending)
  return changedListings.sort((a, b) => Math.abs(b.priceChange) - Math.abs(a.priceChange));
}
