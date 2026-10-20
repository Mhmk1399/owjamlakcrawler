import test from "node:test";
import assert from "node:assert/strict";
import { createLocationHierarchy, locationHierarchy, normalizePersianPlaceName } from "../src/locations/hierarchy.js";
import { buildLocationView } from "../src/api/locationViews.js";

const fixture = [
  { id: 715, name: "کل ایران", slug: "iran", parent: null, type: "0" },
  { id: 904, name: "تهران", slug: "tehran-province", parent: 715, type: "1" },
  { id: 1, name: "تهران", slug: "tehran", parent: 904, type: "2" },
  { id: 61, name: "تجریش", slug: "tajrish", parent: 1, type: "4" },
];

test("indexes the official hierarchy and builds breadcrumbs", () => {
  const hierarchy = createLocationHierarchy(fixture);
  assert.equal(hierarchy.getChildren(1)[0].slug, "tajrish");
  assert.deepEqual(hierarchy.getPath(61).map((node) => node.slug), ["iran", "tehran-province", "tehran", "tajrish"]);
  assert.equal(hierarchy.findTehranNeighborhoods().length, 1);
  assert.equal(normalizePersianPlaceName("  تجريش‌ "), "تجریش");
  assert.equal(hierarchy.findByName("تجريش").node.id, 61);
});

test("resolves listings by slug before Persian name", () => {
  const hierarchy = createLocationHierarchy(fixture);
  const resolved = hierarchy.resolveListingLocation({
    city: "تهران", neighborhood: "نام اشتباه",
    crawlPartition: { area: { id: null, name: null, slug: "tajrish" } },
  });
  assert.deepEqual(resolved, {
    provinceId: 904, cityId: 1, neighborhoodId: 61,
    slug: "tajrish", name: "تجریش", matchConfidence: "exact-slug",
  });
});

test("ships the complete Tehran neighborhood collection", () => {
  assert.ok(locationHierarchy.size > 4_000);
  assert.ok(locationHierarchy.findTehranNeighborhoods().length > 400);
});

test("location view summarizes listings and score bands", () => {
  const listing = {
    token: "one", title: "نمونه", url: "https://divar.ir/v/x/one", neighborhood: "تجریش",
    resolvedLocation: { provinceId: 904, cityId: 1, neighborhoodId: 61, slug: "tajrish", name: "تجریش", matchConfidence: "exact-name" },
    property: { area: 100 }, pricing: { price: 10_000, pricePerMeter: 100 },
  };
  const view = buildLocationView({ identifier: "tajrish", listings: [listing], scoredListings: [{ token: "one", scores: { recommendation: 80, band: "strong-value" } }] });
  assert.equal(view.summary.listingCount, 1);
  assert.equal(view.summary.medianPricePerMeter, 100);
  assert.equal(view.summary.scoreDistribution.strong, 1);
  assert.equal(view.listings[0].score, 80);
});
