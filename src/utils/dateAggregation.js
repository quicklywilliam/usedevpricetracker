/**
 * Date aggregation utilities for grouping dates into weekly buckets
 * when the date range exceeds a threshold.
 */

/**
 * Parse an ISO date string (YYYY-MM-DD) into a UTC Date object
 */
export const parseDateUtc = (dateStr) => {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
};

/**
 * Convert a Date object to ISO date string (YYYY-MM-DD)
 */
export const toIsoDate = (dateObj) => dateObj.toISOString().split('T')[0];

/**
 * Get the Monday of the week for a given date (as ISO string)
 */
export const getWeekStartKey = (dateStr) => {
  const date = parseDateUtc(dateStr);
  const day = date.getUTCDay();
  const diff = (day + 6) % 7;
  date.setUTCDate(date.getUTCDate() - diff);
  return toIsoDate(date);
};

/**
 * Pick the best representative date from a group of dates.
 * Prefers dates that are in the availableSet if provided.
 */
export const pickRepresentativeDate = (dates, availableSet) => {
  if (!Array.isArray(dates) || dates.length === 0) {
    return null;
  }
  if (availableSet && availableSet.size > 0) {
    for (let i = dates.length - 1; i >= 0; i--) {
      if (availableSet.has(dates[i])) {
        return dates[i];
      }
    }
  }
  return dates[dates.length - 1];
};

/**
 * Format a date range label for display (e.g., "Oct 15 - 22" or "Oct 15 - Nov 2")
 */
export const formatDateRangeLabel = (startDate, endDate) => {
  if (!startDate || !endDate) {
    return null;
  }
  const start = parseDateUtc(startDate);
  const end = parseDateUtc(endDate);
  if (startDate === endDate) {
    return start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }
  const sameMonth = start.getUTCFullYear() === end.getUTCFullYear() && start.getUTCMonth() === end.getUTCMonth();
  const startLabel = start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const endLabel = end.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  if (sameMonth) {
    return `${startLabel} – ${end.getUTCDate()}`;
  }
  return `${startLabel} – ${endLabel}`;
};

/**
 * Aggregate dates into weekly buckets when count exceeds threshold.
 * Returns aggregated dates and a map of which original dates belong to each aggregated date.
 *
 * @param {string[]} baseDates - Array of ISO date strings (YYYY-MM-DD), sorted
 * @param {string[]} availableDates - Array of dates that have available data
 * @param {number} threshold - Threshold for when to aggregate (default: 90)
 * @returns {{ dates: string[], dateGroups: Map<string, string[]> }}
 */
export const aggregateDates = (baseDates, availableDates = [], threshold = 90) => {
  const availableDateSet = new Set(availableDates);
  const dateGroups = new Map();

  if (baseDates.length <= threshold) {
    // No aggregation needed
    baseDates.forEach(date => {
      dateGroups.set(date, [date]);
    });
    return { dates: baseDates, dateGroups };
  }

  // Group by week
  const bucketMap = new Map();
  const buckets = [];

  baseDates.forEach(date => {
    const bucketKey = getWeekStartKey(date);
    let bucket = bucketMap.get(bucketKey);
    if (!bucket) {
      bucket = { dates: [] };
      bucketMap.set(bucketKey, bucket);
      buckets.push(bucket);
    }
    bucket.dates.push(date);
  });

  // Pick representative dates and build dateGroups map
  const seen = new Set();
  const dates = buckets
    .map(bucket => {
      const representative = pickRepresentativeDate(bucket.dates, availableDateSet) || bucket.dates[bucket.dates.length - 1];
      dateGroups.set(representative, bucket.dates);
      return representative;
    })
    .filter(date => {
      if (!date || seen.has(date)) {
        return false;
      }
      seen.add(date);
      return true;
    });

  return { dates, dateGroups };
};
