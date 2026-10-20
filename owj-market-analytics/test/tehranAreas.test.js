import test from "node:test";
import assert from "node:assert/strict";
import {
  apartmentAreaUrl,
  buildApartmentAreaQueue,
  extractTehranAreas,
  fetchTehranAreas,
  TEHRAN_FOCUS_AREAS,
} from "../src/collector/tehranAreas.js";

const placesFixture = [
  { id: 1, name: "تهران", slug: "tehran", parent: 904, type: "1" },
  { id: 148, name: "جنت‌آباد جنوبی", slug: "south-janat-abad", parent: 1, type: "4" },
  { id: 992, name: "آبشار", slug: "abshar", parent: "1", type: 4 },
  { id: 61, name: "تجریش", slug: "tajrish", parent: 1, type: "4" },
  { id: 999, name: "شهر دیگر", slug: "other-city", parent: 2, type: "4" },
  { id: 998, name: "نوع دیگر", slug: "other-type", parent: 1, type: "2" },
  { id: 997, name: "نامعتبر", slug: "bad/slug", parent: 1, type: "4" },
  { id: 149, name: "تکراری", slug: "south-janat-abad", parent: 1, type: "4" },
];

test("extracts only valid Tehran Divar areas and de-duplicates slugs", () => {
  const areas = extractTehranAreas(placesFixture);
  assert.equal(areas.length, 3);
  assert.deepEqual(new Set(areas.map((area) => area.slug)), new Set([
    "abshar",
    "south-janat-abad",
    "tajrish",
  ]));
  assert.equal(areas.find((area) => area.slug === "south-janat-abad").id, 149);
  assert.throws(() => extractTehranAreas({}), /not an array/);
});

test("builds deterministic buy-apartment partitions with fifteen candidates per area", () => {
  const queue = buildApartmentAreaQueue(extractTehranAreas(placesFixture), {
    listingsPerArea: 15,
  });
  assert.equal(queue.length, 3);
  assert.ok(queue.every((partition) => partition.category === "buy-apartment"));
  assert.ok(queue.every((partition) => partition.expectedSubcategory === "buy-residential-apartment"));
  assert.ok(queue.every((partition) => partition.limit === 15));
  assert.ok(queue.every((partition) => partition.url.startsWith("https://divar.ir/s/tehran/buy-apartment/")));
  assert.equal(buildApartmentAreaQueue(queue.map((item) => item.area), { maxAreas: 2 }).length, 2);
  assert.equal(apartmentAreaUrl("abshar"), "https://divar.ir/s/tehran/buy-apartment/abshar");
  assert.throws(() => apartmentAreaUrl("bad/slug"), /slug is invalid/);
});

test("filters crawl partitions to the curated Tehran focus list by stable Divar ID", () => {
  const queue = buildApartmentAreaQueue(extractTehranAreas(placesFixture), {
    focusAreas: TEHRAN_FOCUS_AREAS,
  });
  assert.deepEqual(queue.map((partition) => partition.area.id), [992]);
  assert.deepEqual(queue[0].area.municipalDistricts, [12]);
  assert.deepEqual(queue[0].area.reviewStatuses, ["Assigned"]);
  assert.equal(TEHRAN_FOCUS_AREAS.length, 168);
});

test("loads areas through a minimal public request", async () => {
  let captured;
  const requestContext = {
    get: async (url, options) => {
      captured = { url, options };
      return {
        status: () => 200,
        json: async () => placesFixture,
      };
    },
  };
  const areas = await fetchTehranAreas(requestContext);
  assert.equal(areas.length, 3);
  assert.equal(captured.url, "https://map.divarcdn.com/places-web.json");
  assert.deepEqual(captured.options.headers, { accept: "application/json" });
  assert.doesNotMatch(JSON.stringify(captured.options), /cookie|authorization|access.?token/i);
});
