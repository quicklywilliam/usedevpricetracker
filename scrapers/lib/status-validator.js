/**
 * Status validation for vehicle listings
 * Determines if a listing is available, selling (reserved/pending), or sold
 */

import fs from 'fs';
import path from 'path';

/**
 * Load the most recent data file for a source
 * @param {string} sourceName - Source name (carmax, carvana, plattauto)
 * @returns {Object|null} The data object or null if not found
 */
export function loadPreviousData(sourceName) {
  const dataDir = path.join(process.cwd(), 'data', sourceName);

  if (!fs.existsSync(dataDir)) {
    return null;
  }

  const files = fs.readdirSync(dataDir)
    .filter(f => f.endsWith('.json'))
    .sort()
    .reverse();

  if (files.length === 0) {
    return null;
  }

  const mostRecentFile = path.join(dataDir, files[0]);
  const content = fs.readFileSync(mostRecentFile, 'utf-8');
  return JSON.parse(content);
}

/**
 * Find listings from previous scrape that are missing from current scrape
 * @param {Array} previousListings - Listings from previous scrape
 * @param {Array} currentListings - Listings from current scrape
 * @returns {Array} Listings that are in previous but not in current
 */
export function findMissingListings(previousListings, currentListings) {
  const currentIds = new Set(currentListings.map(l => l.id));
  return previousListings.filter(l => !currentIds.has(l.id));
}

/**
 * Validate a listing URL to determine its status
 * @param {Object} page - Puppeteer page object
 * @param {string} url - Listing URL to validate
 * @param {Function} detectStatus - Source-specific status detection function
 * @returns {Promise<string>} Status: 'available', 'selling', or 'sold'
 */
export async function validateListingStatus(page, url, detectStatus) {
  try {
    const response = await page.goto(url, {
      waitUntil: 'networkidle2',
      timeout: 30000
    });

    // Check if page redirected
    const finalUrl = page.url();
    const wasRedirected = finalUrl !== url;

    // Wait for page to load
    await page.waitForSelector('body', { timeout: 5000 });
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Get page content
    const html = await page.content();

    // Use source-specific detection logic
    return await detectStatus({
      html,
      finalUrl,
      originalUrl: url,
      wasRedirected,
      statusCode: response?.status()
    });

  } catch (error) {
    console.error(`    ⚠ Error validating ${url}: ${error.message}`);
    // If page fails to load, assume it's sold
    return 'sold';
  }
}

/**
 * Validate all missing listings and return them with purchase_status
 * @param {Object} page - Puppeteer page object
 * @param {Array} missingListings - Listings to validate
 * @param {Function} detectStatus - Source-specific status detection function
 * @param {number} rateLimitMs - Milliseconds to wait between requests
 * @returns {Promise<Array>} Listings with purchase_status field added (only if selling/sold)
 */
export async function validateMissingListings(page, missingListings, detectStatus, rateLimitMs = 3000) {
  const validatedListings = [];

  console.log(`  Validating ${missingListings.length} missing listings...`);

  for (const listing of missingListings) {
    const status = await validateListingStatus(page, listing.url, detectStatus);

    // Only add purchase_status for non-available vehicles
    const validatedListing = { ...listing };
    if (status === 'selling' || status === 'sold') {
      validatedListing.purchase_status = status;
    }

    validatedListings.push(validatedListing);

    console.log(`    ${listing.id}: ${status}`);

    // Rate limit
    await new Promise(resolve => setTimeout(resolve, rateLimitMs));
  }

  return validatedListings;
}
