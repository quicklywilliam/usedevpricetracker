import React, { useMemo } from 'react';
import PriceRangeChart from './PriceRangeChart';
import { aggregateDates } from '../utils/dateAggregation';
import { aggregateMetricsForGroups, collectScalingValues } from '../utils/metricAggregation';
import { createInventoryScale } from '../utils/inventoryScale';
import './DetailChart.css';

const sourceColors = {
  'mock-source': '#1976d2',
  'autotrader': '#e65100',
  'carmax': '#f57c00',
  'carvana': '#00a9ce',
  'plattauto': '#43a047'
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

export default function DetailChart({
  data,
  model,
  onDateSelect,
  selectedDate,
  timeRangeId,
  onTimeRangeChange,
  timeRangeOptions,
  dateLabels,
  availableDates,
  loading = false
}) {
  const { datasets, dates } = useMemo(() => {
    if (!data || data.length === 0 || !model) {
      return { datasets: [], dates: [] };
    }

    // Extract sources and dates
    const sources = [...new Set(data.map(d => d.source))];
    const providedDates = Array.isArray(dateLabels) && dateLabels.length > 0
      ? dateLabels
      : null;
    const baseDates = providedDates
      ? providedDates
      : [...new Set(data.map(d => d.scraped_at.split('T')[0]))].sort();

    // Aggregate dates into weekly buckets if needed
    const dateAggregation = aggregateDates(baseDates, availableDates);
    const { dates, dateGroups } = dateAggregation;

    // Aggregate metrics for all sources, filtered by model
    const aggregatedMetrics = aggregateMetricsForGroups(
      data,
      sources,
      baseDates,
      dateAggregation,
      (sourceData, source) => {
        if (sourceData.source !== source) {
          return [];
        }
        return sourceData.listings
          .filter(l => `${l.make} ${l.model}` === model)
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
    const datasets = sources.map(source => {
      const metricsMap = aggregatedMetrics.get(source);

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

      const baseColor = sourceColors[source] || '#666';

      // Use dark mode detection
      const prefersDark = typeof window !== 'undefined' && window.matchMedia
        ? window.matchMedia('(prefers-color-scheme: dark)').matches
        : false;
      const rangeFillColor = prefersDark ? toRgba(baseColor, 0.6) : toRgba(baseColor, 0.25);

      return {
        label: source.charAt(0).toUpperCase() + source.slice(1),
        data: avgPoints,
        borderColor: baseColor,
        backgroundColor: baseColor,
        borderWidth: 3,
        tension: 0.3,
        pointRadius: pointRadiiStock,
        pointRadiiStock,
        pointRadiiDays,
        pointHoverRadius: pointRadiiStock.map(r => r + 2),
        pointHitRadius: pointRadiiStock,
        pointBackgroundColor: baseColor,
        isAverageLine: true,
        modelName: source.charAt(0).toUpperCase() + source.slice(1),
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
    }).filter(dataset => {
      // Filter out sources with no data at all
      return dataset.data.some(price => price !== null);
    });

    return { datasets, dates };
  }, [data, model, dateLabels, availableDates]);

  return (
    <div className="detail-chart">
      <h2>{model} - Price History</h2>
      <PriceRangeChart
        datasets={datasets}
        dates={dates}
        data={data}
        onDateSelect={onDateSelect}
        selectedDate={selectedDate}
        timeRangeId={timeRangeId}
        onTimeRangeChange={onTimeRangeChange}
        timeRangeOptions={timeRangeOptions}
        dateLabels={dateLabels}
        availableDates={availableDates}
        loading={loading}
        enableItemNavigation={false}
      />
    </div>
  );
}
