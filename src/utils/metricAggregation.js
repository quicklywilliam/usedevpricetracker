import { calculatePriceStats, calculateAverageDaysOnMarket, buildListingDateIndex } from '../services/dataLoader';

// Configuration for normalized averaging
const BASELINE_WINDOW_DAYS = 14; // Reduced from 30 for better performance
const MIN_TRIM_THRESHOLD = 0.03; // 3% minimum presence to include trim
const MIN_BASELINE_DAYS = 7;

/**
 * Calculate the baseline trim distribution for a group over a rolling window.
 *
 * @param {Array} data - Raw scraped data array
 * @param {string} group - Group identifier (e.g., model name)
 * @param {string[]} windowDates - Dates within the baseline window
 * @param {Function} extractListings - Function to extract listings for this group
 * @returns {Object} - Map of normalized_trim -> weight (e.g., { 'SEL': 0.40, 'Limited': 0.35 })
 */
const calculateTrimBaselineInternal = (data, group, windowDates, extractListings) => {
  // Count trim occurrences across the window
  const trimCounts = {};
  let totalCount = 0;

  // Create a Set for faster date lookup
  const windowDateSet = new Set(windowDates);

  data.forEach(sourceData => {
    const date = sourceData.scraped_at.split('T')[0];
    if (!windowDateSet.has(date)) return;

    const listings = extractListings(sourceData, group);
    listings.forEach(listing => {
      const trim = listing.normalized_trim;
      if (trim) {
        trimCounts[trim] = (trimCounts[trim] || 0) + 1;
        totalCount++;
      }
    });
  });

  if (totalCount === 0) return null;

  // Calculate percentages and filter out trims below threshold
  const baseline = {};
  Object.entries(trimCounts).forEach(([trim, count]) => {
    const percentage = count / totalCount;
    if (percentage >= MIN_TRIM_THRESHOLD) {
      baseline[trim] = percentage;
    }
  });

  // Renormalize to sum to 1.0 after filtering
  const sumWeights = Object.values(baseline).reduce((sum, weight) => sum + weight, 0);
  if (sumWeights > 0) {
    Object.keys(baseline).forEach(trim => {
      baseline[trim] = baseline[trim] / sumWeights;
    });
  }

  return Object.keys(baseline).length > 0 ? baseline : null;
};

/**
 * Calculate normalized average price using baseline trim distribution.
 * Optimized to minimize iterations.
 *
 * @param {Array} listings - Listings for this date/group
 * @param {Object} baseline - Baseline trim distribution (trim -> weight)
 * @returns {number|null} - Normalized average price, or null if can't calculate
 */
export const calculateNormalizedAverage = (listings, baseline) => {
  if (!baseline || Object.keys(baseline).length === 0) return null;
  if (!listings || listings.length === 0) return null;

  // Single pass: group by trim and calculate sum/count simultaneously
  const trimStats = {};

  for (let i = 0; i < listings.length; i++) {
    const listing = listings[i];
    const trim = listing.normalized_trim;

    if (trim && baseline[trim]) {
      if (!trimStats[trim]) {
        trimStats[trim] = { sum: 0, count: 0 };
      }
      trimStats[trim].sum += listing.price;
      trimStats[trim].count++;
    }
  }

  // Calculate weighted average using baseline weights
  let weightedSum = 0;
  let totalWeight = 0;

  for (const trim in baseline) {
    const stats = trimStats[trim];
    if (stats && stats.count > 0) {
      const avg = stats.sum / stats.count;
      weightedSum += avg * baseline[trim];
      totalWeight += baseline[trim];
    }
  }

  // Renormalize if some trims are missing
  if (totalWeight === 0) return null;
  return Math.round(weightedSum / totalWeight);
};

/**
 * Aggregate metrics for multiple groups (models or sources) across dates.
 * Handles both daily metrics and aggregation across date groups.
 *
 * @param {Array} data - Raw scraped data array
 * @param {string[]} groups - Array of group identifiers (e.g., model names or source names)
 * @param {string[]} baseDates - All original dates before aggregation
 * @param {{ dates: string[], dateGroups: Map }} dateAggregation - Result from aggregateDates()
 * @param {Function} extractListings - (dataItem, groupId) => listing[] - Extracts listings for a group
 * @param {string} averageMode - 'raw' or 'normalized' - Type of averaging to use
 * @returns {Map<string, Map<string, Object>>} - Map of group -> date -> metrics
 */
