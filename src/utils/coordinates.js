const SOURCES = ["posts-v2", "embedded-json", "json-ld", "page-state", "dom"];

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

function explicitAccuracy(object) {
  const value = String(object.location_type ?? object.locationType ?? object.type ?? "").toUpperCase();
  if (["EXACT", "PRECISE"].includes(value)) return "exact";
  if (["FUZZY", "APPROXIMATE", "NEARBY"].includes(value)) return "approximate";
  return null;
}

function radiusValue(object) {
  for (const key of ["radius", "radius_meters", "radiusMeters"]) {
    const radius = Number(object[key]);
    if (Number.isFinite(radius) && radius >= 0) return radius;
  }
  return null;
}

function walk(
  input,
  source,
  output,
  inheritedNearby = null,
  inheritedAccuracy = null,
  inheritedRadius = null,
  seen = new Set(),
) {
  if (!input || typeof input !== "object" || seen.has(input)) return;
  seen.add(input);
  const ownNearby = nearbyValue(input);
  const nearby = ownNearby ?? inheritedNearby;
  const accuracy = explicitAccuracy(input) ?? inheritedAccuracy;
  const radiusMeters = radiusValue(input) ?? inheritedRadius;
  const latitude = input.latitude ?? input.lat;
  const longitude = input.longitude ?? input.lng ?? input.lon;
  const valid = validateCoordinates(latitude, longitude);
  if (valid) output.push({ ...valid, nearby, accuracy, radiusMeters, source });
  for (const value of Object.values(input)) {
    walk(value, source, output, nearby, accuracy, radiusMeters, seen);
  }
}

export function extractCoordinates(raw = {}) {
  const candidates = [];
  walk(raw.apiCoordinates || [], "posts-v2", candidates);
  walk(raw.embeddedJson || raw.applicationJson || [], "embedded-json", candidates);
  walk(raw.jsonLd || [], "json-ld", candidates);
  walk(raw.pageState || [], "page-state", candidates);
  walk(raw.domCoordinates || [], "dom", candidates);

  const resolvedAccuracy = (candidate) => (
    candidate.accuracy ?? (candidate.nearby === true ? "approximate" : candidate.nearby === false ? "exact" : "unknown")
  );
  const accuracyRank = { exact: 0, approximate: 1, unknown: 2 };
  candidates.sort((a, b) => (
    accuracyRank[resolvedAccuracy(a)] - accuracyRank[resolvedAccuracy(b)] ||
    SOURCES.indexOf(a.source) - SOURCES.indexOf(b.source)
  ));
  const result = candidates[0];
  if (!result) {
    return { latitude: null, longitude: null, accuracy: null, radiusMeters: null, source: null };
  }
  return {
    latitude: result.latitude,
    longitude: result.longitude,
    accuracy: resolvedAccuracy(result),
    radiusMeters: result.radiusMeters,
    source: result.source,
  };
}
