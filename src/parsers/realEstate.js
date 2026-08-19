import {
  convertPersianDigits,
  extractPersianNumbers,
  normalizePersianText,
  parsePersianBoolean,
  parsePersianMoney,
  parsePersianNumber,
} from "../utils/persian.js";
import { extractPublicLandlines, extractPublicPhoneNumbers } from "../utils/phone.js";
import { extractCoordinates, validateCoordinates } from "../utils/coordinates.js";
import { filterListingImages } from "../utils/images.js";
import { contactEnrichmentStatus, contactStatus } from "../utils/contactStatus.js";

const first = (...values) => values.find((value) => value !== null && value !== undefined && value !== "") ?? null;
const KNOWN_ATTRIBUTE = /^(متراژ|مساحت|ساخت|سال ساخت|اتاق|تعداد اتاق|طبقه|تعداد طبقات|تعداد واحد در طبقه|قیمت کل|قیمت فروش|قیمت هر متر|ودیعه(?: \(تومان\))?|رهن|اجاره(?:ٔ ماهانه)?(?: \(تومان\))?|آسانسور|پارکینگ|انباری|بالکن|سند|جهت ساختمان|وضعیت واحد|محله|محدوده|منطقه|نوع آگهی‌دهنده)$/;

function cleanAttributes(value = {}) {
  const output = {};
  for (const [rawKey, rawValue] of Object.entries(value)) {
    const key = normalizePersianText(rawKey);
    const item = normalizePersianText(rawValue);
    if (!key || !item || !KNOWN_ATTRIBUTE.test(key) || KNOWN_ATTRIBUTE.test(item)) continue;
    if (/^[\d۰-۹٠-٩]/.test(key)) continue;
    if (/^(?:متراژ|مساحت|ساخت|سال ساخت|اتاق|تعداد اتاق)$/.test(key) && parsePersianNumber(item) === null && !/قبل از|نوساز|ساله/.test(item)) continue;
    if (/^(?:متراژ|ساخت|اتاق)(?:\s+(?:متراژ|ساخت|اتاق))+$/.test(item)) continue;
    output[key] ??= item;
  }
  return output;
}

function parsedAttribute(attributes, patterns, parser = (value) => value) {
  for (const [key, value] of Object.entries(attributes || {})) {
    if (!patterns.some((pattern) => pattern.test(key))) continue;
    const parsed = parser(value);
    if (parsed !== null && parsed !== undefined) return parsed;
  }
  return null;
}

function deepValues(input, keyPattern, output = [], seen = new Set()) {
  if (!input || typeof input !== "object" || seen.has(input)) return output;
  seen.add(input);
  for (const [key, value] of Object.entries(input)) {
    if (keyPattern.test(key) && ["string", "number", "boolean"].includes(typeof value)) output.push(value);
    if (value && typeof value === "object") deepValues(value, keyPattern, output, seen);
  }
  return output;
}

function structuredRoot(raw) {
  return [raw.embeddedJson || [], raw.pageState || [], raw.jsonLd || []];
}

function structured(raw, pattern) {
  return deepValues(structuredRoot(raw), pattern)[0] ?? null;
}

function structuredNumber(raw, pattern, parser = parsePersianNumber) {
  for (const value of deepValues(structuredRoot(raw), pattern)) {
    const number = parser(value);
    if (number !== null) return number;
  }
  return null;
}

function parseConstructionYearValue(value) {
  const text = normalizePersianText(value) || "";
  if (/قبل از|پیش از/.test(text)) return null;
  return parsePersianNumber(text);
}

function parseAmenity(value) {
  if (value === true || value === "true") return true;
  if (value === false || value === "false") return false;
  return parsePersianBoolean(value);
}

function choose(sources, fieldSources, field) {
  for (const candidate of sources) {
    if (candidate.value !== null && candidate.value !== undefined && candidate.value !== "") {
      fieldSources[field] = candidate.source;
      return candidate.value;
    }
  }
  return null;
}

