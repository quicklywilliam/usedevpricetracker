const DEFAULT_MAX_DAYS = 7;
const DEFAULT_MISSING_STREAK_THRESHOLD = 120;

/**
 * Progressively load data starting from most recent dates
 * @param {number} maxDays - Maximum number of days to load
 * @param {Object} options - Options for loading
 * @param {Function} options.onProgress - Callback called with incremental results as they arrive
 * @param {number} options.missingStreakThreshold - Stop loading after this many consecutive missing days
 * @param {number} options.batchSize - Number of dates to load per batch (default 7)
 * @param {Function} options.filterListings - Optional function to filter listings (listing => boolean)
 * @returns {Promise<Array>} All loaded data
 */
export async function loadAllData(maxDays = DEFAULT_MAX_DAYS, options = {}) {
  const sources = ['autotrader', 'carmax', 'carvana', 'plattauto'];

  // Add mock-source in development mode only
  if (import.meta.env.DEV) {
    sources.push('mock-source');
  }

  const daysToFetch = Math.max(1, Number.isFinite(maxDays) ? Math.floor(maxDays) : DEFAULT_MAX_DAYS);
  const dates = getLastNDays(daysToFetch);

  const missingThreshold = Math.max(
    1,
    Number.isFinite(options.missingStreakThreshold)
      ? Math.floor(options.missingStreakThreshold)
      : DEFAULT_MISSING_STREAK_THRESHOLD
  );

  const batchSize = options.batchSize || 7;
  const onProgress = options.onProgress;
  const filterListings = options.filterListings;
  const baseUrl = import.meta.env.BASE_URL || '/';

  const allResults = [];

  // Process dates in batches (most recent first)
  for (let batchStart = 0; batchStart < dates.length; batchStart += batchSize) {
    const batchDates = dates.slice(batchStart, batchStart + batchSize);

    // Load all sources for this batch in parallel
    const batchResults = await Promise.all(
      sources.map(async (source) => {
        const sourceResults = [];
        let missingStreak = 0;

        for (const date of batchDates) {
          const url = `${baseUrl}data/${source}/${date}.json`;

          try {
            const response = await fetch(url);
            if (!response.ok) {
              missingStreak += 1;
              if (missingStreak >= missingThreshold) {
                break;
              }
              continue;
            }

            const json = await response.json();
            if (json) {
              // Filter listings if filter function provided
              if (filterListings && Array.isArray(json.listings)) {
                const filteredListings = json.listings.filter(filterListings);
                // Only include this data if it has listings after filtering
                if (filteredListings.length > 0) {
                  sourceResults.push({
                    ...json,
                    listings: filteredListings
                  });
                }
              } else {
                sourceResults.push(json);
              }
              missingStreak = 0;
            } else {
              missingStreak += 1;
              if (missingStreak >= missingThreshold) {
                break;
              }
            }
          } catch (err) {
            missingStreak += 1;
            if (missingStreak >= missingThreshold) {
              break;
            }
          }
        }

        return sourceResults;
      })
    );

    const batchFlat = batchResults.flat();
    allResults.push(...batchFlat);

    // Call progress callback if provided
    if (onProgress && batchFlat.length > 0) {
      onProgress([...allResults]);
    }

    // If all sources had no data for this batch, we can stop early
    if (batchFlat.length === 0) {
      break;
    }
  }

  return allResults;
}

