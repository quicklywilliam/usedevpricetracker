# EV Price Tracker Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a GitHub-based used EV price tracking system with automated scraping, static web frontend, and CLI tool for source management.

**Architecture:** GitHub Actions scrape prices daily → commit JSON files to repo → GitHub Pages serves static site → users view price trends via Chart.js visualizations.

**Tech Stack:** Node.js (scrapers), Vite + React (frontend), Chart.js (charts), GitHub Actions (automation), GitHub Pages (hosting)

---

## Phase 1: Project Setup & Configuration

### Task 1.1: Initialize Node.js Project

**Files:**
- Create: `package.json`
- Create: `README.md`

**Step 1: Initialize package.json**

```bash
cd /Users/admin/dev/usedevpricetracker/.worktrees/ev-price-tracker
npm init -y
```

**Step 2: Update package.json with project details**

```json
{
  "name": "used-ev-price-tracker",
  "version": "1.0.0",
  "description": "Track used electric vehicle prices across multiple sources",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "scrape": "node scrapers/run-all.js",
    "test": "vitest"
  },
  "keywords": ["ev", "price-tracker", "used-cars"],
  "author": "",
  "license": "MIT"
}
```

**Step 3: Create basic README**

```markdown
# Used EV Price Tracker

Track used electric vehicle prices across multiple sources with automated scraping and visualization.

## Architecture

- **Data**: JSON files in `/data/{source}/{date}.json`
- **Scraping**: GitHub Actions run daily
- **Frontend**: Static React app on GitHub Pages
- **Charts**: Chart.js for price visualizations

## Quick Start

```bash
npm install
npm run dev
```

## Adding a New Source

Use the CLI tool to add new price sources with AI assistance:

```bash
npm run add-source
```
```

**Step 4: Commit**

```bash
git add package.json README.md
git commit -m "chore: initialize project with package.json and README"
```

---

### Task 1.2: Install Dependencies

**Files:**
- Modify: `package.json`

**Step 1: Install frontend dependencies**

```bash
npm install vite @vitejs/plugin-react react react-dom chart.js
```

**Step 2: Install scraper dependencies**

```bash
npm install cheerio axios commander
```

**Step 3: Install dev dependencies**

```bash
npm install -D vitest @vitest/ui
```

**Step 4: Verify installation**

Check that `package-lock.json` was created and `node_modules/` exists.

**Step 5: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: install project dependencies"
```

---

### Task 1.3: Create Project Structure

**Files:**
- Create: `config/tracked-models.json`
- Create: `data/.gitkeep`
- Create: `scrapers/lib/.gitkeep`
- Create: `src/App.jsx`
- Create: `src/main.jsx`
- Create: `index.html`
- Create: `vite.config.js`

**Step 1: Create config directory and tracked models**

```bash
mkdir -p config
```

Create `config/tracked-models.json`:
```json
{
  "queries": [
    {
      "make": "Hyundai",
      "model": "Ioniq 5"
    },
    {
      "make": "Tesla",
      "model": "Model 3"
    }
  ]
}
```

**Step 2: Create data directory structure**

```bash
mkdir -p data
touch data/.gitkeep
```

**Step 3: Create scrapers directory structure**

```bash
mkdir -p scrapers/lib
touch scrapers/lib/.gitkeep
```

**Step 4: Create Vite config**

Create `vite.config.js`:
```javascript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: '/',
  build: {
    outDir: 'dist',
    assetsDir: 'assets'
  }
});
```

**Step 5: Create HTML entry point**

Create `index.html`:
```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Used EV Price Tracker</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
```

**Step 6: Create minimal React app**

Create `src/main.jsx`:
```javascript
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

Create `src/App.jsx`:
```javascript
import React from 'react';

function App() {
  return (
    <div>
      <h1>Used EV Price Tracker</h1>
      <p>Coming soon...</p>
    </div>
  );
}

export default App;
```

Create `src/index.css`:
```css
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}
```

**Step 7: Test dev server**

```bash
npm run dev
```

Expected: Server starts on http://localhost:5173, shows "Used EV Price Tracker" heading.

**Step 8: Commit**

```bash
git add config/ data/ scrapers/ src/ index.html vite.config.js
git commit -m "chore: create project structure with Vite and React"
```

