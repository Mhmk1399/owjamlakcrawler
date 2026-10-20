import { createHash } from "node:crypto";
import {
  adaptPublicPostDocument,
  fetchPublicPostDocument,
} from "./divarPost.js";
import { resolveListingLocation } from "../locations/hierarchy.js";
import { classifyListingQuality } from "./listingPolicy.js";

const PHONE_LIKE = /(?<!\d)(?:(?:\+98|0098|0)[\d -]{9,16}\d)(?!\d)/g;
const EMAIL_LIKE = /[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g;
const PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
const ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";

function latinDigits(value) {
  return String(value ?? "")
    .replace(/[۰-۹]/g, (digit) => PERSIAN_DIGITS.indexOf(digit))
    .replace(/[٠-٩]/g, (digit) => ARABIC_DIGITS.indexOf(digit));
}

function numberFrom(value) {
  const match = latinDigits(value).replace(/[,٬،\s]/g, "").match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}

function moneyFrom(value) {
  const number = numberFrom(value);
  if (!Number.isFinite(number)) return null;
  const text = String(value);
  if (text.includes("میلیارد")) return number * 1_000_000_000;
  if (text.includes("میلیون")) return number * 1_000_000;
  return number;
}

function attribute(raw, pattern) {
  const entry = Object.entries(raw.structuredAttributes || raw.attributes || {})
    .find(([label]) => pattern.test(label));
  return entry?.[1] ?? null;
}

function coordinatesFrom(raw) {
  const location = raw.apiCoordinates?.[0];
  const point = location?.fuzzy_data?.point || location?.exact_data?.point || location?.point || location;
  const latitude = Number(point?.latitude ?? point?.lat);
  const longitude = Number(point?.longitude ?? point?.lng);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)
    || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    return { latitude: null, longitude: null, accuracy: null, radiusMeters: null, source: null };
  }
  const approximate = location?.type === "FUZZY" || location?.fuzzy_data;
  return {
    latitude, longitude,
    accuracy: approximate ? "approximate" : "exact",
    radiusMeters: Number.isFinite(Number(location?.fuzzy_data?.radius))
      ? Number(location.fuzzy_data.radius) : null,
    source: raw.extractionSource || "public-html",
  };
}

function normalizePublicRaw(raw) {
  const floorNumbers = latinDigits(attribute(raw, /^طبقه$/)).match(/\d+/g)?.map(Number) || [];
  const normalized = {
    token: raw.token, url: raw.url, title: raw.title, category: raw.category || "real-estate",
    subcategory: raw.subcategory, city: raw.city, district: raw.district,
    neighborhood: raw.neighborhood, sourceNeighborhoodSlug: raw.sourceNeighborhoodSlug,
    publishedText: raw.publishedText,
    property: {
      area: numberFrom(attribute(raw, /^(متراژ|مساحت)$/)),
      constructionYear: numberFrom(attribute(raw, /^(ساخت|سال ساخت)$/)),
      rooms: numberFrom(attribute(raw, /^(اتاق|تعداد اتاق)$/)),
      floor: floorNumbers[0] ?? null,
      totalFloors: floorNumbers[1] ?? numberFrom(attribute(raw, /^تعداد طبقات$/)),
      unitsPerFloor: numberFrom(attribute(raw, /^تعداد واحد در طبقه$/)),
    },
    pricing: {
      price: moneyFrom(attribute(raw, /^(قیمت کل|قیمت فروش)$/)),
      pricePerMeter: moneyFrom(attribute(raw, /^قیمت هر متر$/)),
      deposit: moneyFrom(attribute(raw, /^(ودیعه|رهن)/)),
      rent: moneyFrom(attribute(raw, /^اجاره/)),
      isFullMortgage: null, isNegotiable: null,
    },
    amenities: {
      elevator: typeof raw.amenities?.elevator === "boolean" ? raw.amenities.elevator : null,
      parking: typeof raw.amenities?.parking === "boolean" ? raw.amenities.parking : null,
      storage: typeof raw.amenities?.storage === "boolean" ? raw.amenities.storage : null,
      balcony: typeof raw.amenities?.balcony === "boolean" ? raw.amenities.balcony : null,
    },
    advertiser: { type: null }, images: Array.isArray(raw.images) ? raw.images : [],
    coordinates: coordinatesFrom(raw), quality: { score: 0, missingFields: [] },
  };
  if (!normalized.token || !normalized.url || !normalized.title) {
    throw new Error("Public listing is missing token, URL, or title");
  }
  if (normalized.pricing.deposit !== null || normalized.pricing.rent !== null) normalized.pricing.price = null;
  const required = { title: normalized.title, subcategory: normalized.subcategory, city: normalized.city,
    neighborhood: normalized.neighborhood, area: normalized.property.area, rooms: normalized.property.rooms,
    pricing: normalized.pricing.price ?? normalized.pricing.deposit ?? normalized.pricing.rent };
  normalized.quality.missingFields = Object.entries(required).filter(([, value]) => value == null).map(([key]) => key);
  normalized.quality.score = Math.round(((Object.keys(required).length - normalized.quality.missingFields.length)
    / Object.keys(required).length) * 100);
  return normalized;
}

