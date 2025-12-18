import React, { useMemo, useState, useRef, useEffect } from 'react';
import PriceRangeChart from './PriceRangeChart';
import { getModelKey } from '../services/dataLoader';
import { aggregateDates } from '../utils/dateAggregation';
import { aggregateMetricsForGroups, collectScalingValues } from '../utils/metricAggregation';
import { createInventoryScale } from '../utils/inventoryScale';
import { CATEGORY_TABS, getCategoriesForModel } from '../utils/modelCategories';
import { loadCarGurusData } from '../utils/cargurusData';
import './DetailChart.css'; // Reuse DetailChart styles for the toggle

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

// Category colors (bold, distinct)
const categoryColors = {
  'cheap': '#ef4444',      // bright red
  'mid-range': '#3b82f6',  // bright blue
  'luxury': '#8b5cf6'      // bright purple
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
  selectedCategory,
  timeRangeId,
  onTimeRangeChange,
  timeRangeOptions,
  dateLabels,
  availableDates,
  loading = false,
  onSelectedDatePosition
}) {
  const [averageMode, setAverageMode] = useState(() => {
    // Initialize from URL parameter, default to 'normalized'
    const url = new URL(window.location);
    const avgParam = url.searchParams.get('averageMode');
    return avgParam === 'raw' ? 'raw' : 'normalized';
  });
  const [avgMenuOpen, setAvgMenuOpen] = useState(false);
  const avgButtonRef = useRef(null);
  const [cargurusDataByModel, setCargurusDataByModel] = useState(new Map());

  // Handle URL parameter for average mode
  useEffect(() => {
    const url = new URL(window.location);
    const avgParam = url.searchParams.get('averageMode');
    if (avgParam) {
      setAverageMode(avgParam === 'raw' ? 'raw' : 'normalized');
    } else {
      setAverageMode('normalized');
    }
  }, []);

  // Handle browser back/forward for average mode
  useEffect(() => {
    const handlePopState = () => {
      const url = new URL(window.location);
      const avgParam = url.searchParams.get('averageMode');
      setAverageMode(avgParam === 'raw' ? 'raw' : 'normalized');
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!avgMenuOpen) return;
    const handleClickOutside = (event) => {
      if (avgButtonRef.current && !avgButtonRef.current.contains(event.target)) {
        setAvgMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [avgMenuOpen]);

  // Memoize models and dates separately (doesn't depend on averageMode)
  const { models, baseDates, dateAggregation } = useMemo(() => {
    if (!data || data.length === 0) {
      return { models: [], baseDates: [], dateAggregation: { dates: [], dateGroups: new Map() } };
    }

    const models = [...new Set(data.flatMap(d => d.listings.map(getModelKey)))];
    const providedDates = Array.isArray(dateLabels) && dateLabels.length > 0
      ? [...dateLabels]
      : null;
    const baseDates = providedDates
      ? [...providedDates]
      : [...new Set(data.map(d => d.scraped_at.split('T')[0]))].sort();

    const dateAggregation = aggregateDates(baseDates, availableDates);

    return { models, baseDates, dateAggregation };
  }, [data, dateLabels, availableDates]);

  // Load CarGurus data for all models
  useEffect(() => {
    if (models.length === 0) {
      setCargurusDataByModel(new Map());
      return;
    }

    // Load data for all models in parallel
    Promise.all(
      models.map(async (model) => {
        const data = await loadCarGurusData(model);
        return { model, data };
      })
    ).then((results) => {
      const dataMap = new Map();
      results.forEach(({ model, data }) => {
        if (data) {
          dataMap.set(model, data);
        }
      });
      setCargurusDataByModel(dataMap);
    });
  }, [models]);

  // Memoize avgDays calculation separately (expensive, but doesn't depend on averageMode)
  const avgDaysCache = useMemo(() => {
    if (!data || data.length === 0 || models.length === 0 || loading) {
      return null;
    }

    const { dates } = dateAggregation;
    const categories = CATEGORY_TABS.map(cat => cat.id);
    const allGroups = [...models, ...categories.map(id => `category:${id}`)];

    // Calculate with raw mode and avgDays enabled - only do this once
    const metricsWithAvgDays = aggregateMetricsForGroups(
      data,
      allGroups,
      baseDates,
      dateAggregation,
      (sourceData, group) => {
        if (group.startsWith('category:')) {
          const categoryId = group.substring(9);
          return sourceData.listings
            .filter(listing => {
              const modelKey = getModelKey(listing);
              const modelCategories = getCategoriesForModel(modelKey);
              return modelCategories.includes(categoryId);
            })
            .map(listing => ({ ...listing, source: sourceData.source }));
        } else {
          return sourceData.listings
            .filter(l => getModelKey(l) === group)
            .map(listing => ({ ...listing, source: sourceData.source }));
        }
      },
      'raw', // Mode doesn't matter for avgDays
      false // Calculate avgDays
    );

    // Extract just the avgDays values
    const cache = new Map();
    allGroups.forEach(group => {
      const metricsMap = metricsWithAvgDays.get(group);
      if (metricsMap) {
        const avgDaysMap = new Map();
        metricsMap.forEach((metrics, date) => {
          avgDaysMap.set(date, metrics.avgDays);
        });
        cache.set(group, avgDaysMap);
      }
    });

    return cache;
  }, [data, dateLabels, availableDates, models, baseDates, dateAggregation, loading]);

  // Memoize metrics calculation (fast, recalculates when averageMode changes)
  const { aggregatedMetrics, categoryMetrics, dates } = useMemo(() => {
    if (!data || data.length === 0 || models.length === 0) {
      return { aggregatedMetrics: new Map(), categoryMetrics: new Map(), dates: [] };
    }

    const { dates } = dateAggregation;
    const categories = CATEGORY_TABS.map(cat => cat.id);
    const allGroups = [...models, ...categories.map(id => `category:${id}`)];

    const allMetrics = aggregateMetricsForGroups(
      data,
      allGroups,
      baseDates,
      dateAggregation,
      (sourceData, group) => {
        if (group.startsWith('category:')) {
          const categoryId = group.substring(9);
          return sourceData.listings
            .filter(listing => {
              const modelKey = getModelKey(listing);
              const modelCategories = getCategoriesForModel(modelKey);
              return modelCategories.includes(categoryId);
            })
            .map(listing => ({ ...listing, source: sourceData.source }));
        } else {
          return sourceData.listings
            .filter(l => getModelKey(l) === group)
            .map(listing => ({ ...listing, source: sourceData.source }));
        }
      },
      averageMode,
      true // Skip avgDays, we'll merge from cache
    );

    // Merge avgDays from cache if available
    if (avgDaysCache) {
      allGroups.forEach(group => {
        const metricsMap = allMetrics.get(group);
        const avgDaysMap = avgDaysCache.get(group);
        if (metricsMap && avgDaysMap) {
          metricsMap.forEach((metrics, date) => {
            metrics.avgDays = avgDaysMap.get(date) || null;
          });
        }
      });
    }

    // Split metrics back into models and categories
    const aggregatedMetrics = new Map();
    const categoryMetrics = new Map();

    models.forEach(model => {
      aggregatedMetrics.set(model, allMetrics.get(model));
    });

    categories.forEach(categoryId => {
      categoryMetrics.set(categoryId, allMetrics.get(`category:${categoryId}`));
    });

    return { aggregatedMetrics, categoryMetrics, dates };
  }, [data, dateLabels, availableDates, averageMode, loading, models, baseDates, dateAggregation, avgDaysCache]);

  // Memoize CarGurus datasets separately (only recalculates when CarGurus data changes)
  const cargurusDatasets = useMemo(() => {
    console.log('CarGurus datasets calculation triggered:', {
      modelsCount: models.length,
      cargurusDataCount: cargurusDataByModel.size,
      selectedCategory,
      loading
    });

    if (models.length === 0 || cargurusDataByModel.size === 0) {
      console.log('Skipping all CarGurus: no models or no data');
      return [];
    }

    const { dates } = dateAggregation;
    const categories = CATEGORY_TABS.map(cat => cat.id);

    // Only process categories that will be shown
    const categoriesToProcess = selectedCategory
      ? categories.filter(id => id === selectedCategory)
      : categories;

    console.log('Processing categories:', categoriesToProcess);

    const datasets = categoriesToProcess.map(categoryId => {
      const categoryInfo = CATEGORY_TABS.find(cat => cat.id === categoryId);

      // Get all models in this category
      const categoryModels = models.filter(model => {
        const modelCategories = getCategoriesForModel(model);
        return modelCategories.includes(categoryId);
      });

      // Check if ALL models have CarGurus data
      const allModelsHaveData = categoryModels.every(model =>
        cargurusDataByModel.has(model)
      );

      // If any model is missing data, skip this category
      if (!allModelsHaveData || categoryModels.length === 0) {
        const missingModels = categoryModels.filter(model => !cargurusDataByModel.has(model));
        console.log(`Skipping CarGurus avg for ${categoryInfo?.label || categoryId}:`, {
          categoryId,
          categoryModels,
          missingModels,
          totalModels: categoryModels.length,
          modelsWithData: categoryModels.length - missingModels.length
        });
        return null;
      }

      console.log(`Creating CarGurus avg for ${categoryInfo?.label || categoryId} with ${categoryModels.length} models`);

      // Calculate average CarGurus price for each date
      const avgPoints = [];
      const constantRadii = [];

      dates.forEach(date => {
        const prices = [];

        // Collect prices from all models for this date
        categoryModels.forEach(model => {
          const cgData = cargurusDataByModel.get(model);
          if (!cgData) return;

          // Find aggregate line data (all years combined)
          Object.keys(cgData).forEach(carType => {
            // Look for aggregate line (model name without year prefix)
            if (!carType.match(/^\d{4}\s/)) {
              const dataPoints = cgData[carType];

              // Find closest data point within 7 days
              let closestPoint = null;
              let minDiff = Infinity;
              const chartTime = new Date(date).getTime();

              dataPoints.forEach(dp => {
                const dpTime = new Date(dp.date).getTime();
                const diff = Math.abs(chartTime - dpTime);
                const daysDiff = diff / (1000 * 60 * 60 * 24);

                if (daysDiff <= 7 && diff < minDiff) {
                  minDiff = diff;
                  closestPoint = dp;
                }
              });

              if (closestPoint) {
                prices.push(closestPoint.price);
              }
            }
          });
        });

        // Calculate average only if we have data from all models
        if (prices.length === categoryModels.length) {
          const avg = prices.reduce((sum, p) => sum + p, 0) / prices.length;
          avgPoints.push(avg);
          constantRadii.push(3);
        } else {
          avgPoints.push(null);
          constantRadii.push(3);
        }
      });

      // Skip if no data at all
      if (avgPoints.every(p => p === null)) {
        return null;
      }

      // Use same color scheme as DetailChart CarGurus lines
      const cgColor = '#64748b'; // slate-500 for aggregate

      return {
        label: `${categoryInfo?.label || categoryId} Avg (CarGurus)`,
        data: avgPoints,
        borderColor: cgColor,
        backgroundColor: cgColor,
        borderWidth: 2,
        borderDash: [6, 3], // Dashed line like detail chart
        tension: 0.3,
        pointRadius: constantRadii,
        pointRadiiStock: constantRadii,
        pointRadiiDays: constantRadii,
        pointHoverRadius: constantRadii.map(r => r + 2),
        pointHitRadius: constantRadii,
        pointBackgroundColor: cgColor,
        isAverageLine: true,
        isCarGurusTrend: true,
        isCategoryLine: true,
        categoryId,
        modelName: `${categoryInfo?.label || categoryId} CG Avg`,
        order: -2, // Render behind category averages
        z: 3,
        color: cgColor,
        avgCountsSeries: [],
        maxCountsSeries: [],
        avgDaysSeries: [],
        groupedDatesSeries: dates.map(d => [d]),
        hasAggregatedDates: dates.length !== baseDates.length,
        nonClickable: true
      };
    }).filter(ds => ds !== null);

    return datasets;
  }, [cargurusDataByModel, models, dateAggregation, selectedCategory, baseDates, loading]);

  // Memoize dataset creation separately (only recalculates if metrics change)
  const datasets = useMemo(() => {
    if (aggregatedMetrics.size === 0) {
      return [];
    }

    const { dateGroups } = dateAggregation;
    const categories = CATEGORY_TABS.map(cat => cat.id);

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

    // Create category datasets
    const categoryDatasets = categories.map(categoryId => {
      const categoryInfo = CATEGORY_TABS.find(cat => cat.id === categoryId);
      const metricsMap = categoryMetrics.get(categoryId);

      const avgPoints = [];
      const avgCountsSeries = [];
      const maxCountsSeries = [];
      const avgDaysSeries = [];
      const groupedDatesSeries = [];
      const pointRadiiStock = [];
      const pointRadiiDays = [];

      dates.forEach(date => {
        const metrics = metricsMap.get(date);
        const grouped = metrics?.groupedDates ?? dateGroups.get(date) ?? [date];
        groupedDatesSeries.push(grouped);

        if (!metrics || !metrics.hasData) {
          avgPoints.push(null);
          avgCountsSeries.push(0);
          maxCountsSeries.push(0);
          avgDaysSeries.push(null);
          pointRadiiStock.push(5);
          pointRadiiDays.push(5);
          return;
        }

        avgPoints.push(metrics.avgPrice);
        avgCountsSeries.push(metrics.avgCount);
        maxCountsSeries.push(metrics.maxCount);
        avgDaysSeries.push(metrics.avgDays);

        const baseRadiusStock = metrics.avgCount > 0 ? getPointSizeFromStock(metrics.avgCount) : 5;
        const baseRadiusDays = metrics.avgDays !== null ? getPointSizeFromDays(metrics.avgDays) : 5;

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

      // Grey color: light in dark mode, dark in light mode
      const prefersDark = typeof window !== 'undefined' && window.matchMedia
        ? window.matchMedia('(prefers-color-scheme: dark)').matches
        : false;
      const greyBorderColor = prefersDark ? '#9ca3af' : '#6b7280'; // gray-400 in dark, gray-500 in light
      const greyFillColor = prefersDark ? toRgba('#9ca3af', 0.4) : toRgba('#6b7280', 0.4); // Semi-transparent fill

      return {
        label: `${categoryInfo?.label || categoryId} Average`,
        data: avgPoints,
        borderColor: greyBorderColor,
        backgroundColor: greyFillColor,
        borderWidth: 3,
        borderDash: [8, 4], // Dashed line for visual distinction
        tension: 0.3,
        pointRadius: pointRadiiStock,
        pointRadiiStock,
        pointRadiiDays,
        pointHoverRadius: pointRadiiStock.map(r => r + 2),
        pointHitRadius: pointRadiiStock,
        pointBackgroundColor: greyFillColor,
        isAverageLine: true,
        isCategoryLine: true,
        categoryId,
        modelName: `${categoryInfo?.label || categoryId} Average`,
        order: -1, // Render categories behind individual models
        z: 5,
        color: greyBorderColor,
        // No priceRange property = no shaded region
        avgCountsSeries,
        maxCountsSeries,
        avgDaysSeries,
        groupedDatesSeries,
        hasAggregatedDates: dates.length !== baseDates.length,
        nonClickable: true // Show label but make it non-clickable
      };
    });

    // Filter category datasets to only include the selected category
    const filteredCategoryDatasets = selectedCategory
      ? categoryDatasets.filter(ds => ds.categoryId === selectedCategory)
      : categoryDatasets;

    // Combine model datasets, category datasets, and CarGurus datasets
    console.log('Combining datasets:', {
      modelDatasets: datasets.length,
      categoryDatasets: filteredCategoryDatasets.length,
      cargurusDatasets: cargurusDatasets.length,
      cargurusLabels: cargurusDatasets.map(ds => ds.label)
    });
    const allDatasets = [...datasets, ...filteredCategoryDatasets, ...cargurusDatasets];

    console.log('Final allDatasets:', allDatasets.length, allDatasets.map(ds => ds.label));

    return allDatasets;
  }, [aggregatedMetrics, categoryMetrics, dates, models, dateAggregation, selectedCategory, cargurusDatasets]);

  // Average mode selector component
  const avgModeSelector = (
    <div className="group-mode-selector" ref={avgButtonRef}>
      <button
        type="button"
        className="group-mode-button"
        onClick={() => setAvgMenuOpen(!avgMenuOpen)}
        aria-label="Change averaging mode"
        aria-expanded={avgMenuOpen}
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <polyline points="3,18 7,12 11,15 15,8 19,11 22,6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </svg>
      </button>
      {avgMenuOpen && (
        <div className="group-mode-menu">
          <button
            type="button"
            className={`group-mode-menu-item${averageMode === 'normalized' ? ' active' : ''}`}
            onClick={() => {
              setAverageMode('normalized');
              const url = new URL(window.location);
              url.searchParams.delete('averageMode');
              window.history.pushState({}, '', url);
              setTimeout(() => setAvgMenuOpen(false), 300);
            }}
          >
            {averageMode === 'normalized' ? (
              <span className="group-mode-menu-item__check">✓</span>
            ) : (
              <span className="group-mode-menu-item__spacer"></span>
            )}
            Normalized Average
          </button>
          <button
            type="button"
            className={`group-mode-menu-item${averageMode === 'raw' ? ' active' : ''}`}
            onClick={() => {
              setAverageMode('raw');
              const url = new URL(window.location);
              url.searchParams.set('averageMode', 'raw');
              window.history.pushState({}, '', url);
              setTimeout(() => setAvgMenuOpen(false), 300);
            }}
          >
            {averageMode === 'raw' ? (
              <span className="group-mode-menu-item__check">✓</span>
            ) : (
              <span className="group-mode-menu-item__spacer"></span>
            )}
            Raw Average
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
      extraControls={avgModeSelector}
    />
  );
}
