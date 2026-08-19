import { canonicalizeDivarUrl } from "../../../src/utils/url.js";

const PUBLIC_POST_ENDPOINT = "https://api.divar.ir/v8/posts-v2/web";
const TOKEN = /^[A-Za-z0-9_-]+$/;

export class DivarPublicPostError extends Error {
  constructor(message, { status = null, code = "public-post-error" } = {}) {
    super(message);
    this.name = "DivarPublicPostError";
    this.status = status;
    this.code = code;
  }
}

export function publicPostUrl(token) {
  if (!TOKEN.test(String(token || ""))) {
    throw new DivarPublicPostError("Public post token is invalid", { code: "invalid-token" });
  }
  return `${PUBLIC_POST_ENDPOINT}/${encodeURIComponent(token)}`;
}

export async function fetchPublicPostDocument(requestSource, token, { timeoutMs = 15_000 } = {}) {
  const request = typeof requestSource?.get === "function"
    ? requestSource
    : requestSource?.context?.()?.request;
  if (typeof request?.get !== "function") {
    throw new DivarPublicPostError("Public request context is unavailable", {
      code: "request-context-unavailable",
    });
  }
  const url = publicPostUrl(token);
  let response;
  try {
    response = await request.get(url, {
      failOnStatusCode: false,
      timeout: timeoutMs,
      headers: {
        accept: "application/json-filled",
        "accept-language": "fa-IR,fa;q=0.9,en;q=0.5",
      },
    });
  } catch (error) {
    throw new DivarPublicPostError(`Public post request failed: ${error.message}`, {
      code: "request-failed",
    });
  }

  const status = response.status();
  if (status !== 200) {
    throw new DivarPublicPostError(`Public post request returned HTTP ${status}`, {
      status,
      code: "unexpected-status",
    });
  }

  let document;
  try {
    document = await response.json();
  } catch (error) {
    throw new DivarPublicPostError(`Public post response was not valid JSON: ${error.message}`, {
      status,
      code: "invalid-json",
    });
  }
  if (!document || !Array.isArray(document.sections)) {
    throw new DivarPublicPostError("Public post response has no sections array", {
      status,
      code: "invalid-shape",
    });
  }
  return { document, status, url: response.url?.() || url };
}

function collectWidgets(input, output = [], seen = new Set()) {
  if (!input || typeof input !== "object" || seen.has(input)) return output;
  seen.add(input);
  if (typeof input.widget_type === "string" && input.data && typeof input.data === "object") {
    output.push(input);
  }
  for (const value of Object.values(input)) collectWidgets(value, output, seen);
  return output;
}

function firstWidget(widgets, type) {
  return widgets.find((widget) => widget.widget_type === type) || null;
}

