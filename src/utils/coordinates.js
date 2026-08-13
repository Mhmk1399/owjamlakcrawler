const SOURCES = ["embedded-json", "json-ld", "page-state", "dom"];

export function validateCoordinates(latitude, longitude) {
  if (latitude === null || latitude === undefined || longitude === null || longitude === undefined) return null;
  const lat = Number(latitude);
  const lng = Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { latitude: lat, longitude: lng };
}

function nearbyValue(object) {
  for (const key of ["is_nearby", "isNearby", "nearby", "is_approximate", "isApproximate"]) {
    if (Object.hasOwn(object, key)) return Boolean(object[key]);
  }
  return null;
}

function walk(input, source, output, inheritedNearby = null, seen = new Set()) {
  if (!input || typeof input !== "object" || seen.has(input)) return;
  seen.add(input);
  const ownNearby = nearbyValue(input);
  const nearby = ownNearby ?? inheritedNearby;
  const latitude = input.latitude ?? input.lat;
  const longitude = input.longitude ?? input.lng ?? input.lon;
  const valid = validateCoordinates(latitude, longitude);
  if (valid) output.push({ ...valid, nearby, source });
  for (const value of Object.values(input)) walk(value, source, output, nearby, seen);
}

export function extractCoordinates(raw = {}) {
  const candidates = [];
  walk(raw.embeddedJson || raw.applicationJson || [], "embedded-json", candidates);
  walk(raw.jsonLd || [], "json-ld", candidates);
  walk(raw.pageState || [], "page-state", candidates);
  walk(raw.domCoordinates || [], "dom", candidates);

  candidates.sort((a, b) => SOURCES.indexOf(a.source) - SOURCES.indexOf(b.source));
  const result = candidates[0];
  if (!result) return { latitude: null, longitude: null, accuracy: null, source: null };
  return {
    latitude: result.latitude,
    longitude: result.longitude,
    accuracy: result.nearby === true ? "approximate" : result.nearby === false ? "exact" : "unknown",
    source: result.source,
  };
}
