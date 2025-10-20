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
