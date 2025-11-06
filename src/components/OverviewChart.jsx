import React, { useMemo } from 'react';
import PriceRangeChart from './PriceRangeChart';
import { getModelKey } from '../services/dataLoader';
import { aggregateDates } from '../utils/dateAggregation';
import { aggregateMetricsForGroups, collectScalingValues } from '../utils/metricAggregation';
import { createInventoryScale } from '../utils/inventoryScale';

const modelColors = {
  // Mid-range category
  'Hyundai Ioniq 5': '#667eea',     // indigo
  'Tesla Model 3': '#f59e0b',       // amber
  'Kia EV6': '#10b981',             // emerald
  'Volkswagen ID.4': '#ec4899',     // pink
  'Nissan Ariya': '#8b5cf6',        // violet
  'Ford Mustang Mach-E': '#0ea5e9', // sky blue
  'Chevrolet Equinox EV': '#f97316', // orange
  'Honda Prologue': '#14b8a6',      // teal
  'Audi Q4 e-tron': '#d946ef',      // fuchsia
  'Tesla Model Y': '#dc2626',       // red

  // Cheap category
  'Volkswagen e-Golf': '#1d4ed8',   // blue
  'BMW i3': '#06b6d4',              // cyan
  'Chevrolet Bolt EV': '#ef4444',   // bright red
  'Chevrolet Bolt EUV': '#84cc16',  // lime
  'Kia Niro EV': '#a855f7',         // purple
  'Hyundai Kona Electric': '#f59e0b', // amber
  'Nissan Leaf': '#ec4899',         // pink

  // Luxury category
  'BMW i4': '#0891b2',              // dark cyan
  'BMW i5': '#7c3aed',              // deep purple
  'Tesla Model S': '#fbbf24',       // yellow
  'Tesla Model X': '#fb923c',       // orange
  'Rivian R1T': '#22c55e',          // green
  'Rivian R1S': '#ec4899'           // pink
};

