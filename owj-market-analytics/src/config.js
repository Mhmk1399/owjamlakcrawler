import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

const serviceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function integer(value, fallback, minimum, maximum) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed)
    ? Math.min(maximum, Math.max(minimum, parsed))
    : fallback;
}

function bool(value, fallback) {
  if (value === undefined) return fallback;
  return value === "true";
}

export const config = {
  serviceRoot,
  host: process.env.ANALYTICS_HOST || "127.0.0.1",
  port: integer(process.env.ANALYTICS_PORT, 4567, 1, 65535),
  autoCrawl: bool(process.env.ANALYTICS_AUTO_CRAWL, false),
  crawlIntervalMs: integer(
    process.env.ANALYTICS_CRAWL_INTERVAL_MS,
    21_600_000,
    60_000,
    604_800_000,
  ),
  browser: {
    headless: bool(process.env.ANALYTICS_HEADLESS, true),
    navigationTimeoutMs: integer(
      process.env.ANALYTICS_NAVIGATION_TIMEOUT_MS,
      60_000,
      5_000,
      180_000,
    ),
  },
  crawl: {
    // This is a safety ceiling; normal queue size is area count multiplied by
    // listingsPerArea. Limit areas for quick development crawls.
    maxListings: integer(process.env.ANALYTICS_MAX_LISTINGS, 10_000, 1, 100_000),
    listingsPerArea: integer(
      process.env.ANALYTICS_LISTINGS_PER_AREA,
      15,
      1,
      100,
    ),
    maxAreas: integer(process.env.ANALYTICS_MAX_AREAS, 0, 0, 10_000),
    detailConcurrency: integer(
      process.env.ANALYTICS_DETAIL_CONCURRENCY,
      3,
      1,
      8,
    ),
    publicRequestIntervalMs: integer(
      process.env.ANALYTICS_PUBLIC_REQUEST_INTERVAL_MS,
      1_500,
      250,
      60_000,
    ),
    maxSearchIterations: integer(
      process.env.ANALYTICS_MAX_SEARCH_ITERATIONS,
      150,
      1,
      1_000,
    ),
    maxSearchStalls: integer(
      process.env.ANALYTICS_MAX_SEARCH_STALLS,
      5,
      1,
      20,
    ),
  },
  analytics: {
    minSpatialSample: integer(
      process.env.ANALYTICS_MIN_SPATIAL_SAMPLE ?? process.env.ANALYTICS_MIN_DISTRICT_SAMPLE,
      5,
      2,
      10_000,
    ),
    spatialCellSizeMeters: integer(
      process.env.ANALYTICS_SPATIAL_CELL_SIZE_METERS,
      1_000,
      250,
      10_000,
    ),
    minModelSample: integer(
      process.env.ANALYTICS_MIN_MODEL_SAMPLE,
      30,
      2,
      10_000,
    ),
  },
  paths: {
    data: path.join(serviceRoot, "data"),
    logs: path.join(serviceRoot, "logs"),
    listings: path.join(serviceRoot, "data", "listings.json"),
    listingRecords: path.join(serviceRoot, "data", "listings"),
    analytics: path.join(serviceRoot, "data", "analytics.json"),
    model: path.join(serviceRoot, "data", "online-models.json"),
    scoringReady: path.join(serviceRoot, "data", "scoring-ready.json"),
    scoredListings: path.join(serviceRoot, "data", "scored-listings.json"),
    scoringModel: path.join(serviceRoot, "data", "scoring-model.json"),
    scoringReport: path.join(serviceRoot, "data", "scoring-report.json"),
    serviceState: path.join(serviceRoot, "data", "service-state.json"),
    observations: path.join(serviceRoot, "data", "observations"),
    logFile: path.join(serviceRoot, "logs", "service.jsonl"),
  },
  jsonSnapshotEvery: integer(
    process.env.ANALYTICS_JSON_SNAPSHOT_EVERY,
    25,
    1,
    1_000,
  ),
  logLevel: process.env.ANALYTICS_LOG_LEVEL || "debug",
};
