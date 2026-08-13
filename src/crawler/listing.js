// listing.js
import { canonicalizeDivarUrl } from "../utils/url.js";
import { inspectContactState, extractPhoneNumber } from "./contact.js";
import {
  fillMissingListingFields,
  normalizeListing,
  validateListing,
} from "../parsers/realEstate.js";

const STRUCTURED_LABEL = /^(متراژ|مساحت|ساخت|سال ساخت|اتاق|تعداد اتاق|طبقه|تعداد طبقات|تعداد واحد در طبقه|قیمت کل|قیمت فروش|قیمت هر متر|ودیعه(?: \(تومان\))?|رهن|اجاره(?:ٔ ماهانه)?(?: \(تومان\))?|آسانسور|پارکینگ|انباری|بالکن|سند|جهت ساختمان|وضعیت واحد|محله|محدوده|منطقه|نوع آگهی‌دهنده)$/;

async function safeText(locator) {
  try {
    const text = await locator.first().innerText({ timeout: 1500 });
    return text?.trim() || null;
  } catch {
    return null;
  }
}

async function safeAttribute(locator, attribute) {
  try {
    return (await locator.first().getAttribute(attribute, { timeout: 1500 })) || null;
  } catch {
    return null;
  }
}

async function safeAllText(locator) {
  try {
    return (await locator.allInnerTexts()).map((value) => value.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

function primitiveText(value) {
  if (["string", "number", "boolean"].includes(typeof value)) return String(value);
  if (value && typeof value === "object") {
    return value.display_value ?? value.displayValue ?? value.value ?? value.text ?? null;
  }
  return null;
}

function collectStructuredAttributes(input, output = {}, seen = new Set()) {
  if (!input || typeof input !== "object" || seen.has(input)) return output;
  seen.add(input);
  const label = primitiveText(input.title ?? input.label ?? input.name)?.trim();
  const value = primitiveText(input.value ?? input.display_value ?? input.displayValue ?? input.text);
  if (label && value !== null && STRUCTURED_LABEL.test(label) && String(value).trim() !== label) {
    output[label] ??= String(value).trim();
  }
  for (const child of Object.values(input)) collectStructuredAttributes(child, output, seen);
  return output;
}

export async function extractStructuredPageData(page) {
  const data = await page.evaluate(() => {
    const embeddedJson = [];
    const jsonLd = [];
    document.querySelectorAll("script").forEach((script) => {
      const type = script.getAttribute("type") || "";
      if (type !== "application/ld+json" && type !== "application/json" && script.id !== "__NEXT_DATA__") return;
      try {
        const parsed = JSON.parse(script.textContent);
        if (type === "application/ld+json") jsonLd.push(parsed);
        else embeddedJson.push(parsed);
      } catch {}
    });
    const pageState = [];
    for (const key of ["__INITIAL_STATE__", "__PRELOADED_STATE__", "__APOLLO_STATE__"]) {
      try {
        if (window[key]) pageState.push(JSON.parse(JSON.stringify(window[key])));
      } catch {}
    }
    return { embeddedJson, jsonLd, pageState };
  });

  const attributes = collectStructuredAttributes([data.embeddedJson, data.pageState, data.jsonLd]);
  return {
    ...data,
    structuredAttributes: attributes,
    attributes,
  };
}

export async function extractVisibleDetailData(page) {
  const title =
    (await safeText(page.locator("main h1, article h1, h1"))) ||
    (await safeAttribute(page.locator('meta[property="og:title"]'), "content"));

  const dom = await page.evaluate(() => {
    const clean = (value) =>
      (value || "")
        .replace(/[ \t]+/g, " ")
        .replace(/ *\n */g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();

    const visible = (element) => {
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
    };

    const labels = /^(متراژ|مساحت|ساخت|سال ساخت|اتاق|تعداد اتاق|طبقه|تعداد طبقات|تعداد واحد در طبقه|قیمت کل|قیمت فروش|قیمت هر متر|ودیعه(?: \(تومان\))?|رهن|اجاره(?:ٔ ماهانه)?(?: \(تومان\))?|آسانسور|پارکینگ|انباری|بالکن|سند|جهت ساختمان|وضعیت واحد|محله|محدوده|منطقه|نوع آگهی‌دهنده)$/;
    const attributes = {};

    const addPair = (label, value) => {
      label = clean(label);
      value = clean(value);
      if (!labels.test(label) || !value || labels.test(value) || label === value || value.length > 300) return;
      attributes[label] ??= value;
    };

    for (const row of document.querySelectorAll("tr")) {
      const cells = [...row.querySelectorAll(":scope > th, :scope > td")];
      if (cells.length === 2) addPair(cells[0].innerText, cells[1].innerText);
    }

    for (const term of document.querySelectorAll("dt")) {
      if (term.nextElementSibling?.tagName === "DD") addPair(term.innerText, term.nextElementSibling.innerText);
    }

    for (const row of document.querySelectorAll(
      '[class~="kt-base-row"], [data-testid*="specification-row"], [data-testid*="attribute-row"]'
    )) {
      if (!visible(row)) continue;
      const direct = [...row.children].filter(visible);
      if (direct.length === 2) {
        const first = clean(direct[0].innerText);
        const second = clean(direct[1].innerText);
        if (labels.test(first)) addPair(first, second);
        else if (labels.test(second)) addPair(second, first);
      }
    }

    for (const group of document.querySelectorAll('[class~="kt-group-row"], [data-testid*="group-row"]')) {
      const titleNodes = [
        ...group.querySelectorAll('[class~="kt-group-row-item__title"], [data-testid*="title"]'),
      ].filter((element) => element.children.length === 0 && labels.test(clean(element.innerText)));
      const valueNodes = [
        ...group.querySelectorAll('[class~="kt-group-row-item__value"], [data-testid*="value"]'),
      ].filter((element) => element.children.length === 0 && clean(element.innerText));
      if (titleNodes.length > 0 && titleNodes.length === valueNodes.length) {
        titleNodes.forEach((node, index) => addPair(node.innerText, valueNodes[index].innerText));
      }
    }

    const amenities = {};
    for (const label of ["آسانسور", "پارکینگ", "انباری", "بالکن"]) {
      const candidates = [...document.querySelectorAll("td, span, p, div")]
        .filter((element) => element.children.length === 0 && visible(element))
        .filter(
          (element) =>
            clean(element.innerText) === label || clean(element.innerText) === `${label} ندارد`
        );
      if (!candidates.length) {
        amenities[label] = null;
        continue;
      }
      const leaf = candidates[0];
      let current = leaf;
      let disabled = clean(leaf.innerText).includes("ندارد");
      for (let depth = 0; current && depth < 4; depth += 1, current = current.parentElement) {
        disabled ||= /disabled|unavailable|inactive/.test(String(current.className));
      }
      amenities[label] = !disabled;
    }

    const descriptionHeading = [...document.querySelectorAll("h2, h3, h4, p, div")].find(
      (element) => clean(element.textContent) === "توضیحات"
    );
    let description = null;
    if (descriptionHeading) {
      const candidates = [
        descriptionHeading.nextElementSibling,
        ...(descriptionHeading.parentElement?.children || []),
      ]
        .filter((element) => element && element !== descriptionHeading)
        .map((element) => clean(element.innerText))
        .filter((text) => text && text !== "توضیحات");
      description = candidates.sort((a, b) => b.length - a.length)[0] || null;
    }

    const breadcrumbs = [
      ...document.querySelectorAll(
        'nav[aria-label*="breadcrumb" i] a, ol[aria-label*="breadcrumb" i] a, [class*="breadcrumb"] a'
      ),
    ]
      .map((element) => clean(element.innerText))
      .filter(Boolean);

    const images = [];
    const addImage = (value) => {
      if (!value) return;
      try {
        images.push(new URL(value, location.href).href);
      } catch {}
    };
    document.querySelectorAll("main img, article img").forEach((img) => {
      addImage(img.currentSrc || img.src);
      (img.srcset || "").split(",").forEach((entry) => addImage(entry.trim().split(/\s+/)[0]));
    });
    addImage(document.querySelector('meta[property="og:image"]')?.content);

    const domCoordinates = [
      ...document.querySelectorAll("[data-latitude][data-longitude], [data-lat][data-lng]"),
    ].map((element) => ({
      latitude: element.dataset.latitude ?? element.dataset.lat,
      longitude: element.dataset.longitude ?? element.dataset.lng,
      is_nearby:
        element.dataset.isNearby === "true"
          ? true
          : element.dataset.isNearby === "false"
            ? false
            : undefined,
    }));

    const metas = Object.fromEntries(
      [...document.querySelectorAll("meta[content]")]
        .map((meta) => [meta.getAttribute("property") || meta.name, meta.content])
        .filter(([key]) => key)
    );

    const mainLines = clean(document.querySelector("main")?.innerText || "").split("\n");
    const publishedText =
      mainLines.find((line) =>
        /(?:لحظاتی|دقایقی|ساعاتی|\d+|[۰-۹]+).*(?:پیش|قبل)/.test(line)
      ) || null;
    const agencyLine =
      mainLines.find(
        (line) => /(?:آژانس املاک|مشاور املاک)/.test(line) && line.length < 120
      ) || null;

    const contactButtonAvailable = [...document.querySelectorAll('button, [role="button"]')].some(
      (element) => clean(element.innerText).includes("اطلاعات تماس")
    );

    return {
      attributes,
      visibleAttributes: attributes,
      amenities: {
        elevator: amenities["آسانسور"],
        parking: amenities["پارکینگ"],
        storage: amenities["انباری"],
        balcony: amenities["بالکن"],
      },
      description,
      breadcrumbs,
      images: [...new Set(images)],
      domCoordinates,
      metas,
      publishedText,
      advertiser: agencyLine ? { agencyName: agencyLine, type: "agency" } : null,
      contact: { contactButtonAvailable },
    };
  });

  const fallbackBreadcrumbs = await safeAllText(page.locator('a[href^="/s/"]'));
  return {
    title,
    ...dom,
    breadcrumbs: dom.breadcrumbs.length
      ? dom.breadcrumbs
      : [...new Set(fallbackBreadcrumbs)].slice(0, 10),
  };
}

function mergeValue(preferred, fallback) {
  if (preferred === null || preferred === undefined || preferred === "") return fallback;
  if (Array.isArray(preferred)) return preferred.length ? preferred : fallback;
  if (
    typeof preferred === "object" &&
    !Array.isArray(preferred) &&
    typeof fallback === "object" &&
    fallback
  ) {
    const merged = { ...fallback };
    for (const [key, value] of Object.entries(preferred)) merged[key] = mergeValue(value, fallback[key]);
    return merged;
  }
  return preferred;
}

export function mergeListingSources(...sources) {
  return sources.reduce((result, source) => mergeValue(result, source) || result, {});
}

async function waitForDetailRender(page) {
  await Promise.race([
    page.locator("main h1, article h1, h1").first().waitFor({ state: "visible", timeout: 8000 }),
    page.waitForFunction(
      () =>
        document.querySelector(
          'script[type="application/json"], script[type="application/ld+json"], script#__NEXT_DATA__'
        ),
      null,
      { timeout: 8000 }
    ),
    page.waitForTimeout(2500),
  ]).catch(() => {});
}

export async function crawlListingDetail(page, listing) {
  const url = canonicalizeDivarUrl(listing?.url);
  if (!url) throw new Error(`Invalid Divar listing URL: ${listing?.url || "(missing)"}`);

  await page.goto(url, { waitUntil: "domcontentloaded" });
  await waitForDetailRender(page);

  const structured = await extractStructuredPageData(page);
  const visible = await extractVisibleDetailData(page);
  const contactState = await inspectContactState(page);

  // ── Click contact button and extract phone number ──────────────────────────
  let phoneData = { authenticatedPhone: null, source: "skipped" };

 console.log(`\n🔍🔍🔍 [DEBUG] About to check contact for token: ${listing.token}`);
console.log(`🔍🔍🔍 [DEBUG] contactState:`, JSON.stringify(contactState));

if (contactState?.contactButtonAvailable) {
  console.log(`🔍🔍🔍 [DEBUG] contactButtonAvailable=TRUE, calling extractPhoneNumber...`);
  phoneData = await extractPhoneNumber(page, listing.token);
  console.log(`🔍🔍🔍 [DEBUG] extractPhoneNumber returned:`, JSON.stringify(phoneData));
  await page.waitForTimeout(500 + Math.random() * 1000);
} else {
  console.log(`🔍🔍🔍 [DEBUG] contactButtonAvailable=FALSE, skipping`);
}
  // ──────────────────────────────────────────────────────────────────────────

  const raw = mergeListingSources(
    { token: listing.token ?? null, url },
    structured,
    {
      contact: {
        ...contactState,
        authenticatedPhone: phoneData.authenticatedPhone,  // ← phone from button click
        phoneSource: phoneData.source,                     // ← where it was found
      },
    },
    visible
  );

  const normalized = normalizeListing(raw);
  const filled = fillMissingListingFields(normalized, raw);
  return validateListing(filled);
}

// Backward-compatible raw extractor for callers that still need source data.
export async function extractListing(page, listing) {
  const url = canonicalizeDivarUrl(listing?.url);
  if (!url) throw new Error(`Invalid Divar listing URL: ${listing?.url || "(missing)"}`);
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await waitForDetailRender(page);
  return mergeListingSources(
    { token: listing.token ?? null, url },
    await extractStructuredPageData(page),
    await extractVisibleDetailData(page),
  );
}

export const _helpers = { safeText, safeAttribute, safeAllText, collectStructuredAttributes };
