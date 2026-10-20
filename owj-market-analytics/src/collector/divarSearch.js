import { canonicalizeDivarUrl } from "../utils/divarUrl.js";
import { parseRetryAfter } from "./retry.js";

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

export function apartmentAreaSearchPayload(areaId, paginationData) {
  const id = Number(areaId);
  if (!Number.isInteger(id) || id <= 0) {
    throw new DivarPublicSearchError("Divar area ID is invalid", { code: "invalid-area-id" });
  }
  const payload = {
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
  if (paginationData !== undefined) payload.pagination_data = paginationData;
  return payload;
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
  {
    limit = 15,
    timeoutMs = 15_000,
    maxPages = 150,
    maxStalls = 5,
    beforePage = async () => {},
  } = {},
) {
  if (typeof requestContext?.post !== "function") {
    throw new DivarPublicSearchError("Public request context is unavailable", {
      code: "request-context-unavailable",
    });
  }
  const maximum = Math.max(1, Math.floor(limit));
  const pageLimit = Math.max(1, Math.floor(maxPages));
  const stallLimit = Math.max(1, Math.floor(maxStalls));
  const listings = new Map();
  let paginationData;
  let hasNextPage = true;
  let pagesFetched = 0;
  let consecutiveStalls = 0;
  let status = 0;
  let stopReason = "source-exhausted";

  while (
    listings.size < maximum &&
    hasNextPage &&
    pagesFetched < pageLimit &&
    consecutiveStalls < stallLimit
  ) {
    await beforePage({ page: pagesFetched + 1, collected: listings.size, target: maximum });
    let response;
    try {
      response = await requestContext.post(SEARCH_ENDPOINT, {
        data: apartmentAreaSearchPayload(area?.id, paginationData),
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
    status = response.status();
    if (status !== 200) {
      const error = new DivarPublicSearchError(`Divar area search returned HTTP ${status}`, {
        status,
        code: "unexpected-status",
      });
      error.retryAfterMs = parseRetryAfter(response.headers?.()["retry-after"]);
      throw error;
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
    pagesFetched += 1;
    const before = listings.size;
    for (const listing of extractSearchListings(document, maximum)) {
      if (!listings.has(listing.token)) listings.set(listing.token, listing);
      if (listings.size >= maximum) break;
    }
    consecutiveStalls = listings.size === before ? consecutiveStalls + 1 : 0;
    hasNextPage = document.pagination?.has_next_page === true;
    if (listings.size >= maximum) {
      stopReason = "target-reached";
      break;
    }
    if (!hasNextPage) {
      stopReason = "source-exhausted";
      break;
    }
    if (document.pagination?.data === undefined || document.pagination?.data === null) {
      hasNextPage = false;
      stopReason = "pagination-unavailable";
      break;
    }
    paginationData = document.pagination.data;
  }

  if (listings.size < maximum && consecutiveStalls >= stallLimit) stopReason = "stalled";
  else if (listings.size < maximum && pagesFetched >= pageLimit) stopReason = "max-pages";
  return {
    listings: [...listings.values()],
    status,
    hasNextPage,
    pagesFetched,
    stopReason,
  };
}

export const _divarSearchConstants = { SEARCH_ENDPOINT };
