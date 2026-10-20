import { randomUUID } from "node:crypto";
import { chromium, request as playwrightRequest } from "playwright";
import { normalizePersianText } from "../../../src/utils/persian.js";
import {
  collectListingUrls,
  createSearchDiagnostics,
  openSearchPage,
} from "../../../src/crawler/search.js";
import { crawlPublicListing } from "./publicListing.js";
import { fetchApartmentAreaListings } from "./divarSearch.js";
import {
  buildApartmentAreaQueue,
  fetchTehranAreas,
  TEHRAN_FOCUS_AREAS,
} from "./tehranAreas.js";

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

export function isForbiddenContactUrl(value) {
  try {
    const url = new URL(value);
    return /\/postcontact\/|contact_info/i.test(url.pathname);
  } catch {
    return /\/postcontact\/|contact_info/i.test(String(value));
  }
}

function safePublicUrl(value) {
  try {
    const url = new URL(value);
    for (const key of [...url.searchParams.keys()]) {
      if (/auth|cookie|credential|password|phone|session|tracker|access.?token/i.test(key)) {
        url.searchParams.set(key, "[redacted]");
      }
    }
    return url.href;
  } catch {
    return "[invalid-url]";
  }
}

export function listingMatchesPartition(listing, discovered) {
  if (
    discovered?.expectedSubcategory &&
    listing?.subcategory !== discovered.expectedSubcategory
  ) return false;
  if (discovered?.area?.name) {
    return normalizePersianText(listing?.neighborhood) ===
      normalizePersianText(discovered.area.name);
  }
  return true;
}

export class PublicCrawler {
  constructor({ config, store, analytics, logger }) {
    this.config = config;
    this.store = store;
    this.analytics = analytics;
    this.logger = logger;
    this.browser = null;
    this.context = null;
    this.publicPostRequest = null;
    this.stopRequested = false;
    this.currentPromise = null;
    this.requestSchedule = Promise.resolve();
    this.lastPublicRequestAt = 0;
    this.state = {
      status: "idle",
      runId: null,
      startedAt: null,
      endedAt: null,
      partition: null,
      area: null,
      areasTotal: 0,
      areasCompleted: 0,
      discovered: 0,
      queued: 0,
      processed: 0,
      successful: 0,
      failed: 0,
      changed: 0,
      contactEndpointAttempts: 0,
      httpWarnings: {},
      lastListingToken: null,
      error: null,
    };
  }

  snapshot() {
    return { ...this.state };
  }

  async persistState() {
    await this.store.saveServiceState({
      schemaVersion: "1.0.0",
      updatedAt: new Date().toISOString(),
      crawl: this.snapshot(),
    });
  }

  start() {
    if (this.currentPromise) return { started: false, reason: "crawl-already-running", state: this.snapshot() };
    this.stopRequested = false;
    this.currentPromise = this.run()
      .catch((error) => {
        this.logger.error("crawl.unhandled", "Crawl failed", { error: error.stack || error.message });
      })
      .finally(() => {
        this.currentPromise = null;
      });
    return { started: true, state: this.snapshot() };
  }

  async waitForPublicRequestSlot(token) {
    const scheduled = this.requestSchedule.then(async () => {
      const elapsed = Date.now() - this.lastPublicRequestAt;
      const waitMs = Math.max(0, this.config.crawl.publicRequestIntervalMs - elapsed);
      if (waitMs > 0) {
        this.logger.debug("crawl.request.wait", "Waiting for public request slot", { token, waitMs });
        await delay(waitMs);
      }
      this.lastPublicRequestAt = Date.now();
    });
    this.requestSchedule = scheduled.catch(() => {});
    await scheduled;
  }

