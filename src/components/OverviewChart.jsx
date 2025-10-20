import React, { useEffect, useRef, useState } from 'react';
import Chart from 'chart.js/auto';
import { getModelKey, calculateAveragePrice } from '../services/dataLoader';
import './OverviewChart.css';

export default function OverviewChart({ data, onModelClick }) {
  const chartRef = useRef(null);
  const chartInstance = useRef(null);
  const [hiddenModels, setHiddenModels] = useState(new Set());

  const modelColors = {
    'Hyundai Ioniq 5': '#667eea',
    'Tesla Model 3': '#f59e0b'
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
        tension: 0.3,
        hidden: hiddenModels.has(model)
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
        plugins: {
          legend: {
            display: false
          },
          title: {
            display: true,
            text: 'Average Price Trends Across All Sources'
          }
        },
        scales: {
          y: {
            beginAtZero: false,
            ticks: {
              callback: value => '$' + value.toLocaleString()
            }
          }
        },
        onClick: (event, elements) => {
          if (elements.length > 0 && onModelClick) {
            const datasetIndex = elements[0].datasetIndex;
            const model = models[datasetIndex];
            onModelClick(model);
          }
        }
      }
    });

    return () => {
      if (chartInstance.current) {
        chartInstance.current.destroy();
      }
    };
  }, [data, hiddenModels]);

  const toggleModel = (model) => {
    setHiddenModels(prev => {
      const newSet = new Set(prev);
      if (newSet.has(model)) {
        newSet.delete(model);
      } else {
        newSet.add(model);
      }
      return newSet;
    });
  };

  const models = data.length > 0
    ? [...new Set(data.flatMap(d => d.listings.map(getModelKey)))]
    : [];

  return (
    <div className="overview-chart">
      <div className="legend">
        {models.map(model => (
          <div
            key={model}
            className={`legend-item ${hiddenModels.has(model) ? 'disabled' : ''}`}
            onClick={() => toggleModel(model)}
          >
            <div
              className="legend-color"
              style={{ background: modelColors[model] || '#666' }}
            />
            <span>{model}</span>
          </div>
        ))}
      </div>
      <div className="chart-container">
        <canvas ref={chartRef}></canvas>
      </div>
    </div>
  );
}
