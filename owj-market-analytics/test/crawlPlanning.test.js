import test from "node:test";
import assert from "node:assert/strict";
import { planAdaptivePartitions, RequestBudget, rotate } from "../src/collector/crawlPlanning.js";

const partitions = [1, 2, 3].map((id) => ({ area: { id }, limit: 5 }));

test("queue rotation covers the next deterministic segment", () => {
  assert.deepEqual(rotate([1, 2, 3, 4], 2), [3, 4, 1, 2]);
  const first = planAdaptivePartitions(partitions, [], { totalBudget: 4, maxAreas: 2, offset: 0 });
  const second = planAdaptivePartitions(partitions, [], { totalBudget: 4, maxAreas: 2, offset: first.nextOffset });
  assert.deepEqual(first.partitions.map((item) => item.area.id), [1, 2]);
  assert.deepEqual(second.partitions.map((item) => item.area.id), [3, 1]);
  assert.equal(first.partitions.reduce((sum, item) => sum + item.limit, 0), 4);
});

test("adaptive quota gives more budget to an unrepresented area", () => {
  const listings = Array.from({ length: 20 }, (_, index) => ({
    token: `x-${index}`, lastSeenAt: new Date().toISOString(),
    crawlPartition: { area: { id: 1 } }, lifecycle: { detailFetchedAt: new Date().toISOString() },
    quality: { outcome: "scoring-ready" },
  }));
  const plan = planAdaptivePartitions(partitions.slice(0, 2), listings, { totalBudget: 10 });
  assert.ok(plan.partitions.find((item) => item.area.id === 2).limit > plan.partitions.find((item) => item.area.id === 1).limit);
});

test("request budget accounts by kind and enforces run and minute ceilings", () => {
  let now = 0;
  const budget = new RequestBudget({ maxPerRun: 3, maxPerMinute: 2, now: () => now });
  budget.record("api:get");
  budget.record("api:post");
  assert.throws(() => budget.record("api:get"), /Per-minute/);
  now = 61_000;
  budget.record("browser:document");
  assert.throws(() => budget.record("api:get"), /Per-run/);
  assert.deepEqual(budget.snapshot().byKind, { "api:get": 1, "api:post": 1, "browser:document": 1 });
});
