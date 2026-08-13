import test from "node:test";
import assert from "node:assert/strict";
import {
  convertPersianDigits,
  extractPersianNumbers,
  parsePersianBoolean,
  parsePersianMoney,
  parsePersianNumber,
} from "../src/utils/persian.js";
import { canonicalizeDivarUrl, getDivarToken } from "../src/utils/url.js";
import { normalizeRealEstateListing, validateListing } from "../src/parsers/realEstate.js";
import { extractPublicLandlines, extractPublicPhoneNumbers } from "../src/utils/phone.js";
import { extractCoordinates, validateCoordinates } from "../src/utils/coordinates.js";
import { filterListingImages } from "../src/utils/images.js";

test("normalizes Persian and Arabic digits", () => {
  assert.equal(convertPersianDigits("۰۱۲۳ ٤٥٦"), "0123 456");
  assert.equal(parsePersianNumber("۱۵,۴۹۰,۰۰۰,۰۰۰ تومان"), 15490000000);
  assert.equal(parsePersianNumber("۳ از ۵"), null);
  assert.deepEqual(extractPersianNumbers("۳ از ۵"), [3, 5]);
  assert.equal(parsePersianMoney("۴۰۰ میلیون"), 400000000);
});

test("normalizes Persian booleans", () => {
  assert.equal(parsePersianBoolean("دارد"), true);
  assert.equal(parsePersianBoolean("ندارد"), false);
  assert.equal(parsePersianBoolean("نامشخص"), null);
});

test("canonicalizes listing URLs and gets tokens", () => {
  const input = "https://divar.ir/v/test/gabhsmsg?tracker_session_id=abc";
  assert.equal(canonicalizeDivarUrl(input), "https://divar.ir/v/test/gabhsmsg");
  assert.equal(getDivarToken(input), "gabhsmsg");
  assert.equal(canonicalizeDivarUrl("/v/foo/abc123"), "https://divar.ir/v/foo/abc123");
  assert.equal(
    canonicalizeDivarUrl("https://divar.ir/v/%D8%AE%D8%A7%D9%86%D9%87/abc123?x=1"),
    "https://divar.ir/v/%D8%AE%D8%A7%D9%86%D9%87/abc123",
  );
});

test("maps generic real-estate attributes without losing Persian values", () => {
  const result = normalizeRealEstateListing({
    token: "abc",
    url: "https://divar.ir/v/foo/abc",
    attributes: {
      "متراژ": "۱۱۰",
      "ساخت": "۱۳۹۸",
      "اتاق": "۳",
      "طبقه": "۳ از ۵",
      "قیمت کل": "۱۵,۴۹۰,۰۰۰,۰۰۰ تومان",
      "آسانسور": "دارد",
      "پارکینگ": "ندارد",
    },
  });

  assert.equal(result.property.area, 110);
  assert.equal(result.property.constructionYear, 1398);
  assert.equal(result.property.rooms, 3);
  assert.equal(result.property.floor, 3);
  assert.equal(result.property.totalFloors, 5);
  assert.equal(result.property.unitsPerFloor, null);
  assert.equal(result.pricing.price, 15490000000);
  assert.equal(result.amenities.elevator, true);
  assert.equal(result.amenities.parking, false);
  assert.equal(result.attributes["متراژ"], "۱۱۰");
});

test("does not retain grouped widgets as fake attributes", () => {
  const result = normalizeRealEstateListing({
    attributes: { "آسانسور ندارد": "پارکینگ انباری", "۱۰۱": "۱۳۸۵ ۲" },
    amenities: { elevator: false, parking: true, storage: true },
  });
  assert.equal(result.amenities.elevator, false);
  assert.equal(result.amenities.parking, true);
  assert.equal(result.amenities.storage, true);
  assert.equal(result.amenities.balcony, null);
  assert.deepEqual(result.attributes, {});
  assert.deepEqual(result.coordinates, { latitude: null, longitude: null, accuracy: null, source: null });
});

test("maps explicit one-to-one Divar rows into normalized fields", () => {
  const result = normalizeRealEstateListing({
    attributes: {
      "متراژ": "۵۵",
      "ساخت": "۱۳۸۶",
      "اتاق": "۱",
      "ودیعه (تومان)": "۴۰۰ میلیون",
      "اجارهٔ ماهانه (تومان)": "۱۸ میلیون",
    },
    breadcrumbs: ["املاک", "اجارهٔ مسکونی", "اجارهٔ آپارتمان"],
    publishedText: "۶ روز پیش در تهران، ائمه اطهار، خ طاهری",
  });
  assert.equal(result.property.area, 55);
  assert.equal(result.property.constructionYear, 1386);
  assert.equal(result.property.rooms, 1);
  assert.equal(result.pricing.deposit, 400000000);
  assert.equal(result.pricing.rent, 18000000);
  assert.equal(result.subcategory, "rent-residential-apartment");
  assert.equal(result.neighborhood, "ائمه اطهار");
});

