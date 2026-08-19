function ratio(numerator, denominator) {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) return 0;
  return Number((numerator / denominator * 100).toFixed(2));
}

function average(values) {
  const valid = values.filter(Number.isFinite);
  return valid.length
    ? Number((valid.reduce((total, value) => total + value, 0) / valid.length).toFixed(2))
    : null;
}

function sameArea(listing) {
  const requested = listing?.crawlPartition?.area?.name;
  const actual = listing?.neighborhood;
  if (!requested || !actual) return null;
  return requested.normalize("NFKC").replace(/\s+/g, " ").trim() ===
    actual.normalize("NFKC").replace(/\s+/g, " ").trim();
}

export function buildDashboardPayload({
  crawl = {},
  analyticsDocument = {},
  listings = [],
  recommendations = [],
  recommendationAnalyses = new Map(),
  scoredDocument = null,
  recentEvents = [],
  now = new Date().toISOString(),
} = {}) {
  const inScope = listings.filter((listing) => (
    listing.subcategory === "buy-residential-apartment"
  ));
  const exact = inScope.filter((listing) => listing.coordinates?.accuracy === "exact").length;
  const approximate = inScope.filter((listing) => listing.coordinates?.accuracy === "approximate").length;
  const coordinatesAvailable = inScope.filter((listing) => (
    Number.isFinite(listing.coordinates?.latitude) && Number.isFinite(listing.coordinates?.longitude)
  )).length;
  const missingCoordinates = inScope.length - coordinatesAvailable;
  const areaChecks = inScope.map(sameArea).filter((value) => value !== null);
  const areaMatches = areaChecks.filter(Boolean).length;
  const completeListings = inScope.filter((listing) => (
    listing.quality?.score === 100 && listing.quality?.missingFields?.length === 0
  )).length;

  const partitions = Array.isArray(analyticsDocument.searchDiagnostics?.partitions)
    ? analyticsDocument.searchDiagnostics.partitions
    : [];
  const areas = partitions.map((partition) => ({
    id: partition.area?.id ?? null,
    name: partition.area?.name ?? "Unknown",
    slug: partition.area?.slug ?? null,
    url: partition.url ?? null,
    target: partition.target ?? 0,
    discovered: partition.discovered ?? 0,
    uniqueQueued: partition.uniqueQueued ?? 0,
    duplicates: partition.duplicateCount ?? 0,
    shortfall: partition.shortfall ?? Math.max(0, (partition.target ?? 0) - (partition.discovered ?? 0)),
    source: partition.source ?? null,
  }));
  const areasWithShortfall = areas.filter((area) => area.shortfall > 0).length;
  const totalShortfall = areas.reduce((total, area) => total + area.shortfall, 0);
  const candidateTarget = analyticsDocument.searchDiagnostics?.queue?.targetCandidates ??
    areas.reduce((total, area) => total + area.target, 0);
  const discovered = crawl.discovered ?? analyticsDocument.searchDiagnostics?.totalUniqueTokens ?? 0;

  const models = analyticsDocument.onlineModels || {};
  const globalModel = models["global:sale"] || null;
  const areaModels = Object.entries(models)
    .filter(([key]) => key.startsWith("area:"))
    .map(([, model]) => model);
  const readyAreaModels = areaModels.filter((model) => model.status === "experimental-ready").length;
  const spatialAreas = Array.isArray(analyticsDocument.spatialAreas)
    ? analyticsDocument.spatialAreas
    : [];

  const listingByToken = new Map(listings.map((listing) => [listing.token, listing]));
  const topRecommendations = recommendations.slice(0, 100).map((item) => {
    const listing = listingByToken.get(item.token);
    const liveAnalysis = recommendationAnalyses instanceof Map
      ? recommendationAnalyses.get(item.token)
      : recommendationAnalyses?.[item.token];
    const prediction = item.prediction || liveAnalysis?.prediction;
    const nearby = item.nearby || liveAnalysis?.nearby;
    return {
      token: item.token,
      url: item.url,
      title: item.title,
      score: item.score,
      neighborhood: listing?.neighborhood ?? null,
      area: listing?.property?.area ?? null,
      askingPrice: item.askingPrice ?? listing?.pricing?.price ?? null,
      pricePerMeter: listing?.pricing?.pricePerMeter ?? null,
      coordinateAccuracy: listing?.coordinates?.accuracy ?? null,
      components: item.components || liveAnalysis?.components || {},
      nearby: nearby ? {
        count: nearby.count ?? null,
        radiusMeters: nearby.radiusMeters ?? null,
        subjectPricePercentile: nearby.subjectPricePercentile ?? null,
      } : null,
      prediction: prediction ? {
        method: prediction.method ?? null,
        scope: prediction.scope ?? null,
        modelSampleCount: prediction.modelSampleCount ?? null,
        predictedPricePerMeter: prediction.predictedPricePerMeter ?? null,
        predictedPrice: prediction.predictedPrice ?? null,
        askingVsPredictionPct: prediction.askingVsPredictionPct ?? null,
        askingVsNearbyPct: prediction.askingVsNearbyPct ?? null,
        validationStatus: prediction.validationStatus ?? null,
      } : null,
      warnings: item.warnings || liveAnalysis?.warnings || [],
    };
  });

  const processed = crawl.processed ?? 0;
  const successful = crawl.successful ?? 0;
  const failed = crawl.failed ?? 0;
  return {
    schemaVersion: "1.0.0",
    generatedAt: now,
    sourceUpdatedAt: analyticsDocument.generatedAt ?? null,
    crawl: {
      status: crawl.status ?? "unknown",
      runId: crawl.runId ?? null,
      startedAt: crawl.startedAt ?? null,
      endedAt: crawl.endedAt ?? null,
      durationMs: crawl.startedAt && crawl.endedAt
        ? Math.max(0, Date.parse(crawl.endedAt) - Date.parse(crawl.startedAt))
        : null,
      areasTotal: crawl.areasTotal ?? areas.length,
      areasCompleted: crawl.areasCompleted ?? 0,
      discovered,
      queued: crawl.queued ?? 0,
      processed,
      successful,
      failed,
      changed: crawl.changed ?? 0,
      successRate: ratio(successful, processed),
      failureRate: ratio(failed, processed),
      contactEndpointAttempts: crawl.contactEndpointAttempts ?? 0,
      httpWarnings: crawl.httpWarnings || {},
      error: crawl.error ?? null,
    },
    overview: {
      categoryScope: analyticsDocument.categoryScope ?? "buy-residential-apartment",
      storedListings: listings.length,
      inScopeListings: inScope.length,
      excludedOutOfScope: listings.length - inScope.length,
      candidateTarget,
      candidateCoverage: ratio(discovered, candidateTarget),
      completeListings,
      completenessRate: ratio(completeListings, inScope.length),
      averageQualityScore: average(inScope.map((listing) => listing.quality?.score)),
    },
    locationQuality: {
      available: coordinatesAvailable,
      missing: missingCoordinates,
      coverage: ratio(coordinatesAvailable, inScope.length),
      exact,
      approximate,
      unknown: Math.max(0, coordinatesAvailable - exact - approximate),
      exactRate: ratio(exact, coordinatesAvailable),
      areaChecks: areaChecks.length,
      areaMatches,
      areaMatchRate: ratio(areaMatches, areaChecks.length),
    },
    areaCoverage: {
      total: areas.length,
      complete: areas.length - areasWithShortfall,
      withShortfall: areasWithShortfall,
      totalShortfall,
      areas,
    },
    model: {
      scope: analyticsDocument.categoryScope ?? "buy-residential-apartment",
      validationStatus: "experimental-not-holdout-approved",
      global: globalModel,
      areaModelCount: areaModels.length,
      readyAreaModelCount: readyAreaModels,
      spatialAreaCount: spatialAreas.length,
      publishedSpatialAreaCount: spatialAreas.filter((area) => area.published).length,
    },
    recommendations: {
      count: recommendations.length,
      averageScore: average(recommendations.map((item) => item.score)),
      top: topRecommendations,
    },
    scoring: scoredDocument?.listings ? {
      available: true,
      scoringVersion: scoredDocument.scoringVersion,
      generatedAt: scoredDocument.generatedAt,
      count: scoredDocument.listings.length,
      summary: scoredDocument.summary,
      modelValidation: scoredDocument.modelValidation,
      listings: scoredDocument.listings.slice(0, 100),
    } : {
      available: false,
      scoringVersion: "unavailable",
      generatedAt: "unknown",
      count: 0,
      summary: {},
      modelValidation: {},
      listings: [],
    },
    recentEvents: recentEvents.slice(-40).reverse(),
    disclaimer: analyticsDocument.disclaimer ?? null,
  };
}

export const dashboardHelpers = { ratio, average, sameArea };
