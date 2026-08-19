import test from "node:test";
import assert from "node:assert/strict";
import { LiveMarketEngine } from "../src/analytics/marketEngine.js";

class MemoryStore {
  constructor() {
    this.listings = new Map();
    this.model = null;
    this.analytics = null;
  }
  getListings() { return [...this.listings.values()]; }
  getListing(token) { return this.listings.get(token) || null; }
  async readModelState() { return this.model; }
  async saveModelState(value) { this.model = value; }
  async saveAnalytics(value) { this.analytics = value; }
}

const logger = { info() {}, warn() {}, error() {}, debug() {} };

function listing(token, price, latitude, area = 100) {
  const now = new Date().toISOString();
  return {
    schemaVersion: "1.0.0",
    token,
    url: `https://divar.ir/v/example/${token}`,
    title: token,
    category: "real-estate",
    subcategory: "buy-residential-apartment",
    city: "تهران",
    district: "منطقه ۱",
    neighborhood: "تجریش",
    publishedText: null,
    property: { area, constructionYear: 1400, rooms: 2, floor: 2, totalFloors: 5, unitsPerFloor: 2 },
    pricing: { currency: "TOMAN", price, pricePerMeter: Math.round(price / area), deposit: null, rent: null, isFullMortgage: null, isNegotiable: null },
    amenities: { elevator: true, parking: true, storage: true, balcony: false },
    advertiserType: "شخصی",
    coordinates: {
      latitude,
      longitude: 51.4,
      accuracy: "exact",
      radiusMeters: null,
      source: "fixture",
    },
    imageCount: 1,
    quality: { score: 90, missingFields: [] },
    firstSeenAt: now,
    lastSeenAt: now,
    contentFingerprint: `${token}`.padEnd(64, "a").slice(0, 64),
  };
}

test("live engine updates coordinate-cell analytics, nearby context, model, and score incrementally", async () => {
  const store = new MemoryStore();
  const engine = new LiveMarketEngine({ store, logger, minSpatialSample: 2, minModelSample: 2 });
  await engine.init();

  for (const item of [
    listing("one", 10_000_000_000, 35.8000),
    listing("two", 12_000_000_000, 35.8010),
    listing("three", 14_000_000_000, 35.8020),
  ]) {
    store.listings.set(item.token, item);
    await engine.ingest(item);
  }

  const area = engine.spatialMetrics()[0];
  assert.equal(area.listingCount, 3);
  assert.equal(area.price.mean, 12_000_000_000);
  assert.equal(area.published, true);
  assert.match(area.area.id, /^1000m:-?\d+:-?\d+$/);

  const analysis = engine.analyzeListing("one");
  assert.equal(analysis.status, "scored");
  assert.equal(analysis.schemaVersion, "1.1.0");
  assert.equal(analysis.area.area.id, area.area.id);
  assert.ok(Number.isInteger(analysis.score));
  assert.equal(analysis.nearby.count, 2);
  assert.equal(analysis.nearby.highestAskingPrice.token, "three");
  assert.notEqual(analysis.nearby.topSimilar[0].token, "one");
  assert.equal(analysis.prediction.method, "online-ridge-experimental");
  assert.ok(store.model.models["global:sale"].count >= 3);
  assert.ok(Object.keys(store.model.models).some((key) => key.startsWith("area:1000m:")));
  assert.equal(store.model.locationModelVersion, "buy-apartment-coordinates-v2");

  const snapshot = engine.publicSnapshot();
  assert.equal(snapshot.coordinateCoverage.available, 3);
  assert.equal(snapshot.coordinateCoverage.missing, 0);
  assert.equal(Object.hasOwn(snapshot, "districts"), false);

  const recommendation = engine.recommendations(1)[0];
  assert.deepEqual(recommendation.components, analysis.components);
  assert.equal(recommendation.nearby.count, analysis.nearby.count);
});

test("non-sale listing remains visible but is not scored", async () => {
  const store = new MemoryStore();
  const engine = new LiveMarketEngine({ store, logger, minSpatialSample: 2, minModelSample: 2 });
  await engine.init();
  const rental = listing("rent-one", 1_000_000_000, 35.8);
  rental.subcategory = "rent-residential-apartment";
  rental.pricing.price = null;
  rental.pricing.deposit = 1_000_000_000;
  rental.pricing.rent = 20_000_000;
  store.listings.set(rental.token, rental);
  await engine.ingest(rental);
  assert.equal(engine.analyzeListing(rental).status, "ineligible");
  assert.equal(engine.publicSnapshot().excludedOutOfScope, 1);
  assert.equal(engine.spatialMetrics().length, 0);
});

test("other sale property types cannot contaminate the apartment model", async () => {
  const store = new MemoryStore();
  const villa = listing("villa-one", 30_000_000_000, 35.8);
  villa.subcategory = "buy-residential-villa";
  store.listings.set(villa.token, villa);
  const engine = new LiveMarketEngine({ store, logger, minSpatialSample: 2, minModelSample: 2 });
  await engine.init();
  assert.equal(engine.analyzeListing(villa).status, "ineligible");
  assert.equal(engine.spatialMetrics().length, 0);
  assert.equal(store.model.models["global:sale"], undefined);
});

test("coordinate grouping ignores conflicting text locations", async () => {
  const store = new MemoryStore();
  const engine = new LiveMarketEngine({ store, logger, minSpatialSample: 2, minModelSample: 2 });
  await engine.init();
  const first = listing("location-one", 10_000_000_000, 35.8);
  const second = listing("location-two", 11_000_000_000, 35.8);
  first.district = "منطقه ۱";
  first.neighborhood = "تجریش";
  second.district = "منطقه ۲۲";
  second.neighborhood = "چیتگر";
  for (const item of [first, second]) {
    store.listings.set(item.token, item);
    await engine.ingest(item);
  }
  assert.equal(engine.spatialMetrics().length, 1);
  assert.equal(engine.spatialMetrics()[0].listingCount, 2);
});

test("sale listing without coordinates is not scored through a text-location fallback", async () => {
  const store = new MemoryStore();
  const engine = new LiveMarketEngine({ store, logger, minSpatialSample: 2, minModelSample: 2 });
  await engine.init();
  const item = listing("missing-coordinates", 10_000_000_000, 35.8);
  item.coordinates = {
    latitude: null,
    longitude: null,
    accuracy: null,
    radiusMeters: null,
    source: null,
  };
  store.listings.set(item.token, item);
  await engine.ingest(item);
  const analysis = engine.analyzeListing(item);
  assert.equal(analysis.status, "insufficient-data");
  assert.equal(analysis.area, null);
  assert.equal(analysis.nearby.mode, "coordinates-unavailable");
  assert.match(analysis.warnings.join(" "), /text-based city, district, and neighborhood fallbacks are disabled/);
});