test("extracts and normalizes only plausible public Iranian mobile numbers", () => {
  assert.deepEqual(extractPublicPhoneNumbers("تماس: 09121234567"), ["09121234567"]);
  assert.deepEqual(extractPublicPhoneNumbers("تماس ۰۹۱۲۱۲۳۴۵۶۷"), ["09121234567"]);
  assert.deepEqual(extractPublicPhoneNumbers("+98 912 123 4567"), ["09121234567"]);
  assert.deepEqual(extractPublicPhoneNumbers("0098-912-123-4567"), ["09121234567"]);
  assert.deepEqual(extractPublicPhoneNumbers("98 912 123 4567"), ["09121234567"]);
  assert.deepEqual(extractPublicPhoneNumbers("قیمت ۱۲,۵۰۰,۰۰۰,۰۰۰ تومان"), []);
  assert.deepEqual(extractPublicPhoneNumbers("سال ساخت ۱۳۹۸"), []);
  assert.deepEqual(extractPublicPhoneNumbers("متراژ ۱۱۰"), []);
  assert.deepEqual(extractPublicLandlines("دفتر: +98 21 1234 5678"), ["02112345678"]);
});

test("validates and qualifies exposed coordinates", () => {
  assert.deepEqual(validateCoordinates("35.7", "51.4"), { latitude: 35.7, longitude: 51.4 });
  assert.equal(validateCoordinates(91, 51), null);
  assert.equal(validateCoordinates(null, null), null);
  assert.deepEqual(extractCoordinates({
    embeddedJson: [{ location: { latitude: 35.7, longitude: 51.4, is_nearby: true } }],
  }), { latitude: 35.7, longitude: 51.4, accuracy: "approximate", source: "embedded-json" });
});

test("keeps only the best real listing image variant", () => {
  const images = filterListingImages([
    { url: "https://s100.divarcdn.com/static/photo/abc.webp_thumbnail", variant: "webp_thumbnail" },
    { url: "https://s100.divarcdn.com/static/photo/abc.jpg", variant: "post" },
    { url: "https://s100.divarcdn.com/static/photo/abc.webp_post", variant: "webp_post" },
    "https://mapimage.divarcdn.com/map.png",
    "https://divar.ir/android-chrome-512x512.png",
  ]);
  assert.deepEqual(images, ["https://s100.divarcdn.com/static/photo/abc.webp_post"]);
});

test("description text cannot mark a sale listing as full mortgage", () => {
  const result = normalizeRealEstateListing({
    breadcrumbs: ["املاک", "فروش مسکونی", "فروش آپارتمان"],
    description: "امکان رهن کامل تا مبلغ ۱۰ میلیارد",
  });
  assert.equal(result.pricing.isFullMortgage, null);
});

test("fills missing detail fields without retaining grouped-header artifacts", () => {
  const result = normalizeRealEstateListing({
    token: "detail1",
    url: "https://divar.ir/v/example/detail1",
    title: "۸۵ متر آپارتمان دو خواب",
    description: "سال ساخت ۱۴۰۴، کلا ۵ طبقه ۲ واحدی",
    visibleAttributes: {
      "متراژ": "ساخت اتاق",
      "ساخت": "دارد",
      "اتاق": "دارد",
      "قیمت کل": "۱۷,۰۰۰,۰۰۰,۰۰۰ تومان",
    },
    breadcrumbs: ["املاک", "فروش مسکونی", "فروش آپارتمان"],
  });
  assert.equal(result.property.area, 85);
  assert.equal(result.property.rooms, 2);
  assert.equal(result.property.constructionYear, 1404);
  assert.equal(result.property.totalFloors, 5);
  assert.equal(result.property.unitsPerFloor, 2);
  assert.equal(result.attributes["متراژ"], undefined);
  assert.equal(result.attributes["ساخت"], undefined);
  assert.equal(result.attributes["اتاق"], undefined);
});

test("validation nulls suspicious detail values", () => {
  const listing = normalizeRealEstateListing({
    token: "detail2",
    url: "https://divar.ir/v/example/detail2",
    title: "نمونه آگهی",
  });
  listing.property.area = -5;
  listing.property.rooms = 99;
  listing.property.constructionYear = 999;
  listing.pricing.price = -1;
  listing.coordinates = { latitude: 95, longitude: 200, accuracy: "exact", source: "dom" };
  validateListing(listing);
  assert.equal(listing.property.area, null);
  assert.equal(listing.property.rooms, null);
  assert.equal(listing.property.constructionYear, null);
  assert.equal(listing.pricing.price, null);
  assert.deepEqual(listing.coordinates, { latitude: null, longitude: null, accuracy: null, source: null });
});
