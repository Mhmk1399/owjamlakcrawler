import { createHash } from "node:crypto";
import { extractListing } from "../../../src/crawler/listing.js";
import {
  fillMissingListingFields,
  normalizeListing,
  validateListing,
} from "../../../src/parsers/realEstate.js";
import {
  adaptPublicPostDocument,
  fetchPublicPostDocument,
} from "./divarPost.js";

const PHONE_LIKE = /(?<!\d)(?:(?:\+98|0098|0)[\d -]{9,16}\d)(?!\d)/g;
const EMAIL_LIKE = /[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g;

export function redactContactText(value) {
  if (typeof value !== "string") return value;
  return value
    .replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)))
    .replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)))
    .replace(PHONE_LIKE, "[redacted-phone]")
    .replace(EMAIL_LIKE, "[redacted-email]");
}

function finite(value) {
  return Number.isFinite(value) ? value : null;
}

function nullableBoolean(value) {
  return typeof value === "boolean" ? value : null;
}

function fingerprintFor(listing) {
  const source = JSON.stringify({
    title: listing.title,
    subcategory: listing.subcategory,
    city: listing.city,
    district: listing.district,
    neighborhood: listing.neighborhood,
    coordinates: listing.coordinates,
    property: listing.property,
    pricing: listing.pricing,
    amenities: listing.amenities,
  });
  return createHash("sha256").update(source).digest("hex");
}

export function validatePublicMarketListing(listing) {
  const required = [
    "schemaVersion", "token", "url", "title", "property", "pricing",
    "amenities", "coordinates", "crawlPartition", "firstSeenAt", "lastSeenAt", "contentFingerprint",
  ];
  for (const key of required) {
    if (listing?.[key] === undefined || listing?.[key] === null) {
      throw new Error(`Public listing schema violation: ${key} is required`);
    }
  }
  for (const forbidden of ["contact", "description", "publicPhones", "authenticatedPhone", "advertiser"]) {
    if (Object.hasOwn(listing, forbidden)) {
      throw new Error(`Public listing schema violation: forbidden field ${forbidden}`);
    }
  }
  if (listing.schemaVersion !== "1.0.0") throw new Error("Public listing schema version is unsupported");
  if (!/^[A-Za-z0-9_-]+$/.test(listing.token)) throw new Error("Public listing token is invalid");
  if (listing.pricing.currency !== "TOMAN") throw new Error("Public listing currency must be TOMAN");
  if (!/^[a-f0-9]{64}$/.test(listing.contentFingerprint)) {
    throw new Error("Public listing fingerprint is invalid");
  }
  return listing;
}

export function toPublicMarketListing(
  normalized,
  existing = null,
  now = new Date().toISOString(),
  discovered = null,
) {
  const area = finite(normalized.property?.area);
  const price = finite(normalized.pricing?.price);
  const advertisedPricePerMeter = finite(normalized.pricing?.pricePerMeter);
  const derivedPricePerMeter = price !== null && area !== null && area > 0
    ? Math.round(price / area)
    : null;
  const pricePerMeter = derivedPricePerMeter ?? advertisedPricePerMeter;

  const listing = {
    schemaVersion: "1.0.0",
    token: normalized.token,
    url: normalized.url,
    title: redactContactText(normalized.title),
    category: normalized.category ?? null,
    subcategory: normalized.subcategory ?? null,
    city: normalized.city ?? null,
    district: normalized.district ?? null,
    neighborhood: normalized.neighborhood ?? null,
    publishedText: normalized.publishedText ?? null,
    crawlPartition: {
      category: discovered?.category ?? null,
      expectedSubcategory: discovered?.expectedSubcategory ?? null,
      area: discovered?.area
        ? {
            id: Number.isInteger(discovered.area.id) ? discovered.area.id : null,
            name: discovered.area.name ?? null,
            slug: discovered.area.slug ?? null,
          }
        : null,
    },
    property: {
      area,
      constructionYear: Number.isInteger(normalized.property?.constructionYear)
        ? normalized.property.constructionYear
        : null,
      rooms: finite(normalized.property?.rooms),
      floor: finite(normalized.property?.floor),
      totalFloors: finite(normalized.property?.totalFloors),
      unitsPerFloor: finite(normalized.property?.unitsPerFloor),
    },
    pricing: {
      currency: "TOMAN",
      price,
      pricePerMeter,
      deposit: finite(normalized.pricing?.deposit),
      rent: finite(normalized.pricing?.rent),
      isFullMortgage: nullableBoolean(normalized.pricing?.isFullMortgage),
      isNegotiable: nullableBoolean(normalized.pricing?.isNegotiable),
    },
    amenities: {
      elevator: nullableBoolean(normalized.amenities?.elevator),
      parking: nullableBoolean(normalized.amenities?.parking),
      storage: nullableBoolean(normalized.amenities?.storage),
      balcony: nullableBoolean(normalized.amenities?.balcony),
    },
    advertiserType: normalized.advertiser?.type ?? null,
    coordinates: {
      latitude: finite(normalized.coordinates?.latitude),
      longitude: finite(normalized.coordinates?.longitude),
      accuracy: normalized.coordinates?.accuracy ?? null,
      radiusMeters: finite(normalized.coordinates?.radiusMeters),
      source: normalized.coordinates?.source ?? null,
    },
    imageCount: Array.isArray(normalized.images) ? normalized.images.length : 0,
    quality: {
      score: finite(normalized.quality?.score) ?? 0,
      missingFields: Array.isArray(normalized.quality?.missingFields)
        ? normalized.quality.missingFields
        : [],
    },
    firstSeenAt: existing?.firstSeenAt || now,
    lastSeenAt: now,
    contentFingerprint: "",
  };
  listing.contentFingerprint = fingerprintFor(listing);
  return validatePublicMarketListing(listing);
}

