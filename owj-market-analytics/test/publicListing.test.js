import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { toPublicMarketListing, validatePublicMarketListing } from "../src/collector/publicListing.js";
import {
  isForbiddenContactUrl,
  listingMatchesPartition,
} from "../src/collector/publicCrawler.js";

function normalizedFixture(overrides = {}) {
  return {
    token: "fixture-token",
    url: "https://divar.ir/v/example/fixture-token",
    title: "خانه مناسب تماس ۰۹۱۲۱۲۳۴۵۶۷",
    category: "real-estate",
    subcategory: "buy-residential-apartment",
    city: "تهران",
    district: "منطقه ۱",
    neighborhood: "تجریش",
    publishedText: "یک ساعت پیش",
    property: { area: 100, constructionYear: 1400, rooms: 2, floor: 3, totalFloors: 5, unitsPerFloor: 2 },
    pricing: { price: 10_000_000_000, pricePerMeter: 1, deposit: null, rent: null, isFullMortgage: null, isNegotiable: false },
    amenities: { elevator: true, parking: true, storage: true, balcony: false },
    advertiser: { name: "Private Person", type: "شخصی", agencyName: null },
    contact: { authenticatedPhone: "09121234567", publicPhones: ["09121234567"] },
    images: ["https://example.com/a.jpg"],
    coordinates: {
      latitude: 35.8,
      longitude: 51.4,
      accuracy: "nearby",
      radiusMeters: null,
      source: "dom",
    },
    quality: { score: 90, missingFields: [] },
    ...overrides,
  };
}

test("public projection removes contact and identity fields and derives price per metre", () => {
  const listing = toPublicMarketListing(normalizedFixture(), null, "2026-01-01T00:00:00.000Z");
  assert.equal(Object.hasOwn(listing, "contact"), false);
  assert.equal(Object.hasOwn(listing, "description"), false);
  assert.equal(Object.hasOwn(listing, "advertiser"), false);
  assert.equal(listing.advertiserType, "شخصی");
  assert.deepEqual(listing.crawlPartition, {
    category: null,
    expectedSubcategory: null,
    area: null,
  });
  assert.equal(listing.pricing.pricePerMeter, 100_000_000);
  assert.deepEqual(listing.resolvedLocation, {
    provinceId: 904, cityId: 1, neighborhoodId: 61,
    slug: "tajrish", name: "تجریش", matchConfidence: "exact-name",
  });
  assert.match(listing.title, /\[redacted-phone\]/);
  assert.doesNotMatch(JSON.stringify(listing), /09121234567|Private Person/);
});

test("contact endpoint guard recognizes forbidden URLs", () => {
  assert.equal(isForbiddenContactUrl("https://api.divar.ir/v8/postcontact/web/contact_info_v2/x"), true);
  assert.equal(isForbiddenContactUrl("https://divar.ir/s/tehran/buy-residential"), false);
});

test("partition guard accepts only the requested apartment area", () => {
  const discovered = {
    expectedSubcategory: "buy-residential-apartment",
    area: { name: "جنت‌آباد جنوبی" },
  };
  assert.equal(listingMatchesPartition({
    subcategory: "buy-residential-apartment",
    neighborhood: "جنت‌آباد جنوبی",
  }, discovered), true);
  assert.equal(listingMatchesPartition({
    subcategory: "buy-residential-villa",
    neighborhood: "جنت‌آباد جنوبی",
  }, discovered), false);
  assert.equal(listingMatchesPartition({
    subcategory: "buy-residential-apartment",
    neighborhood: "جنت‌آباد شمالی",
  }, discovered), false);
});

test("runtime schema guard rejects contact-bearing records", () => {
  const listing = toPublicMarketListing(normalizedFixture());
  assert.throws(
    () => validatePublicMarketListing({ ...listing, contact: { authenticatedPhone: "redacted" } }),
    /forbidden field contact/,
  );
});

test("contact redaction covers formatted mobile and landline numbers", () => {
  const listing = toPublicMarketListing(normalizedFixture({
    title: "تماس ۰۹۱۲ ۱۲۳ ۴۵۶۷ یا ۰۲۱ ۱۲۳۴ ۵۶۷۸",
  }));
  assert.equal((listing.title.match(/\[redacted-phone\]/g) || []).length, 2);
  assert.doesNotMatch(listing.title, /0912|021/);
});

test("public listing JSON schema is valid JSON and requires no contact field", async () => {
  const schema = JSON.parse(await fs.readFile(new URL("../schemas/public-listing.schema.json", import.meta.url), "utf8"));
  assert.equal(schema.additionalProperties, false);
  assert.equal(Object.hasOwn(schema.properties, "contact"), false);
  assert.equal(schema.properties.pricing.properties.currency.const, "TOMAN");
});

test("public extractor has no static contact or token-client dependency", async () => {
  const listingModule = await fs.readFile(new URL("../../src/crawler/listing.js", import.meta.url), "utf8");
  const publicModule = await fs.readFile(new URL("../src/collector/publicListing.js", import.meta.url), "utf8");
  assert.doesNotMatch(listingModule, /^import .*\.\/contact\.js/m);
  assert.doesNotMatch(publicModule, /from\s+["'].*(?:contact|tokenClient)/);
});