function inferSubcategory(raw) {
  if (raw.subcategory) return raw.subcategory;
  const text = (raw.breadcrumbs || []).join(" ");
  const categories = [
    [/اجارهٔ کوتاه|اجاره کوتاه/, "short-term-rent"],
    [/فروش آپارتمان/, "buy-residential-apartment"],
    [/فروش خانه|فروش ویلا/, "buy-residential-villa"],
    [/فروش زمین|کلنگی/, "buy-residential-land"],
    [/اجاره آپارتمان|اجارهٔ آپارتمان/, "rent-residential-apartment"],
    [/اجاره خانه|اجاره ویلا/, "rent-residential-villa"],
    [/فروش اداری|فروش مغازه|فروش صنعتی|فروش تجاری/, "buy-commercial"],
    [/اجاره اداری|اجاره مغازه|اجاره صنعتی|اجاره تجاری/, "rent-commercial"],
    [/فروش مسکونی/, "buy-residential"],
    [/اجارهٔ مسکونی|اجاره مسکونی/, "rent-residential"],
  ];
  return categories.find(([pattern]) => pattern.test(text))?.[1] ?? structured(raw, /^(subcategory|categorySlug)$/i);
}

function inferLocation(raw, attributes) {
  const published = normalizePersianText(raw.publishedText)?.split(/\sدر\s/).at(1)?.split("،").map((part) => part.trim()) || [];
  return {
    city: first(
      raw.city,
      parsedAttribute(attributes, [/^شهر$/]),
      structured(raw, /^(city|city_persian|addressLocality)$/i),
      published[0],
      (raw.breadcrumbs || []).find((item) => item === "تهران"),
    ),
    district: first(
      raw.district,
      parsedAttribute(attributes, [/^منطقه$/]),
      structured(raw, /^(region|region_persian|municipalDistrict)$/i),
    ),
    neighborhood: first(
      raw.neighborhood,
      parsedAttribute(attributes, [/^محله$/, /^محدوده$/]),
      structured(raw, /^(neighborhood|locality|district|district_persian)$/i),
      published[1],
    ),
  };
}

