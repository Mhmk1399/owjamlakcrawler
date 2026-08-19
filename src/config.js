import "dotenv/config";

function clampInteger(value, fallback, minimum, maximum) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? Math.min(maximum, Math.max(minimum, parsed)) : fallback;
}

export const config = {
  baseUrl: "https://divar.ir",

  searchUrl:
    process.env.DIVAR_SEARCH_URL ||
    "https://divar.ir/s/tehran/real-estate",

  browser: {
    headless: process.env.HEADLESS === "true",
    slowMo: Number(process.env.SLOW_MO || 100),
  },

  crawler: {
    maxListings: clampInteger(process.env.MAX_LISTINGS, 100, 1, 10000),
    navigationTimeout: Number(
      process.env.NAVIGATION_TIMEOUT || 60000
    ),
    detailConcurrency: clampInteger(process.env.DETAIL_CONCURRENCY, 3, 1, 8),
    detailMaxRetries: clampInteger(process.env.DETAIL_MAX_RETRIES, 2, 0, 5),
    contactRequestIntervalMs: clampInteger(
      process.env.CONTACT_REQUEST_INTERVAL_MS,
      10000,
      0,
      60000,
    ),
    shutdownGraceMs: clampInteger(process.env.SHUTDOWN_GRACE_MS, 15000, 1000, 60000),
    generateCombinedJson: process.env.GENERATE_COMBINED_JSON !== "false",
  },
};
