import fs from "node:fs/promises";
import { collectListingUrls, createSearchDiagnostics, observeSearchNetwork, openSearchPage } from "./search.js";

async function writeJsonAtomic(file, value) {
  const temporary = `${file}.tmp`;
  await fs.writeFile(temporary, JSON.stringify(value, null, 2), "utf8");
  await fs.rename(temporary, file);
}

export const DEFAULT_BACKFILL_PARTITIONS = [
  { category: "buy-residential", url: "https://divar.ir/s/tehran/buy-residential" },
  { category: "rent-residential", url: "https://divar.ir/s/tehran/rent-residential" },
  { category: "buy-commercial", url: "https://divar.ir/s/tehran/buy-commercial-property" },
  { category: "rent-commercial", url: "https://divar.ir/s/tehran/rent-commercial-property" },
  { category: "short-term-rent", url: "https://divar.ir/s/tehran/rent-temporary" },
];

export async function crawlSearchPartition(page, partition, options = {}) {
  const globalListings = options.globalListings || new Map();
  console.log(`\n[BACKFILL] category=${partition.category}`);
  const partitionDiagnostic = {
    category: partition.category,
    districts: partition.districts || [],
    priceMin: partition.priceMin ?? null,
    priceMax: partition.priceMax ?? null,
    areaMin: partition.areaMin ?? null,
    areaMax: partition.areaMax ?? null,
    discovered: 0,
  };
  options.diagnostics?.partitions.push(partitionDiagnostic);
  await openSearchPage(page, partition.url);
  const listings = await collectListingUrls(page, {
    diagnostics: options.diagnostics,
    networkObserver: options.networkObserver,
    maxIterations: options.maxIterations,
    maxListings: options.maxListings,
    onProgress: async (partitionListings) => {
      for (const listing of partitionListings) globalListings.set(listing.token, listing);
      partitionDiagnostic.discovered = partitionListings.length;
      options.diagnostics.totalUniqueTokens = globalListings.size;
      await writeJsonAtomic("data/discovered-listings.json", [...globalListings.values()]);
      await writeJsonAtomic("data/search-diagnostics.json", options.diagnostics);
    },
  });
  for (const listing of listings) {
    if (!globalListings.has(listing.token)) globalListings.set(listing.token, listing);
  }
  console.log(`[BACKFILL] discovered=${listings.length}`);
  partitionDiagnostic.discovered = listings.length;
  return listings;
}

export async function collectBackfillListings(page, options = {}) {
  const diagnostics = options.diagnostics || createSearchDiagnostics();
  const globalListings = new Map();
  await fs.mkdir("data", { recursive: true });
  const networkObserver = observeSearchNetwork(page, diagnostics);
  const maxListings = Number.isFinite(options.maxListings)
    ? Math.max(0, Math.floor(options.maxListings))
    : Infinity;
  try {
    for (const partition of options.partitions || DEFAULT_BACKFILL_PARTITIONS) {
      if (globalListings.size >= maxListings) break;
      await crawlSearchPartition(page, partition, {
        ...options,
        diagnostics,
        globalListings,
        networkObserver,
        maxListings: maxListings - globalListings.size,
      });
    }
  } finally {
    networkObserver.stop();
  }
  diagnostics.endedAt = new Date().toISOString();
  diagnostics.totalUniqueTokens = globalListings.size;
  console.log(`\n[BACKFILL] total unique tokens=${globalListings.size}`);
  return { listings: [...globalListings.values()], diagnostics };
}
