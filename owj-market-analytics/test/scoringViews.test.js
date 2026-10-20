import test from "node:test";
import assert from "node:assert/strict";
import { buildScoreDetail, buildScoringAnalytics, buildScoringWorkshop } from "../src/api/scoringViews.js";

function listing(token, rank, score, band, neighborhood = "Area A") {
  return {
    token,
    rank,
    title: token,
    neighborhood,
    scores: { recommendation: score, confidence: 80, propertyQuality: 75, risk: 20, band },
    asking: { askingPricePerMeter: 100_000_000 },
    valuation: { modelDiscountPct: 10 },
    location: { accuracy: rank % 2 ? "exact" : "approximate" },
  };
}

const listings = [
  listing("a", 1, 90, "strong-value"),
  listing("b", 2, 70, "promising"),
  listing("c", 3, 50, "fair"),
  listing("d", 4, 20, "weak-value"),
  listing("e", 5, 10, "weak-value"),
];
const document = {
  generatedAt: "2026-08-19T00:00:00.000Z",
  scoringVersion: "test-v1",
  modelValidation: { medianAbsolutePercentageError: 20 },
  valuationValidation: { medianAbsolutePercentageError: 15, within20Percent: 65, within30Percent: 80, rSquaredLog: 0.75 },
  summary: {
    scoreDistribution: { minimum: 10, median: 50, maximum: 90 },
    exactCoordinateCount: 3,
    approximateCoordinateCount: 2,
  },
  listings,
};

test("score detail adds population rank context", () => {
  const detail = buildScoreDetail(document, "b");
  assert.equal(detail.listing.token, "b");
  assert.equal(detail.population.total, 5);
  assert.equal(detail.population.outranksPercent, 75);
  assert.equal(buildScoreDetail(document, "missing"), null);
});

test("scoring analytics creates exhaustive bands and histogram", () => {
  const analytics = buildScoringAnalytics(document, { cleaning: { inputCount: 7, acceptedCount: 5, rejectedCount: 2 } });
  assert.equal(analytics.distributions.bands.reduce((sum, band) => sum + band.count, 0), 5);
  assert.equal(analytics.distributions.histogram.reduce((sum, bin) => sum + bin.count, 0), 5);
  assert.equal(analytics.coordinates.exactPercentage, 60);
  assert.equal(analytics.neighborhoods[0].count, 5);
  assert.equal(analytics.valuationValidation.medianAbsolutePercentageError, 15);
});

test("scoring workshop exposes only the inputs needed for safe live simulation", () => {
  const workshop = buildScoringWorkshop(document);
  assert.equal(workshop.formula.dealWeights.modelValue, 45);
  assert.equal(workshop.listings.length, 5);
  assert.equal(workshop.listings[0].scores.recommendation, 90);
  assert.equal(Object.hasOwn(workshop.listings[0], "evidence"), false);
});
