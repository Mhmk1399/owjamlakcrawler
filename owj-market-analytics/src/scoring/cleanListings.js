import { median } from "./statistics.js";

export const CLEANING_VERSION = "scoring-ready-v1";

const LIMITS = Object.freeze({
  area: [20, 1_000],
  price: [300_000_000, 3_000_000_000_000],
  pricePerMeter: [5_000_000, 3_000_000_000],
  latitude: [35.4, 35.95],
  longitude: [50.8, 51.85],
  rooms: [0, 20],
  constructionYear: [1_300, 1_500],
  floor: [-5, 200],
  totalFloors: [1, 200],
});

function finite(value) {
  return Number.isFinite(value) ? value : undefined;
}

function within(value, [minimum, maximum]) {
  return Number.isFinite(value) && value >= minimum && value <= maximum;
}

function text(value, fallback) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function medianOr(values, fallback) {
  const value = median(values.filter(Number.isFinite));
  return Number.isFinite(value) ? value : fallback;
}

function areaBucket(area) {
  return Math.floor(area / 25) * 25;
}

function fieldMedianByArea(records, selector, fallback) {
  const groups = new Map();
  for (const record of records) {
    const value = selector(record);
    if (!Number.isFinite(value)) continue;
    const key = areaBucket(record.property.area);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(value);
  }
  const global = medianOr(records.map(selector), fallback);
  return {
    global,
    forArea(area) {
      return medianOr(groups.get(areaBucket(area)) || [], global);
    },
  };
}

function rejectReasons(listing) {
  const reasons = [];
  if (listing?.subcategory !== "buy-residential-apartment") reasons.push("subcategory-out-of-scope");
  if (!within(listing?.property?.area, LIMITS.area)) reasons.push("invalid-or-implausible-area");
  if (!within(listing?.pricing?.price, LIMITS.price)) reasons.push("invalid-or-implausible-price");
  const area = finite(listing?.property?.area);
  const price = finite(listing?.pricing?.price);
  const pricePerMeter = area > 0 && price > 0 ? Math.round(price / area) : undefined;
  if (!within(pricePerMeter, LIMITS.pricePerMeter)) reasons.push("invalid-or-implausible-price-per-meter");
  if (!within(listing?.coordinates?.latitude, LIMITS.latitude) ||
      !within(listing?.coordinates?.longitude, LIMITS.longitude)) {
    reasons.push("missing-or-out-of-bounds-coordinates");
  }
  return reasons;
}

function noNullWalk(value, path, found) {
  if (value === null || value === undefined) {
    found.push(path);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => noNullWalk(item, `${path}[${index}]`, found));
    return;
  }
  if (typeof value === "object") {
    Object.entries(value).forEach(([key, item]) => noNullWalk(item, path ? `${path}.${key}` : key, found));
  }
}

export function assertNoNulls(value, label = "document") {
  const found = [];
  noNullWalk(value, "", found);
  if (found.length) {
    throw new Error(`${label} contains null or undefined values: ${found.slice(0, 10).join(", ")}`);
  }
  return value;
}

