import puppeteer from 'puppeteer';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE_FILE = path.join(__dirname, 'model-ids.json');
const OUTPUT_DIR = path.join(__dirname, '../../data/cargurus-trend');

/**
 * Load cached model IDs
 */
async function loadCache() {
  try {
    const data = await fs.readFile(CACHE_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    return {};
  }
}

/**
 * Save model ID to cache
 */
async function saveToCache(modelKey, url) {
  const cache = await loadCache();
  cache[modelKey] = {
    url,
    lastVerified: new Date().toISOString().split('T')[0]
  };
  await fs.writeFile(CACHE_FILE, JSON.stringify(cache, null, 2));
}

/**
 * Search for model on CarGurus and extract URL
 */
async function findModelUrl(page, make, model) {
  const modelKey = `${make} ${model}`;
  console.log(`  Searching for ${modelKey}...`);

  // Try constructing URL first (CarGurus uses title case with hyphens)
  const makeSlug = make.replace(/\s+/g, '-');
  const modelSlug = model.replace(/\s+/g, '-');
  const constructedUrl = `https://www.cargurus.com/research/price-trends/${makeSlug}-${modelSlug}`;

  try {
    console.log(`  Trying constructed URL: ${constructedUrl}`);
    await page.goto(constructedUrl, { waitUntil: 'networkidle2', timeout: 30000 });

    // Check if we're on a valid price trends page (not 404 or general trends page)
    const pageTitle = await page.title();
    const currentUrl = page.url();
    console.log(`  Page title: ${pageTitle}`);
    console.log(`  Current URL: ${currentUrl}`);

    if (pageTitle.includes(model) && pageTitle.includes('Price Trends')) {
      // Extract the actual URL with model ID
      if (currentUrl.includes('-d') && currentUrl.toLowerCase().includes(modelSlug.toLowerCase())) {
        console.log(`  ✓ Found URL: ${currentUrl}`);
        return currentUrl;
      }
    }
    console.log(`  Page doesn't match expected model`);
  } catch (error) {
    console.log(`  Construction error: ${error.message}`);
  }

  // Fallback: scrape CarGurus price trends index page
  console.log(`  Searching price trends index...`);
  await page.goto('https://www.cargurus.com/research/price-trends', {
    waitUntil: 'networkidle2',
    timeout: 30000
  });

  // Wait for content to load
  await new Promise(resolve => setTimeout(resolve, 3000));

  // Try to find the model link by searching the page HTML
  const searchTerm = `${make} ${model}`.toLowerCase();
  const modelUrl = await page.evaluate((term) => {
    // Look through all links
    const allLinks = Array.from(document.querySelectorAll('a'));

    for (const link of allLinks) {
      const href = link.getAttribute('href');
      const text = link.textContent.toLowerCase().trim();

      // Match by link text
      if (text === term && href && href.includes('/research/price-trends/') && href.includes('-d')) {
        return href.startsWith('http') ? href : `https://www.cargurus.com${href}`;
      }
    }

    // Try matching in href itself
    for (const link of allLinks) {
      const href = link.getAttribute('href');
      if (href && href.includes('/research/price-trends/')) {
        const hrefLower = href.toLowerCase();
        const termParts = term.split(' ');
        const allPartsMatch = termParts.every(part => hrefLower.includes(part.replace(/\s+/g, '-')));
        if (allPartsMatch && href.includes('-d')) {
          return href.startsWith('http') ? href : `https://www.cargurus.com${href}`;
        }
      }
    }

    return null;
  }, searchTerm);

  if (modelUrl) {
    console.log(`  ✓ Found via index: ${modelUrl}`);
    return modelUrl;
  }

  throw new Error(`Could not find price trends page for ${modelKey}`);
}

/**
 * Configure date range to last 180 days
 */
async function configureDateRange(page) {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 180);

  // Format dates as YYYY-MM-DD for input[type="date"]
  const formatDate = (date) => {
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const year = date.getFullYear();
    return `${year}-${month}-${day}`;
  };

  const startDateStr = formatDate(startDate);
  const endDateStr = formatDate(endDate);

  console.log(`  Setting date range: ${startDateStr} to ${endDateStr}`);

  try {
    // Wait longer for React to render
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Try to find and fill inputs by their associated labels
    const datesFilled = await page.evaluate((start, end) => {
      // Find all input elements
      const allInputs = Array.from(document.querySelectorAll('input'));
      let startInput = null;
      let endInput = null;

      // Look for inputs with "start" and "end" in nearby labels/text
      for (const input of allInputs) {
        const parent = input.closest('div, label, fieldset');
        if (!parent) continue;

        const text = parent.textContent.toLowerCase();

        if (text.includes('start date') && !startInput) {
          startInput = input;
        } else if (text.includes('end date') && !endInput) {
          endInput = input;
        }
      }

      if (startInput && endInput) {
        startInput.value = start;
        startInput.dispatchEvent(new Event('input', { bubbles: true }));
        startInput.dispatchEvent(new Event('change', { bubbles: true }));

        endInput.value = end;
        endInput.dispatchEvent(new Event('input', { bubbles: true }));
        endInput.dispatchEvent(new Event('change', { bubbles: true }));

        return true;
      }

      return false;
    }, startDateStr, endDateStr);

    if (!datesFilled) {
      console.warn('  Warning: Could not find date inputs, using default range');
      return;
    }

    await new Promise(resolve => setTimeout(resolve, 2000));
  } catch (error) {
    console.warn(`  Warning: Date range configuration failed: ${error.message}`);
  }
}

