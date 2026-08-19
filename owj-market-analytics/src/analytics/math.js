export function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function mean(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

export function quantile(values, fraction) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const position = (sorted.length - 1) * fraction;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}

export function trimmedMean(values, fraction = 0.1) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const trim = Math.floor(sorted.length * fraction);
  const kept = sorted.slice(trim, Math.max(trim + 1, sorted.length - trim));
  return mean(kept);
}

export function percentileRank(values, subject) {
  if (!values.length || !Number.isFinite(subject)) return null;
  const belowOrEqual = values.filter((value) => value <= subject).length;
  return (belowOrEqual / values.length) * 100;
}

export function haversineMeters(a, b) {
  if (
    !Number.isFinite(a?.latitude) ||
    !Number.isFinite(a?.longitude) ||
    !Number.isFinite(b?.latitude) ||
    !Number.isFinite(b?.longitude)
  ) return null;
  const radians = (degrees) => (degrees * Math.PI) / 180;
  const earthRadius = 6_371_000;
  const dLat = radians(b.latitude - a.latitude);
  const dLon = radians(b.longitude - a.longitude);
  const lat1 = radians(a.latitude);
  const lat2 = radians(b.latitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * earthRadius * Math.asin(Math.sqrt(h));
}

export function summarize(values) {
  const clean = values.filter(Number.isFinite);
  return {
    count: clean.length,
    mean: clean.length ? Math.round(mean(clean)) : null,
    median: clean.length ? Math.round(quantile(clean, 0.5)) : null,
    trimmedMean: clean.length ? Math.round(trimmedMean(clean)) : null,
    p25: clean.length ? Math.round(quantile(clean, 0.25)) : null,
    p75: clean.length ? Math.round(quantile(clean, 0.75)) : null,
    p90: clean.length ? Math.round(quantile(clean, 0.9)) : null,
    minimum: clean.length ? Math.min(...clean) : null,
    maximum: clean.length ? Math.max(...clean) : null,
  };
}