---

## Phase 2: Scraper Library Foundation

### Task 2.1: Create Shared Scraper Utilities

**Files:**
- Create: `scrapers/lib/http-client.js`
- Create: `scrapers/lib/rate-limiter.js`
- Create: `scrapers/lib/file-writer.js`

**Step 1: Create HTTP client with retry logic**

Create `scrapers/lib/http-client.js`:
```javascript
import axios from 'axios';

const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export async function fetchPage(url, options = {}) {
  const config = {
    url,
    method: options.method || 'GET',
    headers: {
      'User-Agent': USER_AGENT,
      ...options.headers
    },
    timeout: options.timeout || 30000
  };

  try {
    const response = await axios(config);
    return response.data;
  } catch (error) {
    if (error.response) {
      throw new Error(`HTTP ${error.response.status}: ${error.response.statusText}`);
    } else if (error.request) {
      throw new Error(`No response received from ${url}`);
    } else {
      throw new Error(`Request failed: ${error.message}`);
    }
  }
}
```

**Step 2: Create rate limiter**

Create `scrapers/lib/rate-limiter.js`:
```javascript
export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export class RateLimiter {
  constructor(delayMs = 3000) {
    this.delayMs = delayMs;
    this.lastRequestTime = 0;
  }

  async waitIfNeeded() {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;

    if (timeSinceLastRequest < this.delayMs) {
      const waitTime = this.delayMs - timeSinceLastRequest;
      await sleep(waitTime);
    }

    this.lastRequestTime = Date.now();
  }
}
```

**Step 3: Create file writer utility**

Create `scrapers/lib/file-writer.js`:
```javascript
import fs from 'fs/promises';
import path from 'path';

export async function writeJsonFile(sourceName, data) {
  const date = new Date().toISOString().split('T')[0];
  const dirPath = path.join(process.cwd(), 'data', sourceName);
  const filePath = path.join(dirPath, `${date}.json`);

  // Create directory if it doesn't exist
  await fs.mkdir(dirPath, { recursive: true });

  // Write JSON file
  await fs.writeFile(filePath, JSON.stringify(data, null, 2));

  console.log(`✓ Wrote ${data.listings.length} listings to ${filePath}`);

  return filePath;
}
```

**Step 4: Commit**

```bash
git add scrapers/lib/
git commit -m "feat: add shared scraper utilities (HTTP client, rate limiter, file writer)"
```

---

### Task 2.2: Create Example Scraper (Mock Source)

**Files:**
- Create: `scrapers/mock-source/scrape.js`
- Create: `scrapers/mock-source/config.json`

**Step 1: Create mock scraper config**

Create `scrapers/mock-source/config.json`:
```json
{
  "enabled": true,
  "source_name": "mock-source",
  "rate_limit_delay_ms": 1000
}
```

**Step 2: Create mock scraper**

Create `scrapers/mock-source/scrape.js`:
```javascript
import fs from 'fs/promises';
import { writeJsonFile } from '../lib/file-writer.js';

export async function scrapeMockSource() {
  console.log('Scraping mock-source...');

  // Read tracked models
  const configPath = 'config/tracked-models.json';
  const configData = await fs.readFile(configPath, 'utf-8');
  const config = JSON.parse(configData);

  const listings = [];

  // Generate fake listings for each tracked model
  config.queries.forEach((query, idx) => {
    const basePrice = 30000 + (idx * 5000);
    listings.push({
      id: `mock-${idx + 1}`,
      make: query.make,
      model: query.model,
      year: 2023,
      trim: 'Base',
      price: basePrice + Math.floor(Math.random() * 5000),
      mileage: Math.floor(Math.random() * 50000),
      location: 'San Francisco, CA',
      url: `https://example.com/listing-${idx + 1}`,
      listing_date: new Date().toISOString().split('T')[0]
    });
  });

  const result = {
    source: 'mock-source',
    scraped_at: new Date().toISOString(),
    listings
  };

  await writeJsonFile('mock-source', result);

  return result;
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  scrapeMockSource().catch(console.error);
}
```

**Step 3: Test mock scraper**

```bash
node scrapers/mock-source/scrape.js
```

Expected: Creates `data/mock-source/2025-10-20.json` with 2 listings.

**Step 4: Commit**

```bash
git add scrapers/mock-source/ data/
git commit -m "feat: add mock scraper for testing"
```

---

## Phase 3: Frontend - Data Loading

### Task 3.1: Create Data Loader Service

**Files:**
- Create: `src/services/dataLoader.js`

**Step 1: Create data loader**

Create `src/services/dataLoader.js`:
```javascript
export async function loadAllData() {
  // For local dev, fetch from /data directory
  // For production, fetch from GitHub raw URL or relative path

  const sources = ['mock-source']; // Start with mock, will expand
  const dates = getLast7Days();

  const promises = [];

  for (const source of sources) {
    for (const date of dates) {
      const url = `/data/${source}/${date}.json`;
      promises.push(
        fetch(url)
          .then(r => r.ok ? r.json() : null)
          .catch(() => null)
      );
    }
  }

  const results = await Promise.all(promises);
  return results.filter(r => r !== null);
}

