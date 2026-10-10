import fs from "node:fs/promises";
import path from "node:path";
import { createBrowser } from "./crawler/browser.js";
import { collectLatestListings, createSearchDiagnostics } from "./crawler/search.js";
import { collectBackfillListings } from "./crawler/backfill.js";
import { checkDivarSession } from "./crawler/session.js";
import { config } from "./config.js";
import { canonicalizeDivarUrl, getDivarToken } from "./utils/url.js";
import { processListings } from "./workers/detailWorkerPool.js";
import { sendCrawlerAlert } from "./utils/alerts.js";
import {
  generateCombinedListings,
  validSavedTokens,
  writeListingAtomic,
} from "./storage/listingFiles.js";

let context;
let shutdownRequested = false;
let forceShutdownTimer;

async function closeContext() {
  if (!context) return;
  const active = context;
  context = null;
  await active.close().catch(() => {});
}

function requestShutdown(signal) {
  if (shutdownRequested) return;
  shutdownRequested = true;
  console.log(`\n[SHUTDOWN] ${signal}: stopping new detail jobs; waiting up to ${config.crawler.shutdownGraceMs}ms`);
  forceShutdownTimer = setTimeout(() => {
    console.warn("[SHUTDOWN] grace period expired; closing browser context");
    closeContext();
  }, config.crawler.shutdownGraceMs);
}

process.on("SIGINT", () => requestShutdown("SIGINT"));
process.on("SIGTERM", () => requestShutdown("SIGTERM"));

async function writeDiagnostics(diagnostics) {
  await fs.mkdir("data", { recursive: true });
  const destination = "data/search-diagnostics.json";
  const temporary = `${destination}.tmp`;
  await fs.writeFile(temporary, JSON.stringify(diagnostics, null, 2), "utf8");
  await fs.rename(temporary, destination);
}

function compactPhoneResult(detail) {
  const phoneNumbers = [
    detail.contact?.authenticatedPhone,
    ...(detail.contact?.publicPhones || []),
    ...(detail.contact?.publicLandlines || []),
  ]
    .map((value) => String(value || "").trim())
    .filter(Boolean);

  if (phoneNumbers.length === 0) return null;
  return {
    token: detail.token,
    title: detail.title,
    phoneNumbers: [...new Set(phoneNumbers)],
    url: detail.url,
  };
}

async function writePhoneResults(results) {
  await fs.mkdir("data", { recursive: true });
  const destination = "data/crawler-phone-results.json";
  const temporary = `${destination}.tmp`;
  await fs.writeFile(temporary, JSON.stringify(results, null, 2), "utf8");
  await fs.rename(temporary, destination);
}

async function discoverListings(searchPage) {
  const targetUrl = canonicalizeDivarUrl(process.env.TARGET_LISTING_URL);
  const diagnostics = createSearchDiagnostics();
  if (targetUrl) {
    diagnostics.endedAt = new Date().toISOString();
    diagnostics.totalUniqueTokens = 1;
    diagnostics.partitions.push({ category: "target", discovered: 1 });
    return { listings: [{ token: getDivarToken(targetUrl), url: targetUrl }], diagnostics, mode: "target" };
  }
  if (process.env.CRAWL_MODE === "latest") {
    const listings = await collectLatestListings(searchPage, {
      diagnostics,
      maxListings: config.crawler.maxListings,
    });
    diagnostics.endedAt = new Date().toISOString();
    diagnostics.totalUniqueTokens = listings.length;
    diagnostics.partitions.push({ category: "latest", discovered: listings.length });
    return { listings, diagnostics, mode: "latest" };
  }
  const result = await collectBackfillListings(searchPage, {
    diagnostics,
    maxListings: config.crawler.maxListings,
  });
  return { ...result, mode: "backfill" };
}

function printProgress(stats) {
  console.log("[PROGRESS]");
  console.log(`completed=${stats.completed} success=${stats.successful} failed=${stats.failed} skipped=${stats.skipped} processing=${stats.processing} total=${stats.total}`);
}

async function saveFailureScreenshot(listing, _error, _index, workerId, page) {
  await fs.mkdir("screenshots", { recursive: true });
  const token = String(listing.token || "unknown").replace(/[^a-zA-Z0-9_-]/g, "_");
  await page?.screenshot({ path: path.join("screenshots", `failed-${token}.png`), fullPage: true })
    .catch((error) => console.error(`[WORKER ${workerId}] screenshot failed: ${error.message}`));
}

