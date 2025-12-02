import React, { useMemo, useState, useRef, useEffect } from 'react';
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

// Color palette for trims (similar to model colors in OverviewChart)
const trimColorPalette = [
  '#667eea', // Primary purple
  '#f56565', // Red
  '#48bb78', // Green
  '#ed8936', // Orange
  '#4299e1', // Blue
  '#9f7aea', // Purple
  '#ed64a6', // Pink
  '#38b2ac', // Teal
  '#ecc94b', // Yellow
  '#fc8181', // Light red
  '#68d391', // Light green
  '#f6ad55'  // Light orange
];

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
  loading = false,
  onSelectedDatePosition
}) {
  const [groupMode, setGroupMode] = useState(() => {
    // Initialize from URL parameter
    const url = new URL(window.location);
    const groupParam = url.searchParams.get('groupBy');
    return groupParam === 'source' ? 'source' : 'trim';
  });
  const [groupMenuOpen, setGroupMenuOpen] = useState(false);
  const groupButtonRef = useRef(null);

  // Handle URL parameter for group mode
  useEffect(() => {
    const url = new URL(window.location);
    const groupParam = url.searchParams.get('groupBy');
    if (groupParam) {
      setGroupMode(groupParam === 'source' ? 'source' : 'trim');
    } else {
      setGroupMode('trim');
    }
  }, []);

  // Handle browser back/forward for group mode
  useEffect(() => {
    const handlePopState = () => {
      const url = new URL(window.location);
      const groupParam = url.searchParams.get('groupBy');
      setGroupMode(groupParam === 'trim' ? 'trim' : 'source');
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!groupMenuOpen) return;
    const handleClickOutside = (event) => {
      if (groupButtonRef.current && !groupButtonRef.current.contains(event.target)) {
        setGroupMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [groupMenuOpen]);

  const { datasets, dates } = useMemo(() => {
    if (!data || data.length === 0 || !model) {
      return { datasets: [], dates: [] };
    }

    // Extract groups (sources or trims) and dates
    let groups;
    let colorMap;

    if (groupMode === 'trim') {
      // Get all unique normalized trims for this model
      const trimSet = new Set();
      data.forEach(sourceData => {
        sourceData.listings
          .filter(l => `${l.make} ${l.model}` === model && l.normalized_trim)
          .forEach(listing => trimSet.add(listing.normalized_trim));
      });
      groups = Array.from(trimSet).sort();

      // Assign colors to trims
      colorMap = {};
      groups.forEach((trim, index) => {
        colorMap[trim] = trimColorPalette[index % trimColorPalette.length];
      });
    } else {
      // Use sources
      groups = [...new Set(data.map(d => d.source))];
      colorMap = sourceColors;
    }
    const providedDates = Array.isArray(dateLabels) && dateLabels.length > 0
      ? dateLabels
      : null;
    const baseDates = providedDates
      ? providedDates
      : [...new Set(data.map(d => d.scraped_at.split('T')[0]))].sort();

    // Aggregate dates into weekly buckets if needed
    const dateAggregation = aggregateDates(baseDates, availableDates);
    const { dates, dateGroups } = dateAggregation;

    // Aggregate metrics for all groups, filtered by model and group
    const aggregatedMetrics = aggregateMetricsForGroups(
      data,
      groups,
      baseDates,
      dateAggregation,
      (sourceData, group) => {
        const modelListings = sourceData.listings.filter(l => `${l.make} ${l.model}` === model);

        if (groupMode === 'trim') {
          // Filter by normalized_trim
          return modelListings
            .filter(l => l.normalized_trim === group)
            .map(listing => ({ ...listing, source: sourceData.source }));
        } else {
          // Filter by source
          if (sourceData.source !== group) {
            return [];
          }
          return modelListings.map(listing => ({ ...listing, source: sourceData.source }));
        }
      },
      'raw' // DetailChart uses raw average (no normalization needed for single model)
    );

    // Collect scaling values for point sizes
    const { allCounts, allAvgDays } = collectScalingValues(aggregatedMetrics);
    const getPointSizeFromStock = createInventoryScale(allCounts);
    const getPointSizeFromDays = allAvgDays.length > 0
      ? createInventoryScale(allAvgDays)
      : () => 5;

    // Transform metrics into datasets
    const datasets = groups.map(group => {
      const metricsMap = aggregatedMetrics.get(group);

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

      const baseColor = colorMap[group] || '#666';

      // Use dark mode detection
      const prefersDark = typeof window !== 'undefined' && window.matchMedia
        ? window.matchMedia('(prefers-color-scheme: dark)').matches
        : false;
      const rangeFillColor = prefersDark ? toRgba(baseColor, 0.6) : toRgba(baseColor, 0.25);

      // Format label based on group mode
      const label = groupMode === 'trim'
        ? group
        : (group.charAt(0).toUpperCase() + group.slice(1));

      return {
        label,
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
        modelName: label,
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
      // Filter out groups with no data at all
      return dataset.data.some(price => price !== null);
    });

    return { datasets, dates };
  }, [data, model, dateLabels, availableDates, groupMode]);

  // Group mode selector component
  const groupModeSelector = (
    <div className="group-mode-selector" ref={groupButtonRef}>
      <button
        type="button"
        className="group-mode-button"
        onClick={() => setGroupMenuOpen(!groupMenuOpen)}
        aria-label="Change grouping mode"
        aria-expanded={groupMenuOpen}
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <polyline points="3,18 7,12 11,15 15,8 19,11 22,6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </svg>
      </button>
      {groupMenuOpen && (
        <div className="group-mode-menu">
          <button
            type="button"
            className={`group-mode-menu-item${groupMode === 'source' ? ' active' : ''}`}
            onClick={() => {
              setGroupMode('source');
              const url = new URL(window.location);
              url.searchParams.set('groupBy', 'source');
              window.history.pushState({}, '', url);
              setTimeout(() => setGroupMenuOpen(false), 300);
            }}
          >
            {groupMode === 'source' ? (
              <span className="group-mode-menu-item__check">✓</span>
            ) : (
              <span className="group-mode-menu-item__spacer"></span>
            )}
            By Source
          </button>
          <button
            type="button"
            className={`group-mode-menu-item${groupMode === 'trim' ? ' active' : ''}`}
            onClick={() => {
              setGroupMode('trim');
              const url = new URL(window.location);
              url.searchParams.delete('groupBy');
              window.history.pushState({}, '', url);
              setTimeout(() => setGroupMenuOpen(false), 300);
            }}
          >
            {groupMode === 'trim' ? (
              <span className="group-mode-menu-item__check">✓</span>
            ) : (
              <span className="group-mode-menu-item__spacer"></span>
            )}
            By Trim
          </button>
        </div>
      )}
    </div>
  );

  return (
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
        onSelectedDatePosition={onSelectedDatePosition}
        extraControls={groupModeSelector}
      />
  );
}
