import fs from 'fs/promises';
import path from 'path';

export async function writeJsonFile(sourceName, data) {
  const date = new Date().toISOString().split('T')[0];
  const dirPath = path.join(process.cwd(), 'data', sourceName);
  const filePath = path.join(dirPath, `${date}.json`);

  // Create directory if it doesn't exist
  await fs.mkdir(dirPath, { recursive: true });

  // Write JSON file
  await fs.writeFile(filePath, JSON.stringify(data, null, 2));

  console.log(`✓ Wrote ${data.listings.length} listings to ${filePath}`);

  return filePath;
}

export async function appendListings(sourceName, newListings, exceededMax = false, makeModel = null) {
  const date = new Date().toISOString().split('T')[0];
  const dirPath = path.join(process.cwd(), 'data', sourceName);
  const filePath = path.join(dirPath, `${date}.json`);

  // Create directory if it doesn't exist
  await fs.mkdir(dirPath, { recursive: true });

  let existingData = {
    source: sourceName,
    scraped_at: new Date().toISOString(),
    listings: [],
    models_exceeded_max_vehicles: []
  };

  // Read existing file if it exists
  try {
    const fileContent = await fs.readFile(filePath, 'utf-8');
    existingData = JSON.parse(fileContent);
    // Ensure the property exists for backward compatibility
    if (!existingData.models_exceeded_max_vehicles) {
      existingData.models_exceeded_max_vehicles = [];
    }
  } catch (error) {
    // File doesn't exist yet, use default structure
  }

  // Append new listings
  existingData.listings.push(...newListings);
  existingData.scraped_at = new Date().toISOString();

  // Track if this model exceeded max vehicles
  if (exceededMax && makeModel) {
    const alreadyTracked = existingData.models_exceeded_max_vehicles.some(
      m => m.make === makeModel.make && m.model === makeModel.model
    );
    if (!alreadyTracked) {
      existingData.models_exceeded_max_vehicles.push(makeModel);
    }
  }

  // Write back to file
  await fs.writeFile(filePath, JSON.stringify(existingData, null, 2));

  console.log(`  ✓ Added ${newListings.length} listings (total: ${existingData.listings.length})`);
  if (exceededMax) {
    console.log(`  ⚠ ${makeModel.make} ${makeModel.model} exceeded max vehicles (250+)`);
  }

  return filePath;
}
