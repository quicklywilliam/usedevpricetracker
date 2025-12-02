import React, { useEffect, useRef, useState } from 'react';
import Chart from 'chart.js/auto';
import { modelExceededMaxOnDate } from '../services/dataLoader';
import { formatDateRangeLabel } from '../utils/dateAggregation';
import { formatCurrencyShort } from '../utils/numberFormat';
import './PriceRangeChart.css';

/**
 * Shared chart component for displaying price ranges over time.
 * Used by both OverviewChart (for models) and DetailChart (for sources).
 */
export default function PriceRangeChart({
  datasets,
  dates,
  data,
  onItemSelect,
  onDateSelect,
  selectedDate,
  timeRangeId,
  onTimeRangeChange,
  timeRangeOptions,
  dateLabels,
  availableDates,
  loading = false,
  enableItemNavigation = true,
  onSelectedDatePosition,
  extraControls = null
}) {
  const chartRef = useRef(null);
  const chartInstance = useRef(null);
  const labelsContainerRef = useRef(null);
  const dateLabelsContainerRef = useRef(null);
  const chartContainerRef = useRef(null);
  const [dotSizeMode, setDotSizeMode] = useState('stock');
  const [showItemLabels, setShowItemLabels] = useState(() => {
    if (typeof window === 'undefined') {
      return true;
    }
    return window.innerWidth > 768;
  });
  const [mobileItemSummaries, setMobileItemSummaries] = useState([]);
  const [hoveredItem, setHoveredItem] = useState(null);
  const [activeItem, setActiveItem] = useState(null);
  const [dotSizeMenuOpen, setDotSizeMenuOpen] = useState(false);
  const hoveredItemRef = useRef(null);
  const dotSizeButtonRef = useRef(null);

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
      r = g = b = l;
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
      setShowItemLabels(prev => (prev === shouldShow ? prev : shouldShow));
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (!dotSizeMenuOpen) return;
    const handleClickOutside = (event) => {
      if (dotSizeButtonRef.current && !dotSizeButtonRef.current.contains(event.target)) {
        setDotSizeMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [dotSizeMenuOpen]);

  useEffect(() => {
    const highlightItem = hoveredItem || activeItem;
    hoveredItemRef.current = highlightItem;
    const chart = chartInstance.current;
    if (chart && chart.ctx) {
      chart.draw();
    }

    if (labelsContainerRef.current) {
      const labelEls = labelsContainerRef.current.querySelectorAll('[data-item]');
      labelEls.forEach(labelEl => {
        const labelItem = labelEl.getAttribute('data-item');
        const isActive = highlightItem && labelItem === highlightItem;
        labelEl.classList.toggle('hovered', isActive);
        labelEl.classList.toggle('dimmed', Boolean(highlightItem) && !isActive);
      });
    }
  }, [hoveredItem, activeItem]);

  useEffect(() => {
    if (!datasets || datasets.length === 0 || !dates) return;

    const availableDateSet = new Set(Array.isArray(availableDates) ? availableDates : []);

    // Generate mobile summaries from datasets
    const summaries = datasets.map(dataset => {
      const lastDataIndex = dataset.data.map((v, i) => v !== null ? i : -1)
        .reduce((acc, i) => i > acc ? i : acc, -1);
      const lastValue = lastDataIndex >= 0 ? dataset.data[lastDataIndex] : null;

      return {
        item: dataset.label,
        average: lastValue,
        date: lastDataIndex >= 0 ? dates[lastDataIndex] : null,
        color: dataset.color || dataset.borderColor
      };
    });

    const withAverage = summaries
      .filter(summary => summary.average !== null && summary.average !== undefined)
      .sort((a, b) => b.average - a.average);
    const withoutAverage = summaries.filter(summary => summary.average === null || summary.average === undefined);
    const sortedSummaries = [...withAverage, ...withoutAverage];

    setMobileItemSummaries(prev => {
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

    // Update datasets to use the correct point radii based on dotSizeMode
    const datasetsWithCorrectRadii = datasets.map(dataset => {
      const radii = dotSizeMode === 'days' && dataset.pointRadiiDays
        ? dataset.pointRadiiDays
        : (dataset.pointRadiiStock || dataset.pointRadius);

      return {
        ...dataset,
        pointRadius: radii,
        pointHoverRadius: Array.isArray(radii) ? radii.map(r => r + 2) : radii + 2,
        pointHitRadius: radii
      };
    });

    const ctx = chartRef.current;
    const labelCount = dates.length;

    // Calculate global min/max for y-axis scaling
    let globalMin = Infinity;
    let globalMax = -Infinity;

    datasetsWithCorrectRadii.forEach(dataset => {
      if (dataset.priceRange) {
        const { min, max } = dataset.priceRange;
        if (Array.isArray(min)) {
          min.forEach(val => {
            if (Number.isFinite(val)) {
              globalMin = Math.min(globalMin, val);
            }
          });
        }
        if (Array.isArray(max)) {
          max.forEach(val => {
            if (Number.isFinite(val)) {
              globalMax = Math.max(globalMax, val);
            }
          });
        }
      }
    });

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
        datasets: datasetsWithCorrectRadii
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
            right: showItemLabels ? 140 : 24,
            bottom: 20
          }
        },
        plugins: {
          legend: {
            display: false
          },
          title: {
            display: false
          },
          tooltip: {
            displayColors: false,
            filter: (tooltipItem) => tooltipItem.dataset?.isAverageLine,
            callbacks: {
              title: (context) => {
                const dateStr = context[0].label;
                const date = new Date(dateStr);
                return `${date.getMonth() + 1}/${date.getDate()}`;
              },
              label: (context) => {
                const datasetLabel = context.dataset.modelName || context.dataset.label;
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

                const parts = datasetLabel.split(' ');
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
                  `${datasetLabel}: $${price.toLocaleString()}`,
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
            min: Number.isFinite(globalMin) ? globalMin - 500 : undefined,
            max: Number.isFinite(globalMax) ? globalMax + 500 : undefined,
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
              setHoveredItem(dataset.modelName || dataset.label);
              return;
            }
          }
          setHoveredItem(null);
        },
        onLeave: () => {
          setHoveredItem(null);
        },
        onClick: (event, elements, chart) => {
          if (elements.length > 0) {
            const datasetIndex = elements[0].datasetIndex;
            const dataset = chart.data.datasets[datasetIndex];
            if (dataset && dataset.isAverageLine) {
              const itemName = dataset.modelName || dataset.label;
              setActiveItem(itemName);
              if (onItemSelect) {
                onItemSelect(itemName);
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
          const hovered = hoveredItemRef.current;
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

            const itemName = dataset.modelName || dataset.label;
            const isHovered = hasHover && itemName === hovered;
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

              const lineAlpha = hasHover
                ? (isHovered ? 1.0 : (prefersDark ? 0.15 : 0.1))
                : 1.0;

              line.options.borderColor = isHovered
                ? baseColor
                : hasHover ? toRgba(baseColor, lineAlpha) : baseColor;
              const pointFill = isHovered
                ? baseColor
                : hasHover ? toRgba(baseColor, lineAlpha * 1.2) : baseColor;

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

          if (!showItemLabels) {
            if (labelsContainerRef.current) {
              labelsContainerRef.current.innerHTML = '';
            }
          } else {
            const labels = [];
            chart.data.datasets.forEach((dataset, i) => {
              const meta = chart.getDatasetMeta(i);
              if (!dataset.isAverageLine || !meta || meta.hidden || meta.data.length === 0) {
                return;
              }

              // Find last point with actual data (non-null)
              let lastPoint = null;
              for (let j = meta.data.length - 1; j >= 0; j--) {
                const point = meta.data[j];
                const dataValue = dataset.data[j];
                if (point && dataValue !== null && dataValue !== undefined) {
                  lastPoint = point;
                  break;
                }
              }

              // Skip if no valid data points found
              if (!lastPoint) return;

              labels.push({
                text: dataset.label,
                item: dataset.modelName || dataset.label,
                color: dataset.borderColor,
                dataPointX: lastPoint.x,
                dataPointY: lastPoint.y,
                x: lastPoint.x + 20,
                y: lastPoint.y,
                height: 16,
                nonClickable: dataset.nonClickable || false
              });
            });

            labels.sort((a, b) => a.y - b.y);

            const minSpacing = 18;
            labels.forEach(label => {
              label.originalY = label.y;
            });

            for (let i = 1; i < labels.length; i++) {
              const current = labels[i];
              const previous = labels[i - 1];

              if (current.y - previous.y < minSpacing) {
                current.y = previous.y + minSpacing;
              }
            }

            labels.forEach(label => {
              if (Math.abs(label.y - label.originalY) > 2) {
                ctx.strokeStyle = label.color;
                ctx.lineWidth = 1.5;
                ctx.globalAlpha = 0.6;
                ctx.beginPath();
                ctx.moveTo(label.dataPointX, label.dataPointY);
                ctx.lineTo(label.x - 2, label.y);
                ctx.stroke();
                ctx.globalAlpha = 1.0;
              }
            });

            if (labelsContainerRef.current) {
              labelsContainerRef.current.innerHTML = '';

              labels.forEach(label => {
                const isClickable = !label.nonClickable && enableItemNavigation;
                const linkEl = document.createElement(isClickable ? 'a' : (label.nonClickable ? 'span' : 'button'));
                if (isClickable) {
                  linkEl.href = `?model=${encodeURIComponent(label.item)}`;
                }
                linkEl.className = 'chart-label';
                linkEl.dataset.item = label.item;
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

                if (label.nonClickable) {
                  linkEl.style.fontStyle = 'italic';
                  linkEl.style.cursor = 'default';
                } else if (!enableItemNavigation) {
                  linkEl.style.background = 'none';
                  linkEl.style.border = 'none';
                  linkEl.style.padding = '0';
                  linkEl.style.cursor = 'pointer';
                }

                const textSpan = document.createElement('span');
                textSpan.textContent = label.text;
                linkEl.appendChild(textSpan);

                if (enableItemNavigation && !label.nonClickable) {
                  const chevron = document.createElement('span');
                  chevron.textContent = '›';
                  chevron.style.fontSize = '14px';
                  chevron.style.opacity = '0.7';
                  linkEl.appendChild(chevron);
                }

                if (!label.nonClickable) {
                  linkEl.addEventListener('click', (e) => {
                    if (!e.metaKey && !e.ctrlKey && !e.shiftKey && e.button === 0) {
                      e.preventDefault();
                      setActiveItem(label.item);
                      if (onItemSelect) {
                        onItemSelect(label.item);
                      }
                    }
                  });
                }

                linkEl.addEventListener('mouseenter', () => {
                  setHoveredItem(label.item);
                });

                linkEl.addEventListener('mouseleave', () => {
                  setHoveredItem(null);
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

            // Find and report selected date position first
            if (selectedDate && onSelectedDatePosition && chartRef.current) {
              const selectedIndex = dates.findIndex((date, index) => {
                const grouped = datasets[0]?.groupedDatesSeries?.[index] || [date];
                return date === selectedDate || grouped.includes(selectedDate);
              });

              if (selectedIndex >= 0) {
                const xPos = xScale.getPixelForValue(selectedIndex);
                const canvas = chartRef.current;
                const canvasRect = canvas.getBoundingClientRect();
                const viewportX = canvasRect.left + xPos;
                onSelectedDatePosition(viewportX);
              }
            }

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
              // Check if any grouped dates are available
              const grouped = datasets[0]?.groupedDatesSeries?.[index] || [];
              return grouped.some(d => availableDateSet.has(d));
            });

            clickableDates.forEach((date) => {
              const index = dates.indexOf(date);
              if (index === -1) {
                return;
              }
              const xPos = xScale.getPixelForValue(index);
              const yPos = yScale.bottom + 12;

              const grouped = datasets[0]?.groupedDatesSeries?.[index] || [date];
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
                // This position reporting is now done earlier in the afterDatasetsDraw hook
                // to ensure it happens on every chart render
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

              linkEl.appendChild(textSpan);

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
  }, [datasets, dates, data, onItemSelect, onDateSelect, selectedDate, dotSizeMode, prefersDark, dateLabels, availableDates, showItemLabels, loading]);

  const rangeOptions = Array.isArray(timeRangeOptions) ? timeRangeOptions : [];
  const activeRangeId = timeRangeId ?? (rangeOptions[0]?.id ?? null);
  const highlightedItem = hoveredItem || activeItem;

  const handleMobileItemClick = (item) => {
    setActiveItem(prev => (prev === item ? null : item));
    setHoveredItem(null);
  };

  return (
    <div className="price-range-chart">
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
        <div className="chart-extra-controls">
          {extraControls}
          <div className="dot-size-selector" ref={dotSizeButtonRef}>
          <button
            type="button"
            className="dot-size-button"
            onClick={() => setDotSizeMenuOpen(!dotSizeMenuOpen)}
            aria-label="Change dot size mode"
            aria-expanded={dotSizeMenuOpen}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="12" cy="12" r="4.5" fill="currentColor" opacity="0.3" />
              <path d="M3 12 L7.5 12 M16.5 12 L21 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              <path d="M4.5 10 L3 12 L4.5 14 M19.5 10 L21 12 L19.5 14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none" />
            </svg>
          </button>
          {dotSizeMenuOpen && (
            <div className="dot-size-menu">
              <button
                type="button"
                className={`dot-size-menu-item${dotSizeMode === 'stock' ? ' active' : ''}`}
                onClick={() => {
                  setDotSizeMode('stock');
                  setTimeout(() => setDotSizeMenuOpen(false), 300);
                }}
              >
                {dotSizeMode === 'stock' ? (
                  <span className="dot-size-menu-item__check">✓</span>
                ) : (
                  <span className="dot-size-menu-item__spacer"></span>
                )}
                Stock Count
              </button>
              <button
                type="button"
                className={`dot-size-menu-item${dotSizeMode === 'days' ? ' active' : ''}`}
                onClick={() => {
                  setDotSizeMode('days');
                  setTimeout(() => setDotSizeMenuOpen(false), 300);
                }}
              >
                {dotSizeMode === 'days' ? (
                  <span className="dot-size-menu-item__check">✓</span>
                ) : (
                  <span className="dot-size-menu-item__spacer"></span>
                )}
                Avg Days on Market
              </button>
            </div>
          )}
          </div>
        </div>
      </div>
      {!showItemLabels && mobileItemSummaries.length > 0 && (
        <div className="mobile-item-list" role="list">
          {mobileItemSummaries.map(summary => {
            const isActive = highlightedItem === summary.item;
            return (
              <div
                key={summary.item}
                className={`mobile-item-list-item${isActive ? ' active' : ''}`}
                role="listitem"
              >
                <button
                  type="button"
                  className="mobile-item-list-item__select"
                  onClick={() => handleMobileItemClick(summary.item)}
                  aria-pressed={isActive}
                >
                  <span
                    className="mobile-item-list-item__swatch"
                    style={{ backgroundColor: summary.color }}
                    aria-hidden="true"
                  />
                  <span className="mobile-item-list-item__text">
                    <span className="mobile-item-list-item__name">{summary.item}</span>
                  </span>
                </button>
                <a
                  className="mobile-item-list-item__disclosure"
                  href={`?model=${encodeURIComponent(summary.item)}`}
                  aria-label={`View details for ${summary.item}`}
                  onClick={(e) => {
                    if (!e.metaKey && !e.ctrlKey && !e.shiftKey && e.button === 0) {
                      e.preventDefault();
                      setActiveItem(summary.item);
                      if (onItemSelect) {
                        onItemSelect(summary.item);
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
      <div className="chart-container" ref={chartContainerRef}>
        {loading && (!datasets || datasets.length === 0) && (
          <div className="chart-loading">Loading price data...</div>
        )}
        <canvas ref={chartRef}></canvas>
        <div ref={labelsContainerRef} className="chart-labels"></div>
        <div ref={dateLabelsContainerRef} className="date-labels"></div>
      </div>
    </div>
  );
}
