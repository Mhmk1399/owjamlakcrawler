import { crawlListingDetail } from "../crawler/listing.js";

const TRANSIENT_ERROR = /timeout|timed out|net::|network|navigation|connection|temporarily|target page.*closed|page.*crash/i;

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

export function isTransientDetailError(error) {
  return TRANSIENT_ERROR.test(error instanceof Error ? error.message : String(error));
}

export async function ensureWorkerPage(context, page) {
  if (page && !page.isClosed()) return page;
  return context.newPage();
}

export function deduplicateListings(listings = []) {
  const seen = new Set();
  return listings.filter((listing) => {
    if (!listing?.token || seen.has(listing.token)) return false;
    seen.add(listing.token);
    return true;
  }).map(({ token, url }) => ({ token, url }));
}

export async function processListings({
  context,
  listings,
  concurrency = 3,
  maxRetries = 2,
  savedTokens = new Set(),
  shouldStop = () => false,
  crawl = crawlListingDetail,
  onSuccess = async () => {},
  onFailure = async () => {},
  onProgress = () => {},
  retryDelayMs = 1000,
}) {
  const unique = deduplicateListings(listings);
  const queue = unique.filter((listing) => !savedTokens.has(listing.token));
  const skipped = unique.length - queue.length;
  const workerCount = queue.length ? Math.min(Math.max(1, concurrency), queue.length) : 0;
  let cursor = 0;
  let active = 0;
  let peakActiveWorkers = 0;
  let successful = 0;
  let failed = 0;
  let retries = 0;
  let completed = skipped;
  let totalDurationMs = 0;
  const startedAt = Date.now();

  const snapshot = () => ({
    discovered: unique.length,
    queued: queue.length,
    processing: active,
    successful,
    failed,
    skipped,
    completed,
    total: unique.length,
  });

  async function runWorker(workerId) {
    let page = await context.newPage();
    try {
      while (!shouldStop()) {
        const index = cursor;
        cursor += 1;
        if (index >= queue.length) break;
        const listing = queue[index];
        active += 1;
        peakActiveWorkers = Math.max(peakActiveWorkers, active);
        const itemStartedAt = Date.now();
        console.log(`[WORKER ${workerId}] START ${listing.token}`);

        let detail = null;
        let finalError = null;
        try {
          for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
            try {
              page = await ensureWorkerPage(context, page);
              detail = await crawl(page, listing);
              finalError = null;
              break;
            } catch (error) {
              finalError = error;
              const canRetry = attempt < maxRetries && isTransientDetailError(error);
              if (!canRetry) break;
              retries += 1;
              console.warn(`[WORKER ${workerId}] RETRY ${listing.token} (${attempt + 1}/${maxRetries})`);
              if (/target page.*closed|page.*crash/i.test(error instanceof Error ? error.message : String(error))) {
                await page?.close().catch(() => {});
              }
              if (page?.isClosed()) page = await context.newPage();
              await delay(retryDelayMs);
            }
          }

          if (detail) {
            await onSuccess(detail, index, workerId);
            successful += 1;
            console.log(`[WORKER ${workerId}] OK ${listing.token}`);
          } else {
            failed += 1;
            console.error(`[WORKER ${workerId}] FAILED ${listing.token}: ${finalError?.message || String(finalError)}`);
            await onFailure(listing, finalError, index, workerId, page);
          }
        } finally {
          active -= 1;
          completed += 1;
          totalDurationMs += Date.now() - itemStartedAt;
          onProgress(snapshot());
          detail = null;
          finalError = null;
        }
      }
    } finally {
      await page?.close().catch(() => {});
    }
  }

  await Promise.all(Array.from({ length: workerCount }, (_, index) => runWorker(index + 1)));
  const elapsedMs = Date.now() - startedAt;
  return {
    ...snapshot(),
    workers: workerCount,
    retries,
    peakActiveWorkers,
    elapsedMs,
    averageListingDurationMs: successful + failed ? totalDurationMs / (successful + failed) : 0,
    adsPerMinute: elapsedMs ? (successful / elapsedMs) * 60000 : 0,
  };
}
