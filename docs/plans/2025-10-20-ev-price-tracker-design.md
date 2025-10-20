# EV Used Price Tracker - Design Document

**Date:** 2025-10-20
**Status:** Approved

## Overview

A web application that tracks used electric vehicle (EV) prices across multiple sources (dealer websites, marketplaces, APIs). The system uses GitHub as both data store and compute platform, with GitHub Actions performing daily scraping and GitHub Pages hosting a static web frontend.

## Goals

- Track used market prices for various EV models over time
- Visualize price trends through interactive charts
- Support multiple data sources (web scraping + third-party APIs)
- Enable community contributions of new data sources
- Zero hosting costs using GitHub infrastructure

## Architecture

### Core Components

1. **Data Layer**: JSON files stored in Git
2. **Collection Layer**: GitHub Actions running daily scrapers
3. **Presentation Layer**: Static web app hosted on GitHub Pages

### Data Flow

```
GitHub Action (cron: daily midnight)
  → Run scraper scripts (Node.js)
  → Generate JSON files per source per day
  → Commit to repository
  → Trigger GitHub Pages rebuild
  → Users fetch JSON files from GitHub
```

## Data Structure

### Directory Layout

```
/data
  /carmax
    /2025-10-20.json
    /2025-10-21.json
  /carvana
    /2025-10-20.json
  /autotrader
    /2025-10-20.json
  /kelley-blue-book-api
    /2025-10-20.json
```