function normalizePublicListing(raw, existing, discovered = null) {
  // Public text can accidentally contain personal contact details. The analytics
  // record does not retain descriptions, names, contact state, or phone fields.
  raw.description = redactContactText(raw.description);
  const normalized = validateListing(
    fillMissingListingFields(normalizeListing(raw), raw),
  );
  return toPublicMarketListing(normalized, existing, new Date().toISOString(), discovered);
}

function publicCoverage(listing) {
  return {
    hasCoordinates: listing.coordinates.latitude !== null && listing.coordinates.longitude !== null,
    coordinateAccuracy: listing.coordinates.accuracy,
    coordinateRadiusMeters: listing.coordinates.radiusMeters,
    hasArea: listing.property.area !== null,
    hasSalePrice: listing.pricing.price !== null,
    hasDeposit: listing.pricing.deposit !== null,
    hasRent: listing.pricing.rent !== null,
    imageCount: listing.imageCount,
    qualityScore: listing.quality.score,
    missingFieldCount: listing.quality.missingFields.length,
  };
}

export async function crawlPublicListing(
  page,
  discovered,
  existing = null,
  {
    logger = null,
    apiFetcher = fetchPublicPostDocument,
    apiRequestContext = null,
    htmlExtractor = extractListing,
  } = {},
) {
  const apiStartedAt = Date.now();
  try {
    logger?.debug("crawl.detail.api.request", "Requesting public listing JSON", {
      token: discovered.token,
    });
    const { document, status } = await apiFetcher(
      apiRequestContext || page,
      discovered.token,
    );
    const listing = normalizePublicListing(
      adaptPublicPostDocument(document, discovered),
      existing,
      discovered,
    );
    logger?.info("crawl.detail.api.success", "Public listing JSON extracted", {
      token: discovered.token,
      status,
      elapsedMs: Date.now() - apiStartedAt,
      ...publicCoverage(listing),
    });
    return listing;
  } catch (apiError) {
    logger?.warn("crawl.detail.api.fallback", "Public listing JSON failed; using HTML fallback", {
      token: discovered.token,
      status: apiError.status ?? null,
      code: apiError.code ?? null,
      elapsedMs: Date.now() - apiStartedAt,
      error: apiError.message,
    });

    // Do not turn an explicit platform-limit response into another request.
    if (apiError.status === 403 || apiError.status === 429) throw apiError;

    const htmlStartedAt = Date.now();
    try {
      const listing = normalizePublicListing(
        await htmlExtractor(page, discovered),
        existing,
        discovered,
      );
      logger?.info("crawl.detail.html.success", "HTML fallback extracted public listing", {
        token: discovered.token,
        elapsedMs: Date.now() - htmlStartedAt,
        ...publicCoverage(listing),
      });
      return listing;
    } catch (htmlError) {
      logger?.error("crawl.detail.html.failure", "Public JSON and HTML extraction both failed", {
        token: discovered.token,
        elapsedMs: Date.now() - htmlStartedAt,
        apiError: apiError.message,
        error: htmlError.message,
      });
      throw htmlError;
    }
  }
}

export const _publicListingHelpers = {
  fingerprintFor,
  finite,
  nullableBoolean,
  normalizePublicListing,
  publicCoverage,
};
