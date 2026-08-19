const PLACES_URL = "https://map.divarcdn.com/places-web.json";
const TEHRAN_PLACE_ID = "1";
const DISTRICT_PLACE_TYPE = "4";
const BUY_APARTMENT_URL = "https://divar.ir/s/tehran/buy-apartment";

export class DivarPlacesError extends Error {
  constructor(message, { status = null, code = "places-error" } = {}) {
    super(message);
    this.name = "DivarPlacesError";
    this.status = status;
    this.code = code;
  }
}

function cleanText(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function extractTehranAreas(document) {
  if (!Array.isArray(document)) {
    throw new DivarPlacesError("Divar places response is not an array", {
      code: "invalid-shape",
    });
  }

  const bySlug = new Map();
  for (const place of document) {
    if (String(place?.parent) !== TEHRAN_PLACE_ID) continue;
    if (String(place?.type) !== DISTRICT_PLACE_TYPE) continue;
    const name = cleanText(place.name);
    const slug = cleanText(place.slug);
    const id = Number(place.id);
    if (!name || !slug || !Number.isInteger(id)) continue;
    if (!/^[a-z0-9-]+$/i.test(slug)) continue;
    bySlug.set(slug, { id, name, slug });
  }

  const areas = [...bySlug.values()].sort((left, right) => (
    left.name.localeCompare(right.name, "fa") || left.id - right.id
  ));
  if (!areas.length) {
    throw new DivarPlacesError("Divar places response contains no Tehran areas", {
      code: "no-tehran-areas",
    });
  }
  return areas;
}

export async function fetchTehranAreas(requestContext, { timeoutMs = 15_000 } = {}) {
  if (typeof requestContext?.get !== "function") {
    throw new DivarPlacesError("Public request context is unavailable", {
      code: "request-context-unavailable",
    });
  }
  let response;
  try {
    response = await requestContext.get(PLACES_URL, {
      failOnStatusCode: false,
      timeout: timeoutMs,
      headers: { accept: "application/json" },
    });
  } catch (error) {
    throw new DivarPlacesError(`Divar places request failed: ${error.message}`, {
      code: "request-failed",
    });
  }
  const status = response.status();
  if (status !== 200) {
    throw new DivarPlacesError(`Divar places request returned HTTP ${status}`, {
      status,
      code: "unexpected-status",
    });
  }
  try {
    return extractTehranAreas(await response.json());
  } catch (error) {
    if (error instanceof DivarPlacesError) throw error;
    throw new DivarPlacesError(`Divar places response was not valid JSON: ${error.message}`, {
      status,
      code: "invalid-json",
    });
  }
}

export function apartmentAreaUrl(slug) {
  if (!/^[a-z0-9-]+$/i.test(String(slug || ""))) {
    throw new DivarPlacesError("Tehran area slug is invalid", { code: "invalid-slug" });
  }
  return `${BUY_APARTMENT_URL}/${encodeURIComponent(slug)}`;
}

export function buildApartmentAreaQueue(
  areas,
  { listingsPerArea = 15, maxAreas = 0 } = {},
) {
  const perAreaLimit = Math.max(1, Math.floor(listingsPerArea));
  const selected = maxAreas > 0 ? areas.slice(0, Math.floor(maxAreas)) : areas;
  return selected.map((area) => ({
    category: "buy-apartment",
    expectedSubcategory: "buy-residential-apartment",
    area: { id: area.id, name: area.name, slug: area.slug },
    url: apartmentAreaUrl(area.slug),
    limit: perAreaLimit,
  }));
}

export const _tehranAreaConstants = {
  PLACES_URL,
  TEHRAN_PLACE_ID,
  DISTRICT_PLACE_TYPE,
  BUY_APARTMENT_URL,
};