  async createContext() {
    // Keep detail API calls isolated from browser cookies and any authenticated
    // state that may exist elsewhere in this repository.
    this.publicPostRequest = await playwrightRequest.newContext();
    this.browser = await chromium.launch({ headless: this.config.browser.headless });
    this.context = await this.browser.newContext({
      viewport: { width: 1440, height: 900 },
      locale: "fa-IR",
    });
    this.context.setDefaultTimeout(this.config.browser.navigationTimeoutMs);
    this.context.setDefaultNavigationTimeout(this.config.browser.navigationTimeoutMs);

    await this.context.route("**/*", async (route) => {
      const url = route.request().url();
      if (isForbiddenContactUrl(url)) {
        this.state.contactEndpointAttempts += 1;
        this.logger.error(
          "guardrail.contact.blocked",
          "Blocked a forbidden contact endpoint request",
          { url, token: this.state.lastListingToken },
        );
        await this.persistState();
        return route.abort("blockedbyclient");
      }
      return route.continue();
    });

    this.context.on("request", (request) => {
      if (!["document", "xhr", "fetch"].includes(request.resourceType())) return;
      this.logger.debug("crawl.http.request", "Public browser request started", {
        method: request.method(),
        resourceType: request.resourceType(),
        url: safePublicUrl(request.url()),
      });
    });

    this.context.on("response", (response) => {
      const status = response.status();
      if (status < 400) {
        if (["document", "xhr", "fetch"].includes(response.request().resourceType())) {
          this.logger.debug("crawl.http.response", "Public browser response received", {
            status,
            resourceType: response.request().resourceType(),
            url: safePublicUrl(response.url()),
          });
        }
        return;
      }
      this.state.httpWarnings[status] = (this.state.httpWarnings[status] || 0) + 1;
      const event = status === 429 || status === 403 ? "crawl.platform.backoff" : "crawl.http.warning";
      this.logger.warn(event, `Public request returned HTTP ${status}`, {
        status,
        resourceType: response.request().resourceType(),
        url: safePublicUrl(response.url()),
      });
      if (status === 429 || (status === 403 && this.state.httpWarnings[403] >= 3)) {
        this.stopRequested = true;
        this.logger.warn("crawl.guardrail.stop", "Stopping new crawl work after platform-limit signals", {
          status,
          count: this.state.httpWarnings[status],
        });
      }
    });
  }

