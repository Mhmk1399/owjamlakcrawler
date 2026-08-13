import fs from "node:fs/promises";
import { config } from "../config.js";
import { canonicalizeDivarUrl, getDivarToken } from "../utils/url.js";

const SENSITIVE_PARAMETER = /auth|authorization|cookie|credential|password|phone|session|tracker|access[_-]?token/i;
const SEARCH_REQUEST = /(?:\/web-search\/|\/search\/|postlist|widget-list)/i;

export function sanitizeSearchUrl(value) {
  try {
    const url = new URL(value);
    for (const key of [...url.searchParams.keys()]) {
      if (SENSITIVE_PARAMETER.test(key)) url.searchParams.set(key, "[redacted]");
    }
    return url.href;
  } catch {
    return "[invalid-url]";
  }
}

export function createSearchDiagnostics() {
  return {
    startedAt: new Date().toISOString(),
    endedAt: null,
    iterations: 0,
    partitions: [],
    totalUniqueTokens: 0,
    relevantSearchRequests: [],
  };
}

export function observeSearchNetwork(page, diagnostics) {
  let relevantResponses = 0;

  const relevant = (request) => {
    const type = request.resourceType();
    return (type === "xhr" || type === "fetch") && SEARCH_REQUEST.test(request.url());
  };
  const onRequest = (request) => {
    if (!relevant(request)) return;
    console.log(`[SEARCH REQUEST] ${request.method()} ${sanitizeSearchUrl(request.url())}`);
  };
  const onResponse = (response) => {
    const request = response.request();
    if (!relevant(request)) return;
    relevantResponses += 1;
    const record = {
      method: request.method(),
      urlWithoutSensitiveData: sanitizeSearchUrl(request.url()),
      status: response.status(),
    };
    diagnostics.relevantSearchRequests.push(record);
    console.log(`[SEARCH RESPONSE] ${record.method} ${record.status} ${record.urlWithoutSensitiveData}`);
  };

  page.on("request", onRequest);
  page.on("response", onResponse);
  return {
    count: () => relevantResponses,
    stop: () => {
      page.off("request", onRequest);
      page.off("response", onResponse);
    },
  };
}

export async function openSearchPage(page, url = config.searchUrl) {
  console.log(`\n[SEARCH] opening ${url}`);
  await page.goto(url, { waitUntil: "domcontentloaded" });
  const accountError = await page.locator("#error-state").filter({ hasText: /خطا در شناسایی حساب کاربری/ }).count().catch(() => 0);
  if (accountError) {
    console.warn("[SEARCH] account identification error; retrying the ordinary page load once");
    await page.reload({ waitUntil: "domcontentloaded" });
  }
  try {
    await page.waitForFunction(
      () => [...document.links].some((link) => link.getAttribute("href")?.includes("/v/")),
      { timeout: 15000 },
    );
  } catch {
    console.warn("[SEARCH] warning: no listing link appeared during the initial wait");
  }
}

async function readVisibleListings(page) {
  return page.locator('a[href*="/v/"]').evaluateAll((links) =>
    links.map((link) => ({
      href: link.getAttribute("href"),
    })),
  );
}

export function addUniqueListings(listings, links, maxListings = Infinity) {
  const limit = Number.isFinite(maxListings) ? Math.max(0, Math.floor(maxListings)) : Infinity;
  for (const link of links) {
    if (listings.size >= limit) break;
    const url = canonicalizeDivarUrl(link.href);
    const token = getDivarToken(url);
    if (url && token && !listings.has(token)) listings.set(token, { token, url });
  }
  return listings;
}

async function scrollState(page) {
  return page.evaluate(() => {
    const root = document.scrollingElement;
    const candidates = [{ element: root, kind: "window" }];
    for (const element of document.querySelectorAll("main, section, div")) {
      const style = getComputedStyle(element);
      if (element.scrollHeight > element.clientHeight + 100 && /auto|scroll/.test(style.overflowY)) {
        candidates.push({ element, kind: "element" });
      }
    }
    const selected = candidates.sort((a, b) => {
      const aListings = a.element.querySelectorAll?.('a[href*="/v/"]').length || 0;
      const bListings = b.element.querySelectorAll?.('a[href*="/v/"]').length || 0;
      return (bListings - aListings) || ((b.element.scrollHeight - b.element.clientHeight) - (a.element.scrollHeight - a.element.clientHeight));
    })[0];
    const element = selected.element;
    return {
      kind: selected.kind,
      scrollHeight: element.scrollHeight,
      scrollTop: selected.kind === "window" ? window.scrollY : element.scrollTop,
      clientHeight: selected.kind === "window" ? window.innerHeight : element.clientHeight,
    };
  });
}

async function advanceScroll(page) {
  return page.evaluate(() => {
    const root = document.scrollingElement;
    const candidates = [{ element: root, kind: "window" }];
    for (const element of document.querySelectorAll("main, section, div")) {
      const style = getComputedStyle(element);
      if (element.scrollHeight > element.clientHeight + 100 && /auto|scroll/.test(style.overflowY)) candidates.push({ element, kind: "element" });
    }
    const selected = candidates.sort((a, b) => {
      const aListings = a.element.querySelectorAll?.('a[href*="/v/"]').length || 0;
      const bListings = b.element.querySelectorAll?.('a[href*="/v/"]').length || 0;
      return (bListings - aListings) || ((b.element.scrollHeight - b.element.clientHeight) - (a.element.scrollHeight - a.element.clientHeight));
    })[0];
    const before = selected.kind === "window" ? window.scrollY : selected.element.scrollTop;
    const amount = Math.max((selected.kind === "window" ? window.innerHeight : selected.element.clientHeight) * 0.9, 700);
    if (selected.kind === "window") window.scrollBy(0, amount);
    else selected.element.scrollTop += amount;
    const after = selected.kind === "window" ? window.scrollY : selected.element.scrollTop;
    return { before, after };
  });
}

