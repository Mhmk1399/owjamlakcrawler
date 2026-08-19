import test from "node:test";
import assert from "node:assert/strict";
import { buildDashboardPayload } from "../src/api/dashboard.js";

function listing(token, accuracy, overrides = {}) {
  return {
    token,
    subcategory: "buy-residential-apartment",
    neighborhood: "تجریش",
    crawlPartition: { area: { id: 61, name: "تجریش", slug: "tajrish" } },
    coordinates: accuracy === null
      ? { latitude: null, longitude: null, accuracy: null }
      : { latitude: 35.8, longitude: 51.4, accuracy },
    quality: { score: 100, missingFields: [] },
    property: { area: 100 },
    pricing: { price: 10_000_000_000, pricePerMeter: 100_000_000 },
    ...overrides,
  };
}

test("dashboard summary exposes actionable crawl and data-quality metrics", () => {
  const payload = buildDashboardPayload({
    now: "2026-08-19T00:00:00.000Z",
    crawl: {
      status: "completed",
      startedAt: "2026-08-18T21:00:00.000Z",
      endedAt: "2026-08-18T23:00:00.000Z",
      areasTotal: 2,
      areasCompleted: 2,
      discovered: 18,
      processed: 18,
      successful: 17,
      failed: 1,
      contactEndpointAttempts: 0,
    },
    listings: [
      listing("exact", "exact"),
      listing("approximate", "approximate"),
      listing("missing", null),
      listing("rental", "exact", { subcategory: "rent-residential-apartment" }),
    ],
    analyticsDocument: {
      categoryScope: "buy-residential-apartment",
      onlineModels: {
        "global:sale": { count: 3, status: "collecting", minimumRequired: 30 },
        "area:one": { count: 3, status: "experimental-ready" },
      },
      spatialAreas: [{ published: true }, { published: false }],
      searchDiagnostics: {
        queue: { targetCandidates: 20 },
        partitions: [
          { area: { id: 1, name: "الف", slug: "a" }, target: 10, discovered: 10, shortfall: 0 },
          { area: { id: 2, name: "ب", slug: "b" }, target: 10, discovered: 8, shortfall: 2 },
        ],
      },
    },
    recommendations: [{ token: "exact", score: 80, askingPrice: 10_000_000_000 }],
    recommendationAnalyses: new Map([["exact", {
      components: {
        modelValue: 90,
        comparableValue: 80,
        localMarketPosition: 70,
        confidence: 60,
        freshness: 50,
        completeness: 100,
      },
      nearby: { count: 12, radiusMeters: 2_000, subjectPricePercentile: 30 },
      prediction: {
        method: "online-ridge-experimental",
        scope: "global",
        modelSampleCount: 30,
        predictedPrice: 12_000_000_000,
        askingVsPredictionPct: -16.67,
        askingVsNearbyPct: -10,
      },
    }]]),
    scoredDocument: {
      scoringVersion: "location-value-score-v1",
      generatedAt: "2026-08-19T00:00:00.000Z",
      summary: { scoreDistribution: { median: 50 } },
      modelValidation: { medianAbsolutePercentageError: 20 },
      listings: [{ token: "exact", scores: { recommendation: 75 } }],
    },
  });

  assert.equal(payload.crawl.successRate, 94.44);
  assert.equal(payload.overview.inScopeListings, 3);
  assert.equal(payload.overview.excludedOutOfScope, 1);
  assert.equal(payload.overview.candidateCoverage, 90);
  assert.equal(payload.locationQuality.coverage, 66.67);
  assert.equal(payload.locationQuality.exact, 1);
  assert.equal(payload.locationQuality.approximate, 1);
  assert.equal(payload.locationQuality.areaMatchRate, 100);
  assert.equal(payload.areaCoverage.withShortfall, 1);
  assert.equal(payload.areaCoverage.totalShortfall, 2);
  assert.equal(payload.model.readyAreaModelCount, 1);
  assert.equal(payload.recommendations.top[0].neighborhood, "تجریش");
  assert.equal(payload.recommendations.top[0].components.modelValue, 90);
  assert.equal(payload.recommendations.top[0].nearby.count, 12);
  assert.equal(payload.recommendations.top[0].prediction.modelSampleCount, 30);
  assert.equal(payload.scoring.available, true);
  assert.equal(payload.scoring.count, 1);
  assert.equal(payload.scoring.listings[0].scores.recommendation, 75);
});
