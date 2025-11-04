export function formatCurrencyShort(value) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return '';
  }

  const sign = value < 0 ? '-' : '';
  const abs = Math.abs(value);

  const formatWithSuffix = (scaled, suffix) => {
    const decimals = scaled >= 10 ? 0 : 1;
    const rounded = scaled.toFixed(decimals);
    const trimmed = rounded.replace(/\.0$/, '');
    return `${sign}$${trimmed}${suffix}`;
  };

  if (abs >= 1_000_000) {
    return formatWithSuffix(abs / 1_000_000, 'M');
  }

  if (abs >= 1_000) {
    return formatWithSuffix(abs / 1_000, 'K');
  }

  return `${sign}$${abs.toLocaleString()}`;
}
