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
