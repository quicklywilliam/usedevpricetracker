/**
 * Calculate quantile-based point sizes for inventory visualization
 * @param {number[]} inventoryCounts - Array of all inventory counts
 * @returns {Function} Function that maps an inventory count to a point radius
 */
export function createInventoryScale(inventoryCounts) {
  if (!inventoryCounts || inventoryCounts.length === 0) {
    return () => 3; // Default size
  }

  const sorted = [...inventoryCounts].filter(c => c > 0).sort((a, b) => a - b);

  if (sorted.length === 0) {
    return () => 3; // Default size
  }

  // Calculate quantile
  const getQuantile = (arr, q) => {
    const pos = (arr.length - 1) * q;
    const base = Math.floor(pos);
    const rest = pos - base;
    return arr[base + 1] !== undefined
      ? arr[base] + rest * (arr[base + 1] - arr[base])
      : arr[base];
  };

  // Create buckets based on quantiles
  const buckets = [
    0,
    getQuantile(sorted, 0.2),
    getQuantile(sorted, 0.4),
    getQuantile(sorted, 0.6),
    getQuantile(sorted, 0.8),
    getQuantile(sorted, 0.95),
    Infinity
  ];

  const sizes = [2, 4, 7, 9, 11, 14, 19];

  // Return a function that maps count to size
  return (count) => {
    if (count === 0) return sizes[0];

    for (let i = 0; i < buckets.length - 1; i++) {
      if (count >= buckets[i] && count < buckets[i + 1]) {
        return sizes[i];
      }
    }
    return sizes[sizes.length - 1];
  };
}