  async discover(page) {
    const listings = new Map();
    const diagnostics = createSearchDiagnostics();
    this.logger.info("crawl.area-queue.load", "Loading Divar Tehran area directory", {
      category: "buy-apartment",
      listingsPerArea: this.config.crawl.listingsPerArea,
      maxAreas: this.config.crawl.maxAreas || null,
    });
    const areas = await fetchTehranAreas(this.publicPostRequest);
    const partitions = buildApartmentAreaQueue(areas, {
      listingsPerArea: this.config.crawl.listingsPerArea,
      maxAreas: this.config.crawl.maxAreas,
      focusAreas: TEHRAN_FOCUS_AREAS,
    });
    this.state.areasTotal = partitions.length;
    diagnostics.queue = {
      category: "buy-apartment",
      sourceAreaCount: areas.length,
      configuredFocusAreaCount: TEHRAN_FOCUS_AREAS.length,
      queuedAreaCount: partitions.length,
      listingsPerArea: this.config.crawl.listingsPerArea,
      targetCandidates: Math.min(
        this.config.crawl.maxListings,
        partitions.length * this.config.crawl.listingsPerArea,
      ),
    };
    this.logger.info("crawl.area-queue.ready", "Tehran buy-apartment area queue created", {
      ...diagnostics.queue,
      safetyMaxListings: this.config.crawl.maxListings,
    });
    await this.persistState();

    for (const partition of partitions) {
      if (this.stopRequested || listings.size >= this.config.crawl.maxListings) break;
      this.state.partition = partition.category;
      this.state.area = partition.area;
      await this.persistState();
      this.logger.info("crawl.discovery.partition.start", "Starting public search partition", {
        runId: this.state.runId,
        category: partition.category,
        area: partition.area,
        target: partition.limit,
        url: partition.url,
      });
      const partitionDiagnostic = {
        category: partition.category,
        expectedSubcategory: partition.expectedSubcategory,
        area: partition.area,
        url: partition.url,
        target: partition.limit,
        discovered: 0,
        uniqueQueued: 0,
        duplicateCount: 0,
        shortfall: 0,
      };
      diagnostics.partitions.push(partitionDiagnostic);
      const remaining = this.config.crawl.maxListings - listings.size;
      const limit = Math.min(remaining, partition.limit);
      const beforeCount = listings.size;
      const enrich = (listing) => ({
        ...listing,
        category: partition.category,
        expectedSubcategory: partition.expectedSubcategory,
        area: partition.area,
      });
      let discovered;
      try {
        const result = await fetchApartmentAreaListings(
          this.publicPostRequest,
          partition.area,
          {
            limit,
            maxPages: this.config.crawl.maxSearchIterations,
            maxStalls: this.config.crawl.maxSearchStalls,
            beforePage: ({ page }) => this.waitForPublicRequestSlot(
              `area:${partition.area.slug}:page:${page}`,
            ),
          },
        );
        discovered = result.listings;
        partitionDiagnostic.source = "public-search-api";
        partitionDiagnostic.hasNextPage = result.hasNextPage;
        partitionDiagnostic.pagesFetched = result.pagesFetched;
        partitionDiagnostic.stopReason = result.stopReason;
        diagnostics.relevantSearchRequests.push({
          method: "POST",
          urlWithoutSensitiveData: "https://api.divar.ir/v8/postlist/w/search",
          status: result.status,
          category: partition.category,
          area: partition.area,
        });
        this.logger.info("crawl.discovery.api.success", "Public area search returned listing tokens", {
          category: partition.category,
          area: partition.area,
          status: result.status,
          count: discovered.length,
          target: limit,
          hasNextPage: result.hasNextPage,
          pagesFetched: result.pagesFetched,
          stopReason: result.stopReason,
        });
      } catch (apiError) {
        partitionDiagnostic.source = "html-fallback";
        partitionDiagnostic.apiError = apiError.message;
        this.logger.warn("crawl.discovery.api.fallback", "Public area search failed; using HTML fallback", {
          category: partition.category,
          area: partition.area,
          status: apiError.status ?? null,
          code: apiError.code ?? null,
          error: apiError.message,
        });
        if (apiError.status === 403 || apiError.status === 429) {
          this.state.httpWarnings[apiError.status] = (this.state.httpWarnings[apiError.status] || 0) + 1;
          this.stopRequested = true;
          this.logger.warn("crawl.guardrail.stop", "Stopping area discovery after a platform-limit signal", {
            status: apiError.status,
            count: this.state.httpWarnings[apiError.status],
            area: partition.area,
          });
          throw apiError;
        }
        await openSearchPage(page, partition.url);
        discovered = await collectListingUrls(page, {
          diagnostics,
          maxListings: limit,
          maxIterations: this.config.crawl.maxSearchIterations,
          maxStalls: this.config.crawl.maxSearchStalls,
        });
      }
      for (const listing of discovered) {
        if (!listings.has(listing.token)) listings.set(listing.token, enrich(listing));
      }
      const addedCount = listings.size - beforeCount;
      partitionDiagnostic.discovered = discovered.length;
      partitionDiagnostic.uniqueQueued = addedCount;
      partitionDiagnostic.duplicateCount = discovered.length - addedCount;
      partitionDiagnostic.shortfall = Math.max(0, partition.limit - discovered.length);
      this.state.discovered = listings.size;
      this.state.areasCompleted += 1;
      this.logger.info("crawl.discovery.partition.complete", "Public search partition completed", {
        runId: this.state.runId,
        category: partition.category,
        area: partition.area,
        target: partition.limit,
        partitionCount: discovered.length,
        uniqueQueued: addedCount,
        duplicateCount: partitionDiagnostic.duplicateCount,
        shortfall: partitionDiagnostic.shortfall,
        totalUnique: listings.size,
        areasCompleted: this.state.areasCompleted,
        areasTotal: this.state.areasTotal,
      });
    }
    diagnostics.endedAt = new Date().toISOString();
    diagnostics.totalUniqueTokens = listings.size;
    return { listings: [...listings.values()], diagnostics };
  }

  async processListing(page, discovered, workerId) {
    await this.waitForPublicRequestSlot(discovered.token);
    this.state.lastListingToken = discovered.token;
    const startedAt = Date.now();
    this.logger.info("crawl.listing.start", "Processing public listing", {
      runId: this.state.runId,
      workerId,
      token: discovered.token,
      progress: `${this.state.processed + 1}/${this.state.queued}`,
      category: discovered.category,
      area: discovered.area,
    });
    try {
      const existing = this.store.getListing(discovered.token);
      const listing = await crawlPublicListing(page, discovered, existing, {
        logger: this.logger,
        apiRequestContext: this.publicPostRequest,
      });
      if (!listingMatchesPartition(listing, discovered)) {
        throw new Error(
          `Listing partition mismatch: expected ${discovered.expectedSubcategory || "any"} in ${discovered.area?.name || "any area"}, got ${listing.subcategory || "unknown"} in ${listing.neighborhood || "unknown area"}`,
        );
      }
      const result = await this.store.upsertListing(listing, this.state.runId);
      const analysis = await this.analytics.ingest(result.listing);
      this.state.successful += 1;
      if (result.changed) this.state.changed += 1;
      this.logger.info("crawl.listing.success", "Public listing stored and analyzed", {
        runId: this.state.runId,
        workerId,
        token: listing.token,
        changed: result.changed,
        elapsedMs: Date.now() - startedAt,
        analysisStatus: analysis.status,
        score: analysis.score,
        category: listing.subcategory,
        requestedArea: discovered.area,
        actualNeighborhood: listing.neighborhood,
      });
    } catch (error) {
      this.state.failed += 1;
      if (error.status === 403 || error.status === 429) {
        this.state.httpWarnings[error.status] = (this.state.httpWarnings[error.status] || 0) + 1;
        this.logger.warn("crawl.platform.backoff", `Public detail API returned HTTP ${error.status}`, {
          status: error.status,
          token: discovered.token,
          count: this.state.httpWarnings[error.status],
        });
        if (error.status === 429 || this.state.httpWarnings[403] >= 3) {
          this.stopRequested = true;
          this.logger.warn("crawl.guardrail.stop", "Stopping new crawl work after platform-limit signals", {
            status: error.status,
            count: this.state.httpWarnings[error.status],
          });
        }
      }
      this.logger.error("crawl.listing.failure", "Public listing failed", {
        runId: this.state.runId,
        workerId,
        token: discovered.token,
        elapsedMs: Date.now() - startedAt,
        error: error.stack || error.message,
      });
    } finally {
      this.state.processed += 1;
      await this.persistState();
    }
  }