function collectStructuredImages(input, output = [], imageContext = false, seen = new Set()) {
  if (!input || typeof input !== "object" || seen.has(input)) return output;
  seen.add(input);
  for (const [key, value] of Object.entries(input)) {
    const context = imageContext || /image|picture|photo|webp_post|webp_thumbnail/i.test(key);
    if (context && typeof value === "string" && /^https?:\/\//.test(value)) output.push({ url: value, variant: key });
    else if (value && typeof value === "object") collectStructuredImages(value, output, context, seen);
  }
  return output;
}

function collectPublicStructuredPhoneText(raw) {
  const output = [];
  const walk = (input, seen = new Set()) => {
    if (!input || typeof input !== "object" || seen.has(input)) return;
    seen.add(input);
    for (const [key, value] of Object.entries(input)) {
      if (/^(telephone|phone|phoneNumber|publicPhone|businessPhone)$/i.test(key) && typeof value === "string") output.push(value);
      else if (value && typeof value === "object") walk(value, seen);
    }
  };
  // JSON-LD is intended as public page metadata. Do not scan arbitrary application
  // state, where numeric IDs can resemble phones or gated data may be present.
  walk(raw.jsonLd || []);
  return output.join("\n");
}

// ─── NEW HELPER ────────────────────────────────────────────────────────────────
// Validates and normalises a raw phone string coming from the contact button.
// Returns a clean 11-digit Iranian mobile string or null.
function normalizeAuthenticatedPhone(raw) {
  if (!raw || typeof raw !== "string") return null;
  // Strip every non-digit character
  const digits = raw.replace(/\D/g, "");
  // Iranian mobile: starts with 09, 11 digits  e.g. 09123456789
  // or international prefix +98 → 989123456789 (12 digits)
  if (digits.length === 11 && digits.startsWith("09")) return digits;
  if (digits.length === 12 && digits.startsWith("989")) return "0" + digits.slice(2);
  if (digits.length === 10 && digits.startsWith("9")) return "0" + digits;
  return null;
}
// ───────────────────────────────────────────────────────────────────────────────

function inferContact(raw, description, advertiser) {
  // ── 1. Public phones found in visible text (no login needed) ──────────────
  const candidates = [
    { text: description, source: "description" },
    { text: advertiser.name, source: "advertiser-public-text" },
    { text: advertiser.agencyName, source: "agency-public-text" },
    { text: raw.title, source: "structured-public-data" },
    { text: raw.publicContactText, source: "structured-public-data" },
    { text: collectPublicStructuredPhoneText(raw), source: "structured-public-data" },
  ].filter((candidate) => candidate.text);

  const phoneSources = {};
  const landlineSources = {};
  for (const candidate of candidates) {
    for (const number of extractPublicPhoneNumbers(candidate.text)) phoneSources[number] ??= candidate.source;
    for (const number of extractPublicLandlines(candidate.text)) landlineSources[number] ??= candidate.source;
  }

  const publicPhones = Object.keys(phoneSources);
  const publicLandlines = Object.keys(landlineSources);

  // ── 2. Authenticated phone (revealed after clicking contact button) ────────
  //
  // raw.contact.authenticatedPhone is populated by extractPhoneNumber()
  // inside contact.js AFTER the button click.  We normalise it here and
  // merge it into publicPhones so the rest of the pipeline stays unchanged.
  const rawAuthPhone = raw.contact?.authenticatedPhone ?? raw.contact?.phone ?? null;
  const authenticatedPhone = normalizeAuthenticatedPhone(String(rawAuthPhone ?? ""));

  if (authenticatedPhone && !phoneSources[authenticatedPhone]) {
    // Prepend so it is the first (most authoritative) phone
    publicPhones.unshift(authenticatedPhone);
    phoneSources[authenticatedPhone] = "contact-button";
  }
  // ─────────────────────────────────────────────────────────────────────────

  const buttonAvailable = Boolean(raw.contact?.contactButtonAvailable);
  const requiresAuthentication = raw.contact?.requiresAuthentication ?? null;
  const hasPublicContact = publicPhones.length > 0 || publicLandlines.length > 0;
  const source = publicPhones[0]
    ? phoneSources[publicPhones[0]]
    : publicLandlines[0]
      ? landlineSources[publicLandlines[0]]
      : null;

  return {
    publicPhones,
    publicLandlines,
    publicPhoneSources: phoneSources,
    publicLandlineSources: landlineSources,
    source,
    // ── NEW fields saved in final output ─────────────────────────────────────
    authenticatedPhone,                             // the phone from button click
    authenticatedPhoneSource: authenticatedPhone ? "contact-button" : null,
    // ─────────────────────────────────────────────────────────────────────────
    contactButtonAvailable: buttonAvailable,
    contactButton: {
      text: raw.contact?.contactButton?.text ?? null,
      disabled: raw.contact?.contactButton?.disabled ?? null,
      visible: Boolean(raw.contact?.contactButton?.visible),
    },
    requiresAuthentication,
    authenticatedSession: raw.contact?.authenticated ?? null,
    status: contactStatus({
      publicPhones,
      publicLandlines,
      contactButtonAvailable: buttonAvailable,
      requiresAuthentication,
    }),
    enrichment: {
      status: contactEnrichmentStatus({
        hasPublicContact,
        contactButtonAvailable: buttonAvailable,
        requiresAuthentication,
        providerAvailable: Boolean(raw.contactProviderAvailable),
      }),
      provider: null,
    },
  };
}

function parseAreaFromText(value) {
  const text = convertPersianDigits(normalizePersianText(value) || "");
  const explicit = text.match(/متراژ\s*[:：]?\s*(\d{1,6})/);
  if (explicit) return Number(explicit[1]);
  for (const match of text.matchAll(/(?:^|[\s،,:/|-])(\d{1,6})\s*متری?(?=$|[\s،,:/|-])/g)) {
    const tail = text.slice(match.index + match[0].length, match.index + match[0].length + 18);
    const number = Number(match[1]);
    if (!/حیاط|تراس|بالکن|کوچه|گذر|بر\b/.test(tail) && number > 0) return number;
  }
  return null;
}

function parseYearFromText(value) {
  const text = convertPersianDigits(normalizePersianText(value) || "");
  const match = text.match(/(?:سال\s*ساخت|ساخت)\s*[:：]?\s*(1[234]\d{2})/);
  return match ? Number(match[1]) : null;
}

function constructionYearText(value) {
  const text = convertPersianDigits(normalizePersianText(value) || "");
  return text.match(/قبل از\s*1[234]\d{2}|(?:یک|1)\s*ساله|نوساز/)?.[0] ?? null;
}

function parseRoomsFromText(value) {
  const text = convertPersianDigits(normalizePersianText(value) || "");
  if (/بدون اتاق/.test(text)) return { rooms: 0, roomsIsMinimum: false };
  const match = text.match(/(\+)?\s*(\d{1,2})\s*(?:خواب|خوابه|اتاق)/);
  if (match) return { rooms: Number(match[2]), roomsIsMinimum: Boolean(match[1]) };
  const words = { یک: 1, دو: 2, سه: 3, چهار: 4 };
  const word = text.match(/(یک|دو|سه|چهار)\s*(?:خواب|خوابه|اتاق)/);
  return word ? { rooms: words[word[1]], roomsIsMinimum: false } : { rooms: null, roomsIsMinimum: null };
}

function descriptionFloors(value) {
  const text = convertPersianDigits(normalizePersianText(value) || "");
  const total = text.match(/(?:کلا|جمعاً|ساختمان)?\s*(\d{1,3})\s*طبقه/);
  const units = text.match(/(\d{1,3})\s*واحدی/);
  return { totalFloors: total ? Number(total[1]) : null, unitsPerFloor: units ? Number(units[1]) : null };
}

function amenityFromText(value, label) {
  const text = normalizePersianText(value) || "";
  if (new RegExp(`(?:بدون\\s*${label}|${label}\\s*ندارد)`).test(text)) return false;
  if (text.includes(label)) return true;
  return null;
}

function qualityFor(listing) {
  const price = first(listing.pricing?.price, listing.pricing?.deposit, listing.pricing?.rent);
  const important = {
    title: listing.title,
    subcategory: listing.subcategory,
    city: listing.city,
    neighborhood: listing.neighborhood,
    area: listing.property?.area,
    rooms: listing.property?.rooms,
    pricing: price,
    description: listing.description,
  };
  const missingFields = [];
  for (const [key, value] of Object.entries(important)) {
    if (value === null || value === undefined || value === "") missingFields.push(key);
  }
  if (listing.property?.constructionYear === null) missingFields.push("constructionYear");
  if (listing.coordinates?.latitude === null || listing.coordinates?.longitude === null) missingFields.push("coordinates");
  return {
    score: Math.round(
      ((Object.keys(important).length -
        Object.entries(important).filter(([, value]) => value === null || value === undefined || value === "").length) /
        Object.keys(important).length) *
        100
    ),
    missingFields,
  };
}

export function normalizeListing(raw = {}) {
  const fieldSources = {};
  const structuredAttributes = cleanAttributes(raw.structuredAttributes);
  const visibleAttributes = cleanAttributes(raw.visibleAttributes || raw.attributes);
  const attributes = { ...visibleAttributes, ...structuredAttributes };
  const officialNumber = (field, patterns, keyPattern, parser = parsePersianNumber) =>
    choose(
      [
        { value: parsedAttribute(structuredAttributes, patterns, parser), source: "structured-json" },
        { value: structuredNumber(raw, keyPattern, parser), source: "structured-json" },
        { value: parsedAttribute(visibleAttributes, patterns, parser), source: "dom-widget" },
      ],
      fieldSources,
      field
    );
  const floorText = first(parsedAttribute(structuredAttributes, [/^طبقه$/]), parsedAttribute(visibleAttributes, [/^طبقه$/]));
  const floorNumbers = extractPersianNumbers(floorText);
  const subcategory = inferSubcategory(raw);
  const officialPriceEntries = Object.entries(attributes).filter(([key]) => /ودیعه|رهن|اجاره/.test(key));
  const officialPriceText = officialPriceEntries.flat().join(" ");
  const isRental = /^(rent-|short-term-rent)/.test(subcategory || "");
  const advertiser = {
    name: normalizePersianText(first(raw.advertiser?.name, structured(raw, /^(advertiserName|sellerName)$/i))),
    type: normalizePersianText(first(raw.advertiser?.type, parsedAttribute(attributes, [/نوع آگهی.?دهنده/]), structured(raw, /^advertiserType$/i))),
    agencyName: normalizePersianText(first(raw.advertiser?.agencyName, structured(raw, /^(agencyName|businessName)$/i))),
  };
  const description = normalizePersianText(first(raw.description, raw.metas?.description, structured(raw, /^description$/i)));
  const yearText = first(parsedAttribute(structuredAttributes, [/^ساخت$/, /^سال ساخت$/]), parsedAttribute(visibleAttributes, [/^ساخت$/, /^سال ساخت$/]));
  const explicitFullMortgage = structured(raw, /^(isFullMortgage|is_full_mortgage)$/i);
  for (const [field, patterns] of Object.entries({
    price: [/^قیمت کل$/, /^قیمت فروش$/],
    pricePerMeter: [/^قیمت هر متر$/],
    deposit: [/^ودیعه/, /^رهن$/],
    rent: [/^اجاره/],
  })) {
    if (parsedAttribute(structuredAttributes, patterns, parsePersianMoney) !== null) fieldSources[field] = "structured-json";
    else if (parsedAttribute(visibleAttributes, patterns, parsePersianMoney) !== null) fieldSources[field] = "dom-widget";
  }
  for (const [field, value] of Object.entries(raw.amenities || {})) {
    if (value !== null && value !== undefined) fieldSources[field] = "dom-widget";
  }

  const listing = {
    token: raw.token ?? null,
    url: raw.url ?? null,
    title: normalizePersianText(first(structured(raw, /^(headline|postTitle)$/i), raw.title, raw.metas?.["og:title"])),
    category: first(raw.category, "real-estate"),
    subcategory,
    ...inferLocation(raw, attributes),
    publishedText: normalizePersianText(first(raw.publishedText, structured(raw, /^(datePublished|publishedText)$/i))),
    property: {
      area: officialNumber("area", [/^متراژ$/, /^مساحت$/], /^(area|meterage|size)$/i),
      constructionYear: officialNumber("constructionYear", [/^ساخت$/, /^سال ساخت$/], /^(constructionYear|yearBuilt|buildYear)$/i, parseConstructionYearValue),
      constructionYearText: yearText && /قبل از|پیش از|نوساز|ساله/.test(yearText) ? yearText : null,
      rooms: officialNumber("rooms", [/^اتاق$/, /^تعداد اتاق$/], /^(rooms|roomCount)$/i),
      roomsIsMinimum: /\+/.test(first(parsedAttribute(structuredAttributes, [/^اتاق$/]), parsedAttribute(visibleAttributes, [/^اتاق$/])) || "") ? true : null,
      floor: choose(
        [{ value: floorNumbers[0] ?? structuredNumber(raw, /^(floor|floorNumber)$/i), source: floorText ? "dom-widget" : "structured-json" }],
        fieldSources,
        "floor"
      ),
      totalFloors: choose(
        [
          { value: floorNumbers[1] ?? null, source: "dom-widget" },
          { value: officialNumber("totalFloors", [/^تعداد طبقات$/], /^(totalFloors|floorCount)$/i), source: fieldSources.totalFloors || "structured-json" },
        ],
        fieldSources,
        "totalFloors"
      ),
      unitsPerFloor: officialNumber("unitsPerFloor", [/^تعداد واحد در طبقه$/], /^(unitsPerFloor|unitPerFloor)$/i),
    },
    pricing: {
      price: parsedAttribute(attributes, [/^قیمت کل$/, /^قیمت فروش$/], parsePersianMoney),
      pricePerMeter: parsedAttribute(attributes, [/^قیمت هر متر$/], parsePersianMoney),
      deposit: parsedAttribute(attributes, [/^ودیعه/, /^رهن$/], parsePersianMoney),
      rent: parsedAttribute(attributes, [/^اجاره/], parsePersianMoney),
      isFullMortgage:
        explicitFullMortgage === true || (isRental && /رهن کامل/.test(officialPriceText))
          ? true
          : isRental && officialPriceEntries.length
            ? false
            : null,
      isNegotiable: /قابل مذاکره|توافقی/.test(officialPriceText) ? true : null,
    },
    amenities: {
      elevator: first(raw.amenities?.elevator, parseAmenity(parsedAttribute(attributes, [/^آسانسور/]))),
      parking: first(raw.amenities?.parking, parseAmenity(parsedAttribute(attributes, [/^پارکینگ/]))),
      storage: first(raw.amenities?.storage, parseAmenity(parsedAttribute(attributes, [/^انباری/]))),
      balcony: first(raw.amenities?.balcony, parseAmenity(parsedAttribute(attributes, [/^بالکن/]))),
    },
    advertiser,
    contact: inferContact(raw, description, advertiser),
    description,
    images: filterListingImages([...(raw.images || []), ...collectStructuredImages(structuredRoot(raw))]),
    attributes,
    breadcrumbs: [...new Set((raw.breadcrumbs || []).map(normalizePersianText).filter(Boolean))],
    coordinates: extractCoordinates(raw),
    scrapedAt: new Date().toISOString(),
    _fieldSources: fieldSources,
  };
  if (listing.pricing.deposit !== null || listing.pricing.rent !== null) listing.pricing.price = null;
  return listing;
}

export function fillMissingListingFields(listing, raw = {}) {
  const title = listing.title || "";
  const description = listing.description || "";
  const sources = listing._fieldSources || {};
  const fill = (object, key, candidates, sourceKey = key) => {
    if (object[key] !== null && object[key] !== undefined) return;
    for (const candidate of candidates) {
      if (candidate.value !== null && candidate.value !== undefined) {
        object[key] = candidate.value;
        sources[sourceKey] = candidate.source;
        return;
      }
    }
  };

  fill(listing.property, "area", [
    { value: parseAreaFromText(title), source: "title" },
    { value: parseAreaFromText(description), source: "description" },
  ]);
  fill(listing.property, "constructionYear", [
    { value: parseYearFromText(title), source: "title" },
    { value: parseYearFromText(description), source: "description" },
  ]);
  listing.property.constructionYearText ??= first(constructionYearText(title), constructionYearText(description));
  const titleRooms = parseRoomsFromText(title);
  const descriptionRooms = parseRoomsFromText(description);
  fill(listing.property, "rooms", [
    { value: titleRooms.rooms, source: "title" },
    { value: descriptionRooms.rooms, source: "description" },
  ]);
  if (listing.property.roomsIsMinimum === null) {
    listing.property.roomsIsMinimum = titleRooms.rooms !== null ? titleRooms.roomsIsMinimum : descriptionRooms.roomsIsMinimum;
  }
  const floors = descriptionFloors(description);
  fill(listing.property, "totalFloors", [{ value: floors.totalFloors, source: "description" }]);
  fill(listing.property, "unitsPerFloor", [{ value: floors.unitsPerFloor, source: "description" }]);
  for (const [key, label] of Object.entries({ elevator: "آسانسور", parking: "پارکینگ", storage: "انباری", balcony: "بالکن" })) {
    fill(listing.amenities, key, [
      { value: amenityFromText(title, label), source: "title" },
      { value: amenityFromText(description, label), source: "description" },
    ], key);
  }
  listing._fieldSources = sources;
  listing.quality = qualityFor(listing);
  if (process.env.DEBUG_FIELD_SOURCES !== "true") delete listing._fieldSources;
  return listing;
}

export function validateListing(listing) {
  if (!listing?.token) throw new Error("Listing token is missing");
  if (!listing?.url) throw new Error("Listing URL is missing");
  if (!listing?.title) throw new Error("Listing title is missing");
  const positive = (value, maximum) => (Number.isFinite(value) && value > 0 && value <= maximum ? value : null);
  listing.property.area = listing.property.area === null ? null : positive(listing.property.area, 100_000);
  listing.property.rooms =
    listing.property.rooms === null || (Number.isFinite(listing.property.rooms) && listing.property.rooms >= 0 && listing.property.rooms <= 20)
      ? listing.property.rooms
      : null;
  listing.property.constructionYear =
    listing.property.constructionYear === null ||
    (Number.isInteger(listing.property.constructionYear) && listing.property.constructionYear >= 1200 && listing.property.constructionYear <= 1500)
      ? listing.property.constructionYear
      : null;
  for (const key of ["price", "pricePerMeter", "deposit", "rent"]) {
    if (listing.pricing[key] !== null && (!Number.isFinite(listing.pricing[key]) || listing.pricing[key] < 0)) listing.pricing[key] = null;
  }
  const validCoordinates = validateCoordinates(listing.coordinates.latitude, listing.coordinates.longitude);
  if (!validCoordinates) {
    listing.coordinates = {
      latitude: null,
      longitude: null,
      accuracy: null,
      radiusMeters: null,
      source: null,
    };
  }
  listing.images = Array.isArray(listing.images) ? listing.images : [];
  listing.contact.publicPhones = Array.isArray(listing.contact.publicPhones) ? listing.contact.publicPhones : [];
  listing.contact.publicLandlines = Array.isArray(listing.contact.publicLandlines) ? listing.contact.publicLandlines : [];
  listing.contact.publicPhoneSources =
    listing.contact.publicPhoneSources && typeof listing.contact.publicPhoneSources === "object" ? listing.contact.publicPhoneSources : {};
  listing.contact.publicLandlineSources =
    listing.contact.publicLandlineSources && typeof listing.contact.publicLandlineSources === "object" ? listing.contact.publicLandlineSources : {};

  // ── NEW: keep authenticatedPhone consistent ───────────────────────────────
  listing.contact.authenticatedPhone =
    typeof listing.contact.authenticatedPhone === "string" && listing.contact.authenticatedPhone.length === 11
      ? listing.contact.authenticatedPhone
      : null;
  // ─────────────────────────────────────────────────────────────────────────

  listing.quality = qualityFor(listing);
  return listing;
}

export function normalizeRealEstateListing(raw = {}) {
  return fillMissingListingFields(normalizeListing(raw), raw);
}
