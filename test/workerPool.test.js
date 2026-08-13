import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { processListings } from "../src/workers/detailWorkerPool.js";
import { validSavedTokens, writeListingAtomic } from "../src/storage/listingFiles.js";

function mockContext() {
  let pageId = 0;
  return {
    pagesCreated: () => pageId,
    async newPage() {
      pageId += 1;
      let closed = false;
      return {
        id: pageId,
        isClosed: () => closed,
        close: async () => { closed = true; },
      };
    },
  };
}

const listings = (count) => Array.from({ length: count }, (_, index) => ({
  token: `token${index}`,
  url: `https://divar.ir/v/example/token${index}`,
}));

test("worker pool enforces bounded concurrency and suppresses duplicate tokens", async () => {
  const context = mockContext();
  let active = 0;
  let peak = 0;
  const seen = [];
  const stats = await processListings({
    context,
    listings: [...listings(6), listings(1)[0]],
    concurrency: 3,
    retryDelayMs: 1,
    crawl: async (_page, listing) => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 10));
      active -= 1;
      return { ...listing, title: listing.token };
    },
    onSuccess: async (detail) => seen.push(detail.token),
  });
  assert.equal(peak, 3);
  assert.equal(stats.peakActiveWorkers, 3);
  assert.equal(stats.successful, 6);
  assert.equal(new Set(seen).size, 6);
  assert.equal(context.pagesCreated(), 3);
});

test("one failed job does not stop workers", async () => {
  const succeeded = [];
  const failed = [];
  const stats = await processListings({
    context: mockContext(),
    listings: listings(4),
    concurrency: 2,
    maxRetries: 0,
    crawl: async (_page, listing) => {
      if (listing.token === "token1") throw new Error("validation failed");
      return { ...listing, title: listing.token };
    },
    onSuccess: async (detail) => succeeded.push(detail.token),
    onFailure: async (listing) => failed.push(listing.token),
  });
  assert.equal(stats.successful, 3);
  assert.equal(stats.failed, 1);
  assert.deepEqual(failed, ["token1"]);
  assert.equal(succeeded.length, 3);
});

test("transient retries stop at configured limit", async () => {
  let attempts = 0;
  const stats = await processListings({
    context: mockContext(),
    listings: listings(1),
    concurrency: 1,
    maxRetries: 2,
    retryDelayMs: 1,
    crawl: async () => {
      attempts += 1;
      throw new Error("navigation timeout");
    },
  });
  assert.equal(attempts, 3);
  assert.equal(stats.retries, 2);
  assert.equal(stats.failed, 1);
});

test("atomic token persistence is valid and resume skips it", async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "owjcrawler-test-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const detail = { token: "saved1", url: "https://divar.ir/v/example/saved1", title: "saved" };
  const destination = await writeListingAtomic(detail, directory);
  assert.deepEqual(JSON.parse(await fs.readFile(destination, "utf8")), detail);
  await assert.rejects(fs.access(`${destination}.tmp`));

  const savedTokens = await validSavedTokens(directory);
  let crawled = 0;
  const stats = await processListings({
    context: mockContext(),
    listings: [{ token: "saved1", url: detail.url }, { token: "new1", url: "https://divar.ir/v/example/new1" }],
    savedTokens,
    crawl: async (_page, listing) => { crawled += 1; return { ...listing, title: "new" }; },
  });
  assert.equal(crawled, 1);
  assert.equal(stats.skipped, 1);
  assert.equal(stats.successful, 1);
});
