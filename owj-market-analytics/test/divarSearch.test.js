import test from "node:test";
import assert from "node:assert/strict";
import {
  apartmentAreaSearchPayload,
  extractSearchListings,
  fetchApartmentAreaListings,
} from "../src/collector/divarSearch.js";

function responseFixture() {
  return {
    list_widgets: [
      { widget_type: "POST_ROW", data: { token: "gaOne111", tracker_session_id: "private-tracker" } },
      { widget_type: "BANNER", data: { token: "ignore-banner" } },
      { widget_type: "POST_ROW", data: { token: "gaTwo222" } },
      { widget_type: "POST_ROW", data: { token: "gaOne111" } },
      { widget_type: "POST_ROW", data: { token: "bad/token" } },
      { widget_type: "POST_ROW", data: { token: "gaThree3" } },
    ],
    pagination: { has_next_page: true, data: "opaque-data-not-retained" },
  };
}

test("builds an apartment-sale search restricted to one Divar area ID", () => {
  const payload = apartmentAreaSearchPayload(992);
  assert.deepEqual(payload.city_ids, ["1"]);
  assert.equal(payload.disable_recommendation, true);
  assert.equal(payload.search_data.form_data.data.category.str.value, "apartment-sell");
  assert.deepEqual(payload.search_data.form_data.data.districts.repeated_string.value, ["992"]);
  assert.equal(payload.search_data.server_payload.additional_form_data.data.sort.str.value, "sort_date");
  assert.throws(() => apartmentAreaSearchPayload("invalid"), /area ID is invalid/);
});

test("extracts only unique POST_ROW tokens and constructs clean public URLs", () => {
  const listings = extractSearchListings(responseFixture(), 2);
  assert.deepEqual(listings, [
    { token: "gaOne111", url: "https://divar.ir/v/gaOne111" },
    { token: "gaTwo222", url: "https://divar.ir/v/gaTwo222" },
  ]);
  assert.doesNotMatch(JSON.stringify(listings), /tracker|opaque/);
});

test("fetches one public area page without cookies or tracker state", async () => {
  let captured;
  const requestContext = {
    post: async (url, options) => {
      captured = { url, options };
      return {
        status: () => 200,
        json: async () => responseFixture(),
      };
    },
  };
  const result = await fetchApartmentAreaListings(requestContext, { id: 992 }, { limit: 10 });
  assert.equal(captured.url, "https://api.divar.ir/v8/postlist/w/search");
  assert.equal(result.listings.length, 3);
  assert.equal(result.hasNextPage, true);
  assert.doesNotMatch(JSON.stringify(captured.options.headers), /cookie|authorization|access.?token/i);
  assert.doesNotMatch(JSON.stringify(result), /tracker|opaque/);
});