export const aggregateMetricsForGroups = (
  data,
  groups,
  baseDates,
  dateAggregation,
  extractListings,
  averageMode = 'raw',
  skipExpensiveCalculations = false
) => {
  const { dates, dateGroups } = dateAggregation;

  // Step 0: Calculate trim baselines for normalized mode in a single pass
  const trimBaselines = {};
  if (averageMode === 'normalized') {
    // Get the most recent dates within the baseline window
    const windowDates = baseDates.slice(-BASELINE_WINDOW_DAYS);

    // If we don't have enough data, skip baseline calculation (will fall back to raw average)
    if (windowDates.length >= MIN_BASELINE_DAYS) {
      const windowDateSet = new Set(windowDates);

      // Pre-filter data to only window dates for better performance
      const windowData = data.filter(sourceData => {
        const date = sourceData.scraped_at.split('T')[0];
        return windowDateSet.has(date);
      });

      // Count trim occurrences for all groups in one pass
      const trimCountsByGroup = {};
      const totalCountsByGroup = {};

      groups.forEach(group => {
        trimCountsByGroup[group] = {};
        totalCountsByGroup[group] = 0;
      });

      windowData.forEach(sourceData => {
        groups.forEach(group => {
          const listings = extractListings(sourceData, group);
          listings.forEach(listing => {
            const trim = listing.normalized_trim;
            if (trim) {
              if (!trimCountsByGroup[group][trim]) {
                trimCountsByGroup[group][trim] = 0;
              }
              trimCountsByGroup[group][trim]++;
              totalCountsByGroup[group]++;
            }
          });
        });
      });

      // Calculate baselines for each group
      groups.forEach(group => {
        const trimCounts = trimCountsByGroup[group];
        const totalCount = totalCountsByGroup[group];

        if (totalCount === 0) return;

        // Calculate percentages and filter out trims below threshold
        const baseline = {};
        Object.entries(trimCounts).forEach(([trim, count]) => {
          const percentage = count / totalCount;
          if (percentage >= MIN_TRIM_THRESHOLD) {
            baseline[trim] = percentage;
          }
        });

        // Renormalize to sum to 1.0 after filtering
        const sumWeights = Object.values(baseline).reduce((sum, weight) => sum + weight, 0);
        if (sumWeights > 0) {
          Object.keys(baseline).forEach(trim => {
            baseline[trim] = baseline[trim] / sumWeights;
          });

          if (Object.keys(baseline).length > 0) {
            trimBaselines[group] = baseline;
          }
        }
      });
    }
  }

  // Step 1: Organize raw data into buckets by group and base date
  const priceData = {};
  groups.forEach(group => {
    priceData[group] = {};
    baseDates.forEach(date => {
      priceData[group][date] = [];
    });
  });

  data.forEach(sourceData => {
    const date = sourceData.scraped_at.split('T')[0];
    groups.forEach(group => {
      const listings = extractListings(sourceData, group);
      if (priceData[group] && priceData[group][date]) {
        priceData[group][date].push(...listings);
      }
    });
  });

  // Step 2: Calculate daily metrics for each group
  // Build listing date index ONCE for all avgDays calculations
  const listingIndex = !skipExpensiveCalculations ? buildListingDateIndex(data) : null;

  const dailyMetricsByGroup = {};
  groups.forEach(group => {
    dailyMetricsByGroup[group] = {};
    const baseline = trimBaselines[group];

    baseDates.forEach(date => {
      const listings = priceData[group][date];
      const count = listings.length;
      const stats = count > 0 ? calculatePriceStats(listings) : null;

      // Skip expensive "days on market" calculation during loading
      const avgDaysValue = (count > 0 && !skipExpensiveCalculations)
        ? calculateAverageDaysOnMarket(data, listings, date, listingIndex)
        : null;

      // Calculate average price based on mode
      let avgPrice = null;
      if (count > 0) {
        if (averageMode === 'normalized' && baseline) {
          avgPrice = calculateNormalizedAverage(listings, baseline);
          // Fall back to raw average if normalized calculation fails
          if (avgPrice === null && stats) {
            avgPrice = stats.avg;
          }
        } else {
          avgPrice = stats ? stats.avg : null;
        }
      }

      dailyMetricsByGroup[group][date] = {
        count,
        avgPrice,
        minPrice: stats ? stats.min : null,
        maxPrice: stats ? stats.max : null,
        avgDays: avgDaysValue
      };
    });
  });

  // Step 3: Aggregate metrics across date groups
  const aggregatedMetricsByGroup = new Map();

  groups.forEach(group => {
    const metricsMap = new Map();
    aggregatedMetricsByGroup.set(group, metricsMap);

    dates.forEach(date => {
      const groupedDates = dateGroups.get(date) || [date];

      let weightedPriceSum = 0;
      let totalCount = 0;
      let maxDailyCount = 0;
      let samplesWithData = 0;
      let minPrice = Infinity;
      let maxPrice = -Infinity;
      const avgDayValues = [];

      groupedDates.forEach(groupDate => {
        const metrics = dailyMetricsByGroup[group][groupDate];
        if (!metrics) {
          return;
        }

        if (metrics.count > 0 && metrics.avgPrice !== null) {
          weightedPriceSum += metrics.avgPrice * metrics.count;
          totalCount += metrics.count;
          minPrice = Math.min(minPrice, metrics.minPrice);
          maxPrice = Math.max(maxPrice, metrics.maxPrice);
          maxDailyCount = Math.max(maxDailyCount, metrics.count);
          samplesWithData += 1;
        }

        if (metrics.avgDays !== null) {
          avgDayValues.push(metrics.avgDays);
        }
      });

      const avgPrice = totalCount > 0 ? weightedPriceSum / totalCount : null;
      const avgCount = samplesWithData > 0 ? totalCount / samplesWithData : 0;
      const avgDaysValue = avgDayValues.length > 0
        ? Math.round(avgDayValues.reduce((sum, val) => sum + val, 0) / avgDayValues.length)
        : null;

      metricsMap.set(date, {
        avgPrice,
        minPrice: Number.isFinite(minPrice) ? minPrice : null,
        maxPrice: Number.isFinite(maxPrice) ? maxPrice : null,
        avgCount,
        maxCount: maxDailyCount,
        avgDays: avgDaysValue,
        hasData: avgPrice !== null,
        groupedDates
      });
    });
  });

  return aggregatedMetricsByGroup;
};

/**
 * Collect all counts and avgDays values from aggregated metrics for scaling.
 *
 * @param {Map<string, Map<string, Object>>} aggregatedMetrics
 * @returns {{ allCounts: number[], allAvgDays: number[] }}
 */
export const collectScalingValues = (aggregatedMetrics) => {
  const allCounts = [];
  const allAvgDays = [];

  aggregatedMetrics.forEach(metricsMap => {
    metricsMap.forEach(metrics => {
      if (metrics.avgCount > 0) {
        allCounts.push(metrics.avgCount);
      }
      if (metrics.avgDays !== null) {
        allAvgDays.push(metrics.avgDays);
      }
    });
  });

  return { allCounts, allAvgDays };
};