function printWorkerReport(stats, contactSummary, session) {
  console.log("\n========================================");
  console.log("DETAIL WORKER REPORT");
  console.log("========================================");
  console.log(`Listings discovered: ${stats.discovered}`);
  console.log(`Listings queued: ${stats.queued}`);
  console.log(`Listings skipped: ${stats.skipped}`);
  console.log(`Workers: ${stats.workers}`);
  console.log(`Successful: ${stats.successful}`);
  console.log(`Failed: ${stats.failed}`);
  console.log(`Retries: ${stats.retries}`);
  console.log(`Peak active workers: ${stats.peakActiveWorkers}`);
  console.log(`Elapsed: ${(stats.elapsedMs / 1000).toFixed(1)}s`);
  console.log(`Average listing duration: ${(stats.averageListingDurationMs / 1000).toFixed(2)}s`);
  console.log(`Ads/minute: ${stats.adsPerMinute.toFixed(2)}`);
  console.log(`Ads with public mobile: ${contactSummary.publicPhones}`);
  console.log(`Ads with public landline: ${contactSummary.publicLandlines}`);
  console.log(`Ads with contact button: ${contactSummary.contactButtons}`);
  console.log(`Ads requiring authentication: ${contactSummary.authenticationRequired}`);
  console.log(`Ads with no contact information: ${contactSummary.noContactInformation}`);
  console.log(`Authenticated session state: ${session.state}`);
  console.log("========================================");
}

async function main() {
  const browser = await createBrowser();
  context = browser.context;
  const searchPage = browser.page;

  if (searchPage.url() === "about:blank") {
    await searchPage.goto(config.searchUrl, { waitUntil: "domcontentloaded" });
  }
  const session = await checkDivarSession(searchPage);
  console.log(`[SESSION] state=${session.state} evidence=${session.evidence || "none"}`);
  console.log(`[CRAWL] listing limit=${config.crawler.maxListings}`);

  const { listings, diagnostics } = await discoverListings(searchPage);
  await writeDiagnostics(diagnostics);
  await fs.mkdir("data/listings", { recursive: true });
  const savedTokens = process.env.RESUME === "true" ? await validSavedTokens() : new Set();
  const contactSummary = {
    publicPhones: 0,
    publicLandlines: 0,
    contactButtons: 0,
    authenticationRequired: 0,
    noContactInformation: 0,
  };
  const phoneResults = [];
  await writePhoneResults(phoneResults);

  const stats = await processListings({
    context,
    listings,
    concurrency: config.crawler.detailConcurrency,
    maxRetries: config.crawler.detailMaxRetries,
    savedTokens,
    shouldStop: () => shutdownRequested,
    onSuccess: async (detail) => {
      await writeListingAtomic(detail);
      if (detail.contact?.publicPhones?.length) contactSummary.publicPhones += 1;
      if (detail.contact?.publicLandlines?.length) contactSummary.publicLandlines += 1;
      if (detail.contact?.contactButtonAvailable) contactSummary.contactButtons += 1;
      if (detail.contact?.status === "authentication-required") contactSummary.authenticationRequired += 1;
      if (detail.contact?.status === "no-contact-information") contactSummary.noContactInformation += 1;
      const phoneResult = compactPhoneResult(detail);
      if (phoneResult) {
        phoneResults.push(phoneResult);
        await writePhoneResults(phoneResults);
        console.log(`[PHONE] ${phoneResult.phoneNumbers.join(", ")} | ${phoneResult.token} | ${phoneResult.title}`);
      }
    },
    onFailure: saveFailureScreenshot,
    onProgress: printProgress,
  });

  const persistedTokens = await validSavedTokens();
  if (config.crawler.generateCombinedJson && persistedTokens.size > 0) {
    const combined = await generateCombinedListings();
    console.log(`[EXPORT] combined ${combined.count} listings into ${combined.output}`);
  } else if (config.crawler.generateCombinedJson) {
    console.warn("[EXPORT] no valid token files; preserving the existing combined JSON");
  }
  console.log(`[PHONE RESULTS] ${phoneResults.length} ad(s) saved to data/crawler-phone-results.json`);
  printWorkerReport(stats, contactSummary, session);
  if (stats.failed > 0) {
    await sendCrawlerAlert(
      `Crawler finished with ${stats.failed} failed listing(s), ${stats.successful} successful, and ${stats.retries} retries.`,
      "warning"
    );
  }
  await closeContext();
  if (shutdownRequested) process.exitCode = 130;
}

main().catch(async (error) => {
  console.error("\nCRAWLER ERROR:");
  console.error(error);
  await sendCrawlerAlert(error.stack || error.message || String(error), "error");
  await closeContext();
  process.exitCode = 1;
}).finally(() => {
  if (forceShutdownTimer) clearTimeout(forceShutdownTimer);
});