  async processDetails(listings) {
    this.state.queued = listings.length;
    await this.persistState();
    let cursor = 0;
    const workerCount = Math.min(this.config.crawl.detailConcurrency, listings.length);
    const runWorker = async (workerId) => {
      const page = await this.context.newPage();
      try {
        while (!this.stopRequested) {
          const index = cursor;
          cursor += 1;
          if (index >= listings.length) break;
          await this.processListing(page, listings[index], workerId);
        }
      } finally {
        await page.close().catch(() => {});
      }
    };
    await Promise.all(Array.from({ length: workerCount }, (_, index) => runWorker(index + 1)));
  }

  async run() {
    this.state = {
      status: "starting",
      runId: randomUUID(),
      startedAt: new Date().toISOString(),
      endedAt: null,
      partition: null,
      area: null,
      areasTotal: 0,
      areasCompleted: 0,
      discovered: 0,
      queued: 0,
      processed: 0,
      successful: 0,
      failed: 0,
      changed: 0,
      contactEndpointAttempts: 0,
      httpWarnings: {},
      lastListingToken: null,
      error: null,
    };
    await this.persistState();
    this.logger.info("crawl.run.start", "Live public crawl started", {
      runId: this.state.runId,
      maxListings: this.config.crawl.maxListings,
      category: "buy-apartment",
      listingsPerArea: this.config.crawl.listingsPerArea,
      maxAreas: this.config.crawl.maxAreas || null,
      concurrency: this.config.crawl.detailConcurrency,
      requestIntervalMs: this.config.crawl.publicRequestIntervalMs,
    });

    try {
      await this.createContext();
      this.state.status = "discovering";
      await this.persistState();
      const searchPage = await this.context.newPage();
      const { listings, diagnostics } = await this.discover(searchPage);
      await searchPage.close();

      this.state.status = "processing";
      await this.persistState();
      await this.processDetails(listings);
      await this.store.flush();

      const analytics = {
        ...this.analytics.publicSnapshot(),
        recommendations: this.analytics.recommendations(100),
        searchDiagnostics: diagnostics,
      };
      await this.store.saveAnalytics(analytics);
      this.state.status = this.stopRequested ? "stopped" : "completed";
    } catch (error) {
      this.state.status = this.stopRequested && [403, 429].includes(error.status)
        ? "stopped"
        : "failed";
      this.state.error = error.message;
      this.logger.error("crawl.run.failure", "Live public crawl failed", {
        runId: this.state.runId,
        error: error.stack || error.message,
      });
    } finally {
      this.state.endedAt = new Date().toISOString();
      this.state.partition = null;
      this.state.area = null;
      await this.persistState();
      await this.publicPostRequest?.dispose().catch(() => {});
      await this.context?.close().catch(() => {});
      await this.browser?.close().catch(() => {});
      this.context = null;
      this.publicPostRequest = null;
      this.browser = null;
      this.logger.info("crawl.run.complete", "Live public crawl ended", this.snapshot());
    }
  }

  async stop() {
    this.stopRequested = true;
    this.logger.warn("crawl.stop.requested", "Crawler stop requested", { runId: this.state.runId });
    await this.context?.close().catch(() => {});
    if (this.currentPromise) await this.currentPromise;
  }
}
