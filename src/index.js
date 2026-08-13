import fs from "node:fs/promises";
import path from "node:path";
import { createBrowser } from "./crawler/browser.js";
import { crawlListingDetail } from "./crawler/listing.js";
import { collectLatestListings, createSearchDiagnostics } from "./crawler/search.js";
import { collectBackfillListings } from "./crawler/backfill.js";
import { canonicalizeDivarUrl, getDivarToken } from "./utils/url.js";

let context;
let stopping = false;

async function writeJsonAtomic(file, value) {
  const temporary = `${file}.tmp`;
  await fs.writeFile(temporary, JSON.stringify(value, null, 2), "utf8");
  await fs.rename(temporary, file);
}

async function closeContext() {
  if (!context) return;
  const activeContext = context;
  context = null;
  await activeContext.close().catch(() => {});
}

async function shutdown() {
  if (stopping) return;
  stopping = true;
  console.log("\nClosing crawler...");
  await closeContext();
  process.exitCode = 130;
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

async function saveFailureScreenshot(page, token) {
  await fs.mkdir("screenshots", { recursive: true });
  const safeToken = String(token || "unknown").replace(/[^a-zA-Z0-9_-]/g, "_");
  await page.screenshot({ path: path.join("screenshots", `failed-${safeToken}.png`), fullPage: true });
}

async function main() {
  const browserData = await createBrowser();
  context = browserData.context;
  const page = browserData.page;
  const mode = process.env.CRAWL_MODE === "latest" ? "latest" : "backfill";
  const diagnostics = createSearchDiagnostics();
  let listings;
  const targetUrl = canonicalizeDivarUrl(process.env.TARGET_LISTING_URL);
  if (targetUrl) {
    listings = [{ token: getDivarToken(targetUrl), url: targetUrl }];
    diagnostics.endedAt = new Date().toISOString();
    diagnostics.totalUniqueTokens = 1;
    diagnostics.partitions.push({ category: "target", discovered: 1 });
  } else if (mode === "latest") {
    listings = await collectLatestListings(page, { diagnostics });
    diagnostics.endedAt = new Date().toISOString();
    diagnostics.totalUniqueTokens = listings.length;
    diagnostics.partitions.push({ category: "latest", discovered: listings.length });
  } else {
    ({ listings } = await collectBackfillListings(page, { diagnostics }));
  }
  await fs.mkdir("data", { recursive: true });
  await fs.writeFile("data/search-diagnostics.json", JSON.stringify(diagnostics, null, 2), "utf8");
  let existingData = [];
  try {
    const parsed = JSON.parse(await fs.readFile("data/listings.json", "utf8"));
    if (Array.isArray(parsed)) {
      existingData = parsed.filter((item) => item?.token && item?.quality && Object.hasOwn(item.contact || {}, "contactButtonAvailable"));
    }
  } catch {}
  const dataByToken = new Map(existingData.map((item) => [item.token, item]));
  const data = [...dataByToken.values()];
  console.log(`[CHECKPOINT] resumable listings loaded: ${data.length}`);
  let failed = 0;
  let visited = 0;
  let successfulThisRun = 0;

  for (let index = 0; index < listings.length; index += 1) {
    const listing = listings[index];
    if (!targetUrl && process.env.RESUME === "true" && dataByToken.has(listing.token)) {
      console.log(`\n[${index + 1}/${listings.length}] Skipping saved ${listing.token}`);
      continue;
    }
    console.log(`\n[DETAIL ${index + 1}/${listings.length}] ${listing.token}`);

    try {
      visited += 1;
      const detail = await crawlListingDetail(page, listing);
      dataByToken.set(detail.token, detail);
      const existingIndex = data.findIndex((item) => item.token === detail.token);
      if (existingIndex >= 0) data[existingIndex] = detail;
      else data.push(detail);
      successfulThisRun += 1;
      await writeJsonAtomic("data/listings.json", data);
      console.log(`[OK] ${detail.title || listing.token}`);
      console.log(`[CHECKPOINT] saved ${data.length} listings`);
    } catch (error) {
      failed += 1;
      console.error(`[FAILED] ${listing.token}`);
      console.error(error instanceof Error ? error.message : String(error));
      await saveFailureScreenshot(page, listing.token).catch((screenshotError) => {
        console.error(`[FAILED] could not save screenshot: ${screenshotError.message}`);
      });
    }
  }

  await writeJsonAtomic("data/listings.json", data);

  const withPhones = data.filter((item) => item.contact.publicPhones.length > 0).length;
  const withCoordinates = data.filter((item) => item.coordinates.latitude !== null && item.coordinates.longitude !== null);
  const exactCoordinates = withCoordinates.filter((item) => item.coordinates.accuracy === "exact").length;
  const approximateCoordinates = withCoordinates.filter((item) => item.coordinates.accuracy === "approximate").length;
  const unknownCoordinates = withCoordinates.filter((item) => item.coordinates.accuracy === "unknown").length;
  const averageImages = data.length
    ? data.reduce((total, item) => total + item.images.length, 0) / data.length
    : 0;
  const withArea = data.filter((item) => item.property.area !== null).length;
  const withRooms = data.filter((item) => item.property.rooms !== null).length;
  const withYear = data.filter((item) => item.property.constructionYear !== null).length;
  const withPrice = data.filter((item) => item.pricing.price !== null || item.pricing.deposit !== null || item.pricing.rent !== null).length;
  const withAmenities = data.filter((item) => Object.values(item.amenities).some((value) => value !== null)).length;
  const withContactButton = data.filter((item) => item.contact.contactButtonAvailable).length;
  const averageQuality = data.length ? data.reduce((total, item) => total + item.quality.score, 0) / data.length : 0;

  console.log("\n========================================");
  console.log("CRAWL COMPLETE");
  console.log("========================================");
  console.log(`DETAIL PAGES DISCOVERED: ${listings.length}`);
  console.log(`DETAIL PAGES VISITED: ${visited}`);
  console.log(`SUCCESS: ${successfulThisRun}`);
  console.log(`FAILED: ${failed}`);
  console.log(`ADS WITH AREA: ${withArea}`);
  console.log(`ADS WITH ROOMS: ${withRooms}`);
  console.log(`ADS WITH CONSTRUCTION YEAR: ${withYear}`);
  console.log(`ADS WITH PRICE: ${withPrice}`);
  console.log(`ADS WITH AMENITIES: ${withAmenities}`);
  console.log(`ADS WITH COORDINATES: ${withCoordinates.length}`);
  console.log(`ADS WITH PUBLIC PHONE: ${withPhones}`);
  console.log(`ADS WITH CONTACT BUTTON: ${withContactButton}`);
  console.log(`AVERAGE QUALITY SCORE: ${averageQuality.toFixed(2)}`);
  console.log(`Ads with public mobile numbers: ${withPhones}`);
  console.log(`Ads with coordinates: ${withCoordinates.length}`);
  console.log(`Exact coordinates: ${exactCoordinates}`);
  console.log(`Approximate coordinates: ${approximateCoordinates}`);
  console.log(`Unknown-accuracy coordinates: ${unknownCoordinates}`);
  console.log(`Ads without coordinates: ${data.length - withCoordinates.length}`);
  console.log(`Average real listing images: ${averageImages.toFixed(2)}`);
  console.log(`Backfill partitions crawled: ${!targetUrl && mode === "backfill" ? diagnostics.partitions.length : 0}`);
  console.log("Output: data/listings.json");
  console.log("Search diagnostics: data/search-diagnostics.json");
  console.log("========================================");
  const verification = dataByToken.get("gaylgw4i");
  if (verification) {
    console.log("\nNORMALIZED gaylgw4i:");
    console.log(JSON.stringify(verification, null, 2));
  }

  await closeContext();
}

main().catch(async (error) => {
  if (stopping) {
    await closeContext();
    return;
  }
  console.error("\nCRAWLER ERROR:");
  console.error(error);
  await closeContext();
  process.exitCode = 1;
});
