/**
 * Validates vehicle listings to ensure critical fields are present and valid.
 * Tracks validation statistics and determines when a source should fail.
 */

const CURRENT_YEAR = new Date().getFullYear();
const MIN_YEAR = 1990;
const MAX_YEAR = CURRENT_YEAR + 1; // Allow next year's models

/**
 * Validates a single listing against critical field requirements
 * @param {Object} listing - The listing to validate
 * @param {Object} query - The search query (make, model)
 * @returns {Object} - {valid: boolean, errors: string[]}
 */
export function validateListing(listing, query) {
  const errors = [];

  // Check id
  if (!listing.id) {
    errors.push('Missing id');
  }

  // Check make (must match query)
  if (!listing.make) {
    errors.push('Missing make');
  } else if (listing.make.toLowerCase() !== query.make.toLowerCase()) {
    errors.push(`Make mismatch: expected "${query.make}", got "${listing.make}"`);
  }

  // Check model (must match query)
  if (!listing.model) {
    errors.push('Missing model');
  } else if (listing.model.toLowerCase() !== query.model.toLowerCase()) {
    errors.push(`Model mismatch: expected "${query.model}", got "${listing.model}"`);
  }

  // Check year
  if (listing.year == null) {
    errors.push('Missing year');
  } else if (typeof listing.year !== 'number' || listing.year < MIN_YEAR || listing.year > MAX_YEAR) {
    errors.push(`Invalid year: ${listing.year} (must be between ${MIN_YEAR}-${MAX_YEAR})`);
  }

  // Check trim
  if (!listing.trim) {
    errors.push('Missing trim');
  }

  // Check price
  if (listing.price == null) {
    errors.push('Missing price');
  } else if (typeof listing.price !== 'number' || listing.price <= 0) {
    errors.push(`Invalid price: ${listing.price} (must be > 0)`);
  }

  // Check mileage
  if (listing.mileage == null) {
    errors.push('Missing mileage');
  } else if (typeof listing.mileage !== 'number' || listing.mileage < 0) {
    errors.push(`Invalid mileage: ${listing.mileage} (must be >= 0)`);
  }

  // Check url
  if (!listing.url) {
    errors.push('Missing url');
  }

  // Check listing_date
  if (!listing.listing_date) {
    errors.push('Missing listing_date');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Validates all listings and tracks statistics
 * @param {Array} listings - Array of listings to validate
 * @param {Object} query - The search query (make, model)
 * @returns {Object} - {validListings, invalidListings, stats}
 */
export function validateListings(listings, query) {
  const validListings = [];
  const invalidListings = [];
  const validationErrors = [];

  for (const listing of listings) {
    const result = validateListing(listing, query);

    if (result.valid) {
      validListings.push(listing);
    } else {
      invalidListings.push({
        listing,
        errors: result.errors
      });
      validationErrors.push({
        id: listing.id || 'unknown',
        errors: result.errors
      });
    }
  }

  const total = listings.length;
  const valid = validListings.length;
  const invalid = invalidListings.length;
  const successRate = total > 0 ? (valid / total) * 100 : 0;

  return {
    validListings,
    invalidListings,
    stats: {
      total,
      valid,
      invalid,
      successRate: Math.round(successRate * 10) / 10, // Round to 1 decimal
      validationErrors
    }
  };
}

/**
 * Determines if a source should fail based on validation stats
 * Fails if: 3+ invalid listings AND success rate < 80%
 * @param {Object} stats - Validation statistics
 * @returns {boolean} - True if source should fail
 */
export function shouldFailSource(stats) {
  const MIN_FAILURES = 3;
  const MIN_SUCCESS_RATE = 80;

  return stats.invalid >= MIN_FAILURES && stats.successRate < MIN_SUCCESS_RATE;
}

/**
 * Formats validation errors for logging
 * @param {Object} stats - Validation statistics
 * @returns {string} - Formatted error message
 */
export function formatValidationErrors(stats) {
  const lines = [
    `Validation failed: ${stats.invalid}/${stats.total} listings invalid (${stats.successRate}% success rate)`,
    '',
    'Validation errors:'
  ];

  for (const error of stats.validationErrors.slice(0, 5)) { // Show first 5
    lines.push(`  - ID ${error.id}: ${error.errors.join(', ')}`);
  }

  if (stats.validationErrors.length > 5) {
    lines.push(`  ... and ${stats.validationErrors.length - 5} more`);
  }

  return lines.join('\n');
}
