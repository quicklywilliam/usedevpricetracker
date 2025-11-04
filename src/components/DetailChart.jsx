import React, { useEffect, useRef, useState } from 'react';
import Chart from 'chart.js/auto';
import { calculatePriceStats, modelExceededMaxOnDate, calculateAverageDaysOnMarket } from '../services/dataLoader';
import { createLabelPlugin } from '../utils/chartLabels';
import { createInventoryScale } from '../utils/inventoryScale';
import { formatCurrencyShort } from '../utils/numberFormat';
import './DetailChart.css';

export default function DetailChart({
  data,
  model,
  onDateSelect,
  selectedDate,
  timeRangeId,
  onTimeRangeChange,
  timeRangeOptions,
  dateLabels,
  availableDates
}) {
  const chartRef = useRef(null);
  const chartInstance = useRef(null);
  const labelBoundsRef = useRef([]);
  const dateLabelsContainerRef = useRef(null);
  const [dotSizeMode, setDotSizeMode] = useState('stock'); // 'stock' or 'days'

  const colors = {
    'mock-source': '#1976d2',
    'autotrader': '#e65100',
    'carmax': '#f57c00',
    'carvana': '#00a9ce',
    'plattauto': '#43a047'
  };

  useEffect(() => {
    if (!data || data.length === 0 || !model) return;

    const availableDateSet = new Set(Array.isArray(availableDates) ? availableDates : []);

    // Filter data for selected model
    const sources = [...new Set(data.map(d => d.source))];
    const providedDates = Array.isArray(dateLabels) && dateLabels.length > 0
      ? dateLabels
      : null;
    const dates = providedDates
      ? providedDates
      : [...new Set(data.map(d => d.scraped_at.split('T')[0]))].sort();

    const sourceData = {};
    sources.forEach(source => {
      sourceData[source] = {};
      dates.forEach(date => {
        sourceData[source][date] = [];
      });
    });

    data.forEach(item => {
      const date = item.scraped_at.split('T')[0];
      const filteredListings = item.listings.filter(
        l => `${l.make} ${l.model}` === model
      ).map(listing => ({ ...listing, source: item.source })); // Add source field
      if (sourceData[item.source] && sourceData[item.source][date]) {
        sourceData[item.source][date].push(...filteredListings);
      }
    });

    // Collect all inventory counts and avg days for scaling
    const allCounts = [];
    const allAvgDays = [];
    sources.forEach(source => {
      dates.forEach(date => {
        const listings = sourceData[source][date];
        const count = listings.length;
        if (count > 0) {
          allCounts.push(count);
        }
        const avgDays = calculateAverageDaysOnMarket(data, listings, date);
        if (avgDays !== null) {
          allAvgDays.push(avgDays);
        }
      });
    });

    // Create scales based on mode
    const getPointSizeFromStock = createInventoryScale(allCounts);
    const getPointSizeFromDays = allAvgDays.length > 0
      ? createInventoryScale(allAvgDays)
      : () => 5; // Fallback if no days data

    const datasets = [];

    sources.forEach((source, idx) => {
      const avgData = [];
      const minData = [];
      const maxData = [];
      const inventoryCounts = [];

      dates.forEach(date => {
        const listings = sourceData[source][date];
        inventoryCounts.push(listings.length);
        if (listings.length > 0) {
          const stats = calculatePriceStats(listings);
          avgData.push(stats.avg);
          minData.push(stats.min);
          maxData.push(stats.max);
        } else {
          avgData.push(null);
          minData.push(null);
          maxData.push(null);
        }
      });

      const barData = dates.map((date, i) => {
        if (minData[i] !== null && maxData[i] !== null) {
          return [minData[i], maxData[i]];
        }
        return null;
      });

      // Calculate point sizes based on selected mode
      const pointRadii = dates.map((date, i) => {
        if (dotSizeMode === 'days') {
          const listings = sourceData[source][date];
          const avgDays = calculateAverageDaysOnMarket(data, listings, date);
          return avgDays !== null ? getPointSizeFromDays(avgDays) : 5;
        } else {
          return getPointSizeFromStock(inventoryCounts[i]);
        }
      });

      const color = colors[source] || '#666';
      // Give each source a different bar width so they don't overlap
      const barThickness = 30 - (idx * 4); // 30, 26, 22, 18, etc.

      // Range bars
      datasets.push({
        label: source.charAt(0).toUpperCase() + source.slice(1) + ' Range',
        data: barData,
        type: 'bar',
        backgroundColor: 'transparent',
        borderColor: color,
        borderWidth: 3,
        barThickness: barThickness,
        order: idx + 1,
        stack: 'overlap',
        base: 0,
        borderSkipped: false, // Draw borders on all sides
        skipLabel: true // Don't show label for range bars
      });

      // Average line
      datasets.push({
        label: source.charAt(0).toUpperCase() + source.slice(1),
        data: avgData,
        type: 'line',
        borderColor: color,
        backgroundColor: color,
        borderWidth: 3,
        pointRadius: pointRadii,
        pointHoverRadius: pointRadii.map(r => r + 2),
        tension: 0.3,
        order: 0,
        inventoryCounts: inventoryCounts, // Store for tooltip
        sourceName: source // Store source name for exceeded check
      });
    });

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

      if (labelCount > 540) {
        if (isFirst || isLast || (isFirstOfMonth && dateObj.getMonth() % 6 === 0)) {
          return monthYearLabel;
        }
        if (isFirstOfMonth && dateObj.getMonth() % 3 === 0) {
          return monthLabel;
        }
        return '';
      }

      if (labelCount > 365) {
        if (isFirst || isLast || (isFirstOfMonth && dateObj.getMonth() % 3 === 0)) {
          return monthYearLabel;
        }
        if (isFirstOfMonth) {
          return monthLabel;
        }
        return '';
      }

      if (labelCount > 120) {
        if (isFirst || isLast || isFirstOfMonth) {
          return monthLabel;
        }
        return '';
      }

      if (labelCount > 60) {
        if (isFirst || isLast || isFirstOfMonth || index % 14 === 0) {
          return monthDayLabel;
        }
        return '';
      }

      if (labelCount > 30) {
        if (isFirst || isLast || index % 7 === 0) {
          return monthDayLabel;
        }
        return '';
      }

      if (labelCount > 14) {
        if (isFirst || isLast || index % 3 === 0) {
          return monthDayLabel;
        }
        return '';
      }

      if (isFirst || isLast || index % 2 === 0) {
        return monthDayLabel;
      }
      return '';
    };

    if (chartInstance.current) {
      chartInstance.current.destroy();
    }

    const ctx = chartRef.current;
    chartInstance.current = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: dates,
        datasets: datasets
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        layout: {
          padding: {
            right: 100 // Add space for labels on the right
          }
        },
        interaction: {
          mode: 'index',
          intersect: false
        },
        plugins: {
          legend: {
            display: false
          },
          title: {
            display: true,
            text: 'Price Range by Source (min/avg/max)'
          },
          tooltip: {
            displayColors: false, // Remove the colored box
            callbacks: {
              title: (context) => {
                // Format date as MM/DD
                const dateStr = context[0].label;
                const date = new Date(dateStr);
                return `${date.getMonth() + 1}/${date.getDate()}`;
              },
              label: function(context) {
                const label = context.dataset.label;
                if (label.includes('Range')) {
                  const data = context.raw;
                  // Skip if no data for this point
                  if (!data || !Array.isArray(data)) return null;
                  return label + ': $' + data[0].toLocaleString() + ' - $' + data[1].toLocaleString();
                } else {
                  const price = context.parsed.y;
                  // Skip if no data for this point
                  if (price === null || price === undefined) return null;

                  const inventoryCounts = context.dataset.inventoryCounts;
                  const count = inventoryCounts ? inventoryCounts[context.dataIndex] : 0;

                  // Extract make and model from the model name (passed from parent)
                  const parts = model.split(' ');
                  const make = parts[0];
                  const modelName = parts.slice(1).join(' ');

                  // Get date for this data point
                  const date = dates[context.dataIndex];

                  // Check if this model exceeded max on this date for this source
                  const sourceName = context.dataset.sourceName;
                  const dataForDateAndSource = data.filter(
                    d => d.scraped_at.startsWith(date) && d.source === sourceName
                  );

                  const exceededMax = dataForDateAndSource.some(sourceData => {
                    const exceededModels = sourceData.models_exceeded_max_vehicles || [];
                    return exceededModels.some(m => m.make === make && m.model === modelName);
                  });

                  const stockLabel = exceededMax ? `Over ${count} cars` : `${count} cars`;

                  // Get listings for this source and date
                  const listings = sourceData[sourceName]?.[date] || [];
                  const avgDays = calculateAverageDaysOnMarket(data, listings, date);
                  const daysLabel = avgDays !== null ? `Avg days on market: ${avgDays}` : null;

                  const result = [
                    label + ': $' + price.toLocaleString(),
                    'Stock: ' + stockLabel
                  ];

                  if (daysLabel) {
                    result.push(daysLabel);
                  }

                  return result;
                }
              }
            }
          }
        },
        scales: {
          x: {
            offset: true,
            grid: {
              offset: true
            },
            stacked: true,
            ticks: {
              autoSkip: false,
              maxRotation: 0,
              callback: (_value, index) => {
                return formatAxisLabel(index);
              }
            }
          },
          y: {
            beginAtZero: false,
            stacked: false,
            ticks: {
              callback: value => formatCurrencyShort(value)
            }
          }
        }
      },
      plugins: [
        createLabelPlugin(labelBoundsRef),
        {
          afterDatasetsDraw: (chart) => {
            // Create DOM elements for clickable date labels
            if (dateLabelsContainerRef.current && onDateSelect) {
              dateLabelsContainerRef.current.innerHTML = '';

              const xScale = chart.scales.x;
              const yScale = chart.scales.y;

              const clickableDates = availableDateSet.size > 0
                ? dates.filter(date => availableDateSet.has(date))
                : dates;

              clickableDates.forEach((date) => {
                const index = dates.indexOf(date);
                if (index === -1) {
                  return;
                }
                const xPos = xScale.getPixelForValue(index);
                const yPos = yScale.bottom + 10; // Position below the chart

                const dateObj = new Date(date);
                const formattedDate = `${dateObj.getMonth() + 1}/${dateObj.getDate()}`;

              const linkEl = document.createElement('a');
              linkEl.className = 'date-label';
              const hasData = availableDateSet.size === 0 ? true : availableDateSet.has(date);
              if (date === selectedDate && hasData) {
                linkEl.classList.add('selected');
              }
              if (!hasData) {
                linkEl.classList.add('disabled');
                linkEl.setAttribute('aria-disabled', 'true');
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

                const textSpan = document.createElement('span');
                textSpan.textContent = formattedDate;

                const chevron = document.createElement('span');
                chevron.textContent = '›';
                chevron.style.fontSize = '12px';
                chevron.style.opacity = '0.6';

              linkEl.appendChild(textSpan);
              linkEl.appendChild(chevron);

              if (hasData) {
                linkEl.style.cursor = 'pointer';
                linkEl.href = '#';
                linkEl.addEventListener('click', (e) => {
                  e.preventDefault();
                  onDateSelect(date);
                });
              } else {
                linkEl.style.cursor = 'default';
                linkEl.tabIndex = -1;
              }

              dateLabelsContainerRef.current.appendChild(linkEl);
            });
          }
          }
        }
      ]
    });

    return () => {
      if (chartInstance.current) {
        chartInstance.current.destroy();
      }
    };
  }, [data, model, onDateSelect, selectedDate, dotSizeMode, dateLabels, availableDates]);

  const rangeOptions = Array.isArray(timeRangeOptions) ? timeRangeOptions : [];
  const activeRangeId = timeRangeId ?? (rangeOptions[0]?.id ?? null);

  return (
    <div className="detail-chart">
      <h2>{model} - Price History</h2>
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
          <label htmlFor="detail-dot-size-mode">Show:</label>
          <select
            id="detail-dot-size-mode"
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
        <div ref={dateLabelsContainerRef} className="date-labels"></div>
      </div>
    </div>
  );
}