export function cleanListings(listings, { onEvent = () => {} } = {}) {
  const candidates = [];
  const rejected = [];
  const seenTokens = new Set();

  listings.forEach((listing, index) => {
    const token = text(listing?.token, `missing-token-${index}`);
    const reasons = rejectReasons(listing);
    if (seenTokens.has(token)) reasons.push("duplicate-token");
    if (reasons.length) {
      rejected.push({ token, reasons: [...new Set(reasons)] });
      return;
    }
    seenTokens.add(token);
    candidates.push(listing);
  });

  const rooms = fieldMedianByArea(candidates, (item) => (
    within(item.property?.rooms, LIMITS.rooms) ? item.property.rooms : undefined
  ), 2);
  const constructionYear = fieldMedianByArea(candidates, (item) => (
    within(item.property?.constructionYear, LIMITS.constructionYear)
      ? item.property.constructionYear
      : undefined
  ), 1_390);
  const floor = fieldMedianByArea(candidates, (item) => (
    within(item.property?.floor, LIMITS.floor) ? item.property.floor : undefined
  ), 1);
  const totalFloors = fieldMedianByArea(candidates, (item) => (
    within(item.property?.totalFloors, LIMITS.totalFloors)
      ? item.property.totalFloors
      : undefined
  ), 4);

  const cleaned = candidates.map((listing, index) => {
    const imputedFields = [];
    const area = listing.property.area;
    const impute = (field, value, fallback) => {
      if (Number.isFinite(value)) return value;
      imputedFields.push(field);
      return fallback;
    };
    const cleanRooms = impute(
      "property.rooms",
      within(listing.property?.rooms, LIMITS.rooms) ? listing.property.rooms : undefined,
      Math.round(rooms.forArea(area)),
    );
    const cleanYear = impute(
      "property.constructionYear",
      within(listing.property?.constructionYear, LIMITS.constructionYear)
        ? listing.property.constructionYear
        : undefined,
      Math.round(constructionYear.forArea(area)),
    );
    const cleanFloor = impute(
      "property.floor",
      within(listing.property?.floor, LIMITS.floor) ? listing.property.floor : undefined,
      Math.round(floor.forArea(area)),
    );
    const rawTotalFloors = within(listing.property?.totalFloors, LIMITS.totalFloors)
      ? listing.property.totalFloors
      : undefined;
    let cleanTotalFloors = impute(
      "property.totalFloors",
      rawTotalFloors,
      Math.round(totalFloors.forArea(area)),
    );
    cleanTotalFloors = Math.max(1, cleanFloor, cleanTotalFloors);

    const amenity = (key) => {
      const value = listing.amenities?.[key];
      if (typeof value === "boolean") return value ? 1 : 0;
      imputedFields.push(`amenities.${key}`);
      return 0.5;
    };
    const accuracy = listing.coordinates.accuracy === "exact" ? "exact" : "approximate";
    const record = {
      schemaVersion: "1.0.0",
      cleaningVersion: CLEANING_VERSION,
      token: listing.token,
      url: text(listing.url, `https://divar.ir/v/${listing.token}`),
      title: text(listing.title, listing.token),
      neighborhood: text(listing.neighborhood, "unknown"),
      property: {
        area,
        rooms: cleanRooms,
        constructionYear: cleanYear,
        floor: cleanFloor,
        totalFloors: cleanTotalFloors,
      },
      amenities: {
        elevator: amenity("elevator"),
        parking: amenity("parking"),
        storage: amenity("storage"),
        balcony: amenity("balcony"),
      },
      location: {
        latitude: listing.coordinates.latitude,
        longitude: listing.coordinates.longitude,
        accuracy,
        radiusMeters: accuracy === "exact"
          ? 0
          : Number.isFinite(listing.coordinates.radiusMeters)
            ? listing.coordinates.radiusMeters
            : 500,
      },
      pricing: {
        currency: "TOMAN",
        askingPrice: listing.pricing.price,
        askingPricePerMeter: Math.round(listing.pricing.price / area),
      },
      source: {
        qualityScore: Number.isFinite(listing.quality?.score) ? listing.quality.score : 0,
        missingFields: Array.isArray(listing.quality?.missingFields)
          ? listing.quality.missingFields.map(String)
          : [],
        firstSeenAt: text(listing.firstSeenAt, "unknown"),
        lastSeenAt: text(listing.lastSeenAt, "unknown"),
      },
      cleaning: {
        imputed: imputedFields.length > 0,
        imputedFields: [...new Set(imputedFields)].sort(),
        imputationCount: [...new Set(imputedFields)].length,
      },
    };
    if ((index + 1) % 500 === 0) {
      onEvent({ type: "clean.progress", processed: index + 1, total: candidates.length });
    }
    return assertNoNulls(record, `cleaned listing ${listing.token}`);
  });

  const rejectionCounts = {};
  for (const item of rejected) {
    for (const reason of item.reasons) rejectionCounts[reason] = (rejectionCounts[reason] || 0) + 1;
  }
  const imputationCounts = {};
  for (const item of cleaned) {
    for (const field of item.cleaning.imputedFields) {
      imputationCounts[field] = (imputationCounts[field] || 0) + 1;
    }
  }
  return {
    records: cleaned,
    rejected,
    summary: {
      inputCount: listings.length,
      acceptedCount: cleaned.length,
      rejectedCount: rejected.length,
      rejectionCounts,
      recordsWithImputation: cleaned.filter((item) => item.cleaning.imputed).length,
      imputationCounts,
      limits: LIMITS,
    },
  };
}

export const cleaningHelpers = { rejectReasons, areaBucket };