function text(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function subcategoryFor(document, breadcrumbs) {
  const cat2 = String(document.analytics?.cat2 || document.webengage?.cat_2 || "").toLowerCase();
  const cat3 = String(
    document.analytics?.cat3 || document.webengage?.cat_3 || document.webengage?.category || "",
  ).toLowerCase();
  const joined = `${cat2} ${cat3}`;
  if (/temporary|daily|villa-suite|short.?term/.test(joined)) return "short-term-rent";
  if (/apartment.*sell|sell.*apartment/.test(joined)) return "buy-residential-apartment";
  if (/(house|villa).*sell|sell.*(house|villa)/.test(joined)) return "buy-residential-villa";
  if (/(land|old-house).*sell|sell.*(land|old-house)/.test(joined)) return "buy-residential-land";
  if (/apartment.*rent|rent.*apartment/.test(joined)) return "rent-residential-apartment";
  if (/(house|villa).*rent|rent.*(house|villa)/.test(joined)) return "rent-residential-villa";
  if (/commercial|office|shop|industrial|agricultural/.test(joined) && /sell/.test(joined)) return "buy-commercial";
  if (/commercial|office|shop|industrial|agricultural/.test(joined) && /rent/.test(joined)) return "rent-commercial";
  if (/residential.*sell|sell.*residential/.test(joined)) return "buy-residential";
  if (/residential.*rent|rent.*residential/.test(joined)) return "rent-residential";

  const labels = breadcrumbs.join(" ");
  if (/اجاره(?:ٔ| )?کوتاه|اجاره روزانه/.test(labels)) return "short-term-rent";
  if (/فروش آپارتمان/.test(labels)) return "buy-residential-apartment";
  if (/اجاره آپارتمان|اجارهٔ آپارتمان/.test(labels)) return "rent-residential-apartment";
  if (/فروش مسکونی/.test(labels)) return "buy-residential";
  if (/اجاره مسکونی|اجارهٔ مسکونی/.test(labels)) return "rent-residential";
  return null;
}

function attributesFrom(widgets) {
  const attributes = {};
  const add = (label, value) => {
    label = text(label);
    value = text(value);
    if (label && value) attributes[label] ??= value;
  };
  for (const widget of widgets) {
    const data = widget.data || {};
    if (widget.widget_type === "GROUP_INFO_ROW") {
      for (const item of data.items || []) add(item.title, item.value);
    } else if (widget.widget_type === "UNEXPANDABLE_ROW") {
      add(data.title, data.value);
    }
  }
  return attributes;
}

function amenitiesFrom(widgets) {
  const amenities = {};
  const labels = {
    elevator: /آسانسور/,
    parking: /پارکینگ/,
    storage: /انباری/,
    balcony: /بالکن/,
  };
  const accept = (item) => {
    const title = text(item?.title);
    if (!title) return;
    for (const [key, pattern] of Object.entries(labels)) {
      if (!pattern.test(title)) continue;
      amenities[key] = item.available === false || item.disabled === true || /ندارد|بدون/.test(title)
        ? false
        : true;
    }
  };
  for (const widget of widgets) {
    if (widget.widget_type === "GROUP_FEATURE_ROW") {
      for (const item of widget.data?.items || []) accept(item);
    } else if (widget.widget_type === "FEATURE_ROW") {
      accept(widget.data);
    }
  }
  return amenities;
}

function imagesFrom(widgets) {
  const images = [];
  for (const widget of widgets) {
    if (widget.widget_type !== "IMAGE_CAROUSEL") continue;
    for (const item of widget.data?.items || []) {
      const url = text(item.image?.url) || text(item.image_url);
      if (url) images.push(url);
    }
  }
  return [...new Set(images)];
}

function breadcrumbsFrom(widgets, document) {
  const breadcrumb = firstWidget(widgets, "BREADCRUMB")?.data;
  return [...new Set([
    ...(breadcrumb?.parent_items || []).map((item) => text(item.title)),
    text(document.seo?.web_info?.category_slug_persian),
  ].filter(Boolean))];
}

function mapLocationFrom(widgets) {
  return firstWidget(widgets, "MAP_ROW")?.data?.location || null;
}

export function adaptPublicPostDocument(document, discovered) {
  if (!document || !Array.isArray(document.sections)) {
    throw new DivarPublicPostError("Cannot adapt a public post without sections", {
      code: "invalid-shape",
    });
  }
  const token = String(discovered?.token || document.webengage?.token || "");
  if (!TOKEN.test(token)) {
    throw new DivarPublicPostError("Cannot adapt a public post without a valid token", {
      code: "invalid-token",
    });
  }
  const widgets = collectWidgets(document.sections);
  const breadcrumbs = breadcrumbsFrom(widgets, document);
  const titleWidget = firstWidget(widgets, "LEGEND_TITLE_ROW")?.data;
  const breadcrumbWidget = firstWidget(widgets, "BREADCRUMB")?.data;
  const publishedWidget = firstWidget(widgets, "EXPANDABLE_SECTION")?.data;
  const descriptionWidget = firstWidget(widgets, "DESCRIPTION_ROW")?.data;
  const mapLocation = mapLocationFrom(widgets);
  const url = canonicalizeDivarUrl(discovered?.url || document.share?.web_url || `https://divar.ir/v/${token}`);

  return {
    token,
    url,
    title: text(document.seo?.web_info?.title) || text(titleWidget?.title) || text(breadcrumbWidget?.current_page_title),
    category: text(document.analytics?.cat1) || "real-estate",
    subcategory: subcategoryFor(document, breadcrumbs),
    city: text(document.seo?.web_info?.city_persian) || text(document.city?.name),
    district: null,
    neighborhood: text(document.seo?.web_info?.district_persian),
    publishedText: text(publishedWidget?.title),
    description: text(descriptionWidget?.text),
    breadcrumbs,
    structuredAttributes: attributesFrom(widgets),
    amenities: amenitiesFrom(widgets),
    images: imagesFrom(widgets),
    apiCoordinates: mapLocation ? [mapLocation] : [],
    extractionSource: "posts-v2",
  };
}

export const _divarPostHelpers = {
  collectWidgets,
  subcategoryFor,
  attributesFrom,
  amenitiesFrom,
  imagesFrom,
};
