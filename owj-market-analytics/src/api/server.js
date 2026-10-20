import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { buildDashboardPayload } from "./dashboard.js";
import { buildScoreDetail, buildScoringAnalytics, buildScoringWorkshop } from "./scoringViews.js";
import { buildLocationView } from "./locationViews.js";

function sendJson(response, status, value) {
  const body = JSON.stringify(value, null, 2);
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
  });
  response.end(body);
}

const STATIC_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

async function readJson(file, fallback = null) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return fallback;
    throw error;
  }
}

function createCachedJsonReader(file, fallback = null) {
  let cachedSignature = null;
  let cachedValue = fallback;
  let pending = null;

  return async function readCachedJson() {
    let metadata;
    try {
      metadata = await stat(file);
    } catch (error) {
      if (error.code === "ENOENT") return fallback;
      throw error;
    }

    const signature = `${metadata.mtimeMs}:${metadata.size}`;
    if (signature === cachedSignature) return cachedValue;
    if (pending?.signature === signature) return pending.promise;

    const promise = readJson(file, fallback)
      .then((value) => {
        cachedSignature = signature;
        cachedValue = value;
        return value;
      })
      .finally(() => {
        if (pending?.promise === promise) pending = null;
      });
    pending = { signature, promise };
    return promise;
  };
}

