import React, { useEffect, useRef, useState } from 'react';
import Chart from 'chart.js/auto';
import { getModelKey, modelExceededMaxOnDate, calculateAverageDaysOnMarket, calculatePriceStats } from '../services/dataLoader';
import { createInventoryScale } from '../utils/inventoryScale';
import { formatCurrencyShort } from '../utils/numberFormat';
import './OverviewChart.css';

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
  loading = false
}) {
  const chartRef = useRef(null);
  const chartInstance = useRef(null);
  const labelsContainerRef = useRef(null);
  const dateLabelsContainerRef = useRef(null);
  const [dotSizeMode, setDotSizeMode] = useState('stock'); // 'stock' or 'days'
  const [showModelLabels, setShowModelLabels] = useState(() => {
    if (typeof window === 'undefined') {
      return true;
    }
    return window.innerWidth > 768;
  });
  const [mobileModelSummaries, setMobileModelSummaries] = useState([]);
  const [hoveredModel, setHoveredModel] = useState(null);
  const [activeModel, setActiveModel] = useState(null);
  const hoveredModelRef = useRef(null);

  const parseDateUtc = (dateStr) => {
    const [year, month, day] = dateStr.split('-').map(Number);
    return new Date(Date.UTC(year, month - 1, day));
  };

  const toIsoDate = (dateObj) => dateObj.toISOString().split('T')[0];

  const getWeekStartKey = (dateStr) => {
    const date = parseDateUtc(dateStr);
    const day = date.getUTCDay();
    const diff = (day + 6) % 7;
    date.setUTCDate(date.getUTCDate() - diff);
    return toIsoDate(date);
  };

  const pickRepresentativeDate = (dates, availableSet) => {
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

  const formatDateRangeLabel = (startDate, endDate) => {
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

  const modelColors = {
    'Hyundai Ioniq 5': '#667eea',
    'Tesla Model 3': '#f59e0b',
    'Kia EV6': '#10b981',
    'Volkswagen ID.4': '#8b5cf6',
    'Nissan Ariya': '#ec4899',
    'Ford Mustang Mach-E': '#0ea5e9',
    'Chevrolet Bolt EV': '#f97316',
    'Chevrolet Bolt EUV': '#84cc16',
    'Chevrolet Equinox EV': '#06b6d4',
    'Honda Prologue': '#6366f1',
    'Audi Q4 e-tron': '#d946ef',
    'Volkswagen e-Golf': '#1d4ed8',
    'BMW i4': '#4c1d95',
    'BMW i5': '#9333ea',
    'BMW i3': '#14b8a6'
  };

  const hexToRgb = (hex) => {
    if (!hex) return null;
    let normalized = hex.replace('#', '');
    if (normalized.length === 3) {
      normalized = normalized.split('').map(ch => ch + ch).join('');
    }
    if (normalized.length !== 6) return null;
    const intVal = parseInt(normalized, 16);
    return {
      r: (intVal >> 16) & 255,
      g: (intVal >> 8) & 255,
      b: intVal & 255
    };
  };

  const rgbToHex = (r, g, b) => {
    const toHex = (value) => value.toString(16).padStart(2, '0');
    return `#${toHex(Math.max(0, Math.min(255, r)))}${toHex(Math.max(0, Math.min(255, g)))}${toHex(Math.max(0, Math.min(255, b)))}`;
  };

  const toRgba = (hex, alpha) => {
    if (!hex) return `rgba(102, 102, 102, ${alpha})`;
    const rgb = hexToRgb(hex);
    if (!rgb) return `rgba(102, 102, 102, ${alpha})`;
    const { r, g, b } = rgb;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  };

  const rgbToHsl = ({ r, g, b }) => {
    r /= 255;
    g /= 255;
    b /= 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let h = 0;
    let s = 0;
    const l = (max + min) / 2;
    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r:
          h = (g - b) / d + (g < b ? 6 : 0);
          break;
        case g:
          h = (b - r) / d + 2;
          break;
        case b:
          h = (r - g) / d + 4;
          break;
      }
      h /= 6;
    }
    return { h, s, l };
  };

  const hslToRgb = ({ h, s, l }) => {
    const hue2rgb = (p, q, t) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };

    let r;
    let g;
    let b;

    if (s === 0) {
      r = g = b = l; // achromatic
    } else {
      const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      const p = 2 * l - q;
      r = hue2rgb(p, q, h + 1 / 3);
      g = hue2rgb(p, q, h);
      b = hue2rgb(p, q, h - 1 / 3);
    }

    return {
      r: Math.round(r * 255),
      g: Math.round(g * 255),
      b: Math.round(b * 255)
    };
  };

  const adjustLightness = (hex, delta) => {
    const rgb = hexToRgb(hex);
    if (!rgb) return hex;
    const hsl = rgbToHsl(rgb);
    hsl.l = Math.max(0, Math.min(1, hsl.l + delta));
    const adjustedRgb = hslToRgb(hsl);
    return rgbToHex(adjustedRgb.r, adjustedRgb.g, adjustedRgb.b);
  };

  const [prefersDark, setPrefersDark] = useState(() => {
    if (typeof window === 'undefined' || !window.matchMedia) {
      return false;
    }
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (event) => setPrefersDark(event.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleResize = () => {
      const shouldShow = window.innerWidth > 768;
      setShowModelLabels(prev => (prev === shouldShow ? prev : shouldShow));
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    const highlightModel = hoveredModel || activeModel;
    hoveredModelRef.current = highlightModel;
    const chart = chartInstance.current;
    if (chart && chart.ctx) {
      chart.draw();
    }

    if (labelsContainerRef.current) {
      const labelEls = labelsContainerRef.current.querySelectorAll('[data-model]');
      labelEls.forEach(labelEl => {
        const labelModel = labelEl.getAttribute('data-model');
        const isActive = highlightModel && labelModel === highlightModel;
        labelEl.classList.toggle('hovered', isActive);
        labelEl.classList.toggle('dimmed', Boolean(highlightModel) && !isActive);
      });
    }
  }, [hoveredModel, activeModel]);

  useEffect(() => {
    if (!data || data.length === 0) return;

    const availableDateSet = new Set(Array.isArray(availableDates) ? availableDates : []);

    const AGGREGATION_THRESHOLD = 90;

    const providedDates = Array.isArray(dateLabels) && dateLabels.length > 0
      ? [...dateLabels]
      : null;

    // Group data by model and date
    const models = [...new Set(data.flatMap(d => d.listings.map(getModelKey)))];
    const baseDates = providedDates
      ? [...providedDates]
      : [...new Set(data.map(d => d.scraped_at.split('T')[0]))].sort();

    let dates = baseDates;

    const priceData = {};
    models.forEach(model => {
      priceData[model] = {};
      baseDates.forEach(date => {
        priceData[model][date] = [];
      });
    });

    data.forEach(sourceData => {
      const date = sourceData.scraped_at.split('T')[0];
      sourceData.listings.forEach(listing => {
        const model = getModelKey(listing);
        if (priceData[model] && priceData[model][date]) {
          // Add source field to listing for days on market calculation
          priceData[model][date].push({ ...listing, source: sourceData.source });
        }
      });
    });

    const dailyMetricsByModel = {};
    models.forEach(model => {
      dailyMetricsByModel[model] = {};
      baseDates.forEach(date => {
        const listings = priceData[model][date];
        const count = listings.length;
        const stats = count > 0 ? calculatePriceStats(listings) : null;
        const avgDaysValue = count > 0 ? calculateAverageDaysOnMarket(data, listings, date) : null;

        dailyMetricsByModel[model][date] = {
          count,
          avgPrice: stats ? stats.avg : null,
          minPrice: stats ? stats.min : null,
          maxPrice: stats ? stats.max : null,
          avgDays: avgDaysValue
        };
      });
    });

    const dateGroups = new Map();
    if (dates.length > AGGREGATION_THRESHOLD) {
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

      const seen = new Set();
      dates = buckets
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
    } else {
      dates.forEach(date => {
        dateGroups.set(date, [date]);
      });
    }

    const aggregatedMetricsByModel = new Map();
    const allCounts = [];
    const allAvgDays = [];

    models.forEach(model => {
      const metricsMap = new Map();
      aggregatedMetricsByModel.set(model, metricsMap);

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
          const metrics = dailyMetricsByModel[model][groupDate];
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

        if (avgCount > 0) {
          allCounts.push(avgCount);
        }
        if (avgDaysValue !== null) {
          allAvgDays.push(avgDaysValue);
        }

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

    const getPointSizeFromStock = createInventoryScale(allCounts);
    const getPointSizeFromDays = allAvgDays.length > 0
      ? createInventoryScale(allAvgDays)
      : () => 5;

    const datasets = [];
    const modelSummaries = [];

    let globalMin = Infinity;
    let globalMax = -Infinity;

    models.forEach(model => {
      const metricsMap = aggregatedMetricsByModel.get(model);

      const avgPoints = [];
      const minPoints = [];
      const maxPoints = [];
      const pointRadii = [];
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
          pointRadii.push(5);
          avgCountsSeries.push(0);
          maxCountsSeries.push(0);
          avgDaysSeries.push(null);
          return;
        }

        avgPoints.push(metrics.avgPrice);
        minPoints.push(metrics.minPrice);
        maxPoints.push(metrics.maxPrice);

        if (Number.isFinite(metrics.minPrice)) {
          globalMin = Math.min(globalMin, metrics.minPrice);
        }
        if (Number.isFinite(metrics.maxPrice)) {
          globalMax = Math.max(globalMax, metrics.maxPrice);
        }

        avgCountsSeries.push(metrics.avgCount);
        maxCountsSeries.push(metrics.maxCount);
        avgDaysSeries.push(metrics.avgDays);

        const baseRadius = dotSizeMode === 'days'
          ? (metrics.avgDays !== null ? getPointSizeFromDays(metrics.avgDays) : 5)
          : (metrics.avgCount > 0 ? getPointSizeFromStock(metrics.avgCount) : 5);

        // Progressive scaling based on viewport width
        const getScaleFactor = () => {
          if (typeof window === 'undefined') return 1;
          const width = window.innerWidth;
          // Full size at 1200px and above, scale down to 0.3x at 320px
          if (width >= 1200) return 1;
          if (width <= 320) return 0.3;
          // Linear interpolation between 320px and 1200px
          return 0.3 + ((width - 320) / (1200 - 320)) * 0.7;
        };

        const radius = baseRadius * getScaleFactor();
        pointRadii.push(radius);
      });

      const baseColor = modelColors[model] || '#666';
      const rangeFillColor = prefersDark ? toRgba(baseColor, 0.6) : toRgba(baseColor, 0.25);

      datasets.push({
        label: model,
        data: avgPoints,
        borderColor: baseColor,
        backgroundColor: baseColor,
        borderWidth: 2,
        tension: 0.3,
        pointRadius: pointRadii,
        pointHoverRadius: pointRadii.map(r => r + 2),
        pointHitRadius: pointRadii,
        pointBackgroundColor: baseColor,
        pointBorderColor: prefersDark
          ? adjustLightness(baseColor, -0.15)
          : adjustLightness(baseColor, -0.05),
        isAverageLine: true,
        modelName: model,
        order: 0,
        z: 10,
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
      });

      const latestDate = [...dates].reverse().find(date => {
        const metrics = metricsMap.get(date);
        return metrics && metrics.hasData;
      }) || dates[dates.length - 1];

      const latestMetrics = latestDate ? metricsMap.get(latestDate) : null;
      modelSummaries.push({
        model,
        average: latestMetrics && latestMetrics.hasData ? latestMetrics.avgPrice : null,
        date: latestDate,
        color: baseColor
      });
    });

    const withAverage = modelSummaries
      .filter(summary => summary.average !== null && summary.average !== undefined)
      .sort((a, b) => a.average - b.average);
    const withoutAverage = modelSummaries.filter(summary => summary.average === null || summary.average === undefined);
    const sortedSummaries = [...withAverage, ...withoutAverage];

    setMobileModelSummaries(prev => {
      const prevKey = JSON.stringify(prev);
      const nextKey = JSON.stringify(sortedSummaries);
      if (prevKey === nextKey) {
        return prev;
      }
      return sortedSummaries;
    });

    if (chartInstance.current) {
      chartInstance.current.destroy();
    }

    const ctx = chartRef.current;
    const labelCount = dates.length;

    const formatAxisLabel = (index) => {
      if (index < 0 || index >= labelCount) return '';
      const dateString = dates[index];
      const dateObj = new Date(dateString);
      if (Number.isNaN(dateObj.getTime())) {
        return dateString;
      }

      const isFirst = index === 0;
      const isLast = index === labelCount - 1;
      const isFirstOfMonth = dateObj.getDate() === 1;

      const monthLabel = dateObj.toLocaleDateString(undefined, { month: 'short' });
      const monthYearLabel = dateObj.toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
      const monthDayLabel = `${dateObj.getMonth() + 1}/${dateObj.getDate()}`;

      const desiredTickTarget = (() => {
        if (labelCount <= 6) return labelCount;
        if (labelCount <= 14) return 5;
        if (labelCount <= 30) return 6;
        if (labelCount <= 90) return 8;
        if (labelCount <= 240) return 10;
        return 12;
      })();

      const step = Math.max(1, Math.round(labelCount / desiredTickTarget));
      const shouldLabel = isFirst || isLast || (index % step === 0);
      if (!shouldLabel) {
        return '';
      }

      if (labelCount > 540) {
        return monthYearLabel;
      }

      if (labelCount > 365) {
        return isFirstOfMonth ? monthYearLabel : monthLabel;
      }

      if (labelCount > 120) {
        return isFirstOfMonth ? monthLabel : monthLabel;
      }

      if (labelCount > 60) {
        if (isFirstOfMonth) {
          return monthLabel;
        }
        return monthDayLabel;
      }

      if (labelCount > 30) {
        return monthDayLabel;
      }

      return monthDayLabel;
    };

    chartInstance.current = new Chart(ctx, {
      type: 'line',
      data: {
        labels: dates,
        datasets: datasets
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        transitions: {
          active: {
            animation: {
              duration: 0
            }
          }
        },
        layout: {
          padding: {
            right: showModelLabels ? 140 : 24 // Reduce padding when labels hidden
          }
        },
        plugins: {
          legend: {
            display: false
          },
          title: {
            display: true,
            text: 'Average Price Trends Across All Sources'
          },
          tooltip: {
            displayColors: false, // Remove the colored box
            filter: (tooltipItem) => tooltipItem.dataset?.isAverageLine,
            callbacks: {
              title: (context) => {
                // Format date as MM/DD
                const dateStr = context[0].label;
                const date = new Date(dateStr);
                return `${date.getMonth() + 1}/${date.getDate()}`;
              },
              label: (context) => {
                const datasetModelName = context.dataset.modelName || context.dataset.label;
                const price = context.parsed.y;
                if (price == null || Number.isNaN(price)) {
                  return null;
                }

                const dateIndex = context.dataIndex;
                const displayDate = dates[dateIndex];
                const avgCountsSeries = context.dataset.avgCountsSeries || [];
                const maxCountsSeries = context.dataset.maxCountsSeries || [];
                const avgDaysSeries = context.dataset.avgDaysSeries || [];
                const groupedDatesSeries = context.dataset.groupedDatesSeries || [];

                const avgCount = avgCountsSeries[dateIndex] ?? 0;
                const maxCount = maxCountsSeries[dateIndex] ?? avgCount;
                const avgDaysValue = avgDaysSeries[dateIndex];
                const groupedDatesForPoint = groupedDatesSeries[dateIndex] || [displayDate];

                const parts = datasetModelName.split(' ');
                const make = parts[0];
                const model = parts.slice(1).join(' ');

                const exceededMax = groupedDatesForPoint.some(groupDate =>
                  modelExceededMaxOnDate(data, make, model, groupDate)
                );

                const countForLabel = exceededMax ? Math.round(maxCount) : Math.round(avgCount);
                const stockLabel = countForLabel > 0
                  ? `${exceededMax ? 'Over ' : ''}${countForLabel} cars`
                  : exceededMax ? 'Over listed max' : 'No data';

                const daysLabel = avgDaysValue !== null && avgDaysValue !== undefined
                  ? `Avg days on market: ${avgDaysValue}`
                  : null;

                const minValue = context.dataset.priceRange?.min?.[dateIndex];
                const maxValue = context.dataset.priceRange?.max?.[dateIndex];
                const rangeLabel = (minValue != null && maxValue != null)
                  ? `Range: $${minValue.toLocaleString()} - $${maxValue.toLocaleString()}`
                  : null;

                const dateRangeLabel = context.dataset.hasAggregatedDates && groupedDatesForPoint.length > 1
                  ? `Period: ${formatDateRangeLabel(groupedDatesForPoint[0], groupedDatesForPoint[groupedDatesForPoint.length - 1])}`
                  : null;

                const result = [
                  `${datasetModelName}: $${price.toLocaleString()}`,
                  `Stock: ${stockLabel}`
                ];

                if (daysLabel) {
                  result.push(daysLabel);
                }
                if (rangeLabel) {
                  result.push(rangeLabel);
                }
                if (dateRangeLabel) {
                  result.push(dateRangeLabel);
                }

                return result;
              }
            }
          }
        },
        scales: {
          x: {
            ticks: {
              display: false
            },
            grid: {
              display: labelCount <= 90
            }
          },
          y: {
            position: 'left',
            beginAtZero: false,
            suggestedMin: Number.isFinite(globalMin) ? Math.floor(globalMin * 0.95) : undefined,
            suggestedMax: Number.isFinite(globalMax) ? Math.ceil(globalMax * 1.05) : undefined,
            ticks: {
              callback: value => formatCurrencyShort(value)
            }
          }
        },
        onHover: (_event, elements, chart) => {
          if (elements.length > 0) {
            const element = elements[0];
            const dataset = chart.data.datasets[element.datasetIndex];
            if (dataset && dataset.isAverageLine) {
              setHoveredModel(dataset.modelName);
              return;
            }
          }
          setHoveredModel(null);
        },
        onLeave: () => {
          setHoveredModel(null);
        },
        onClick: (event, elements, chart) => {
          // Check if clicking on a model line/point
          if (elements.length > 0) {
            const datasetIndex = elements[0].datasetIndex;
            const dataset = chart.data.datasets[datasetIndex];
            if (dataset && dataset.isAverageLine) {
              setActiveModel(dataset.modelName);
              if (onModelSelect) {
                onModelSelect(dataset.modelName);
              }
            }
            return;
          }
        }
      },
      plugins: [{
        beforeDatasetsDraw: (chart) => {
          const ctx = chart.ctx;
          const xScale = chart.scales.x;
          const yScale = chart.scales.y;

          if (!ctx || typeof ctx.save !== 'function' || !xScale || !yScale) {
            return;
          }
          const hovered = hoveredModelRef.current;
          const hasHover = Boolean(hovered);

          chart.data.datasets.forEach((dataset, datasetIndex) => {
            if (!dataset.isAverageLine || !dataset.priceRange) {
              return;
            }

            const meta = chart.getDatasetMeta(datasetIndex);
            if (!meta || meta.hidden) {
              return;
            }

            const { min, max, baseColor } = dataset.priceRange;
            if (!Array.isArray(min) || !Array.isArray(max)) {
              return;
            }

            const isHovered = hasHover && dataset.modelName === hovered;
            const fillAlpha = hasHover
              ? (isHovered ? (prefersDark ? 0.45 : 0.28) : (prefersDark ? 0.05 : 0.03))
              : (prefersDark ? 0.18 : 0.12);
            const strokeAlpha = hasHover
              ? (isHovered ? 0.9 : 0.18)
              : 0.35;
            const fillStyle = toRgba(baseColor, fillAlpha);
            const borderColor = toRgba(baseColor, strokeAlpha);

            if (meta.dataset) {
              const line = meta.dataset;
              line.options.borderWidth = isHovered ? 3 : hasHover ? 1.25 : 2;

              // Use same dimming logic as ranges for consistency
              const lineAlpha = hasHover
                ? (isHovered ? 1.0 : (prefersDark ? 0.15 : 0.1))
                : 1.0;

              line.options.borderColor = isHovered
                ? baseColor
                : hasHover ? toRgba(baseColor, lineAlpha) : baseColor;
              const pointFill = isHovered
                ? baseColor
                : hasHover ? toRgba(baseColor, lineAlpha * 1.2) : baseColor;

              // Dim point borders for non-hovered models
              const pointBorderBase = isHovered
                ? adjustLightness(baseColor, -0.12)
                : adjustLightness(baseColor, -0.08);
              const pointBorder = hasHover && !isHovered
                ? toRgba(pointBorderBase, lineAlpha)
                : pointBorderBase;

              line.options.pointBackgroundColor = pointFill;
              line.options.pointBorderColor = pointBorder;

              meta.data.forEach((point, pointIndex) => {
                const radiusArray = Array.isArray(dataset.pointRadius) ? dataset.pointRadius : [];
                const radius = radiusArray.length > 0
                  ? radiusArray[pointIndex] ?? radiusArray[radiusArray.length - 1]
                  : dataset.pointRadius || point.options?.radius || 4;
                point.options.radius = radius;
                point.options.backgroundColor = pointFill;
                point.options.borderColor = pointBorder;
              });
            }

            ctx.save();
            ctx.fillStyle = fillStyle;
            ctx.strokeStyle = borderColor;
            ctx.lineWidth = isHovered ? 2 : 1;

            let inSegment = false;
            let upperPoints = [];
            let lowerPoints = [];

            const flushSegment = () => {
              if (upperPoints.length < 2 || lowerPoints.length < 2) {
                upperPoints = [];
                lowerPoints = [];
                inSegment = false;
                return;
              }

              ctx.beginPath();
              ctx.moveTo(upperPoints[0].x, upperPoints[0].y);
              for (let i = 1; i < upperPoints.length; i++) {
                ctx.lineTo(upperPoints[i].x, upperPoints[i].y);
              }
              for (let i = lowerPoints.length - 1; i >= 0; i--) {
                ctx.lineTo(lowerPoints[i].x, lowerPoints[i].y);
              }
              ctx.closePath();
              ctx.fill();
              ctx.stroke();

              upperPoints = [];
              lowerPoints = [];
              inSegment = false;
            };

            dates.forEach((date, index) => {
              const minVal = min[index];
              const maxVal = max[index];

              if (minVal == null || maxVal == null) {
                flushSegment();
                return;
              }

              const upper = Math.max(minVal, maxVal);
              const lower = Math.min(minVal, maxVal);
              const x = xScale.getPixelForValue(index);
              const upperY = yScale.getPixelForValue(upper);
              const lowerY = yScale.getPixelForValue(lower);

              upperPoints.push({ x, y: upperY });
              lowerPoints.push({ x, y: lowerY });
              inSegment = true;
            });

            if (inSegment) {
              flushSegment();
            }

            ctx.restore();
          });
        },
        afterDatasetsDraw: (chart) => {
          const ctx = chart.ctx;

            if (!showModelLabels) {
              if (labelsContainerRef.current) {
                labelsContainerRef.current.innerHTML = '';
              }
            } else {
            // First pass: collect all label positions
            const labels = [];
            chart.data.datasets.forEach((dataset, i) => {
              const meta = chart.getDatasetMeta(i);
              if (!dataset.isAverageLine || !meta || meta.hidden || meta.data.length === 0) {
                return;
              }

              const lastPoint = meta.data[meta.data.length - 1];

              labels.push({
                text: dataset.label,
                model: dataset.modelName || dataset.label,
                color: dataset.borderColor,
                dataPointX: lastPoint.x,
                dataPointY: lastPoint.y,
                x: lastPoint.x + 20,
                y: lastPoint.y,
                height: 16
              });
            });

            // Sort by y position to process from top to bottom
            labels.sort((a, b) => a.y - b.y);

            // Adjust positions to avoid overlaps and track original positions
            const minSpacing = 18; // Minimum pixels between labels
            labels.forEach(label => {
              label.originalY = label.y; // Store original position for callout line
            });

            for (let i = 1; i < labels.length; i++) {
              const current = labels[i];
              const previous = labels[i - 1];

              // Check if labels overlap
              if (current.y - previous.y < minSpacing) {
                current.y = previous.y + minSpacing;
              }
            }

            // Draw callout lines only
            labels.forEach(label => {
              // Draw callout line if label was moved
              if (Math.abs(label.y - label.originalY) > 2) {
                ctx.strokeStyle = label.color;
                ctx.lineWidth = 1.5;
                ctx.globalAlpha = 0.6;
                ctx.beginPath();
                // Straight line from data point to label
                ctx.moveTo(label.dataPointX, label.dataPointY);
                ctx.lineTo(label.x - 2, label.y);
                ctx.stroke();
                ctx.globalAlpha = 1.0;
              }
            });

            // Create DOM labels
            if (labelsContainerRef.current) {
              labelsContainerRef.current.innerHTML = '';

              labels.forEach(label => {
                const linkEl = document.createElement('a');
                linkEl.href = `?model=${encodeURIComponent(label.model)}`;
                linkEl.className = 'chart-label';
                linkEl.dataset.model = label.model;
                linkEl.style.position = 'absolute';
                linkEl.style.left = label.x + 'px';
                linkEl.style.top = (label.y - label.height / 2) + 'px';
                linkEl.style.color = label.color;
                linkEl.style.fontWeight = 'bold';
                linkEl.style.fontSize = '12px';
                linkEl.style.textDecoration = 'none';
                linkEl.style.whiteSpace = 'nowrap';
                linkEl.style.display = 'flex';
                linkEl.style.alignItems = 'center';
                linkEl.style.gap = '4px';

                const textSpan = document.createElement('span');
                textSpan.textContent = label.text;

                const chevron = document.createElement('span');
                chevron.textContent = '›';
                chevron.style.fontSize = '14px';
                chevron.style.opacity = '0.7';

                linkEl.appendChild(textSpan);
                linkEl.appendChild(chevron);

                linkEl.addEventListener('click', (e) => {
                  // Only prevent default for regular clicks (no modifier keys)
                  // Allow command+click, ctrl+click, middle-click, etc. to work normally
                  if (!e.metaKey && !e.ctrlKey && !e.shiftKey && e.button === 0) {
                    e.preventDefault();
                    setActiveModel(label.model);
                    if (onModelSelect) {
                      onModelSelect(label.model);
                    }
                  }
                });

                linkEl.addEventListener('mouseenter', () => {
                  setHoveredModel(label.model);
                });

                linkEl.addEventListener('mouseleave', () => {
                  setHoveredModel(null);
                });

                labelsContainerRef.current.appendChild(linkEl);
              });
            }
          }

          // Create DOM elements for clickable date labels
          if (dateLabelsContainerRef.current && onDateSelect) {
            dateLabelsContainerRef.current.innerHTML = '';

            const xScale = chart.scales.x;
            const yScale = chart.scales.y;

            const clickableDates = dates.filter((date, index) => {
              const axisLabel = formatAxisLabel(index);
              if (!axisLabel) {
                return false;
              }
              if (availableDateSet.size === 0) {
                return true;
              }
              if (availableDateSet.has(date)) {
                return true;
              }
              const grouped = dateGroups.get(date) || [];
              return grouped.some(d => availableDateSet.has(d));
            });

            clickableDates.forEach((date) => {
              const index = dates.indexOf(date);
              if (index === -1) {
                return;
              }
              const xPos = xScale.getPixelForValue(index);
              const yPos = yScale.bottom + 12;

              const grouped = dateGroups.get(date) || [date];
              const axisLabel = formatAxisLabel(index);
              if (!axisLabel) {
                return;
              }

              const linkEl = document.createElement('a');
              linkEl.className = 'date-label';
              const hasData = availableDateSet.size === 0
                ? true
                : availableDateSet.has(date) || grouped.some(d => availableDateSet.has(d));

              const isSelected = selectedDate
                ? (date === selectedDate || grouped.includes(selectedDate))
                : false;

              if (isSelected && hasData) {
                linkEl.classList.add('selected');
              }
              if (!hasData) {
                linkEl.classList.add('disabled');
                linkEl.setAttribute('aria-disabled', 'true');
              }
              linkEl.style.position = 'absolute';
              linkEl.style.left = `${xPos}px`;
              linkEl.style.top = `${yPos}px`;
              linkEl.style.transform = 'translateX(-50%)';
              linkEl.style.textDecoration = 'none';
              linkEl.style.whiteSpace = 'nowrap';
              linkEl.style.display = 'flex';
              linkEl.style.alignItems = 'center';
              linkEl.style.gap = '2px';
              linkEl.style.fontSize = '11px';

              const textSpan = document.createElement('span');
              textSpan.textContent = axisLabel;

              const chevron = document.createElement('span');
              chevron.textContent = '›';
              chevron.style.fontSize = '12px';
              chevron.style.opacity = '0.6';

              linkEl.appendChild(textSpan);
              linkEl.appendChild(chevron);

              if (hasData) {
                linkEl.style.cursor = 'pointer';
                linkEl.href = '#';
                const targetDate = availableDateSet.has(date)
                  ? date
                  : (grouped.slice().reverse().find(d => availableDateSet.has(d)) || date);
                linkEl.addEventListener('click', (e) => {
                  e.preventDefault();
                  onDateSelect(targetDate);
                });
              } else {
                linkEl.style.cursor = 'default';
                linkEl.tabIndex = -1;
              }

              dateLabelsContainerRef.current.appendChild(linkEl);
            });
          }
        }
      }]
    });

    return () => {
      if (chartInstance.current) {
        chartInstance.current.destroy();
        chartInstance.current = null;
      }
    };
  }, [data, onModelSelect, onDateSelect, selectedDate, dotSizeMode, prefersDark, dateLabels, availableDates, showModelLabels, loading]);

  const rangeOptions = Array.isArray(timeRangeOptions) ? timeRangeOptions : [];
  const activeRangeId = timeRangeId ?? (rangeOptions[0]?.id ?? null);
  const highlightedModel = hoveredModel || activeModel;

  const handleMobileModelClick = (model) => {
    setActiveModel(prev => (prev === model ? null : model));
    setHoveredModel(null);
  };

  const formatModelPrice = (value) => {
    if (value === null || value === undefined) {
      return 'No data';
    }
    return `$${Math.round(value).toLocaleString()}`;
  };

  return (
    <div className="overview-chart">
      <div className="chart-header">
        <div className="chart-range-controls">
          {rangeOptions.map(option => {
            const isActive = option.id === activeRangeId;
            return (
              <button
                key={option.id}
                type="button"
                className={`range-button${isActive ? ' active' : ''}`}
                onClick={() => {
                  if (typeof onTimeRangeChange === 'function') {
                    onTimeRangeChange(option.id);
                  }
                }}
              >
                {option.label}
              </button>
            );
          })}
        </div>
        <div className="chart-controls">
          <label htmlFor="dot-size-mode">Show:</label>
          <select
            id="dot-size-mode"
            value={dotSizeMode}
            onChange={(e) => setDotSizeMode(e.target.value)}
          >
            <option value="stock">Stock Count</option>
            <option value="days">Avg Days on Market</option>
          </select>
        </div>
      </div>
      {!showModelLabels && mobileModelSummaries.length > 0 && (
        <div className="mobile-model-list" role="list">
          {mobileModelSummaries.map(summary => {
            const isActive = highlightedModel === summary.model;
            return (
              <div
                key={summary.model}
                className={`mobile-model-list-item${isActive ? ' active' : ''}`}
                role="listitem"
              >
                <button
                  type="button"
                  className="mobile-model-list-item__select"
                  onClick={() => handleMobileModelClick(summary.model)}
                  aria-pressed={isActive}
                >
                  <span
                    className="mobile-model-list-item__swatch"
                    style={{ backgroundColor: summary.color }}
                    aria-hidden="true"
                  />
                  <span className="mobile-model-list-item__text">
                    <span className="mobile-model-list-item__name">{summary.model}</span>
                  </span>
                </button>
                <a
                  className="mobile-model-list-item__disclosure"
                  href={`?model=${encodeURIComponent(summary.model)}`}
                  aria-label={`View details for ${summary.model}`}
                  onClick={(e) => {
                    if (!e.metaKey && !e.ctrlKey && !e.shiftKey && e.button === 0) {
                      e.preventDefault();
                      setActiveModel(summary.model);
                      if (onModelSelect) {
                        onModelSelect(summary.model);
                      }
                    }
                  }}
                >
                  ›
                </a>
              </div>
            );
          })}
        </div>
      )}
      <div className="chart-container">
        {loading && (!data || data.length === 0) && (
          <div className="chart-loading">Loading price data...</div>
        )}
        <canvas ref={chartRef}></canvas>
        <div ref={labelsContainerRef} className="chart-labels"></div>
        <div ref={dateLabelsContainerRef} className="date-labels"></div>
      </div>
    </div>
  );
}
