import { canonicalizeDivarUrl } from "../../../src/utils/url.js";

const SEARCH_ENDPOINT = "https://api.divar.ir/v8/postlist/w/search";
const TOKEN = /^[A-Za-z0-9_-]+$/;

export class DivarPublicSearchError extends Error {
  constructor(message, { status = null, code = "public-search-error" } = {}) {
    super(message);
    this.name = "DivarPublicSearchError";
    this.status = status;
    this.code = code;
  }
}

export function apartmentAreaSearchPayload(areaId) {
  const id = Number(areaId);
  if (!Number.isInteger(id) || id <= 0) {
    throw new DivarPublicSearchError("Divar area ID is invalid", { code: "invalid-area-id" });
  }
  return {
    city_ids: ["1"],
    source_view: "CATEGORY",
    // A sparse area should report a shortfall, not be filled with recommended
    // listings from outside the requested area.
    disable_recommendation: true,
    search_data: {
      form_data: {
        data: {
          category: { str: { value: "apartment-sell" } },
          districts: { repeated_string: { value: [String(id)] } },
        },
      },
      server_payload: {
        "@type": "type.googleapis.com/widgets.SearchData.ServerPayload",
        additional_form_data: {
          data: { sort: { str: { value: "sort_date" } } },
        },
      },
    },
    previous_place_ids: [],
  };
}

export function extractSearchListings(document, limit = 10) {
  if (!document || !Array.isArray(document.list_widgets)) {
    throw new DivarPublicSearchError("Divar search response has no list_widgets array", {
      code: "invalid-shape",
    });
  }
  const listings = new Map();
  const maximum = Math.max(1, Math.floor(limit));
  for (const widget of document.list_widgets) {
    if (widget?.widget_type !== "POST_ROW") continue;
    const token = String(widget.data?.token || "");
    if (!TOKEN.test(token) || listings.has(token)) continue;
    const url = canonicalizeDivarUrl(`https://divar.ir/v/${token}`);
    if (url) listings.set(token, { token, url });
    if (listings.size >= maximum) break;
  }
  return [...listings.values()];
}

export async function fetchApartmentAreaListings(
  requestContext,
  area,
  { limit = 10, timeoutMs = 15_000 } = {},
) {
  if (typeof requestContext?.post !== "function") {
    throw new DivarPublicSearchError("Public request context is unavailable", {
      code: "request-context-unavailable",
    });
  }
  let response;
  try {
    response = await requestContext.post(SEARCH_ENDPOINT, {
      data: apartmentAreaSearchPayload(area?.id),
      failOnStatusCode: false,
      timeout: timeoutMs,
      headers: {
        accept: "application/json",
        "content-type": "application/json",
      },
    });
  } catch (error) {
    throw new DivarPublicSearchError(`Divar area search request failed: ${error.message}`, {
      code: "request-failed",
    });
  }
  const status = response.status();
  if (status !== 200) {
    throw new DivarPublicSearchError(`Divar area search returned HTTP ${status}`, {
      status,
      code: "unexpected-status",
    });
  }
  let document;
  try {
    document = await response.json();
  } catch (error) {
    throw new DivarPublicSearchError(`Divar area search was not valid JSON: ${error.message}`, {
      status,
      code: "invalid-json",
    });
  }
  return {
    listings: extractSearchListings(document, limit),
    status,
    hasNextPage: document.pagination?.has_next_page === true,
  };
}

export const _divarSearchConstants = { SEARCH_ENDPOINT };
