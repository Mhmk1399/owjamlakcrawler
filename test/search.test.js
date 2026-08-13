import test from "node:test";
import assert from "node:assert/strict";
import { addUniqueListings } from "../src/crawler/search.js";

test("search discovery stops adding listings at the configured limit", () => {
  const listings = new Map();
  const links = Array.from({ length: 20 }, (_, index) => ({
    href: `/v/example-${index}/token${index}`,
  }));

  addUniqueListings(listings, links, 10);

  assert.equal(listings.size, 10);
  assert.deepEqual([...listings.keys()], Array.from({ length: 10 }, (_, index) => `token${index}`));
});

test("search discovery ignores duplicate tokens while applying the limit", () => {
  const listings = new Map([
    ["token0", { token: "token0", url: "https://divar.ir/v/old/token0" }],
  ]);

  addUniqueListings(listings, [
    { href: "/v/duplicate/token0" },
    { href: "/v/new/token1" },
    { href: "/v/new/token2" },
  ], 2);

  assert.deepEqual([...listings.keys()], ["token0", "token1"]);
});
