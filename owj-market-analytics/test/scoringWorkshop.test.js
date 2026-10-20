import test from "node:test";
import assert from "node:assert/strict";
import { calculatePropertyScore, calculateScenario, DEFAULT_SCORING_CONFIG, LEGACY_SCORING_CONFIG } from "../dashboard/src/scoringWorkshopModel.js";

const listings = [
  { token: "a", rank: 1, scores: { modelValue: 90, nearbyValue: 80, localPosition: 70, confidence: 60, risk: 20, recommendation: 57, band: "promising" } },
  { token: "b", rank: 2, scores: { modelValue: 40, nearbyValue: 60, localPosition: 90, confidence: 90, risk: 10, recommendation: 55, band: "fair" } },
];

test("workshop baseline uses the production scoring formula", () => {
  const result = calculateScenario(listings, LEGACY_SCORING_CONFIG);
  const expectedDeal = 90 * 0.45 + 80 * 0.4 + 70 * 0.15;
  const expected = Math.round(expectedDeal * (0.55 + 0.6 * 0.45) * (1 - 0.2 * 0.4));
  assert.equal(result.rows.find((row) => row.token === "a").scenario.recommendation, expected);
  assert.equal(result.dealWeightTotal, 100);
  assert.equal(result.histogram.reduce((sum, bin) => sum + bin.count, 0), 2);
});

test("detailed model rewards amenities and penalizes a third-floor walk-up", () => {
  const strong = calculatePropertyScore({ property: { floor: 1, buildingAge: 5, area: 100, rooms: 2, unitsPerFloor: 1, isSingleUnitFloor: true },
    amenities: { elevator: 1, parking: 1, storage: 1, balcony: 1 } }, DEFAULT_SCORING_CONFIG);
  const walkup = calculatePropertyScore({ property: { floor: 3, buildingAge: 5, area: 100, rooms: 2, unitsPerFloor: 1, isSingleUnitFloor: true },
    amenities: { elevator: 0, parking: 0, storage: 0, balcony: 0 } }, DEFAULT_SCORING_CONFIG);
  assert.ok(strong.score > walkup.score);
  assert.equal(walkup.contributions.floor, -2);
  assert.equal(walkup.contributions.noElevatorHighFloor, -4);
  assert.equal(walkup.contributions.elevator, -8);
});

test("changing weights dynamically changes scores and ranking", () => {
  const result = calculateScenario(listings, { ...DEFAULT_SCORING_CONFIG, modelValue: 0, nearbyValue: 0, localPosition: 100 });
  assert.equal(result.rows[0].token, "b");
  assert.equal(result.rows[0].scenario.rank, 1);
});