/**
 * Select all year checkboxes and deselect CarGurus Index
 */
async function selectAllYears(page) {
  console.log('  Configuring year filters...');

  try {
    // Wait longer for React to render table
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Search for checkbox-like elements (real checkboxes or role="checkbox")
    const result = await page.evaluate(() => {
      let yearCount = 0;
      let yearClickedCount = 0;
      let indexUnchecked = false;

      // Find checkbox elements - both real and ARIA
      const checkboxes = Array.from(document.querySelectorAll('input[type="checkbox"], [role="checkbox"]'));

      for (const checkbox of checkboxes) {
        // Get surrounding context - go up several levels
        let container = checkbox;
        let text = '';
        for (let i = 0; i < 7; i++) {
          text = container.textContent;
          if (text.length > 10) break; // Found meaningful text
          container = container.parentElement;
          if (!container) break;
        }

        // Skip cookie consent
        if (text.toLowerCase().includes('cookie') || text.toLowerCase().includes('consent')) {
          continue;
        }

        // Check if it's checked/selected
        const isChecked = checkbox.checked ||
                         checkbox.getAttribute('aria-checked') === 'true' ||
                         checkbox.classList.contains('checked') ||
                         checkbox.classList.contains('selected');

        // Uncheck CarGurus Index
        if (text.includes('CarGurus Index')) {
          if (isChecked) {
            checkbox.click();
            indexUnchecked = true;
          }
          continue;
        }

        // Check year entries (2018-2026)
        const hasYear = /20(2[0-6]|1[8-9])/.test(text);
        if (hasYear && !text.includes('Index') && !text.includes('Year over Year')) {
          yearCount++;
          if (!isChecked) {
            checkbox.click();
            yearClickedCount++;
          }
        }
      }

      return { yearCount, yearClickedCount, indexUnchecked };
    });

    console.log(`  ✓ Found ${result.yearCount} year filters (clicked ${result.yearClickedCount}), unchecked index: ${result.indexUnchecked}`);
    await new Promise(resolve => setTimeout(resolve, 2000));
  } catch (error) {
    console.warn(`  Warning: Year filter configuration failed: ${error.message}`);
  }
}

/**
 * Export and download CSV
 */