**Benefits:**
- Each source isolated (failures don't cascade)
- Easy to add new sources (new directory)
- Community can contribute via PRs
- Different sources can run on different schedules
- Source-specific schemas possible

### JSON Schema

Each source file follows this structure:

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

### Tracked Models Configuration

`/config/tracked-models.json`:

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

**Design note:** Using "queries" instead of "models" allows future extensibility (year filters, trim filters, etc.) while starting simple with just make/model.

## Scraper Implementation

### Directory Structure

```
/scrapers
  /lib
    /http-client.js       # Shared HTTP utilities
    /rate-limiter.js      # Request throttling
    /parser-helpers.js    # Common parsing functions
  /carmax
    /scrape.js           # Main scraper script
    /config.json         # Source-specific config
  /carvana
    /scrape.js
    /config.json
```

### Scraper Strategy

**Minimally invasive approach:**
- Target specific search result pages only
- Small number of requests per source (typically 1-5 per model)
- 2-5 second delays between requests
- Reasonable timeouts (30s per request, 5min per source)
- Honest user-agent identification

**Graceful failure handling:**
- If blocked (403/429): log warning, preserve previous data, retry tomorrow
- If page structure changes: log parsing error, skip source
- Individual source failures don't crash entire workflow
- No empty files committed on failure

**Priority:**
- Use third-party APIs where available (more reliable)
- Use web scraping for sites without APIs
- Accept that some sources will be fragile and need maintenance

### Source Configuration

Each source has `/scrapers/{source}/config.json`:

```json
{
  "enabled": true,
  "base_url": "https://carmax.com",
  "rate_limit_delay_ms": 3000,
  "timeout_ms": 30000,
  "max_results_per_model": 100
}
```

## GitHub Actions Workflow

### Workflow Files

```
.github/workflows/
  scrape-all-sources.yml    # Main orchestrator
  scrape-carmax.yml         # Individual source workflows
  scrape-carvana.yml
  scrape-autotrader.yml
```

### Main Workflow (scrape-all-sources.yml)

- **Trigger**: Daily at midnight UTC (`cron: '0 0 * * *'`)
- **Strategy**: Call individual source workflows using `workflow_call`
- **Execution**: Source jobs run independently (parallel where possible)
- **Output**: Single commit with all new data files

### Individual Source Workflow

1. Checkout repository
2. Setup Node.js environment
3. Install dependencies
4. Run scraper script for that source
5. Output JSON file to `/data/{source}/YYYY-MM-DD.json`
6. On failure: exit gracefully, log error (don't block other sources)

### Commit Strategy

- After all scrapers complete: commit all new files in one atomic commit
- Commit message format: `"Update prices for 2025-10-20 (3/5 sources succeeded)"`
- Use GitHub Actions bot user for commits
- Push triggers automatic GitHub Pages rebuild

### Error Handling

- If all sources fail: create GitHub Issue automatically
- If specific source fails 3 days in a row: create Issue for that source
- Workflow logs show which sources succeeded/failed

## Web Frontend

### Technology Stack

- **Framework**: React with Vite (or Next.js static export)
- **Charting**: Chart.js (validated in mockup - supports mixed line/scatter charts)
- **Data fetching**: Direct JSON fetch from GitHub (raw.githubusercontent.com or GitHub Pages)
- **Styling**: Tailwind CSS
- **Deployment**: GitHub Pages (automatic on push)

**Note**: A functional mockup demonstrating all key features has been created in `/mockup/` with fake data to validate the design. The mockup validates:
- Chart.js works well for both overview and detail charts
- Overlapping bar charts effectively show price ranges per source
- URL routing provides shareable links to specific models
- Table layout for individual listings is clear and functional

### Key Components

1. **All Models Overview**
   - Single chart showing all tracked models
   - Each model = different colored line
   - Toggle models on/off for clarity
   - Shows market trends at a glance

2. **Individual Model Detail**
   - Drill-down view for specific model
   - Price history chart showing:
     - Candlestick bars showing min-max price range per source (overlapping, semi-transparent)
     - Average price as solid line with points overlaid on bars
     - All color-coded by source
   - Data table with all listings from all sources (sorted by price)
   - Shows: source badge, year, trim, price, mileage, location, link to listing

3. **Model Selector**
   - Search/filter to find specific make/model combinations
   - Quick navigation between models

4. **Source Health Dashboard**
   - Shows which sources last updated successfully
   - Helps users understand data freshness

### Navigation Flow

```
Landing: All Models Overview Chart
  ↓ (click model or use dropdown selector)
Individual Model Detail Page (URL: ?model=Tesla%20Model%203)
  ↓ (breadcrumb or "All Models Overview" button)
Back to Overview (URL: /)
```

**URL Routing:**
- Overview: `/` or `/?model=all`
- Model detail: `/?model=<Make>%20<Model>` (e.g., `/?model=Hyundai%20Ioniq%205`)
- Browser back/forward buttons work correctly
- URLs are shareable and bookmarkable

### Data Loading Strategy

- **On load**: Fetch all JSON files for all sources and dates
- **URL-based routing**: Load appropriate view (overview or model detail) based on URL params
- **User selects model**: Update URL and re-render view
- **Client-side aggregation**:
  - Calculate min/max/average prices per source per date
  - Merge data from multiple sources for comparison
- **Future optimization**: Can add lazy loading if dataset grows large

### Performance Considerations

- Code splitting for efficient bundles
- JSON files kept reasonably sized (used EV inventory is small: ~50-100 listings per model per source)
- Bundle optimization with Vite

## CLI Tool: Source Management

### Tool: `add-source` Command

A CLI assistant powered by Claude Code that helps add and maintain data sources.

### Add New Source Flow

```bash
npm run add-source
```

**Interactive prompts:**

1. "Source domain?" → User enters: `carmax.com`
2. "Source display name?" → User enters: `CarMax`
3. Tool reads first model from `tracked-models.json` (e.g., Hyundai Ioniq 5)
4. Claude Code generates search URL based on site structure
5. Tool displays: "Please visit this URL: https://carmax.com/cars/hyundai-ioniq-5"
6. User confirms URL shows correct results: `(y/n)`
7. Tool scrapes page and extracts listings
8. Shows sample output:
   ```
   Found 63 listings:
   - 2023 Ioniq 5 SEL, 12k mi, $38,990
   - 2024 Ioniq 5 Limited, 5k mi, $44,500
   ...
   Does this data look correct? (y/n)
   ```
9. If confirmed, tool creates:
   - `/scrapers/carmax/scrape.js`
   - `/scrapers/carmax/config.json`
   - `.github/workflows/scrape-carmax.yml`
   - Updates main workflow file
10. Tests locally by running scraper for all tracked models
11. Shows summary: "✓ Scraped 54 Ioniq 5, 42 Model 3, 38 Bolt EV"
12. Offers: "Create PR? (y/n)"
    - If yes: commits changes, pushes branch, creates pull request

### Update Source Flow

**Update specific source:**
```bash
npm run add-source -- --update carmax
```

- Detects if scraper is broken (errors/no results)
- Uses Claude Code to analyze site changes
- Regenerates scraper code
- Tests new version
- Shows diff of changes
- User confirms → updates files

**Update all sources:**
```bash
npm run add-source -- --update-all
```

- Iterates through all sources in `/scrapers/`
- Tests each source
- Flags broken sources
- Attempts to fix each broken source
- Shows summary: "✓ 3 working, ⚠ 2 fixed, ✗ 1 failed"

### Update Scenarios

The CLI tool handles:
- **Site structure changes**: Re-analyzes HTML, updates selectors
- **New filter types**: Regenerates URL construction for new filters
- **API endpoint changes**: Updates base URLs and parameters
- **Schema evolution**: Adapts to new data fields

This makes ongoing maintenance sustainable as websites evolve.

## Authentication

**Phase 1**: No authentication required
- All data is public
- No user accounts
- No personalization

**Future**: Authentication can be added later if needed.

## Key Benefits of This Architecture

1. **Zero cost**: GitHub Actions + Pages are free for public repos
2. **Built-in versioning**: Git history = complete price history
3. **Transparency**: All data and code visible/auditable
4. **Simple deployment**: Push to deploy
5. **Community extensible**: Anyone can add sources via PRs or forks
6. **Audit trail**: Every price update is a Git commit
7. **No database management**: JSON files in Git
8. **No authentication complexity**: Start simple, add later if needed
9. **Automated maintenance**: CLI tool makes source updates manageable

## Trade-offs

**Limitations accepted:**
- Scraping is fragile (sites change frequently)
- Daily updates only (not real-time)
- Limited to public data sources
- Small dataset size (works for used EV market, wouldn't scale to all used cars)
- Browser-based data aggregation (not server-side)

**Why these are acceptable:**
- Used EV market is small enough for daily updates
- CLI tool makes scraper maintenance manageable
- Community can help maintain sources
- Simple architecture reduces maintenance burden
- Free hosting justifies manual intervention when scrapers break

## Success Criteria

- Track prices for 5+ EV models across 3+ sources
- Daily automated updates with <10% source failure rate
- Interactive charts showing price trends over time
- Community contributions: at least one external PR adding a source
- Zero ongoing hosting costs

## Future Enhancements

**Not in initial scope, but possible later:**
- More sophisticated filtering (year, trim, mileage ranges)
- Export data to CSV
- Price prediction models
- Integration with more data sources
