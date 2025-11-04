import React, { useEffect, useRef, useState } from 'react';
import Chart from 'chart.js/auto';
import { getModelKey, modelExceededMaxOnDate, calculateAverageDaysOnMarket, calculatePriceStats } from '../services/dataLoader';
import { createInventoryScale } from '../utils/inventoryScale';
import './OverviewChart.css';

export default function OverviewChart({ data, onModelSelect, onDateSelect, selectedDate }) {
  const chartRef = useRef(null);
  const chartInstance = useRef(null);
  const labelsContainerRef = useRef(null);
  const dateLabelsContainerRef = useRef(null);
  const [dotSizeMode, setDotSizeMode] = useState('stock'); // 'stock' or 'days'
  const [hoveredModel, setHoveredModel] = useState(null);
  const hoveredModelRef = useRef(null);

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
    hoveredModelRef.current = hoveredModel;
    const chart = chartInstance.current;
    if (chart && chart.ctx) {
      chart.draw();
    }

    if (labelsContainerRef.current) {
      const labelEls = labelsContainerRef.current.querySelectorAll('[data-model]');
      labelEls.forEach(labelEl => {
        const labelModel = labelEl.getAttribute('data-model');
        const isHovered = hoveredModel && labelModel === hoveredModel;
        labelEl.classList.toggle('hovered', isHovered);
        labelEl.classList.toggle('dimmed', Boolean(hoveredModel) && !isHovered);
      });
    }
  }, [hoveredModel]);

  useEffect(() => {
    if (!data || data.length === 0) return;

    // Group data by model and date
    const models = [...new Set(data.flatMap(d => d.listings.map(getModelKey)))];
    const dates = [...new Set(data.map(d => d.scraped_at.split('T')[0]))].sort();

    const priceData = {};
    models.forEach(model => {
      priceData[model] = {};
      dates.forEach(date => {
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

    // Collect all inventory counts and average days for scaling
    const allCounts = [];
    const allAvgDays = [];
    models.forEach(model => {
      dates.forEach(date => {
        const listings = priceData[model][date];
        allCounts.push(listings.length);
        const avgDays = calculateAverageDaysOnMarket(data, listings, date);
        if (avgDays !== null) {
          allAvgDays.push(avgDays);
        }
      });
    });

    // Create scales based on mode
    const getPointSizeFromStock = createInventoryScale(allCounts);
    const getPointSizeFromDays = allAvgDays.length > 0
      ? createInventoryScale(allAvgDays) // Reuse inventory scale logic for days
      : () => 5; // Fallback if no days data

    const datasets = [];

    let globalMin = Infinity;
    let globalMax = -Infinity;

    models.forEach(model => {
      const avgPoints = [];
      const minPoints = [];
      const maxPoints = [];

      const pointRadii = dates.map(date => {
        const listings = priceData[model][date];
        if (dotSizeMode === 'days') {
          const avgDays = calculateAverageDaysOnMarket(data, listings, date);
          return avgDays !== null ? getPointSizeFromDays(avgDays) : 5;
        }
        const count = listings.length;
        return getPointSizeFromStock(count);
      });

      dates.forEach(date => {
        const listings = priceData[model][date];
        if (!listings || listings.length === 0) {
          avgPoints.push(null);
          minPoints.push(null);
          maxPoints.push(null);
          return;
        }

        const stats = calculatePriceStats(listings);
        if (!stats) {
          avgPoints.push(null);
          minPoints.push(null);
          maxPoints.push(null);
          return;
        }

        avgPoints.push(stats.avg);
        minPoints.push(stats.min);
        maxPoints.push(stats.max);

        if (stats.min < globalMin) {
          globalMin = stats.min;
        }
        if (stats.max > globalMax) {
          globalMax = stats.max;
        }
      });

      const baseColor = modelColors[model] || '#666';
      const rangeFillColor = prefersDark ? toRgba(baseColor, 0.6) : toRgba(baseColor, 0.25);
      const rangeBorderColor = baseColor;

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
          borderColor: rangeBorderColor,
          baseColor
        }
      });
    });

    if (chartInstance.current) {
      chartInstance.current.destroy();
    }

    const ctx = chartRef.current;
    chartInstance.current = new Chart(ctx, {
      type: 'line',
      data: {
        labels: dates,
        datasets: datasets
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        layout: {
          padding: {
            right: 140 // Add space for labels on the right
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
                const dateIndex = context.dataIndex;
                const date = dates[dateIndex];
                const listings = (priceData[datasetModelName] && priceData[datasetModelName][date]) || [];
                const count = listings.length;

                // Extract make and model from modelName (e.g., "Tesla Model 3")
                const parts = datasetModelName.split(' ');
                const make = parts[0];
                const model = parts.slice(1).join(' ');

                // Check if this model exceeded max on this date
                const exceededMax = modelExceededMaxOnDate(data, make, model, date);
                const stockLabel = exceededMax ? `Over ${count} cars` : `${count} cars`;

                // Calculate average days on market
                const avgDays = calculateAverageDaysOnMarket(data, listings, date);
                const daysLabel = avgDays !== null ? `Avg days on market: ${avgDays}` : null;

                const stats = calculatePriceStats(listings);
                const rangeLabel = stats
                  ? `Range: $${stats.min.toLocaleString()} - $${stats.max.toLocaleString()}`
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

                return result;
              }
            }
          }
        },
        scales: {
          x: {
            ticks: {
              display: false // Hide default labels, we'll use custom DOM elements
            }
          },
          y: {
            position: 'left',
            beginAtZero: false,
            suggestedMin: Number.isFinite(globalMin) ? Math.floor(globalMin * 0.95) : undefined,
            suggestedMax: Number.isFinite(globalMax) ? Math.ceil(globalMax * 1.05) : undefined,
            ticks: {
              callback: value => '$' + value.toLocaleString()
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
          if (elements.length > 0 && onModelSelect) {
            const datasetIndex = elements[0].datasetIndex;
            const dataset = chart.data.datasets[datasetIndex];
            if (dataset && dataset.isAverageLine) {
              onModelSelect(dataset.modelName);
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
              line.options.borderColor = isHovered
                ? baseColor
                : hasHover ? toRgba(baseColor, 0.3) : baseColor;
              const pointFill = isHovered
                ? baseColor
                : hasHover ? toRgba(baseColor, 0.35) : baseColor;
              const pointBorder = isHovered
                ? adjustLightness(baseColor, -0.12)
                : adjustLightness(baseColor, hasHover ? -0.08 : -0.03);
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

          // Create DOM elements for clickable date labels
          if (dateLabelsContainerRef.current && onDateSelect) {
            dateLabelsContainerRef.current.innerHTML = '';

            const xScale = chart.scales.x;
            const yScale = chart.scales.y;

            dates.forEach((date, index) => {
              const xPos = xScale.getPixelForValue(index);
              const yPos = yScale.bottom + 10; // Position below the chart

              const dateObj = new Date(date);
              const formattedDate = `${dateObj.getMonth() + 1}/${dateObj.getDate()}`;

              const linkEl = document.createElement('a');
              linkEl.href = '#';
              linkEl.className = 'date-label';
              if (date === selectedDate) {
                linkEl.classList.add('selected');
              }
              linkEl.style.position = 'absolute';
              linkEl.style.left = xPos + 'px';
              linkEl.style.top = yPos + 'px';
              linkEl.style.transform = 'translateX(-50%)';
              linkEl.style.textDecoration = 'none';
              linkEl.style.whiteSpace = 'nowrap';
              linkEl.style.display = 'flex';
              linkEl.style.alignItems = 'center';
              linkEl.style.gap = '2px';
              linkEl.style.fontSize = '11px';
              linkEl.style.cursor = 'pointer';

              const textSpan = document.createElement('span');
              textSpan.textContent = formattedDate;

              const chevron = document.createElement('span');
              chevron.textContent = '›';
              chevron.style.fontSize = '12px';
              chevron.style.opacity = '0.6';

              linkEl.appendChild(textSpan);
              linkEl.appendChild(chevron);

              linkEl.addEventListener('click', (e) => {
                e.preventDefault();
                onDateSelect(date);
              });

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
  }, [data, onModelSelect, onDateSelect, selectedDate, dotSizeMode, prefersDark]);

  return (
    <div className="overview-chart">
      <div className="chart-header">
        <div className="chart-controls">
          <label htmlFor="dot-size-mode">Dot size represents:</label>
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
      <div className="chart-container">
        <canvas ref={chartRef}></canvas>
        <div ref={labelsContainerRef} className="chart-labels"></div>
        <div ref={dateLabelsContainerRef} className="date-labels"></div>
      </div>
    </div>
  );
}