function getLast7Days() {
  const dates = [];
  for (let i = 0; i < 7; i++) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    dates.push(date.toISOString().split('T')[0]);
  }
  return dates;
}

export function getModelKey(listing) {
  return `${listing.make} ${listing.model}`;
}

export function calculateAveragePrice(listings) {
  if (listings.length === 0) return 0;
  const sum = listings.reduce((acc, l) => acc + l.price, 0);
  return Math.round(sum / listings.length);
}

export function calculatePriceStats(listings) {
  if (listings.length === 0) return null;
  const prices = listings.map(l => l.price);
  return {
    min: Math.min(...prices),
    max: Math.max(...prices),
    avg: calculateAveragePrice(listings)
  };
}
```

**Step 2: Commit**

```bash
git add src/services/
git commit -m "feat: add data loader service"
```

---

### Task 3.2: Create Overview Chart Component

**Files:**
- Create: `src/components/OverviewChart.jsx`
- Create: `src/components/OverviewChart.css`

**Step 1: Create overview chart component**

Create `src/components/OverviewChart.jsx`:
```javascript
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
```

Create `src/components/OverviewChart.css`:
```css
.overview-chart {
  background: white;
  border-radius: 8px;
  padding: 1.5rem;
  box-shadow: 0 2px 4px rgba(0,0,0,0.05);
}

.legend {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  margin-bottom: 1rem;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  cursor: pointer;
  padding: 0.5rem;
  border-radius: 4px;
  transition: background 0.2s;
}

.legend-item:hover {
  background: #f5f5f5;
}

.legend-item.disabled {
  opacity: 0.4;
}

.legend-color {
  width: 20px;
  height: 20px;
  border-radius: 4px;
}

.chart-container {
  position: relative;
  height: 400px;
}
```

**Step 2: Commit**

```bash
git add src/components/
git commit -m "feat: add overview chart component"
```

---

### Task 3.3: Update Main App to Load and Display Data

**Files:**
- Modify: `src/App.jsx`
- Modify: `src/index.css`

**Step 1: Update App component**

Update `src/App.jsx`:
```javascript
import React, { useState, useEffect } from 'react';
import { loadAllData } from './services/dataLoader';
import OverviewChart from './components/OverviewChart';

function App() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadAllData()
      .then(results => {
        setData(results);
        setLoading(false);
      })
      .catch(err => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return <div className="loading">Loading price data...</div>;
  }

  if (error) {
    return <div className="error">Error: {error}</div>;
  }

  return (
    <div className="app">
      <header>
        <h1>Used EV Price Tracker</h1>
        <p>Track used electric vehicle prices across multiple sources</p>
      </header>
      <main className="container">
        <OverviewChart data={data} />
      </main>
    </div>
  );
}

export default App;
```

**Step 2: Update global styles**

Update `src/index.css`:
```css
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background: #f5f5f5;
  color: #333;
}

header {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  padding: 2rem;
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
}

header h1 {
  font-size: 2rem;
  margin-bottom: 0.5rem;
}

header p {
  opacity: 0.9;
}

.container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 2rem;
}

.loading, .error {
  text-align: center;
  padding: 4rem 2rem;
  font-size: 1.2rem;
}