async function extractPublicHtmlListing(page, discovered) {
  await page.goto(discovered.url, { waitUntil: "domcontentloaded" });
  const raw = await page.evaluate(() => {
    const clean = (value) => String(value || "").replace(/\s+/g, " ").trim();
    const attributes = {};
    for (const row of document.querySelectorAll("tr, .kt-base-row")) {
      const values = [...row.children].map((node) => clean(node.textContent)).filter(Boolean);
      if (values.length === 2) attributes[values[0]] ??= values[1];
    }
    return {
      title: clean(document.querySelector("h1")?.textContent || document.querySelector('meta[property="og:title"]')?.content),
      attributes,
      images: [...document.querySelectorAll("main img")].map((image) => image.currentSrc || image.src).filter(Boolean),
    };
  });
  return { ...raw, token: discovered.token, url: discovered.url, category: "real-estate",
    subcategory: discovered.expectedSubcategory, city: "تهران", neighborhood: discovered.area?.name,
    sourceNeighborhoodSlug: discovered.area?.slug, extractionSource: "public-html", amenities: {} };
}

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
    resolvedLocation: listing.resolvedLocation,
    coordinates: listing.coordinates,
    property: listing.property,
    pricing: listing.pricing,
    amenities: listing.amenities,
    advertiserType: listing.advertiserType,
    imageCount: listing.imageCount,
    publishedText: listing.publishedText,
    quality: listing.quality,
  });
  return createHash("sha256").update(source).digest("hex");
}

export function validatePublicMarketListing(listing) {
  const required = [
    "schemaVersion", "token", "url", "title", "property", "pricing",
    "amenities", "coordinates", "crawlPartition", "quality", "lifecycle", "firstSeenAt", "lastSeenAt", "contentFingerprint",
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
    sourceNeighborhoodSlug: normalized.sourceNeighborhoodSlug ?? null,
    resolvedLocation: null,
    publishedText: normalized.publishedText ?? null,
    crawlPartition: {
      category: discovered?.category ?? null,
      expectedSubcategory: discovered?.expectedSubcategory ?? null,
      area: discovered?.area
        ? {
            id: Number.isInteger(discovered.area.id) ? discovered.area.id : null,
            name: discovered.area.name ?? null,
            slug: discovered.area.slug ?? null,
            municipalDistricts: Array.isArray(discovered.area.municipalDistricts)
              ? discovered.area.municipalDistricts.filter(Number.isInteger)
              : [],
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
      outcome: null,
      outcomeReasons: [],
    },
    firstSeenAt: existing?.firstSeenAt || now,
    lastSeenAt: now,
    contentFingerprint: "",
    lifecycle: {
      status: "active",
      detailFetchedAt: now,
      lastDiscoveredAt: now,
      lastConfirmedRunId: null,
      lastContentChangedAt: null,
      consecutiveMisses: 0,
      removedAt: null,
    },
  };
  listing.resolvedLocation = resolveListingLocation(listing);
  Object.assign(listing.quality, classifyListingQuality(listing));
  listing.contentFingerprint = fingerprintFor(listing);
  listing.lifecycle.lastContentChangedAt = existing?.contentFingerprint === listing.contentFingerprint
    ? existing?.lifecycle?.lastContentChangedAt ?? existing?.lastSeenAt ?? now
    : now;
  return validatePublicMarketListing(listing);
}

function normalizePublicListing(raw, existing, discovered = null) {
  // Public text can accidentally contain personal contact details. The analytics
  // record does not retain descriptions, names, contact state, or phone fields.
  raw.description = redactContactText(raw.description);
  const normalized = normalizePublicRaw(raw);
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
    htmlExtractor = extractPublicHtmlListing,
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