function getLastNDays(count) {
  const dates = [];
  for (let i = 0; i < count; i++) {
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

export function findNewListings(allData, targetDate = null) {
  if (allData.length === 0) return [];

  // Get all unique dates and sort them (most recent first)
  const dates = [...new Set(allData.map(d => d.scraped_at.split('T')[0]))].sort().reverse();

  if (dates.length < 2) {
    // If we only have one date, all listings are "new"
    return allData
      .flatMap(d => d.listings.map(listing => ({ ...listing, source: d.source })))
      .sort((a, b) => b.price - a.price);
  }

  // Use targetDate if provided, otherwise use most recent
  const mostRecentDate = targetDate || dates[0];
  const dateIndex = dates.indexOf(mostRecentDate);
  const previousDate = dateIndex >= 0 && dateIndex < dates.length - 1 ? dates[dateIndex + 1] : null;

  if (!previousDate) {
    // If no previous date, return all listings for this date as "new"
    return allData
      .filter(d => d.scraped_at.startsWith(mostRecentDate))
      .flatMap(d => d.listings.map(listing => ({ ...listing, source: d.source })))
      .sort((a, b) => b.price - a.price);
  }

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

export function findListingsWithPriceChanges(allData, targetDate = null) {
  if (allData.length === 0) return [];

  // Get all unique dates and sort them (most recent first)
  const dates = [...new Set(allData.map(d => d.scraped_at.split('T')[0]))].sort().reverse();

  if (dates.length < 2) {
    return [];
  }

  // Use targetDate if provided, otherwise use most recent
  const mostRecentDate = targetDate || dates[0];
  const dateIndex = dates.indexOf(mostRecentDate);
  const previousDate = dateIndex >= 0 && dateIndex < dates.length - 1 ? dates[dateIndex + 1] : null;

  if (!previousDate) {
    return [];
  }

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

/**
 * Check if a model exceeded the max vehicle count for any source on a given date
 * @param {Array} allData - All data from all sources
 * @param {string} make - Make of the vehicle
 * @param {string} model - Model of the vehicle
 * @param {string} date - Date to check (YYYY-MM-DD format)
 * @returns {boolean} True if any source exceeded max for this model on this date
 */
export function modelExceededMaxOnDate(allData, make, model, date) {
  const dataForDate = allData.filter(d => d.scraped_at.startsWith(date));

  return dataForDate.some(sourceData => {
    const exceededModels = sourceData.models_exceeded_max_vehicles || [];
    return exceededModels.some(m => m.make === make && m.model === model);
  });
}

/**
 * Check if a specific source/make/model exceeded max on a given date
 * @param {Array} allData - All data from all sources
 * @param {string} source - Source name (e.g., 'carmax', 'carvana')
 * @param {string} make - Make of the vehicle
 * @param {string} model - Model of the vehicle
 * @param {string} date - Date to check (YYYY-MM-DD format)
 * @returns {boolean} True if this specific source exceeded max for this model on this date
 */
function sourceModelExceededMaxOnDate(allData, source, make, model, date) {
  const dataForSourceAndDate = allData.find(
    d => d.source === source && d.scraped_at.startsWith(date)
  );

  if (!dataForSourceAndDate) return false;

  const exceededModels = dataForSourceAndDate.models_exceeded_max_vehicles || [];
  return exceededModels.some(m => m.make === make && m.model === model);
}

/**
 * Find vehicles that have been confirmed as sold or are selling via URL validation
 * @param {Array} allData - All data from all sources
 * @param {string} targetDate - Optional target date (defaults to most recent)
 * @returns {Array} Array of sold/selling listings with source info and displayStatus
 */
export function findSoldListings(allData, targetDate = null) {
  if (allData.length === 0) return [];

  // Get the most recent date or use targetDate
  const dates = [...new Set(allData.map(d => d.scraped_at.split('T')[0]))].sort().reverse();
  const mostRecentDate = targetDate || dates[0];

  // Get all listings from target date that have purchase_status === 'sold' or 'selling'
  const soldListings = [];

  allData
    .filter(d => d.scraped_at.startsWith(mostRecentDate))
    .forEach(sourceData => {
      sourceData.listings.forEach(listing => {
        if (listing.purchase_status === 'sold' || listing.purchase_status === 'selling') {
          soldListings.push({
            ...listing,
            source: sourceData.source,
            displayStatus: listing.purchase_status === 'selling' ? 'Sale Pending' : 'Sold'
          });
        }
      });
    });

  // Sort by status first (selling before sold), then by price (descending)
  return soldListings.sort((a, b) => {
    if (a.purchase_status === 'selling' && b.purchase_status === 'sold') return -1;
    if (a.purchase_status === 'sold' && b.purchase_status === 'selling') return 1;
    return b.price - a.price;
  });
}

/**
 * Find vehicles that are currently selling (reserved, purchase in progress, etc.)
 * @param {Array} allData - All data from all sources
 * @returns {Array} Array of selling listings with source info
 */
export function findSellingListings(allData) {
  if (allData.length === 0) return [];

  // Get the most recent date
  const dates = [...new Set(allData.map(d => d.scraped_at.split('T')[0]))].sort().reverse();
  const mostRecentDate = dates[0];

  // Get all listings from most recent date that have purchase_status === 'selling'
  const sellingListings = [];

  allData
    .filter(d => d.scraped_at.startsWith(mostRecentDate))
    .forEach(sourceData => {
      sourceData.listings.forEach(listing => {
        if (listing.purchase_status === 'selling') {
          sellingListings.push({
            ...listing,
            source: sourceData.source
          });
        }
      });
    });

  // Sort by price (descending)
  return sellingListings.sort((a, b) => b.price - a.price);
}

/**
 * Calculate days on market for a listing
 * @param {Array} allData - All data from all sources
 * @param {string} listingId - The listing ID
 * @param {string} source - The source name
 * @param {string} targetDate - The date to calculate from (YYYY-MM-DD format)
 * @param {string} purchaseStatus - Current purchase status
 * @returns {number|null} Days on market or null if can't be calculated
 */
export function calculateDaysOnMarket(allData, listingId, source, targetDate, purchaseStatus) {
  // Get all dates, sorted oldest to newest
  const dates = [...new Set(allData.map(d => d.scraped_at.split('T')[0]))].sort();

  // Find first date this listing appeared
  let firstSeenDate = null;
  let statusChangeDate = null;

  for (const date of dates) {
    const dataForDate = allData.filter(
      d => d.source === source && d.scraped_at.startsWith(date)
    );

    for (const sourceData of dataForDate) {
      const listing = sourceData.listings.find(l => l.id === listingId);

      if (listing) {
        if (!firstSeenDate) {
          firstSeenDate = date;
        }

        // Track when status changed to selling or sold
        if ((listing.purchase_status === 'selling' || listing.purchase_status === 'sold') && !statusChangeDate) {
          statusChangeDate = date;
        }
      }
    }
  }

  if (!firstSeenDate) return null;

  // Calculate end date based on status
  let endDate;
  if (purchaseStatus === 'selling' || purchaseStatus === 'sold') {
    // Use the date when status first changed
    endDate = statusChangeDate || targetDate;
  } else {
    // For available vehicles, use target date
    endDate = targetDate;
  }

  // Calculate days difference
  const firstDate = new Date(firstSeenDate);
  const lastDate = new Date(endDate);
  const diffTime = Math.abs(lastDate - firstDate);
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  return diffDays;
}

/**
 * Calculate average days on market for a set of listings
 * @param {Array} allData - All data from all sources
 * @param {Array} listings - Array of listings
 * @param {string} targetDate - The date to calculate from
 * @returns {number|null} Average days on market
 */
export function calculateAverageDaysOnMarket(allData, listings, targetDate) {
  if (!listings || listings.length === 0) return null;

  const daysOnMarket = listings.map(listing =>
    calculateDaysOnMarket(allData, listing.id, listing.source, targetDate, listing.purchase_status)
  ).filter(days => days !== null);

  if (daysOnMarket.length === 0) return null;

  return Math.round(daysOnMarket.reduce((sum, days) => sum + days, 0) / daysOnMarket.length);
}
