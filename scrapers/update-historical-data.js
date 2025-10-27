import fs from 'fs/promises';
import path from 'path';

/**
 * Retroactively updates historical data files to add models_exceeded_max_vehicles property
 * Marks Tesla Model 3 as exceeding max for carmax and carvana (but not plattauto)
 */

async function updateDataFile(filePath, source) {
  try {
    const fileContent = await fs.readFile(filePath, 'utf-8');
    const data = JSON.parse(fileContent);

    // Initialize the property if it doesn't exist
    if (!data.models_exceeded_max_vehicles) {
      data.models_exceeded_max_vehicles = [];
    }

    // For carmax and carvana, mark Tesla Model 3 as exceeded
    if ((source === 'carmax' || source === 'carvana')) {
      const hasTeslaModel3 = data.listings.some(
        l => l.make === 'Tesla' && l.model === 'Model 3'
      );

      if (hasTeslaModel3) {
        const alreadyMarked = data.models_exceeded_max_vehicles.some(
          m => m.make === 'Tesla' && m.model === 'Model 3'
        );

        if (!alreadyMarked) {
          data.models_exceeded_max_vehicles.push({ make: 'Tesla', model: 'Model 3' });
          console.log(`✓ Marked Tesla Model 3 as exceeded in ${path.basename(filePath)} for ${source}`);
        }
      }
    }

    // Write the updated data back
    await fs.writeFile(filePath, JSON.stringify(data, null, 2));
  } catch (error) {
    console.error(`Error updating ${filePath}:`, error.message);
  }
}

async function updateAllDataFiles() {
  const sources = ['carmax', 'carvana', 'plattauto'];
  const dataDir = path.join(process.cwd(), 'data');

  for (const source of sources) {
    const sourceDir = path.join(dataDir, source);

    try {
      const files = await fs.readdir(sourceDir);

      for (const file of files) {
        if (file.endsWith('.json')) {
          const filePath = path.join(sourceDir, file);
          await updateDataFile(filePath, source);
        }
      }

      console.log(`\n✓ Finished updating ${source} data files\n`);
    } catch (error) {
      console.error(`Error processing ${source}:`, error.message);
    }
  }

  console.log('All historical data files have been updated!');
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  updateAllDataFiles().catch(console.error);
}

export { updateAllDataFiles };
