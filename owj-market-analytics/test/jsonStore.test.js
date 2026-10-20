import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { JsonMarketStore } from "../src/storage/jsonStore.js";

const logger = { info() {}, warn() {}, error() {}, debug() {} };

test("JSON store writes immediate per-listing records and a combined flush checkpoint", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "owj-market-store-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const paths = {
    data: root,
    listings: path.join(root, "listings.json"),
    listingRecords: path.join(root, "listings"),
    analytics: path.join(root, "analytics.json"),
    model: path.join(root, "models.json"),
    serviceState: path.join(root, "state.json"),
    observations: path.join(root, "observations"),
  };
  const store = new JsonMarketStore(paths, logger, { snapshotEvery: 25 });
  await store.init();
  const listing = {
    token: "json-one",
    url: "https://divar.ir/v/example/json-one",
    title: "fixture",
    firstSeenAt: "2026-01-01T00:00:00.000Z",
    lastSeenAt: "2026-01-01T00:00:00.000Z",
    contentFingerprint: "a".repeat(64),
  };
  await store.upsertListing(listing, "run-one");
  assert.equal(JSON.parse(await fs.readFile(path.join(paths.listingRecords, "json-one.json"), "utf8")).token, "json-one");
  assert.equal(JSON.parse(await fs.readFile(path.join(paths.observations, "json-one.json"), "utf8")).observations.length, 1);
  await assert.rejects(fs.access(paths.listings));
  await store.flush();
  assert.equal(JSON.parse(await fs.readFile(paths.listings, "utf8")).listings.length, 1);
});

test("JSON store advances lifecycle only for exhaustively observed areas", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "owj-market-lifecycle-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const paths = { data: root, listings: path.join(root, "listings.json"), listingRecords: path.join(root, "listings"),
    analytics: path.join(root, "analytics.json"), model: path.join(root, "models.json"), serviceState: path.join(root, "state.json"),
    observations: path.join(root, "observations") };
  const store = new JsonMarketStore(paths, logger);
  await store.init();
  await store.upsertListing({ token: "life-one", firstSeenAt: "2026-01-01T00:00:00.000Z", lastSeenAt: "2026-01-01T00:00:00.000Z",
    contentFingerprint: "b".repeat(64), crawlPartition: { category: "buy-apartment", expectedSubcategory: "buy-residential-apartment",
      area: { id: 992, name: "آبشار", slug: "abshar" } }, quality: { outcome: "scoring-ready", outcomeReasons: [] },
    lifecycle: { status: "active", detailFetchedAt: "2026-01-01T00:00:00.000Z", lastDiscoveredAt: "2026-01-01T00:00:00.000Z",
      lastConfirmedRunId: "seed", lastContentChangedAt: "2026-01-01T00:00:00.000Z", consecutiveMisses: 0, removedAt: null } }, "seed");
  for (let run = 1; run <= 3; run += 1) {
    await store.reconcileLifecycle({ runId: `run-${run}`, observedTokens: [], completedAreaIds: [992], removalThreshold: 3 });
  }
  assert.equal(store.getListing("life-one").lifecycle.status, "removed");
  assert.equal(store.getListings({ activeOnly: true }).length, 0);
});

test("JSON store compacts observation history while preserving newest evidence", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "owj-market-compact-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const observations = path.join(root, "observations");
  await fs.mkdir(observations, { recursive: true });
  await fs.writeFile(path.join(observations, "token.json"), JSON.stringify({
    token: "token", observations: [1, 2, 3, 4, 5].map((sequence) => ({ sequence })),
  }));
  const store = new JsonMarketStore({ data: root, listings: path.join(root, "listings.json"), listingRecords: path.join(root, "listings"),
    analytics: path.join(root, "analytics.json"), model: path.join(root, "models.json"), serviceState: path.join(root, "state.json"), observations }, logger);
  await store.init();
  const result = await store.compactHistory({ maxObservationsPerListing: 3 });
  assert.equal(result.removedObservations, 2);
  const saved = JSON.parse(await fs.readFile(path.join(observations, "token.json"), "utf8"));
  assert.deepEqual(saved.observations.map((item) => item.sequence), [3, 4, 5]);
});