const toRgba = (hex, alpha) => {
  if (!hex) return `rgba(102, 102, 102, ${alpha})`;
  let normalized = hex.replace('#', '');
  if (normalized.length === 3) {
    normalized = normalized.split('').map(ch => ch + ch).join('');
  }
  if (normalized.length !== 6) return `rgba(102, 102, 102, ${alpha})`;
  const intVal = parseInt(normalized, 16);
  const r = (intVal >> 16) & 255;
  const g = (intVal >> 8) & 255;
  const b = intVal & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

export default function OverviewChart({
  data,
  onModelSelect,
  onDateSelect,
  selectedDate,
  timeRangeId,
  onTimeRangeChange,
  timeRangeOptions,
  dateLabels,
  availableDates,
  loading = false,
  onSelectedDatePosition
}) {
  const { datasets, dates } = useMemo(() => {
    if (!data || data.length === 0) {
      return { datasets: [], dates: [] };
    }

    // Extract models and dates
    const models = [...new Set(data.flatMap(d => d.listings.map(getModelKey)))];
    const providedDates = Array.isArray(dateLabels) && dateLabels.length > 0
      ? [...dateLabels]
      : null;
    const baseDates = providedDates
      ? [...providedDates]
      : [...new Set(data.map(d => d.scraped_at.split('T')[0]))].sort();

    // Aggregate dates into weekly buckets if needed
    const dateAggregation = aggregateDates(baseDates, availableDates);
    const { dates, dateGroups } = dateAggregation;

    // Aggregate metrics for all models
    const aggregatedMetrics = aggregateMetricsForGroups(
      data,
      models,
      baseDates,
      dateAggregation,
      (sourceData, model) => {
        return sourceData.listings
          .filter(l => getModelKey(l) === model)
          .map(listing => ({ ...listing, source: sourceData.source }));
      }
    );

    // Collect scaling values for point sizes
    const { allCounts, allAvgDays } = collectScalingValues(aggregatedMetrics);
    const getPointSizeFromStock = createInventoryScale(allCounts);
    const getPointSizeFromDays = allAvgDays.length > 0
      ? createInventoryScale(allAvgDays)
      : () => 5;

    // Transform metrics into datasets
    const datasets = models.map(model => {
      const metricsMap = aggregatedMetrics.get(model);

      const avgPoints = [];
      const minPoints = [];
      const maxPoints = [];
      const pointRadiiStock = [];
      const pointRadiiDays = [];
      const avgCountsSeries = [];
      const maxCountsSeries = [];
      const avgDaysSeries = [];
      const groupedDatesSeries = [];

      dates.forEach(date => {
        const metrics = metricsMap.get(date);
        const grouped = metrics?.groupedDates ?? dateGroups.get(date) ?? [date];
        groupedDatesSeries.push(grouped);

        if (!metrics || !metrics.hasData) {
          avgPoints.push(null);
          minPoints.push(null);
          maxPoints.push(null);
          pointRadiiStock.push(5);
          pointRadiiDays.push(5);
          avgCountsSeries.push(0);
          maxCountsSeries.push(0);
          avgDaysSeries.push(null);
          return;
        }

        avgPoints.push(metrics.avgPrice);
        minPoints.push(metrics.minPrice);
        maxPoints.push(metrics.maxPrice);
        avgCountsSeries.push(metrics.avgCount);
        maxCountsSeries.push(metrics.maxCount);
        avgDaysSeries.push(metrics.avgDays);

        const baseRadiusStock = metrics.avgCount > 0 ? getPointSizeFromStock(metrics.avgCount) : 5;
        const baseRadiusDays = metrics.avgDays !== null ? getPointSizeFromDays(metrics.avgDays) : 5;

        // Progressive scaling based on viewport width
        const getScaleFactor = () => {
          if (typeof window === 'undefined') return 1;
          const width = window.innerWidth;
          if (width >= 1200) return 1;
          if (width <= 320) return 0.3;
          return 0.3 + ((width - 320) / (1200 - 320)) * 0.7;
        };

        const scaleFactor = getScaleFactor();
        pointRadiiStock.push(baseRadiusStock * scaleFactor);
        pointRadiiDays.push(baseRadiusDays * scaleFactor);
      });

      const baseColor = modelColors[model] || '#666';

      // Use dark mode detection (same as PriceRangeChart)
      const prefersDark = typeof window !== 'undefined' && window.matchMedia
        ? window.matchMedia('(prefers-color-scheme: dark)').matches
        : false;
      const rangeFillColor = prefersDark ? toRgba(baseColor, 0.6) : toRgba(baseColor, 0.25);

      return {
        label: model,
        data: avgPoints,
        borderColor: baseColor,
        backgroundColor: baseColor,
        borderWidth: 2,
        tension: 0.3,
        pointRadius: pointRadiiStock, // Default to stock, will be swapped by PriceRangeChart based on dotSizeMode
        pointRadiiStock,
        pointRadiiDays,
        pointHoverRadius: pointRadiiStock.map(r => r + 2),
        pointHitRadius: pointRadiiStock,
        pointBackgroundColor: baseColor,
        isAverageLine: true,
        modelName: model,
        order: 0,
        z: 10,
        color: baseColor,
        priceRange: {
          min: minPoints,
          max: maxPoints,
          fillStyle: rangeFillColor,
          borderColor: baseColor,
          baseColor
        },
        avgCountsSeries,
        maxCountsSeries,
        avgDaysSeries,
        groupedDatesSeries,
        hasAggregatedDates: dates.length !== baseDates.length
      };
    });

    return { datasets, dates };
  }, [data, dateLabels, availableDates]);

  return (
    <PriceRangeChart
      datasets={datasets}
      dates={dates}
      data={data}
      onItemSelect={onModelSelect}
      onDateSelect={onDateSelect}
      selectedDate={selectedDate}
      timeRangeId={timeRangeId}
      onTimeRangeChange={onTimeRangeChange}
      timeRangeOptions={timeRangeOptions}
      dateLabels={dateLabels}
      availableDates={availableDates}
      loading={loading}
      onSelectedDatePosition={onSelectedDatePosition}
    />
  );
}