async function clickMoreAdsButton(page) {
  return page.evaluate(() => {
    const pattern = /^(?:مشاهده|نمایش)?\s*آگهی(?:‌| )?های بیشتر$/;
    const candidates = [...document.querySelectorAll('button, a, [role="button"]')];
    const button = candidates.find((element) => {
      const text = (element.innerText || element.textContent || "").replace(/\s+/g, " ").trim();
      const rect = element.getBoundingClientRect();
      return pattern.test(text) && rect.width > 0 && rect.height > 0 && !element.disabled;
    });
    if (!button) return false;
    button.click();
    return true;
  });
}

async function waitForSearchChange(page, baseline, networkObserver, timeout = 2200) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    await page.waitForTimeout(200);
    const state = await scrollState(page);
    const cards = await page.locator('a[href*="/v/"]').count();
    if (cards > baseline.cards || state.scrollHeight > baseline.scrollHeight || networkObserver.count() > baseline.network) {
      return { state, cards };
    }
  }
  return { state: await scrollState(page), cards: await page.locator('a[href*="/v/"]').count() };
}

export async function collectListingUrls(page, options = {}) {
  const diagnostics = options.diagnostics || createSearchDiagnostics();
  const ownObserver = !options.networkObserver;
  const networkObserver = options.networkObserver || observeSearchNetwork(page, diagnostics);
  const listings = new Map();
  let consecutiveStalls = 0;
  let moreAdsClicks = 0;
  const maxIterations = options.maxIterations || 150;
  const maxStalls = options.maxStalls || 5;
  const maxListings = Number.isFinite(options.maxListings)
    ? Math.max(0, Math.floor(options.maxListings))
    : Infinity;

  try {
    for (let iteration = 1; iteration <= maxIterations && consecutiveStalls < maxStalls; iteration += 1) {
      diagnostics.iterations += 1;
      const previousTokenCount = listings.size;
      const beforeState = await scrollState(page);
      const links = await readVisibleListings(page);
      addUniqueListings(listings, links, maxListings);

      const newTokens = listings.size - previousTokenCount;
      if (newTokens > 0 && options.onProgress) await options.onProgress([...listings.values()]);
      if (listings.size >= maxListings) {
        console.log(`[SEARCH] listing limit reached (${maxListings}); starting detail crawl`);
        break;
      }
      const networkBefore = networkObserver.count();
      const movement = await advanceScroll(page);
      const clickedMoreAds = moreAdsClicks < 20 && await clickMoreAdsButton(page);
      if (clickedMoreAds) {
        moreAdsClicks += 1;
        diagnostics.moreAdsClicks = (diagnostics.moreAdsClicks || 0) + 1;
        console.log(`[SEARCH] clicked more ads button (${moreAdsClicks}/20)`);
      }
      const after = await waitForSearchChange(page, {
        cards: links.length,
        scrollHeight: beforeState.scrollHeight,
        network: networkBefore,
      }, networkObserver);
      const networkActivity = networkObserver.count() > networkBefore;
      const heightIncreased = after.state.scrollHeight > beforeState.scrollHeight;
      const canAdvance = movement.after > movement.before + 5 || after.state.scrollTop > beforeState.scrollTop + 5;
      const stalled = newTokens === 0 && !heightIncreased && !networkActivity && !canAdvance && !clickedMoreAds;
      consecutiveStalls = stalled ? consecutiveStalls + 1 : 0;

      console.log(`[SEARCH] current DOM cards: ${after.cards}`);
      console.log(`[SEARCH] total unique tokens: ${listings.size}`);
      console.log(`[SEARCH] scrollHeight: ${after.state.scrollHeight}`);
      console.log(`[SEARCH] scrollTop: ${after.state.scrollTop}`);
      console.log(`[SEARCH] clientHeight: ${after.state.clientHeight}`);
      console.log(`[SEARCH] new tokens this iteration: ${newTokens}`);
      if (stalled) console.log(`[SEARCH] confirmed stall: ${consecutiveStalls}/${maxStalls}`);
    }
  } finally {
    if (ownObserver) networkObserver.stop();
  }

  console.log(`[SEARCH] total unique listings: ${listings.size}`);
  if (listings.size === 0) {
    await fs.mkdir("screenshots", { recursive: true });
    await fs.mkdir("data", { recursive: true });
    await page.screenshot({ path: "screenshots/search-debug.png", fullPage: true });
    await fs.writeFile("data/search-debug.html", await page.content(), "utf8");
  }
  return [...listings.values()];
}

export async function collectLatestListings(page, options = {}) {
  await openSearchPage(page, options.url || config.searchUrl);
  return collectListingUrls(page, { ...options, maxIterations: options.maxIterations || 3 });
}
