import test from "node:test";
import assert from "node:assert/strict";
import {
  apartmentAreaSearchPayload,
  extractSearchListings,
  fetchApartmentAreaListings,
} from "../src/collector/divarSearch.js";

function responseFixture({ tokens = ["gaOne111", "gaTwo222", "gaOne111", "bad/token", "gaThree3"], hasNextPage = true, paginationData = "opaque-data-not-retained" } = {}) {
  return {
    list_widgets: [
      { widget_type: "BANNER", data: { token: "ignore-banner" } },
      ...tokens.map((token) => ({ widget_type: "POST_ROW", data: { token, tracker_session_id: "private-tracker" } })),
    ],
    pagination: { has_next_page: hasNextPage, data: paginationData },
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

test("paginates public area search until the per-area target is reached", async () => {
  const captured = [];
  const pages = [
    responseFixture({ tokens: ["gaOne111", "gaTwo222"], paginationData: "cursor-one" }),
    responseFixture({ tokens: ["gaTwo222", "gaThree3"], paginationData: "cursor-two" }),
    responseFixture({ tokens: ["gaFour44", "gaFive555"], hasNextPage: false }),
  ];
  const requestContext = {
    post: async (url, options) => {
      captured.push({ url, options });
      return {
        status: () => 200,
        json: async () => pages[captured.length - 1],
      };
    },
  };
  const visitedPages = [];
  const result = await fetchApartmentAreaListings(requestContext, { id: 992 }, {
    limit: 5,
    beforePage: ({ page }) => visitedPages.push(page),
  });
  assert.equal(captured.length, 3);
  assert.equal(captured[0].url, "https://api.divar.ir/v8/postlist/w/search");
  assert.equal(captured[0].options.data.pagination_data, undefined);
  assert.equal(captured[1].options.data.pagination_data, "cursor-one");
  assert.equal(captured[2].options.data.pagination_data, "cursor-two");
  assert.deepEqual(visitedPages, [1, 2, 3]);
  assert.equal(result.listings.length, 5);
  assert.equal(result.pagesFetched, 3);
  assert.equal(result.stopReason, "target-reached");
  assert.doesNotMatch(JSON.stringify(captured[0].options.headers), /cookie|authorization|access.?token/i);
  assert.doesNotMatch(JSON.stringify(result), /tracker|opaque/);
});

test("records an explicit shortfall when Divar exhausts an area", async () => {
  const requestContext = {
    post: async () => ({
      status: () => 200,
      json: async () => responseFixture({ tokens: ["gaOnly111"], hasNextPage: false }),
    }),
  };
  const result = await fetchApartmentAreaListings(requestContext, { id: 992 }, { limit: 15 });
  assert.equal(result.listings.length, 1);
  assert.equal(result.pagesFetched, 1);
  assert.equal(result.stopReason, "source-exhausted");
});
