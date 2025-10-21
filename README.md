# Used EV Price Tracker

Track used electric vehicle prices across multiple sources with automated scraping and visualization.

## Features

- **Automated Daily Scraping**: GitHub Actions runs scrapers daily at midnight UTC
- **Multiple Sources**: CarMax, Carvana, Platt Auto, and extensible to more
- **11 EV Models Tracked**: Tesla Model 3/Y/S/X, Nissan Leaf/Ariya, Chevy Bolt EV/EUV, Ford Mustang Mach-E, Hyundai Ioniq 5, Volkswagen ID.4
- **Interactive Visualizations**:
  - Overview chart showing average prices across all models
  - Detail charts with price ranges and individual listings
  - Clickable labels and direct line labels
- **Static Deployment**: Hosted on GitHub Pages with no backend required

## Live Demo

Visit the live tracker at: https://quicklywilliam.github.io/usedevpricetracker/

## Architecture

- **Data Storage**: JSON files in `/data/{source}/{date}.json` committed to repository
- **Scraping**: Puppeteer-based scrapers running in GitHub Actions
- **Frontend**: React app with Chart.js visualizations
- **Deployment**: GitHub Pages for static hosting
- **Workflows**:
  - `deploy.yml`: Runs on every push to main, builds and deploys frontend only
  - `scrape-and-deploy.yml`: Runs daily at midnight UTC, scrapes all sources, commits data, then deploys

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
node scrapers/carmax/scrape.js
node scrapers/carvana/scrape.js
node scrapers/plattauto/scrape.js
```

Run mock scraper for testing:
```bash
node scrapers/mock-source/scrape.js
```

### Generate Mock Historical Data

For testing visualizations with multiple days of data:
```bash
node scrapers/generate-mock-history.js
```

## Project Structure

```
.
├── .github/workflows/
│   ├── deploy.yml              # Deploy-only workflow (on push)
│   └── scrape-and-deploy.yml   # Daily scraping workflow
├── data/                       # Scraped price data (JSON)
│   ├── carmax/
│   ├── carvana/
│   ├── plattauto/
│   └── mock-source/
├── scrapers/
│   ├── shared/
│   │   └── scraper-utils.js    # Shared scraper utilities
│   ├── carmax/
│   │   └── scrape.js
│   ├── carvana/
│   │   └── scrape.js
│   ├── plattauto/
│   │   └── scrape.js
│   ├── mock-source/
│   │   └── scrape.js
│   ├── run-all.js              # Run all scrapers sequentially
│   └── generate-mock-history.js
├── src/
│   ├── components/
│   │   ├── OverviewChart.jsx   # Main overview with all models
│   │   ├── DetailChart.jsx     # Per-model price ranges
│   │   └── ListingsTable.jsx   # Individual listings table
│   ├── services/
│   │   └── dataLoader.js       # Load and process JSON data
│   ├── utils/
│   │   └── chartLabels.js      # Reusable chart label plugin
│   └── App.jsx
├── config/
│   └── models.json             # EV models to track
└── vite.config.js              # Vite config with data copy plugin
```

## Adding a New Scraper

All scrapers use shared utilities from `scrapers/shared/scraper-utils.js` for consistency:

1. **Create scraper directory**:
   ```bash
   mkdir scrapers/newsource
   ```

2. **Create `scrape.js`** using the template pattern:
   ```javascript
   import { setupScraper, scrapeModel } from '../shared/scraper-utils.js';

   const SOURCE_NAME = 'newsource';

   async function scrapeListings(page, make, model) {
     const url = buildSearchUrl(make, model);
     await page.goto(url, { waitUntil: 'networkidle0' });

     return await page.evaluate(() => {
       const listings = [];
       document.querySelectorAll('.listing-card').forEach(card => {
         listings.push({
           price: parseInt(card.querySelector('.price').textContent.replace(/\D/g, '')),
           year: parseInt(card.querySelector('.year').textContent),
           trim: card.querySelector('.trim').textContent.trim(),
           mileage: parseInt(card.querySelector('.mileage').textContent.replace(/\D/g, '')),
           url: card.querySelector('a').href
         });
       });
       return listings;
     });
   }

   function buildSearchUrl(make, model) {
     return `https://newsource.com/cars/${make}-${model}`;
   }

   (async () => {
     const { browser, models } = await setupScraper(SOURCE_NAME);

     try {
       for (const { make, model } of models) {
         await scrapeModel(browser, SOURCE_NAME, make, model, scrapeListings);
       }
     } finally {
       await browser.close();
     }
   })();
   ```

3. **Add to run-all.js** in the scrapers array

4. **Test locally**:
   ```bash
   node scrapers/newsource/scrape.js
   ```

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

## Data Format

Each scraper outputs JSON files with this structure:

```json
{
  "source": "carmax",
  "date": "2025-10-20",
  "listings": [
    {
      "make": "Tesla",
      "model": "Model 3",
      "year": 2023,
      "trim": "Long Range",
      "price": 35990,
      "mileage": 12500,
      "url": "https://..."
    }
  ]
}
```

## Tracked Models

Configured in `config/models.json`:

- Tesla: Model 3, Model Y, Model S, Model X
- Nissan: Leaf, Ariya
- Chevrolet: Bolt EV, Bolt EUV
- Ford: Mustang Mach-E
- Hyundai: Ioniq 5
- Volkswagen: ID.4

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

### Models to Track

Edit `config/models.json` to add/remove models:

```json
[
  { "make": "Tesla", "model": "Model 3" },
  { "make": "Nissan", "model": "Ariya" }
]
```

## License

MIT
