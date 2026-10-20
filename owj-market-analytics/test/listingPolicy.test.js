import test from "node:test";
import assert from "node:assert/strict";
import { classifyListingQuality, nextLifecycleStatus, refreshDecision } from "../src/collector/listingPolicy.js";

test("freshness policy skips recent records and refreshes stale or new records", () => {
  const now = Date.parse("2026-10-20T12:00:00.000Z");
  assert.equal(refreshDecision(null, { now }).reason, "new-token");
  assert.equal(refreshDecision({
    lastSeenAt: "2026-10-20T10:00:00.000Z",
    lifecycle: { status: "active", detailFetchedAt: "2026-10-20T10:00:00.000Z" },
    quality: { outcome: "scoring-ready" },
  }, { now, freshHours: 6 }).refresh, false);
  assert.equal(refreshDecision({
    lastSeenAt: "2026-10-20T00:00:00.000Z",
    lifecycle: { status: "active", detailFetchedAt: "2026-10-20T00:00:00.000Z" },
    quality: { outcome: "scoring-ready" },
  }, { now, freshHours: 6 }).refresh, true);
});

test("lifecycle requires repeated misses before removal", () => {
  assert.equal(nextLifecycleStatus(0, 3), "active");
  assert.equal(nextLifecycleStatus(1, 3), "not-seen");
  assert.equal(nextLifecycleStatus(2, 3), "possibly-removed");
  assert.equal(nextLifecycleStatus(3, 3), "removed");
});

test("quality classification keeps incomplete public records out of scoring", () => {
  const base = {
    subcategory: "buy-residential-apartment",
    property: { area: 90 }, pricing: { price: 9_000_000_000 },
    resolvedLocation: { matchConfidence: "exact-name" },
  };
  assert.equal(classifyListingQuality(base).outcome, "scoring-ready");
  const incomplete = classifyListingQuality({ ...base, pricing: { price: null } });
  assert.equal(incomplete.outcome, "history-only");
  assert.deepEqual(incomplete.reasons, ["missing-or-invalid-price"]);
});
