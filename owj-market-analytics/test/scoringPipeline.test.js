import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { cleanListings } from "../src/scoring/cleanListings.js";
import { trainCrossValidatedPriceModel } from "../src/scoring/ridgePriceModel.js";
import { scoreListings } from "../src/scoring/scoringMachine.js";
import { runScoringPipeline } from "../src/scoring/pipeline.js";

function rawListing(index, overrides = {}) {
  const latitude = 35.62 + (index % 13) * 0.004;
  const longitude = 51.25 + Math.floor(index / 13) * 0.004;
  const area = 50 + index % 90;
  const rooms = Math.max(1, Math.round(area / 45));
  const logPpm = 18.5 +
    (latitude - 35.65) * 3.5 +
    (longitude - 51.28) * 2.2 -
    Math.log(area) * 0.08 +
    rooms * 0.025;
  const pricePerMeter = Math.round(Math.exp(logPpm));
  const token = `fixture_${String(index).padStart(4, "0")}`;
  return {
    schemaVersion: "1.0.0",
    token,
    url: `https://divar.ir/v/${token}`,
    title: `Apartment ${index}`,
    subcategory: "buy-residential-apartment",
    neighborhood: `Area ${index % 8}`,
    property: {
      area,
      rooms,
      constructionYear: 1_385 + index % 20,
      floor: index % 8,
      totalFloors: index % 7 === 0 ? null : 8,
    },
    amenities: {
      elevator: true,
      parking: index % 3 !== 0,
      storage: true,
      balcony: index % 4 === 0 ? null : false,
    },
    coordinates: {
      latitude,
      longitude,
      accuracy: index % 3 === 0 ? "approximate" : "exact",
      radiusMeters: index % 3 === 0 ? 500 : null,
    },
    pricing: {
      price: pricePerMeter * area,
      pricePerMeter,
    },
    quality: { score: 100, missingFields: [] },
    firstSeenAt: "2026-08-18T00:00:00.000Z",
    lastSeenAt: "2026-08-18T00:00:00.000Z",
    ...overrides,
  };
}

test("cleaner rejects unscorable rows and records every optional imputation", () => {
  const missingCoordinates = rawListing(2);
  missingCoordinates.coordinates.latitude = null;
  const result = cleanListings([rawListing(7), missingCoordinates]);
  assert.equal(result.records.length, 1);
  assert.equal(result.rejected.length, 1);
  assert.match(result.rejected[0].reasons.join(" "), /coordinates/);
  assert.ok(result.records[0].cleaning.imputedFields.includes("property.totalFloors"));
  assert.doesNotMatch(JSON.stringify(result.records), /:null/);
});

test("location-aware model uses out-of-fold predictions and produces distributed scores", () => {
  const cleaned = cleanListings(Array.from({ length: 160 }, (_, index) => rawListing(index)));
  const trained = trainCrossValidatedPriceModel(cleaned.records, { folds: 5, lambda: 5 });
  assert.equal(trained.predictions.size, cleaned.records.length);
  assert.equal(trained.model.locationFeaturesIncluded, true);
  assert.ok(trained.model.validation.rSquaredLog > 0.8);

  const scored = scoreListings(cleaned.records, trained.predictions, trained.model);
  assert.equal(scored.listings.length, cleaned.records.length);
  assert.equal(scored.listings[0].rank, 1);
  assert.equal(scored.listings[0].evidence.predictionIsOutOfFold, true);
  assert.ok(Array.isArray(scored.listings[0].evidence.comparables));
  assert.equal(scored.listings[0].formula.dealWeights.modelValue, 0.45);
  assert.ok(scored.listings[0].formula.appliedConfidenceGate >= 0.55);
  assert.ok(new Set(scored.listings.map((item) => item.scores.recommendation)).size > 10);
  assert.doesNotMatch(JSON.stringify(scored), /:null/);
});

test("callback-driven pipeline writes all four no-null scoring documents", async () => {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "owj-score-test-"));
  const paths = {
    input: path.join(temporary, "listings.json"),
    scoringReady: path.join(temporary, "scoring-ready.json"),
    scoredListings: path.join(temporary, "scored-listings.json"),
    model: path.join(temporary, "scoring-model.json"),
    report: path.join(temporary, "scoring-report.json"),
  };
  await fs.writeFile(paths.input, JSON.stringify({
    schemaVersion: "1.0.0",
    updatedAt: "2026-08-18T00:00:00.000Z",
    listings: Array.from({ length: 130 }, (_, index) => rawListing(index)),
  }));
  const eventTypes = [];
  const result = await runScoringPipeline({ paths }, {
    onEvent: (event) => eventTypes.push(event.type),
  });
  assert.equal(result.report.status, "completed");
  assert.ok(eventTypes.includes("clean.complete"));
  assert.ok(eventTypes.includes("model.complete"));
  assert.ok(eventTypes.includes("score.complete"));
  for (const file of Object.values(paths).filter((file) => file !== paths.input)) {
    const contents = await fs.readFile(file, "utf8");
    assert.doesNotMatch(contents, /: null/);
  }
});
