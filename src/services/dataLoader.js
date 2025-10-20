export async function loadAllData() {
  // For local dev, fetch from /data directory
  // For production, fetch from GitHub raw URL or relative path

  const sources = ['mock-source']; // Start with mock, will expand
  const dates = getLast7Days();

  const promises = [];

  for (const source of sources) {
    for (const date of dates) {
      const url = `/data/${source}/${date}.json`;
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
