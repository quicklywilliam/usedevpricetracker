/**
 * Utility for loading and parsing CarGurus price trend data
 */

/**
 * Parse CarGurus CSV data and convert to usable format
 * @param {string} csvText - Raw CSV text content
 * @returns {Object} Parsed data organized by car type
 */
export function parseCarGurusCSV(csvText) {
  const lines = csvText.trim().split('\n');

  // Skip header and copyright line at the end
  const dataLines = lines.slice(1).filter(line =>
    !line.startsWith('©') && line.trim().length > 0
  );

  const dataByType = {};

  dataLines.forEach(line => {
    // Parse CSV line (handle potential commas in quotes)
    const parts = line.split(',');

    if (parts.length < 3) return;

    const dateStr = parts[0]; // MM-DD-YYYY format
    const price = parseFloat(parts[1]);
    const carType = parts[2];

    if (!dateStr || isNaN(price) || !carType) return;

    // Convert MM-DD-YYYY to YYYY-MM-DD
    const [month, day, year] = dateStr.split('-');
    const isoDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;

    if (!dataByType[carType]) {
      dataByType[carType] = [];
    }

    dataByType[carType].push({
      date: isoDate,
      price: price
    });
  });

  // Sort each type's data by date
  Object.keys(dataByType).forEach(type => {
    dataByType[type].sort((a, b) => a.date.localeCompare(b.date));
  });

  return dataByType;
}

/**
 * Load CarGurus data for a specific model
 * @param {string} model - Model name (e.g., "Hyundai Ioniq 5")
 * @returns {Promise<Object>} Parsed CarGurus data
 */
export async function loadCarGurusData(model) {
  try {
    // Convert model name to filename (e.g., "Hyundai Ioniq 5" -> "hyundai-ioniq5.csv")
    // Split by space, lowercase, remove special characters, join with hyphens
    const filename = model
      .split(' ')
      .map(part => part.toLowerCase().replace(/[^a-z0-9]/g, ''))
      .filter(part => part.length > 0)
      .join('-');

    const baseUrl = import.meta.env.BASE_URL || '/';
    const response = await fetch(`${baseUrl}data/cargurus-trend/${filename}.csv`);

    if (!response.ok) {
      console.warn(`CarGurus data not found for ${model}`);
      return null;
    }

    const csvText = await response.text();
    return parseCarGurusCSV(csvText);
  } catch (error) {
    console.warn(`Failed to load CarGurus data for ${model}:`, error);
    return null;
  }
}

/**
 * Extract year from CarGurus car type string
 * @param {string} carType - e.g., "2023 Ioniq 5" or "Hyundai Ioniq 5"
 * @returns {string|null} Year as string or null for aggregate
 */
export function extractYear(carType) {
  const match = carType.match(/^(\d{4})\s/);
  return match ? match[1] : null;
}

/**
 * Check if a car type is the aggregate line (all years)
 * @param {string} carType - e.g., "Hyundai Ioniq 5"
 * @param {string} model - Model name to check against
 * @returns {boolean}
 */
export function isAggregateLine(carType, model) {
  // Remove make from model for comparison (e.g., "Hyundai Ioniq 5" -> "Ioniq 5")
  const modelWithoutMake = model.split(' ').slice(1).join(' ');
  return carType.includes(modelWithoutMake) && !carType.match(/^\d{4}\s/);
}
