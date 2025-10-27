import React, { useEffect, useRef } from 'react';
import Chart from 'chart.js/auto';
import { calculatePriceStats, modelExceededMaxOnDate } from '../services/dataLoader';
import { createLabelPlugin } from '../utils/chartLabels';
import { createInventoryScale } from '../utils/inventoryScale';
import './DetailChart.css';

export default function DetailChart({ data, model }) {
  const chartRef = useRef(null);
  const chartInstance = useRef(null);
  const labelBoundsRef = useRef([]);

  const colors = {
    'mock-source': '#1976d2',
    'carmax': '#f57c00',
    'carvana': '#00a9ce',
    'plattauto': '#43a047'
  };

  useEffect(() => {
    if (!data || data.length === 0 || !model) return;

    // Filter data for selected model
    const sources = [...new Set(data.map(d => d.source))];
    const dates = [...new Set(data.map(d => d.scraped_at.split('T')[0]))].sort();

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
      );
      if (sourceData[item.source] && sourceData[item.source][date]) {
        sourceData[item.source][date].push(...filteredListings);
      }
    });

    // Collect all inventory counts for scaling
    const allCounts = [];
    sources.forEach(source => {
      dates.forEach(date => {
        allCounts.push(sourceData[source][date].length);
      });
    });

    // Create inventory-based size scale
    const getPointSize = createInventoryScale(allCounts);

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

      // Calculate point sizes based on inventory
      const pointRadii = inventoryCounts.map(count => getPointSize(count));

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
                  return label + ': $' + data[0].toLocaleString() + ' - $' + data[1].toLocaleString();
                } else {
                  const price = context.parsed.y;
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

                  return [
                    label + ': $' + price.toLocaleString(),
                    'Stock: ' + stockLabel
                  ];
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
              callback: (value, index) => {
                // Format date as MM/DD
                const dateStr = dates[index];
                const date = new Date(dateStr);
                return `${date.getMonth() + 1}/${date.getDate()}`;
              }
            }
          },
          y: {
            beginAtZero: false,
            stacked: false,
            ticks: {
              callback: value => '$' + value.toLocaleString()
            }
          }
        }
      },
      plugins: [createLabelPlugin(labelBoundsRef)]
    });

    return () => {
      if (chartInstance.current) {
        chartInstance.current.destroy();
      }
    };
  }, [data, model]);

  return (
    <div className="detail-chart">
      <h2>{model} - Price History</h2>
      <div className="chart-container">
        <canvas ref={chartRef}></canvas>
      </div>
    </div>
  );
}
