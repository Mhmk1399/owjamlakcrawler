import fs from "node:fs/promises";
import { canonicalizeDivarUrl, getDivarToken } from "../utils/divarUrl.js";

export function createSearchDiagnostics() {
  return {
    startedAt: new Date().toISOString(), endedAt: null, iterations: 0,
    partitions: [], totalUniqueTokens: 0, relevantSearchRequests: [],
  };
}

export async function openSearchPage(page, url) {
  await page.goto(url, { waitUntil: "domcontentloaded" });
  const accountError = await page.locator("#error-state")
    .filter({ hasText: /خطا در شناسایی حساب کاربری/ }).count().catch(() => 0);
  if (accountError) await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(
    () => [...document.links].some((link) => link.getAttribute("href")?.includes("/v/")),
    { timeout: 15_000 },
  ).catch(() => {});
}

function addLinks(listings, links, limit) {
  for (const href of links) {
    if (listings.size >= limit) break;
    const url = canonicalizeDivarUrl(href);
    const token = getDivarToken(url);
    if (url && token && !listings.has(token)) listings.set(token, { token, url });
  }
}

export async function collectListingUrls(page, options = {}) {
  const diagnostics = options.diagnostics || createSearchDiagnostics();
  const listings = new Map();
  const limit = Number.isFinite(options.maxListings)
    ? Math.max(0, Math.floor(options.maxListings)) : Infinity;
  const maxIterations = options.maxIterations || 150;
  const maxStalls = options.maxStalls || 5;
  let stalls = 0;

  for (let iteration = 0; iteration < maxIterations && stalls < maxStalls; iteration += 1) {
    diagnostics.iterations += 1;
    const before = listings.size;
    const links = await page.locator('a[href*="/v/"]').evaluateAll((nodes) => (
      nodes.map((node) => node.getAttribute("href"))
    ));
    addLinks(listings, links, limit);
    if (listings.size > before && options.onProgress) await options.onProgress([...listings.values()]);
    if (listings.size >= limit) break;
    const movement = await page.evaluate(() => {
      const start = window.scrollY;
      window.scrollBy(0, Math.max(window.innerHeight * 0.9, 700));
      return { start, end: window.scrollY, height: document.scrollingElement?.scrollHeight || 0 };
    });
    await page.waitForTimeout(1_000);
    const afterHeight = await page.evaluate(() => document.scrollingElement?.scrollHeight || 0);
    const advanced = movement.end > movement.start + 5 || afterHeight > movement.height;
    stalls = listings.size === before && !advanced ? stalls + 1 : 0;
  }

  if (!listings.size) {
    await fs.mkdir("screenshots", { recursive: true });
    await fs.mkdir("data", { recursive: true });
    await page.screenshot({ path: "screenshots/search-debug.png", fullPage: true });
    await fs.writeFile("data/search-debug.html", await page.content(), "utf8");
  }
  return [...listings.values()];
}
