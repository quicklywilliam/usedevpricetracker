/**
 * Trim Normalization Library
 * Normalizes trim strings to canonical values using fuzzy matching and VIN validation
 */

import { quickDecode } from '@cardog/corgi';
import teslaVin from 'tesla-vin';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load canonical trims from tracked-models.json
let CANONICAL_TRIMS = null;

function loadCanonicalTrims() {
  if (CANONICAL_TRIMS) return CANONICAL_TRIMS;

  const trackedModelsPath = path.join(__dirname, '../../config/tracked-models.json');
  const data = JSON.parse(fs.readFileSync(trackedModelsPath, 'utf8'));

  CANONICAL_TRIMS = new Map();

  for (const query of data.queries) {
    if (query.trims && query.trims.length > 0) {
      const key = `${query.make}|${query.model}`;
      CANONICAL_TRIMS.set(key, query.trims);
    }
  }

  return CANONICAL_TRIMS;
}

/**
 * Normalize a vehicle's trim to canonical format
 *
 * @param {Object} vehicle - Vehicle object with vin, make, model, trim, and source
 * @returns {Promise<string|null>} Normalized trim, or null if flagged for review
 */
export async function normalizeTrim(vehicle) {
  const { vin, make, model, trim, source } = vehicle;

  // Load canonical trims
  const canonicalTrims = loadCanonicalTrims();
  const key = `${make}|${model}`;
  const validTrims = canonicalTrims.get(key);

  // If no canonical trims for this model, can't normalize
  if (!validTrims || validTrims.length === 0) {
    return null;
  }

  // If no scraped trim, can't normalize
  if (!trim) {
    return null;
  }

  // Fuzzy match scraped trim against canonical trims
  const matches = findBestMatches(trim, validTrims);

  // If no matches found and we have VIN, try VIN decoding
  if (matches.length === 0 && vin) {
    let decodedTrim = await decodeVin(vin, make);

    if (decodedTrim) {
      // Try to match the VIN-decoded trim against canonical trims
      const decodedMatches = findBestMatches(decodedTrim, validTrims);

      if (decodedMatches.length === 1) {
        // Only one match - use it confidently
        return decodedMatches[0];
      } else if (decodedMatches.length > 1) {
        return null;
      }
    }

    // Still no match - flag for review
    return null;
  }

  // If no matches and no VIN, flag for review
  if (matches.length === 0) {
    return null;
  }

  // If exactly one match, use it
  if (matches.length === 1) {
    return matches[0];
  }

  // Multiple matches - use VIN decoding to disambiguate
  if (vin) {
    const decodedTrim = await decodeVin(vin, make);

    if (decodedTrim) {
      // Check if decoded trim matches any of our candidate matches
      for (const candidate of matches) {
        if (trimsMatch(candidate, decodedTrim)) {
          return candidate;
        }
      }
    }
  }

  // If we still can't disambiguate, return the first match
  // (this is better than flagging for review in most cases)
  return matches[0];
}

/**
 * Find best matching canonical trims for a scraped trim
 * Prioritizes exact matches, then more specific matches
 */
function findBestMatches(scrapedTrim, canonicalTrims) {
  const normalize = (str) => str.toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
  const normalizedScraped = normalize(scrapedTrim);

  // First, try exact match after normalization
  for (const canonical of canonicalTrims) {
    if (normalize(canonical) === normalizedScraped) {
      return [canonical];
    }
  }

  // Then, find all fuzzy matches
  const matches = [];
  for (const canonical of canonicalTrims) {
    if (trimsMatch(scrapedTrim, canonical)) {
      matches.push(canonical);
    }
  }

  // If we have multiple matches, prefer the one with more words/specificity
  // e.g., "Engage e-4ORCE" should beat "Engage"
  if (matches.length > 1) {
    // Sort by length (longer = more specific)
    matches.sort((a, b) => b.length - a.length);
  }

  return matches;
}

async function decodeVin(vin, make) {
  if (make.toLowerCase() === 'tesla') {
    return await decodeTeslaVIN(vin);
  } else {
    return await decodeWithCorgi(vin);
  }
}


/**
 * Decode VIN using Corgi library
 */
async function decodeWithCorgi(vin) {
  try {
    const result = await quickDecode(vin);

    // Check if decode was successful
    if (!result || !result.valid) {
      return null;
    }

    // Extract trim from VDS patterns
    // Corgi returns patterns array in components.vds.patterns
    const patterns = result.components?.vds?.patterns || [];

    // Find the trim pattern
    const trimPattern = patterns.find(p => p.element === 'Trim');
    if (trimPattern) {
      return trimPattern.value;
    }

    return null;
  } catch (error) {
    return null;
  }
}

/**
 * Decode Tesla VIN using tesla-vin library
 */
async function decodeTeslaVIN(vin) {
  try {
    const result = teslaVin(vin);

    // tesla-vin doesn't have a direct trim field, but motor type is descriptive
    // e.g., "Single Motor Standard (3DU 800A)" or "Dual Motor Performance"
    if (result?.motor) {
      // Extract the motor type (e.g., "Single Motor Standard")
      // Remove the technical details in parentheses
      const motor = result.motor.replace(/\s*\([^)]*\)/g, '').trim();
      return motor;
    }

    return null;
  } catch (error) {
    return null;
  }
}


/**
 * Check if two trim strings match (with fuzzy matching)
 * Handles variations like "SEL AWD" vs "SEL e-4ORCE"
 */
function trimsMatch(scrapedTrim, decodedTrim) {
  if (!scrapedTrim || !decodedTrim) {
    return false;
  }

  const normalize = (str) => str.toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
  const scraped = normalize(scrapedTrim);
  const decoded = normalize(decodedTrim);

  // Exact match after normalization
  if (scraped === decoded) {
    return true;
  }

  // Check if one contains the other (handles "SEL" vs "SEL AWD")
  if (scraped.includes(decoded) || decoded.includes(scraped)) {
    return true;
  }

  // Split into words and check for significant overlap
  // e.g., "ENGAGE+ e-4ORCE" vs "ENGAGE/EVOLVE/EMPOWER" should match on "ENGAGE"
  const scrapedWords = scraped.split(' ').filter(w => w.length >= 3);
  const decodedWords = decoded.split(' ').filter(w => w.length >= 3);

  // Check if any significant word from scraped appears in decoded
  for (const word of scrapedWords) {
    if (decodedWords.includes(word) || decoded.includes(word)) {
      return true;
    }
  }

  // Check if any significant word from decoded appears in scraped
  for (const word of decodedWords) {
    if (scrapedWords.includes(word) || scraped.includes(word)) {
      return true;
    }
  }

  return false;
}

/**
 * Batch normalize trims for multiple vehicles
 * More efficient for processing many vehicles at once
 */
export async function normalizeTrims(vehicles) {
  const results = [];

  for (const vehicle of vehicles) {
    const normalizedTrim = await normalizeTrim(vehicle);
    results.push({
      ...vehicle,
      normalized_trim: normalizedTrim
    });
  }

  return results;
}