async function sendStatic(response, file, type) {
  try {
    const body = await readFile(file);
    response.writeHead(200, {
      "Content-Type": type,
      "Content-Length": body.length,
      "Cache-Control": file.pathname.endsWith("index.html")
        ? "no-cache"
        : "public, max-age=31536000, immutable",
      "Content-Security-Policy": "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'; img-src 'self' data:; connect-src 'self'",
    });
    response.end(body);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

function numberParam(value, fallback, minimum, maximum) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? Math.min(maximum, Math.max(minimum, parsed)) : fallback;
}

function externalListing(listing) {
  const latitude = listing.coordinates?.latitude;
  const longitude = listing.coordinates?.longitude;
  return {
    ...listing,
    coordinates: {
      ...listing.coordinates,
      latitude: Number.isFinite(latitude) ? Number(latitude.toFixed(4)) : null,
      longitude: Number.isFinite(longitude) ? Number(longitude.toFixed(4)) : null,
    },
  };
}

export function createAnalyticsServer({ config, store, analytics, crawler, logger }) {
  let recommendationAnalysisCache = { key: null, value: new Map() };
  const readScoredDocument = createCachedJsonReader(config.paths.scoredListings, null);
  const server = http.createServer(async (request, response) => {
    const startedAt = Date.now();
    const requestId = randomUUID();
    const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);
    let status = 200;
    response.once("finish", () => {
      logger.info("http.request", "JSON API request completed", {
        requestId,
        method: request.method,
        path: url.pathname,
        status: response.statusCode,
        elapsedMs: Date.now() - startedAt,
      });
    });

    try {
      if (request.method === "GET" && url.pathname === "/health") {
        return sendJson(response, 200, {
          status: "ok",
          service: "owj-market-analytics",
          mode: "public-only-live-json",
          time: new Date().toISOString(),
          listingCount: store.getListings().length,
          crawl: crawler.snapshot(),
          guardrails: {
            contactEndpointAttempts: crawler.snapshot().contactEndpointAttempts,
            authenticatedTokenAccess: 0,
          },
          files: {
            listings: config.paths.listings,
            analytics: config.paths.analytics,
            models: config.paths.model,
            scoringReady: config.paths.scoringReady,
            scoredListings: config.paths.scoredListings,
            scoringReport: config.paths.scoringReport,
            logs: config.paths.logFile,
          },
        });
      }

      if (request.method === "GET" && url.pathname === "/dashboard") {
        const [analyticsDocument, savedServiceState, scoredDocument] = await Promise.all([
          readJson(config.paths.analytics, analytics.publicSnapshot()),
          readJson(config.paths.serviceState, {}),
          readScoredDocument(),
        ]);
        const liveCrawl = crawler.snapshot();
        const dashboardCrawl = liveCrawl.status === "idle" && savedServiceState?.crawl
          ? savedServiceState.crawl
          : liveCrawl;
        const sourceRecommendations = Array.isArray(analyticsDocument.recommendations)
          ? analyticsDocument.recommendations
          : scoredDocument?.listings
            ? []
            : analytics.recommendations(100);
        if (!scoredDocument?.listings) {
          const analysisCacheKey = [
            analyticsDocument.generatedAt || analyticsDocument.updatedAt || "unknown",
            sourceRecommendations.length,
            Math.floor(Date.now() / 3_600_000),
          ].join(":");
          if (recommendationAnalysisCache.key !== analysisCacheKey) {
            recommendationAnalysisCache = {
              key: analysisCacheKey,
              value: new Map(sourceRecommendations.map((item) => [
                item.token,
                item.components ? item : analytics.analyzeListing(item.token),
              ])),
            };
          }
        }
        return sendJson(response, 200, buildDashboardPayload({
          crawl: dashboardCrawl,
          analyticsDocument,
          listings: store.getListings(),
          recommendations: sourceRecommendations,
          recommendationAnalyses: recommendationAnalysisCache.value,
          scoredDocument,
          recentEvents: logger.getRecent(40),
        }));
      }

      if (request.method === "GET" && url.pathname === "/scores") {
        const document = await readScoredDocument();
        if (!document?.listings) {
          return sendJson(response, 404, {
            error: "scores-not-generated",
            message: "Run npm run score inside owj-market-analytics.",
          });
        }
        const offset = numberParam(url.searchParams.get("offset"), 0, 0, 1_000_000);
        const limit = numberParam(url.searchParams.get("limit"), 100, 1, 500);
        const query = (url.searchParams.get("query") || "").trim().toLocaleLowerCase("fa");
        const band = url.searchParams.get("band") || "all";
        const direction = url.searchParams.get("direction") === "asc" ? 1 : -1;
        const sort = url.searchParams.get("sort") || "recommendation";
        const numericValue = (item) => ({
          rank: item.rank,
          recommendation: item.scores.recommendation,
          dealValue: item.scores.dealValue,
          modelValue: item.scores.modelValue,
          nearbyValue: item.scores.nearbyValue,
          localPosition: item.scores.localPosition,
          confidence: item.scores.confidence,
          dataQuality: item.scores.dataQuality,
          propertyQuality: item.scores.propertyQuality,
          risk: item.scores.risk,
          modelDiscountPct: item.valuation.modelDiscountPct,
          nearbyDiscountPct: item.valuation.nearbyDiscountPct,
          askingPrice: item.asking.askingPrice,
        })[sort] ?? item.scores.recommendation;
        const filtered = document.listings
          .filter((item) => band === "all" || item.scores.band === band)
          .filter((item) => !query || `${item.title} ${item.token} ${item.neighborhood}`
            .toLocaleLowerCase("fa").includes(query))
          .sort((left, right) => {
            if (sort === "listing") {
              return left.title.localeCompare(right.title, "fa") * direction || left.rank - right.rank;
            }
            return (numericValue(left) - numericValue(right)) * direction || left.rank - right.rank;
          });
        return sendJson(response, 200, {
          schemaVersion: "1.0.0",
          scoringVersion: document.scoringVersion,
          generatedAt: document.generatedAt,
          total: document.listings.length,
          filteredTotal: filtered.length,
          offset,
          limit,
          summary: document.summary,
          modelValidation: document.modelValidation,
          valuationValidation: document.valuationValidation || document.summary?.valuationValidation,
          listings: filtered.slice(offset, offset + limit),
        });
      }

      const scoreDetailMatch = url.pathname.match(/^\/score-details\/([A-Za-z0-9_-]+)$/);
      if (request.method === "GET" && scoreDetailMatch) {
        const document = await readScoredDocument();
        if (!document?.listings) {
          return sendJson(response, 404, { error: "scores-not-generated" });
        }
        const detail = buildScoreDetail(document, scoreDetailMatch[1]);
        return detail
          ? sendJson(response, 200, detail)
          : sendJson(response, 404, { error: "scored-listing-not-found", token: scoreDetailMatch[1] });
      }

      if (request.method === "GET" && url.pathname === "/score-analytics-data") {
        const [document, report] = await Promise.all([
          readScoredDocument(),
          readJson(config.paths.scoringReport, {}),
        ]);
        if (!document?.listings) {
          return sendJson(response, 404, { error: "scores-not-generated" });
        }
        return sendJson(response, 200, buildScoringAnalytics(document, report));
      }

      if (request.method === "GET" && url.pathname === "/score-workshop-data") {
        const document = await readScoredDocument();
        if (!document?.listings) return sendJson(response, 404, { error: "scores-not-generated" });
        return sendJson(response, 200, buildScoringWorkshop(document));
      }

      if (request.method === "GET" && url.pathname === "/scoring-report") {
        const report = await readJson(config.paths.scoringReport, null);
        return report
          ? sendJson(response, 200, report)
          : sendJson(response, 404, { error: "scoring-report-not-generated" });
      }

      if (request.method === "POST" && url.pathname === "/crawl") {
        const result = crawler.start();
        status = result.started ? 202 : 409;
        return sendJson(response, status, result);
      }

      if (request.method === "GET" && url.pathname === "/crawl") {
        return sendJson(response, 200, crawler.snapshot());
      }

      if (request.method === "GET" && url.pathname === "/listings") {
        const offset = numberParam(url.searchParams.get("offset"), 0, 0, 1_000_000);
        const limit = numberParam(url.searchParams.get("limit"), 50, 1, 500);
        const district = url.searchParams.get("district");
        const area = url.searchParams.get("area");
        const category = url.searchParams.get("category");
        const all = store.getListings().filter((listing) => {
          const matchesDistrict = !district ||
            listing.district === district ||
            listing.neighborhood === district ||
            listing.crawlPartition?.area?.municipalDistricts?.includes(Number(district));
          const partitionArea = listing.crawlPartition?.area;
          const matchesArea = !area || [partitionArea?.slug, partitionArea?.name, String(partitionArea?.id)]
            .filter(Boolean)
            .includes(area);
          const matchesCategory = !category ||
            listing.crawlPartition?.category === category ||
            listing.subcategory === category;
          return matchesDistrict && matchesArea && matchesCategory;
        });
        return sendJson(response, 200, {
          schemaVersion: "1.0.0",
          generatedAt: new Date().toISOString(),
          total: all.length,
          offset,
          limit,
          listings: all.slice(offset, offset + limit).map(externalListing),
        });
      }

      const locationMatch = url.pathname.match(/^\/locations(?:\/([a-z0-9-]+))?$/i);
      if (request.method === "GET" && locationMatch) {
        const scoredDocument = await readScoredDocument();
        const view = buildLocationView({
          identifier: locationMatch[1] || "iran",
          listings: store.getListings(),
          scoredListings: scoredDocument?.listings || [],
        });
        return view
          ? sendJson(response, 200, view)
          : sendJson(response, 404, { error: "location-not-found", identifier: locationMatch[1] });
      }

      const listingMatch = url.pathname.match(/^\/listings\/([A-Za-z0-9_-]+)\/analysis$/);
      if (request.method === "GET" && listingMatch) {
        const analysis = analytics.analyzeListing(listingMatch[1]);
        if (!analysis) return sendJson(response, 404, { error: "listing-not-found", token: listingMatch[1] });
        return sendJson(response, 200, analysis);
      }

      if (request.method === "GET" && url.pathname === "/areas") {
        return sendJson(response, 200, {
          schemaVersion: "1.1.0",
          generatedAt: new Date().toISOString(),
          spatialCellSizeMeters: analytics.spatialCellSizeMeters,
          areas: analytics.spatialMetrics(),
        });
      }

      const areaMatch = url.pathname.match(/^\/areas\/(.+)$/);
      if (request.method === "GET" && areaMatch) {
        const areaId = decodeURIComponent(areaMatch[1]);
        return sendJson(response, 200, {
          schemaVersion: "1.1.0",
          generatedAt: new Date().toISOString(),
          areaId,
          metrics: analytics.spatialMetrics().filter((item) => item.area.id === areaId),
        });
      }

      if (request.method === "GET" && url.pathname === "/recommendations") {
        const limit = numberParam(url.searchParams.get("limit"), 20, 1, 100);
        return sendJson(response, 200, {
          schemaVersion: "1.0.0",
          generatedAt: new Date().toISOString(),
          disclaimer: "Experimental market ranking only; not investment advice.",
          recommendations: analytics.recommendations(limit),
        });
      }

      if (request.method === "GET" && url.pathname === "/analytics") {
        return sendJson(response, 200, await readJson(
          config.paths.analytics,
          analytics.publicSnapshot(),
        ));
      }

      if (request.method === "GET" && url.pathname === "/events") {
        const limit = numberParam(url.searchParams.get("limit"), 100, 1, 500);
        return sendJson(response, 200, { events: logger.getRecent(limit) });
      }

      if (request.method === "GET" && url.pathname === "/schemas/public-listing") {
        const schema = JSON.parse(await readFile(new URL("../../schemas/public-listing.schema.json", import.meta.url), "utf8"));
        return sendJson(response, 200, schema);
      }

      if (request.method === "GET" && url.pathname === "/schemas/scoring-ready") {
        const schema = JSON.parse(await readFile(new URL("../../schemas/scoring-ready.schema.json", import.meta.url), "utf8"));
        return sendJson(response, 200, schema);
      }

      if (request.method === "GET" && url.pathname === "/schemas/scored-listings") {
        const schema = JSON.parse(await readFile(new URL("../../schemas/scored-listings.schema.json", import.meta.url), "utf8"));
        return sendJson(response, 200, schema);
      }

      const isDashboardRoute = url.pathname === "/" ||
        url.pathname === "/score-analytics" ||
        url.pathname === "/score-workshop" ||
        /^\/explore(?:\/[a-z0-9-]+)?$/i.test(url.pathname) ||
        /^\/listing\/[A-Za-z0-9_-]+$/.test(url.pathname);
      if (request.method === "GET" && isDashboardRoute) {
        const sent = await sendStatic(
          response,
          new URL("../../public/index.html", import.meta.url),
          STATIC_TYPES[".html"],
        );
        if (sent) return;
        return sendJson(response, 503, {
          error: "dashboard-not-built",
          message: "Run npm run dashboard:build inside owj-market-analytics.",
        });
      }

      const assetMatch = url.pathname.match(/^\/assets\/([A-Za-z0-9_.-]+)$/);
      if (request.method === "GET" && assetMatch) {
        const extension = assetMatch[1].match(/\.[A-Za-z0-9]+$/)?.[0] || "";
        const sent = await sendStatic(
          response,
          new URL(`../../public/assets/${assetMatch[1]}`, import.meta.url),
          STATIC_TYPES[extension] || "application/octet-stream",
        );
        if (sent) return;
      }

      return sendJson(response, 404, {
        error: "not-found",
        method: request.method,
        path: url.pathname,
        routes: [
          "GET /health",
          "GET /dashboard",
          "GET /scores",
          "GET /score-details/:token",
          "GET /score-analytics-data",
          "GET /score-workshop-data",
          "GET /scoring-report",
          "POST /crawl",
          "GET /crawl",
          "GET /listings",
          "GET /listings/:token/analysis",
          "GET /areas",
          "GET /areas/:areaId",
          "GET /recommendations",
          "GET /analytics",
          "GET /events",
          "GET /schemas/public-listing",
          "GET /schemas/scoring-ready",
          "GET /schemas/scored-listings",
        ],
      });
    } catch (error) {
      logger.error("http.failure", "JSON API request failed", {
        requestId,
        method: request.method,
        path: url.pathname,
        error: error.stack || error.message,
      });
      return sendJson(response, 500, { error: "internal-error", requestId });
    }
  });
  return server;
}