async function exportData(page, make, model) {
  console.log('  Clicking export button...');

  // Set up download handling
  const client = await page.target().createCDPSession();
  await client.send('Page.setDownloadBehavior', {
    behavior: 'allow',
    downloadPath: OUTPUT_DIR
  });

  // Look for and click export button
  const exportClicked = await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button, a, [role="button"]'));
    for (const btn of buttons) {
      const text = btn.textContent.trim().toLowerCase();
      if (text === 'export' || text.includes('export data')) {
        btn.click();
        return true;
      }
    }
    return false;
  });

  if (!exportClicked) {
    throw new Error('Could not find export button');
  }

  // Wait for download to actually complete by polling for new file
  console.log('  Waiting for download...');
  const startTime = Date.now();
  const maxWaitTime = 30000; // 30 seconds max
  const initialFiles = new Set((await fs.readdir(OUTPUT_DIR)).filter(f => f.endsWith('.csv')));

  let newFile = null;
  while (Date.now() - startTime < maxWaitTime) {
    await new Promise(resolve => setTimeout(resolve, 1000));
    const currentFiles = (await fs.readdir(OUTPUT_DIR)).filter(f => f.endsWith('.csv'));
    const newFiles = currentFiles.filter(f => !initialFiles.has(f));

    if (newFiles.length > 0) {
      // Check if file has valid CSV content
      const filePath = path.join(OUTPUT_DIR, newFiles[0]);
      try {
        const stats = await fs.stat(filePath);
        if (stats.size > 100) {
          // Read first line to verify it's valid CSV
          const content = await fs.readFile(filePath, 'utf-8');
          const firstLine = content.split('\n')[0].trim();

          // Valid CSV should have the exact header
          const isValidCSV = firstLine === 'Date,Price,Car Type,Avg Price,Last 30 days,Last 90 days,YoY Change';

          if (!isValidCSV) {
            // Invalid file, delete it and continue waiting
            console.log(`  Invalid download detected (header: "${firstLine.substring(0, 50)}..."), retrying...`);
            await fs.unlink(filePath);
            continue;
          }

          newFile = newFiles[0];
          break;
        }
      } catch (e) {
        // File might still be writing
      }
    }
  }

  if (!newFile) {
    throw new Error('Download did not complete within timeout');
  }

  const csvFiles = [newFile];

  if (csvFiles.length > 0) {
    // Sort by modification time, get most recent
    const fileStats = await Promise.all(
      csvFiles.map(async f => ({
        name: f,
        mtime: (await fs.stat(path.join(OUTPUT_DIR, f))).mtime
      }))
    );
    fileStats.sort((a, b) => b.mtime - a.mtime);

    const downloadedFile = fileStats[0].name;
    const targetName = `${make.toLowerCase().replace(/\s+/g, '-')}-${model.toLowerCase().replace(/\s+/g, '-')}.csv`;

    // Only rename if it's not already the target name
    if (downloadedFile !== targetName) {
      await fs.rename(
        path.join(OUTPUT_DIR, downloadedFile),
        path.join(OUTPUT_DIR, targetName)
      );
    }

    console.log(`  ✓ Saved to ${targetName}`);
  } else {
    throw new Error('Download did not complete');
  }
}

/**
 * Scrape price trends for a single model
 */
async function scrapeModel(browser, make, model) {
  const modelKey = `${make} ${model}`;
  console.log(`\nProcessing ${modelKey}...`);

  const page = await browser.newPage();

  try {
    // Get model URL (cached or search)
    const cache = await loadCache();
    let url = cache[modelKey]?.url;

    if (!url) {
      url = await findModelUrl(page, make, model);
      await saveToCache(modelKey, url);
    } else {
      console.log(`  Using cached URL: ${url}`);
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

      // Verify it's still valid
      const pageTitle = await page.title();
      if (!pageTitle.toLowerCase().includes(model.toLowerCase())) {
        console.log('  Cached URL invalid, re-searching...');
        url = await findModelUrl(page, make, model);
        await saveToCache(modelKey, url);
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
      }
    }

    // Wait for page to fully load
    await page.waitForSelector('body', { timeout: 5000 });
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Configure date range
    await configureDateRange(page);

    // Select all years
    await selectAllYears(page);

    // Export data
    await exportData(page, make, model);

    console.log(`✓ ${modelKey} completed`);
  } catch (error) {
    console.error(`✗ ${modelKey} failed: ${error.message}`);
  } finally {
    await page.close();
  }
}

/**
 * Main scraper function
 */
export async function scrapeCarGurusTrends(query, options = {}) {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    await scrapeModel(browser, query.make, query.model);

    // Add delay between models to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 5000));
  } finally {
    await browser.close();
  }
}
