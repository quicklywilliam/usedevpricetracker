# Used EV Price Tracker

A website tracking used EV prices, currently live [here](https://quicklywilliam.github.io/usedevpricetracker/). It's part market tracker, part price guide, part shopping tool. This is currently just a small hobby project, but bug reports and feature requests are welcome.

## Features

- **Multiple Sources**: CarMax, Carvana and Autotrader. Easiy extensible to more
- **Tracks Individua EV Models**: Currently tracks 16 different models, see [tracked-models.json](https://github.com/quicklywilliam/usedevpricetracker/blob/main/config/tracked-models.json).
- **Interactive Visualizations**:

## Architecture

- **Static Deployment**: Hosted on GitHub Pages with no backend required
- **Automated Daily Data Digestion**: GitHub Actions runs scrappers daily at midnight UTC
- **Simple Data Storage**: JSON files in `/data/{source}/{date}.json` committed to repository
- **Frontend**: React app with Chart.js visualizations

## Quick Start

### Run Frontend Locally

```bash
npm install
npm run dev
```

Visit http://localhost:5173

### Run Scrapers Locally

Run all scrapers:
```bash
node scrapers/run-all.js
```

Run a specific scraper:
```bash
node scrapers/run-all.js --source=carvana
```

Run mock scraper for testing:
```bash
node scrapers/mock-source/scrape.js
```

### Generate Mock Historical Data

For testing visualizations with multiple days of data:
```bash
node scrapers/mock-source/generate-mock-history.js
```

## Project Structure

```
.
├── .github/workflows/
│   ├── deploy.yml              # Deploy-only workflow (on push)
│   └── scrape-and-deploy.yml   # Daily scraping workflow
├── data/                       # Scraped price data (JSON)
│   ├── autotrader/
│   ├── carmax/
│   ├── carvana/
│   ├── plattauto/
│   └── mock-source/
├── scrapers/
│   ├── lib/                    # Shared scraper utilities
│   │   ├── base-scraper.js     # Abstract base scraper class
│   │   ├── config.js           # Shared configuration
│   │   ├── file-writer.js      # Data persistence utilities
│   │   ├── http-client.js      # HTTP request utilities
│   │   ├── rate-limiter.js     # Request rate limiting
│   │   └── status-validator.js # Data validation utilities
│   ├── autotrader/
│   │   ├── config.json
│   │   ├── scrape.js
│   │   ├── scrape.test.js
│   │   └── README.md
│   ├── carmax/
│   │   ├── config.json
│   │   └── scrape.js
│   ├── carvana/
│   │   ├── config.json
│   │   └── scrape.js
│   ├── plattauto/
│   │   ├── config.json
│   │   └── scrape.js
│   ├── mock-source/
│   │   ├── config.json
│   │   ├── scrape.js
│   │   └── generate-mock-history.js
│   ├── run-all.js              # Run all scrapers sequentially
│   └── TEMPLATE.md             # Template for new scrapers
├── src/
│   ├── components/
│   │   ├── DetailChart.jsx     # Per-model price ranges chart
│   │   ├── DetailChart.css
│   │   ├── Footer.jsx          # Site footer
│   │   ├── Footer.css
│   │   ├── ListingsTable.jsx   # Individual listings table
│   │   ├── ListingsTable.css
│   │   ├── ModelListingsView.jsx # Model-specific listings view
│   │   ├── ModelListingsView.css
│   │   ├── NewListings.jsx     # New listings panel
│   │   ├── NewListings.css
│   │   ├── NoTeslaToggle.jsx   # Toggle to exclude Tesla
│   │   ├── NoTeslaToggle.css
│   │   ├── OverviewChart.jsx   # Main overview with all models
│   │   ├── OverviewChart.css
│   │   ├── VehicleListingTabs.jsx # Tabs for switching between models
│   │   └── VehicleListingTabs.css
│   ├── services/
│   │   └── dataLoader.js       # Load and process JSON data
│   ├── utils/
│   │   ├── chartLabels.js      # Reusable chart label plugin
│   │   ├── inventoryScale.js   # Inventory scale calculations
│   │   ├── modelCategories.js  # Model categorization logic
│   │   └── numberFormat.js     # Number formatting utilities
│   ├── App.jsx                 # Main application component
│   ├── main.jsx                # Application entry point
│   └── index.css               # Global styles
├── config/
│   └── tracked-models.json     # EV models to track
├── index.html                  # HTML template
└── vite.config.js              # Vite config with data copy plugin
```

## Adding a New Scraper

All scrapers use shared utilities from `scrapers/lib` for consistency. See [here](https://github.com/quicklywilliam/usedevpricetracker/blob/main/scrapers/TEMPLATE.md) for more information.

## GitHub Actions Workflows

### Deploy Workflow (`deploy.yml`)

- **Triggers**: Push to main, manual workflow dispatch
- **Purpose**: Fast deployment of frontend changes
- **Steps**:
  1. Checkout repository
  2. Install dependencies
  3. Build frontend (includes copying data directory)
  4. Deploy to GitHub Pages

### Scrape and Deploy Workflow (`scrape-and-deploy.yml`)

- **Triggers**: Daily at midnight UTC, manual workflow dispatch
- **Purpose**: Collect fresh price data and update site
- **Steps**:
  1. Checkout repository
  2. Install dependencies and Chromium
  3. Run all scrapers (model-first iteration)
  4. Commit scraped data to repository
  5. Build frontend
  6. Deploy to GitHub Pages

### Manual Trigger

To manually run the scraping workflow:
```bash
gh workflow run "Scrape Prices and Deploy"
```

## Development

### Build for Production

```bash
npm run build
```

### Test Production Build Locally

```bash
# Build the app
npm run build

# Create symlink for correct base path
ln -s dist usedevpricetracker

# Serve from project root
python3 -m http.server 8001

# Visit http://localhost:8001/usedevpricetracker/
```

## Configuration

### Vite Base Path

The app is configured for GitHub Pages deployment at `/usedevpricetracker/`:

```javascript
// vite.config.js
export default defineConfig({
  base: '/usedevpricetracker/'
});
```

## License

MIT
