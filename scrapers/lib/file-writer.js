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
