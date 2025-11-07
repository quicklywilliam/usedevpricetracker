#!/usr/bin/env node

/**
 * Re-normalize trim data in existing JSON files
 *
 * This script re-runs trim normalization logic on scraped data files.
 * Useful when:
 * - Adding new canonical trims to tracked-models.json
 * - Fixing bugs in trim normalization logic
 * - Updating old data with new normalization rules
 *
 * Usage:
 *   node normalize-trims.js                    # Normalize all dates for all models
 *   node normalize-trims.js --date=2025-11-07  # Normalize specific date
 *   node normalize-trims.js --models="Tesla Model Y,Rivian R1T"  # Specific models
 *   node normalize-trims.js --date=2025-11-07 --models="Tesla Model Y"
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { normalizeTrim } from './lib/trim-normalizer.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    date: null,
    models: null
  };

  for (const arg of args) {
    if (arg.startsWith('--date=')) {
      options.date = arg.split('=')[1];
    } else if (arg.startsWith('--models=')) {
      const modelsStr = arg.split('=')[1];
      options.models = modelsStr.split(',').map(m => {
        const [make, ...modelParts] = m.trim().split(' ');
        return { make, model: modelParts.join(' ') };
      });
    }
  }

  return options;
}

async function normalizeTrims() {
  const options = parseArgs();
  const dataDir = path.join(__dirname, '..', 'data');

  console.log('Re-normalizing trim data...');
  if (options.date) {
    console.log(`Date filter: ${options.date}`);
  } else {
    console.log(`Date filter: All dates`);
  }
  if (options.models) {
    console.log(`Model filter: ${options.models.map(m => `${m.make} ${m.model}`).join(', ')}`);
  } else {
    console.log(`Model filter: All models`);
  }
  console.log();

  // Get all source directories
  const sources = await fs.readdir(dataDir, { withFileTypes: true });

  let totalProcessed = 0;
  let totalNormalized = 0;
  let totalFilesUpdated = 0;

  for (const source of sources) {
    if (!source.isDirectory() || source.name === 'mock-source') continue;

    const sourceName = source.name;
    const sourceDir = path.join(dataDir, sourceName);

    console.log(`\n=== Processing ${sourceName} ===`);

    // Get all date files
    const files = await fs.readdir(sourceDir);
    const dateFiles = files
      .filter(f => f.endsWith('.json'))
      .filter(f => !options.date || f === `${options.date}.json`)
      .sort();

    if (dateFiles.length === 0) {
      console.log(`  ⊘ No matching date files found`);
      continue;
    }

    console.log(`  ✓ Found ${dateFiles.length} date file(s)`);

    for (const dateFile of dateFiles) {
      const filePath = path.join(sourceDir, dateFile);
      const fileContent = await fs.readFile(filePath, 'utf-8');
      const fileData = JSON.parse(fileContent);

      let fileProcessed = 0;
      let fileNormalized = 0;

      // Process each listing
      for (const listing of fileData.listings) {
        // Apply model filter if specified
        if (options.models) {
          const isTargetModel = options.models.some(
            m => m.make === listing.make && m.model === listing.model
          );
          if (!isTargetModel) {
            continue;
          }
        }

        fileProcessed++;
        totalProcessed++;

        // Normalize the trim (re-normalize even if already present)
        const normalizedTrim = await normalizeTrim({
          vin: listing.vin,
          make: listing.make,
          model: listing.model,
          trim: listing.trim,
          source: sourceName
        });

        // Update normalized_trim
        listing.normalized_trim = normalizedTrim;

        // Count as normalized if we got a non-null value
        if (normalizedTrim !== null) {
          fileNormalized++;
          totalNormalized++;
        }
      }

      // Write back to file if any listings were processed
      if (fileProcessed > 0) {
        await fs.writeFile(filePath, JSON.stringify(fileData, null, 2));
        totalFilesUpdated++;
        if (dateFiles.length > 5) {
          // Only log individual files if there aren't too many
          if (fileProcessed > 0) {
            process.stdout.write('.');
          }
        } else {
          console.log(`    ✓ ${dateFile}: Processed ${fileProcessed}, normalized ${fileNormalized}`);
        }
      }
    }

    if (dateFiles.length > 5) {
      console.log(`\n  ✓ Updated ${totalFilesUpdated} file(s)`);
    }
  }

  console.log('\n--- Summary ---');
  console.log(`Total files updated: ${totalFilesUpdated}`);
  console.log(`Total listings processed: ${totalProcessed}`);
  console.log(`Total listings normalized: ${totalNormalized}`);
  console.log(`Success rate: ${totalProcessed > 0 ? ((totalNormalized / totalProcessed) * 100).toFixed(1) : 0}%`);
}

normalizeTrims().catch(console.error);
