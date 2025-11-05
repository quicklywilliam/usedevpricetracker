import { calculatePriceStats, calculateAverageDaysOnMarket } from '../services/dataLoader';

/**
 * Aggregate metrics for multiple groups (models or sources) across dates.
 * Handles both daily metrics and aggregation across date groups.
 *
 * @param {Array} data - Raw scraped data array
 * @param {string[]} groups - Array of group identifiers (e.g., model names or source names)
 * @param {string[]} baseDates - All original dates before aggregation
 * @param {{ dates: string[], dateGroups: Map }} dateAggregation - Result from aggregateDates()
 * @param {Function} extractListings - (dataItem, groupId) => listing[] - Extracts listings for a group
 * @returns {Map<string, Map<string, Object>>} - Map of group -> date -> metrics
 */
export const aggregateMetricsForGroups = (
  data,
  groups,
  baseDates,
  dateAggregation,
  extractListings
) => {
  const { dates, dateGroups } = dateAggregation;

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
  const dailyMetricsByGroup = {};
  groups.forEach(group => {
    dailyMetricsByGroup[group] = {};
    baseDates.forEach(date => {
      const listings = priceData[group][date];
      const count = listings.length;
      const stats = count > 0 ? calculatePriceStats(listings) : null;
      const avgDaysValue = count > 0 ? calculateAverageDaysOnMarket(data, listings, date) : null;

      dailyMetricsByGroup[group][date] = {
        count,
        avgPrice: stats ? stats.avg : null,
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
