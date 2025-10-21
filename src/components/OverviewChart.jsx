import React, { useEffect, useRef } from 'react';
import Chart from 'chart.js/auto';
import { getModelKey, calculateAveragePrice } from '../services/dataLoader';
import './OverviewChart.css';

export default function OverviewChart({ data, onModelSelect }) {
  const chartRef = useRef(null);
  const chartInstance = useRef(null);
  const labelsContainerRef = useRef(null);

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
    'Audi Q4 e-tron': '#d946ef'
  };

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
          priceData[model][date].push(listing);
        }
      });
    });

    const datasets = models.map(model => {
      const dataPoints = dates.map(date => {
        const listings = priceData[model][date];
        return listings.length > 0 ? calculateAveragePrice(listings) : null;
      });

      return {
        label: model,
        data: dataPoints,
        borderColor: modelColors[model] || '#666',
        backgroundColor: (modelColors[model] || '#666') + '20',
        tension: 0.3
      };
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
            callbacks: {
              title: (context) => {
                // Format date as MM/DD
                const dateStr = context[0].label;
                const date = new Date(dateStr);
                return `${date.getMonth() + 1}/${date.getDate()}`;
              },
              label: (context) => {
                // Show model name and price
                const modelName = context.dataset.label;
                const price = context.parsed.y;
                return `${modelName}: $${price.toLocaleString()}`;
              }
            }
          }
        },
        scales: {
          x: {
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
            ticks: {
              callback: value => '$' + value.toLocaleString()
            }
          }
        },
        onClick: (event, elements) => {
          if (elements.length > 0 && onModelSelect) {
            const datasetIndex = elements[0].datasetIndex;
            const model = models[datasetIndex];
            onModelSelect(model);
          }
        }
      },
      plugins: [{
        afterDatasetsDraw: (chart) => {
          const ctx = chart.ctx;

          // First pass: collect all label positions
          const labels = [];
          chart.data.datasets.forEach((dataset, i) => {
            const meta = chart.getDatasetMeta(i);
            if (!meta.hidden && meta.data.length > 0) {
              const lastPoint = meta.data[meta.data.length - 1];

              labels.push({
                text: dataset.label,
                model: dataset.label,
                color: dataset.borderColor,
                dataPointX: lastPoint.x,
                dataPointY: lastPoint.y,
                x: lastPoint.x + 20,
                y: lastPoint.y,
                height: 16
              });
            }
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

              labelsContainerRef.current.appendChild(linkEl);
            });
          }
        }
      }]
    });

    return () => {
      if (chartInstance.current) {
        chartInstance.current.destroy();
      }
    };
  }, [data, onModelSelect]);

  const models = data.length > 0
    ? [...new Set(data.flatMap(d => d.listings.map(getModelKey)))]
    : [];

  return (
    <div className="overview-chart">
      <div className="chart-container">
        <canvas ref={chartRef}></canvas>
        <div ref={labelsContainerRef} className="chart-labels"></div>
      </div>
    </div>
  );
}