.error {
  color: #d32f2f;
}
```

**Step 3: Test the app**

```bash
npm run dev
```

Expected: App loads and displays overview chart with mock data.

**Step 4: Commit**

```bash
git add src/
git commit -m "feat: integrate overview chart into main app"
```

---

## Phase 4: Frontend - Detail View

### Task 4.1: Create Detail Chart Component

**Files:**
- Create: `src/components/DetailChart.jsx`
- Create: `src/components/DetailChart.css`

**Step 1: Create detail chart component**

Create `src/components/DetailChart.jsx`:
```javascript
import React, { useEffect, useRef } from 'react';
import Chart from 'chart.js/auto';
import { calculatePriceStats } from '../services/dataLoader';
import './DetailChart.css';

export default function DetailChart({ data, model }) {
  const chartRef = useRef(null);
  const chartInstance = useRef(null);

  const colors = {
    'mock-source': '#1976d2'
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

    const datasets = [];

    sources.forEach((source, idx) => {
      const avgData = [];
      const minData = [];
      const maxData = [];

      dates.forEach(date => {
        const listings = sourceData[source][date];
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

      const color = colors[source] || '#666';

      // Range bars
      datasets.push({
        label: source.charAt(0).toUpperCase() + source.slice(1) + ' Range',
        data: barData,
        type: 'bar',
        backgroundColor: color + '50',
        borderColor: color,
        borderWidth: 2,
        barThickness: 20,
        order: idx + 1,
        stack: 'overlap',
        base: 0
      });

      // Average line
      datasets.push({
        label: source.charAt(0).toUpperCase() + source.slice(1) + ' Avg',
        data: avgData,
        type: 'line',
        borderColor: color,
        backgroundColor: color,
        borderWidth: 3,
        pointRadius: 6,
        pointHoverRadius: 8,
        tension: 0.3,
        order: 0
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
        interaction: {
          mode: 'index',
          intersect: false
        },
        plugins: {
          legend: {
            display: true,
            position: 'top'
          },
          title: {
            display: true,
            text: 'Price Range by Source (min/avg/max)'
          },
          tooltip: {
            callbacks: {
              label: function(context) {
                const label = context.dataset.label;
                if (label.includes('Range')) {
                  const data = context.raw;
                  return label + ': $' + data[0].toLocaleString() + ' - $' + data[1].toLocaleString();
                } else {
                  return label + ': $' + context.parsed.y.toLocaleString();
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
            stacked: true
          },
          y: {
            beginAtZero: false,
            stacked: false,
            ticks: {
              callback: value => '$' + value.toLocaleString()
            }
          }
        }
      }
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
```

Create `src/components/DetailChart.css`:
```css
.detail-chart {
  background: white;
  border-radius: 8px;
  padding: 1.5rem;
  margin-bottom: 2rem;
  box-shadow: 0 2px 4px rgba(0,0,0,0.05);
}

.detail-chart h2 {
  font-size: 1.5rem;
  margin-bottom: 1rem;
  color: #667eea;
}

.chart-container {
  position: relative;
  height: 400px;
}
```

**Step 2: Commit**

```bash
git add src/components/DetailChart.*
git commit -m "feat: add detail chart component with price ranges"
```

---

### Task 4.2: Create Listings Table Component

**Files:**
- Create: `src/components/ListingsTable.jsx`
- Create: `src/components/ListingsTable.css`

**Step 1: Create listings table**

Create `src/components/ListingsTable.jsx`:
```javascript
import React from 'react';
import './ListingsTable.css';

export default function ListingsTable({ data, model }) {
  if (!data || data.length === 0 || !model) {
    return null;
  }

  // Get latest data only
  const latestDate = data
    .map(d => d.scraped_at)
    .sort()
    .reverse()[0]
    ?.split('T')[0];

  const latestData = data.filter(
    d => d.scraped_at.startsWith(latestDate)
  );

  const listings = [];
  latestData.forEach(sourceData => {
    sourceData.listings.forEach(listing => {
      if (`${listing.make} ${listing.model}` === model) {
        listings.push({ ...listing, source: sourceData.source });
      }
    });
  });

  // Sort by price
  listings.sort((a, b) => a.price - b.price);

  const sourceColors = {
    'mock-source': 'source-mock'
  };

  return (
    <div className="listings-table">
      <h2>Current Listings</h2>
      <table>
        <thead>
          <tr>
            <th>Source</th>
            <th>Year</th>
            <th>Trim</th>
            <th>Price</th>
            <th>Mileage</th>
            <th>Location</th>
            <th>Link</th>
          </tr>
        </thead>
        <tbody>
          {listings.map((listing, idx) => (
            <tr key={idx}>
              <td>
                <span className={`source-badge ${sourceColors[listing.source] || 'source-default'}`}>
                  {listing.source}
                </span>
              </td>
              <td>{listing.year}</td>
              <td>{listing.trim}</td>
              <td className="price">${listing.price.toLocaleString()}</td>
              <td>{listing.mileage.toLocaleString()} mi</td>
              <td>{listing.location}</td>
              <td>
                <a href={listing.url} target="_blank" rel="noopener noreferrer">
                  View
                </a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

Create `src/components/ListingsTable.css`:
```css
.listings-table {
  background: white;
  border-radius: 8px;
  padding: 1.5rem;
  box-shadow: 0 2px 4px rgba(0,0,0,0.05);
}

.listings-table h2 {
  font-size: 1.5rem;
  margin-bottom: 1rem;
  color: #667eea;
}

table {
  width: 100%;
  border-collapse: collapse;
}

th, td {
  text-align: left;
  padding: 0.75rem;
  border-bottom: 1px solid #e0e0e0;
}

th {
  background: #f8f9fa;
  font-weight: 600;
  color: #667eea;
}

tr:hover {
  background: #f8f9fa;
}

.source-badge {
  display: inline-block;
  padding: 0.25rem 0.75rem;
  border-radius: 12px;
  font-size: 0.875rem;
  font-weight: 500;
}

.source-mock {
  background: #e3f2fd;
  color: #1976d2;
}

.source-default {
  background: #f5f5f5;
  color: #666;
}

.price {
  font-weight: 600;
  color: #2e7d32;
}

a {
  color: #667eea;
  text-decoration: none;
}

a:hover {
  text-decoration: underline;
}
```

**Step 2: Commit**

```bash
git add src/components/ListingsTable.*
git commit -m "feat: add listings table component"
```

---

### Task 4.3: Add URL Routing and Model Selection

**Files:**
- Modify: `src/App.jsx`

**Step 1: Update App with routing and detail view**

Update `src/App.jsx`:
```javascript
import React, { useState, useEffect } from 'react';
import { loadAllData, getModelKey } from './services/dataLoader';
import OverviewChart from './components/OverviewChart';
import DetailChart from './components/DetailChart';
import ListingsTable from './components/ListingsTable';

function App() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedModel, setSelectedModel] = useState(null);

  useEffect(() => {
    loadAllData()
      .then(results => {
        setData(results);
        setLoading(false);

        // Load from URL
        const url = new URL(window.location);
        const modelParam = url.searchParams.get('model');
        if (modelParam && modelParam !== 'all') {
          setSelectedModel(modelParam);
        }
      })
      .catch(err => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  // Handle browser back/forward
  useEffect(() => {
    const handlePopState = () => {
      const url = new URL(window.location);
      const modelParam = url.searchParams.get('model');
      setSelectedModel(modelParam && modelParam !== 'all' ? modelParam : null);
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const handleModelSelect = (model) => {
    const url = new URL(window.location);
    if (model === 'all' || !model) {
      url.searchParams.delete('model');
      setSelectedModel(null);
    } else {
      url.searchParams.set('model', model);
      setSelectedModel(model);
    }
    window.history.pushState({}, '', url);
  };

  if (loading) {
    return <div className="loading">Loading price data...</div>;
  }

  if (error) {
    return <div className="error">Error: {error}</div>;
  }

  const models = data.length > 0
    ? [...new Set(data.flatMap(d => d.listings.map(getModelKey)))]
    : [];

  return (
    <div className="app">
      <header>
        <h1>Used EV Price Tracker</h1>
        <p>Track used electric vehicle prices across multiple sources</p>
      </header>
      <main className="container">
        <div className="nav">
          <button
            className={!selectedModel ? 'active' : ''}
            onClick={() => handleModelSelect(null)}
          >
            All Models Overview
          </button>
          <button
            className={selectedModel ? 'active' : ''}
            disabled={!selectedModel}
          >
            Model Detail
          </button>
          <select
            value={selectedModel || 'all'}
            onChange={(e) => handleModelSelect(e.target.value === 'all' ? null : e.target.value)}
            style={{ marginLeft: 'auto' }}
          >
            <option value="all">All Models</option>
            {models.map(model => (
              <option key={model} value={model}>{model}</option>
            ))}
          </select>
        </div>

        {!selectedModel ? (
          <OverviewChart data={data} onModelClick={handleModelSelect} />
        ) : (
          <>
            <div className="breadcrumb">
              <a href="#" onClick={(e) => { e.preventDefault(); handleModelSelect(null); }}>
                All Models
              </a> / {selectedModel}
            </div>
            <DetailChart data={data} model={selectedModel} />
            <ListingsTable data={data} model={selectedModel} />
          </>
        )}
      </main>
    </div>
  );
}

export default App;
```

**Step 2: Add navigation styles**

Update `src/index.css` to add navigation and breadcrumb styles:
```css
/* Add to existing styles */

.nav {
  background: white;
  border-radius: 8px;
  padding: 1rem;
  margin-bottom: 2rem;
  box-shadow: 0 2px 4px rgba(0,0,0,0.05);
  display: flex;
  gap: 1rem;
  align-items: center;
}

.nav button {
  padding: 0.75rem 1.5rem;
  border: none;
  border-radius: 6px;
  background: #f0f0f0;
  color: #333;
  cursor: pointer;
  font-size: 1rem;
  transition: all 0.2s;
}

.nav button:hover:not(:disabled) {
  background: #e0e0e0;
}

.nav button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.nav button.active {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
}

.nav select {
  padding: 0.5rem 1rem;
  border: 2px solid #e0e0e0;
  border-radius: 6px;
  font-size: 1rem;
  background: white;
  cursor: pointer;
}

.nav select:focus {
  outline: none;
  border-color: #667eea;
}

.breadcrumb {
  margin-bottom: 1rem;
  color: #666;
}

.breadcrumb a {
  color: #667eea;
  text-decoration: none;
}

.breadcrumb a:hover {
  text-decoration: underline;
}
```

**Step 3: Test the routing**

```bash
npm run dev
```

Expected:
- Overview shows by default
- Selecting a model updates URL and shows detail view
- Browser back button works
- Refreshing page with ?model=Tesla%20Model%203 loads detail view

**Step 4: Commit**

```bash
git add src/
git commit -m "feat: add URL routing and model detail views"
```

---

## Phase 5: GitHub Actions Setup

### Task 5.1: Create Scraper Runner Script

**Files:**
- Create: `scrapers/run-all.js`

**Step 1: Create orchestrator script**

Create `scrapers/run-all.js`:
```javascript
#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function runAllScrapers() {
  console.log('Starting scraper run...\n');

  const scrapersDir = __dirname;
  const entries = await fs.readdir(scrapersDir, { withFileTypes: true });

  const results = {
    succeeded: [],
    failed: []
  };

  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name === 'lib') continue;

    const configPath = path.join(scrapersDir, entry.name, 'config.json');
    const scrapePath = path.join(scrapersDir, entry.name, 'scrape.js');

    try {
      // Check if config and scrape exist
      await fs.access(configPath);
      await fs.access(scrapePath);

      // Read config
      const configData = await fs.readFile(configPath, 'utf-8');
      const config = JSON.parse(configData);

      if (!config.enabled) {
        console.log(`⊘ Skipping ${entry.name} (disabled in config)`);
        continue;
      }

      console.log(`Running ${entry.name}...`);

      // Import and run scraper
      const scraper = await import(scrapePath);
      const scraperFn = Object.values(scraper).find(v => typeof v === 'function');

      if (scraperFn) {
        await scraperFn();
        results.succeeded.push(entry.name);
      } else {
        throw new Error('No exported function found');
      }
    } catch (error) {
      console.error(`✗ ${entry.name} failed:`, error.message);
      results.failed.push(entry.name);
    }

    console.log('');
  }

  // Summary
  console.log('--- Summary ---');
  console.log(`✓ Succeeded: ${results.succeeded.length} (${results.succeeded.join(', ') || 'none'})`);
  console.log(`✗ Failed: ${results.failed.length} (${results.failed.join(', ') || 'none'})`);

  return results;
}

runAllScrapers().catch(console.error);
```

**Step 2: Test the runner**

```bash
chmod +x scrapers/run-all.js
npm run scrape
```

Expected: Runs mock-source scraper successfully.

**Step 3: Commit**

```bash
git add scrapers/run-all.js
git commit -m "feat: add scraper orchestrator script"
```

---

### Task 5.2: Create GitHub Actions Workflow

**Files:**
- Create: `.github/workflows/scrape-prices.yml`

**Step 1: Create workflow file**

```bash
mkdir -p .github/workflows
```

Create `.github/workflows/scrape-prices.yml`:
```yaml
name: Scrape Used EV Prices

on:
  schedule:
    # Run daily at midnight UTC
    - cron: '0 0 * * *'
  workflow_dispatch: # Allow manual triggers

jobs:
  scrape:
    runs-on: ubuntu-latest

    steps:
      - name: Checkout repository
        uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Run scrapers
        run: npm run scrape

      - name: Commit and push data
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"

          # Check if there are changes
          if [ -n "$(git status --porcelain)" ]; then
            DATE=$(date +%Y-%m-%d)
            SUCCEEDED=$(ls data/*/2*.json 2>/dev/null | wc -l)

            git add data/
            git commit -m "chore: update prices for ${DATE} (${SUCCEEDED} sources)"
            git push
          else
            echo "No new data to commit"
          fi
```

**Step 2: Commit**

```bash
git add .github/
git commit -m "ci: add GitHub Actions workflow for daily scraping"
```

---

### Task 5.3: Configure GitHub Pages

**Files:**
- Create: `.github/workflows/deploy.yml`

**Step 1: Create deploy workflow**

Create `.github/workflows/deploy.yml`:
```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

jobs:
  build:
    runs-on: ubuntu-latest

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Build
        run: npm run build

      - name: Upload artifact
        uses: actions/upload-pages-artifact@v3
        with:
          path: ./dist

  deploy:
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    runs-on: ubuntu-latest
    needs: build

    steps:
      - name: Deploy to GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v4
```

**Step 2: Update Vite config for GitHub Pages**

Update `vite.config.js` to set correct base path:
```javascript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: process.env.GITHUB_REPOSITORY
    ? `/${process.env.GITHUB_REPOSITORY.split('/')[1]}/`
    : '/',
  build: {
    outDir: 'dist',
    assetsDir: 'assets'
  }
});
```

**Step 3: Commit**

```bash
git add .github/workflows/deploy.yml vite.config.js
git commit -m "ci: add GitHub Pages deployment workflow"
```

---

## Phase 6: Documentation

### Task 6.1: Update README

**Files:**
- Modify: `README.md`

**Step 1: Write comprehensive README**

Update `README.md`:
```markdown
# Used EV Price Tracker

Track used electric vehicle prices across multiple sources with automated daily scraping and interactive visualizations.

## Features

- 📊 **Interactive Price Charts** - View price trends across all models or drill down to specific vehicles
- 🤖 **Automated Scraping** - GitHub Actions runs scrapers daily to collect fresh data
- 🎯 **Multi-Source Tracking** - Aggregate prices from multiple marketplaces and dealers
- 📈 **Historical Trends** - See how prices change over time with candlestick-style range visualization
- 🌐 **Zero Cost Hosting** - Fully static site hosted on GitHub Pages
- 🔗 **Shareable URLs** - Direct links to specific model views

## Architecture

```
┌─────────────────┐
│  GitHub Actions │  ← Daily cron job
│   (Scrapers)    │
└────────┬────────┘
         │ commits
         ↓
┌─────────────────┐
│   Data Layer    │  ← JSON files in /data/{source}/{date}.json
│   (Git repo)    │
└────────┬────────┘
         │ serves
         ↓
┌─────────────────┐
│ GitHub Pages    │  ← Static React app with Chart.js
│   (Frontend)    │
└─────────────────┘
```

## Quick Start

### Local Development

```bash
# Install dependencies
npm install

# Run dev server
npm run dev

# Build for production
npm run build
```

### Run Scrapers Locally

```bash
# Run all enabled scrapers
npm run scrape
```

## Project Structure

```
├── config/
│   └── tracked-models.json      # Models to track
├── data/
│   └── {source}/
│       └── {date}.json          # Price data per source per day
├── scrapers/
│   ├── lib/                     # Shared utilities
│   └── {source}/
│       ├── config.json          # Source configuration
│       └── scrape.js            # Scraper implementation
├── src/
│   ├── components/              # React components
│   ├── services/                # Data loading & processing
│   └── App.jsx                  # Main app
└── .github/workflows/
    ├── scrape-prices.yml        # Daily scraping
    └── deploy.yml               # Deploy to GitHub Pages
```

## Adding a New Source

Each scraper lives in its own directory under `/scrapers/{source}/`:

1. Create directory: `scrapers/new-source/`
2. Add config: `scrapers/new-source/config.json`
3. Add scraper: `scrapers/new-source/scrape.js`

### Example Scraper

```javascript
import { writeJsonFile } from '../lib/file-writer.js';
import { fetchPage } from '../lib/http-client.js';
import { RateLimiter } from '../lib/rate-limiter.js';

export async function scrapeNewSource() {
  const rateLimiter = new RateLimiter(3000); // 3 second delay

  const listings = [];

  // Your scraping logic here
  await rateLimiter.waitIfNeeded();
  const html = await fetchPage('https://example.com/search');
  // Parse HTML and extract listings...

  const result = {
    source: 'new-source',
    scraped_at: new Date().toISOString(),
    listings
  };

  await writeJsonFile('new-source', result);
  return result;
}
```

## Tracked Models

Edit `config/tracked-models.json` to add/remove models:

```json
{
  "queries": [
    {
      "make": "Hyundai",
      "model": "Ioniq 5"
    },
    {
      "make": "Tesla",
      "model": "Model 3"
    }
  ]
}
```

## Data Format

Each source file (`data/{source}/{date}.json`) follows this schema:

```json
{
  "source": "carmax",
  "scraped_at": "2025-10-20T00:15:32Z",
  "listings": [
    {
      "id": "listing-12345",
      "make": "Tesla",
      "model": "Model 3",
      "year": 2021,
      "trim": "Long Range",
      "price": 32500,
      "mileage": 45000,
      "location": "San Francisco, CA",
      "url": "https://...",
      "listing_date": "2025-10-15"
    }
  ]
}
```

## GitHub Actions Setup

The project uses two workflows:

1. **scrape-prices.yml** - Runs daily at midnight UTC, executes all scrapers and commits data
2. **deploy.yml** - Builds and deploys frontend to GitHub Pages on push to main

Both workflows run automatically. You can also trigger them manually from the Actions tab.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Add your scraper or improvements
4. Submit a pull request

## License

MIT
```

**Step 2: Commit**

```bash
git add README.md
git commit -m "docs: update README with comprehensive documentation"
```

---

## Summary

This implementation plan provides a complete, working EV price tracker with:

✅ **Frontend**: React app with Chart.js visualizations, URL routing, overview and detail views
✅ **Data Layer**: JSON files organized by source and date
✅ **Scrapers**: Modular scraper system with shared utilities and mock example
✅ **Automation**: GitHub Actions for daily scraping and deployment
✅ **Documentation**: Complete README with architecture and usage

### Next Steps After Implementation

1. **Add Real Scrapers**: Replace mock-source with actual scrapers for CarMax, Carvana, etc.
2. **CLI Tool**: Build the `add-source` CLI tool mentioned in the design (future enhancement)
3. **Testing**: Add unit tests for data processing and component rendering
4. **Error Handling**: Improve error handling and reporting in scrapers
5. **Performance**: Add caching and lazy loading if dataset grows large

### Verification Checklist

- [ ] Dev server runs and shows overview chart
- [ ] Mock scraper generates data files
- [ ] Detail view shows price ranges and listings
- [ ] URL routing works (shareable links)
- [ ] GitHub Actions workflows are valid YAML
- [ ] Build succeeds: `npm run build`
- [ ] All files committed to Git
