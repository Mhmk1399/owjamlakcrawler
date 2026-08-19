import {
  clamp,
  haversineMeters,
  percentileRank,
  quantile,
  summarize,
} from "./math.js";
import { OnlineRidgeModel, saleFeatures } from "../models/onlineRidge.js";

const EARTH_RADIUS_METERS = 6_378_137;
const MAX_MERCATOR_LATITUDE = 85.05112878;
const DEFAULT_SPATIAL_CELL_SIZE_METERS = 1_000;
const LOCATION_MODEL_VERSION = "buy-apartment-coordinates-v2";

function inScope(listing) {
  return listing?.subcategory === "buy-residential-apartment";
}

function transactionType(listing) {
  if (listing.subcategory?.startsWith("buy-")) return "sale";
  if (listing.subcategory?.startsWith("rent-") || listing.subcategory === "short-term-rent") return "rent";
  if (Number.isFinite(listing.pricing?.price)) return "sale";
  if (Number.isFinite(listing.pricing?.rent) || Number.isFinite(listing.pricing?.deposit)) return "rent";
  return "unknown";
}

function saleEligible(listing) {
  return (
    inScope(listing) &&
    transactionType(listing) === "sale" &&
    Number.isFinite(listing.pricing?.price) && listing.pricing.price > 0 &&
    Number.isFinite(listing.property?.area) && listing.property.area > 0 &&
    Number.isFinite(listing.pricing?.pricePerMeter) && listing.pricing.pricePerMeter > 0
  );
}

function coordinatePoint(listing) {
  const latitude = listing?.coordinates?.latitude;
  const longitude = listing?.coordinates?.longitude;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;
  return { latitude, longitude };
}

function projectedPoint({ latitude, longitude }) {
  const boundedLatitude = clamp(latitude, -MAX_MERCATOR_LATITUDE, MAX_MERCATOR_LATITUDE);
  const latitudeRadians = boundedLatitude * Math.PI / 180;
  return {
    x: EARTH_RADIUS_METERS * longitude * Math.PI / 180,
    y: EARTH_RADIUS_METERS * Math.log(Math.tan(Math.PI / 4 + latitudeRadians / 2)),
  };
}

function unprojectedPoint(x, y) {
  return {
    latitude: (2 * Math.atan(Math.exp(y / EARTH_RADIUS_METERS)) - Math.PI / 2) * 180 / Math.PI,
    longitude: x / EARTH_RADIUS_METERS * 180 / Math.PI,
  };
}

function roundedPoint(point) {
  return {
    latitude: Number(point.latitude.toFixed(6)),
    longitude: Number(point.longitude.toFixed(6)),
  };
}

function spatialCellFor(listing, cellSizeMeters = DEFAULT_SPATIAL_CELL_SIZE_METERS) {
  const point = coordinatePoint(listing);
  if (!point) return null;
  const projected = projectedPoint(point);
  const column = Math.floor(projected.x / cellSizeMeters);
  const row = Math.floor(projected.y / cellSizeMeters);
  const southwest = unprojectedPoint(column * cellSizeMeters, row * cellSizeMeters);
  const northeast = unprojectedPoint((column + 1) * cellSizeMeters, (row + 1) * cellSizeMeters);
  return {
    id: `${cellSizeMeters}m:${column}:${row}`,
    cellSizeMeters,
    center: roundedPoint(unprojectedPoint(
      (column + 0.5) * cellSizeMeters,
      (row + 0.5) * cellSizeMeters,
    )),
    bounds: {
      south: Number(southwest.latitude.toFixed(6)),
      west: Number(southwest.longitude.toFixed(6)),
      north: Number(northeast.latitude.toFixed(6)),
      east: Number(northeast.longitude.toFixed(6)),
    },
  };
}

function sameSubtype(left, right) {
  return !left.subcategory || !right.subcategory || left.subcategory === right.subcategory;
}

function comparableShape(subject, candidate) {
  if (subject.token === candidate.token) return false;
  if (!saleEligible(candidate) || !sameSubtype(subject, candidate)) return false;
  const areaDifference = Math.abs(candidate.property.area - subject.property.area) / subject.property.area;
  if (areaDifference > 0.25) return false;
  if (
    Number.isFinite(subject.property.rooms) &&
    Number.isFinite(candidate.property.rooms) &&
    Math.abs(subject.property.rooms - candidate.property.rooms) > 1
  ) return false;
  return true;
}

function modelKeyFor(listing, cellSizeMeters) {
  const cell = spatialCellFor(listing, cellSizeMeters);
  return cell ? `area:${cell.id}` : null;
}

function emptyNearby(mode) {
  return {
    mode,
    center: null,
    radiusMeters: null,
    count: 0,
    medianPricePerMeter: null,
    p25PricePerMeter: null,
    p75PricePerMeter: null,
    subjectPricePercentile: null,
    highestAskingPrice: null,
    highestPricePerMeter: null,
    topSimilar: [],
  };
}

export class LiveMarketEngine {
  constructor({
    store,
    logger,
    minSpatialSample = 5,
    minModelSample = 30,
    spatialCellSizeMeters = DEFAULT_SPATIAL_CELL_SIZE_METERS,
  }) {
    this.store = store;
    this.logger = logger;
    this.minSpatialSample = minSpatialSample;
    this.minModelSample = minModelSample;
    this.spatialCellSizeMeters = spatialCellSizeMeters;
    this.models = new Map();
    this.seenFingerprints = {};
    this.updatedAt = null;
  }

  async init() {
    const saved = await this.store.readModelState();
    if (
      saved?.schemaVersion === "1.0.0" &&
      saved.locationModelVersion === LOCATION_MODEL_VERSION &&
      saved.spatialCellSizeMeters === this.spatialCellSizeMeters
    ) {
      for (const [key, state] of Object.entries(saved.models || {})) {
        this.models.set(key, new OnlineRidgeModel(state));
      }
      this.seenFingerprints = saved.seenFingerprints || {};
      this.updatedAt = saved.updatedAt || null;
      this.logger.info("analytics.models.loaded", "Coordinate-based online model state loaded", {
        modelCount: this.models.size,
        trainedObservations: Object.keys(this.seenFingerprints).length,
        locationModelVersion: LOCATION_MODEL_VERSION,
      });
      return;
    }

    this.models.clear();
    this.seenFingerprints = {};
    for (const listing of this.store.getListings()) this.updateModels(listing);
    await this.persistModelState();
    this.logger.info("analytics.models.rebuilt", "Coordinate-based models initialized from JSON listings", {
      listingCount: this.store.getListings().length,
      modelCount: this.models.size,
      migrationReason: saved ? "location-model-configuration-changed" : "no-saved-model",
      locationModelVersion: LOCATION_MODEL_VERSION,
    });
  }

  getModel(key) {
    if (!this.models.has(key)) this.models.set(key, new OnlineRidgeModel());
    return this.models.get(key);
  }

  updateModels(listing) {
    if (!saleEligible(listing)) return false;
    const seenKey = `${listing.token}:${listing.contentFingerprint}`;
    if (this.seenFingerprints[seenKey]) return false;
    const features = saleFeatures(listing);
    const target = Math.log(listing.pricing.pricePerMeter);
    const updatedGlobal = this.getModel("global:sale").update(features, target);
    const areaModelKey = modelKeyFor(listing, this.spatialCellSizeMeters);
    const updatedArea = areaModelKey ? this.getModel(areaModelKey).update(features, target) : false;
    if (updatedGlobal || updatedArea) {
      this.seenFingerprints[seenKey] = listing.lastSeenAt;
      this.updatedAt = new Date().toISOString();
      return true;
    }
    return false;
  }

  async ingest(listing) {
    const modelUpdated = this.updateModels(listing);
    if (modelUpdated) await this.persistModelState();
    const snapshot = this.publicSnapshot();
    await this.store.saveAnalytics(snapshot);
    const analysis = this.analyzeListing(listing);
    this.logger.info("analytics.listing.updated", "Live coordinate analytics updated", {
      token: listing.token,
      spatialAreaId: spatialCellFor(listing, this.spatialCellSizeMeters)?.id ?? null,
      coordinateSource: listing.coordinates?.source ?? null,
      modelUpdated,
      analysisStatus: analysis.status,
      score: analysis.score,
      currentListingCount: this.store.getListings().length,
    });
    return analysis;
  }

  spatialMetrics() {
    const groups = new Map();
    for (const listing of this.store.getListings()) {
      if (!inScope(listing)) continue;
      const area = spatialCellFor(listing, this.spatialCellSizeMeters);
      if (!area) continue;
      const type = transactionType(listing);
      const key = `${type}:${area.id}`;
      if (!groups.has(key)) groups.set(key, { type, area, listings: [] });
      groups.get(key).listings.push(listing);
    }

    return [...groups.values()].map(({ type, area, listings }) => {
      const prices = listings.map((item) => item.pricing?.price).filter(Number.isFinite);
      const ppm = listings.map((item) => item.pricing?.pricePerMeter).filter(Number.isFinite);
      const areas = listings.map((item) => item.property?.area).filter(Number.isFinite);
      return {
        transactionType: type,
        area,
        listingCount: listings.length,
        published: listings.length >= this.minSpatialSample,
        minimumRequired: this.minSpatialSample,
        price: summarize(prices),
        pricePerMeter: summarize(ppm),
        propertyArea: summarize(areas),
        updatedAt: listings.map((item) => item.lastSeenAt).sort().at(-1) || null,
      };
    }).sort((left, right) => (
      left.transactionType.localeCompare(right.transactionType) || left.area.id.localeCompare(right.area.id)
    ));
  }

  spatialAreaFor(listing) {
    const cell = spatialCellFor(listing, this.spatialCellSizeMeters);
    if (!cell) return null;
    return this.spatialMetrics().find(
      (metric) => metric.transactionType === transactionType(listing) && metric.area.id === cell.id,
    ) || null;
  }

  nearbyComparables(subject) {
    if (!saleEligible(subject)) return emptyNearby("ineligible");
    const center = coordinatePoint(subject);
    if (!center) return emptyNearby("coordinates-unavailable");

    const coordinateCandidates = this.store.getListings()
      .filter((item) => comparableShape(subject, item))
      .map((item) => ({ item, distanceMeters: haversineMeters(center, coordinatePoint(item)) }))
      .filter(({ distanceMeters }) => distanceMeters !== null)
      .sort((a, b) => a.distanceMeters - b.distanceMeters);

    let selected = [];
    let radiusMeters = 5_000;
    for (const radius of [500, 1_000, 2_000, 3_000, 5_000]) {
      selected = coordinateCandidates.filter(({ distanceMeters }) => distanceMeters <= radius);
      radiusMeters = radius;
      if (selected.length >= 15) break;
    }

    const byPrice = [...selected].sort((a, b) => b.item.pricing.price - a.item.pricing.price);
    const byPpm = [...selected].sort((a, b) => b.item.pricing.pricePerMeter - a.item.pricing.pricePerMeter);
    const topSimilar = [...selected]
      .sort((a, b) => {
        const areaA = Math.abs(a.item.property.area - subject.property.area);
        const areaB = Math.abs(b.item.property.area - subject.property.area);
        return areaA - areaB || a.distanceMeters - b.distanceMeters;
      })
      .slice(0, 5)
      .map(({ item, distanceMeters }) => ({
        token: item.token,
        url: item.url,
        coordinates: roundedPoint(coordinatePoint(item)),
        area: item.property.area,
        rooms: item.property.rooms,
        askingPrice: item.pricing.price,
        pricePerMeter: item.pricing.pricePerMeter,
        distanceMeters: Math.round(distanceMeters),
      }));

    const ppmValues = selected.map(({ item }) => item.pricing.pricePerMeter);
    return {
      mode: "coordinates",
      center: roundedPoint(center),
      radiusMeters,
      count: selected.length,
      medianPricePerMeter: ppmValues.length ? Math.round(quantile(ppmValues, 0.5)) : null,
      p25PricePerMeter: ppmValues.length ? Math.round(quantile(ppmValues, 0.25)) : null,
      p75PricePerMeter: ppmValues.length ? Math.round(quantile(ppmValues, 0.75)) : null,
      subjectPricePercentile: percentileRank(ppmValues, subject.pricing.pricePerMeter),
      highestAskingPrice: byPrice[0]
        ? { token: byPrice[0].item.token, price: byPrice[0].item.pricing.price, distanceMeters: Math.round(byPrice[0].distanceMeters), url: byPrice[0].item.url }
        : null,
      highestPricePerMeter: byPpm[0]
        ? { token: byPpm[0].item.token, pricePerMeter: byPpm[0].item.pricing.pricePerMeter, distanceMeters: Math.round(byPpm[0].distanceMeters), url: byPpm[0].item.url }
        : null,
      topSimilar,
    };
  }

  predictionFor(listing, spatialArea) {
    if (!saleEligible(listing) || !coordinatePoint(listing)) return null;
    const features = saleFeatures(listing);
    const areaModelKey = modelKeyFor(listing, this.spatialCellSizeMeters);
    const areaModel = areaModelKey ? this.models.get(areaModelKey) : null;
    const globalModel = this.models.get("global:sale");
    const selected = areaModel?.state.count >= this.minModelSample
      ? { model: areaModel, scope: "coordinate-cell" }
      : globalModel?.state.count >= this.minModelSample
        ? { model: globalModel, scope: "global" }
        : null;

    if (selected) {
      const predicted = selected.model.predict(features);
      if (!predicted) return null;
      const predictedPricePerMeter = Math.round(predicted.value);
      const sigma = predicted.standardDeviation;
      return {
        method: "online-ridge-experimental",
        scope: selected.scope,
        modelSampleCount: selected.model.state.count,
        predictedPricePerMeter,
        predictedPrice: Math.round(predictedPricePerMeter * listing.property.area),
        interval: sigma === null ? null : {
          low: Math.round(Math.exp(predicted.logValue - 1.645 * sigma) * listing.property.area),
          high: Math.round(Math.exp(predicted.logValue + 1.645 * sigma) * listing.property.area),
          level: 0.9,
        },
        validationStatus: "experimental-not-holdout-approved",
      };
    }

    if (spatialArea?.published && Number.isFinite(spatialArea.pricePerMeter.median)) {
      return {
        method: "coordinate-cell-median-baseline",
        scope: "coordinate-cell",
        modelSampleCount: spatialArea.pricePerMeter.count,
        predictedPricePerMeter: spatialArea.pricePerMeter.median,
        predictedPrice: Math.round(spatialArea.pricePerMeter.median * listing.property.area),
        interval: {
          low: Math.round((spatialArea.pricePerMeter.p25 || spatialArea.pricePerMeter.median) * listing.property.area),
          high: Math.round((spatialArea.pricePerMeter.p75 || spatialArea.pricePerMeter.median) * listing.property.area),
          level: null,
        },
        validationStatus: "descriptive-baseline",
      };
    }
    return null;
  }

  analyzeListing(listingOrToken) {
    const listing = typeof listingOrToken === "string"
      ? this.store.getListing(listingOrToken)
      : listingOrToken;
    if (!listing) return null;
    const hasCoordinates = Boolean(coordinatePoint(listing));
    const spatialArea = this.spatialAreaFor(listing);
    const nearby = this.nearbyComparables(listing);
    const prediction = this.predictionFor(listing, spatialArea);
    const warnings = [];
    if (!inScope(listing)) warnings.push("Only buy-apartment listings are included in the current model.");
    else if (!saleEligible(listing)) warnings.push("The apartment sale is missing fields required for scoring.");
    if (!hasCoordinates) warnings.push("Coordinates are required; text-based city, district, and neighborhood fallbacks are disabled.");
    if (hasCoordinates && !spatialArea?.published) warnings.push(`Coordinate-cell sample is below ${this.minSpatialSample}.`);
    if (nearby.count < 5) warnings.push("Fewer than five coordinate-based comparable listings are available within 5 km.");
    if (prediction?.validationStatus === "experimental-not-holdout-approved") {
      warnings.push("Online regression is experimental and has not passed a time-based holdout gate.");
    }

    const base = {
      schemaVersion: "1.1.0",
      generatedAt: new Date().toISOString(),
      token: listing.token,
      area: spatialArea,
      nearby,
      prediction: null,
      score: null,
      components: {},
      warnings,
    };
    if (!saleEligible(listing)) return { ...base, status: "ineligible" };
    if (!hasCoordinates || !prediction) return { ...base, status: "insufficient-data" };

    const asking = listing.pricing.price;
    const modelGapPct = ((asking - prediction.predictedPrice) / prediction.predictedPrice) * 100;
    const comparablePrice = Number.isFinite(nearby.medianPricePerMeter)
      ? nearby.medianPricePerMeter * listing.property.area
      : null;
    const comparableGapPct = comparablePrice
      ? ((asking - comparablePrice) / comparablePrice) * 100
      : null;
    const modelValue = clamp(50 - modelGapPct * 1.5, 0, 100);
    const comparableValue = comparableGapPct === null
      ? 25
      : clamp(50 - comparableGapPct * 1.5, 0, 100);
    const localPosition = nearby.subjectPricePercentile === null
      ? 25
      : clamp(100 - nearby.subjectPricePercentile, 0, 100);
    const sampleConfidence = clamp((prediction.modelSampleCount / this.minModelSample) * 60, 0, 60);
    const comparableConfidence = clamp((nearby.count / 15) * 40, 0, 40);
    const confidence = sampleConfidence + comparableConfidence;
    const ageHours = (Date.now() - Date.parse(listing.lastSeenAt)) / 3_600_000;
    const freshness = clamp(100 - ageHours / 2, 0, 100);
    const completeness = clamp(listing.quality?.score || 0, 0, 100);
    const components = {
      modelValue: Math.round(modelValue),
      comparableValue: Math.round(comparableValue),
      localMarketPosition: Math.round(localPosition),
      confidence: Math.round(confidence),
      freshness: Math.round(freshness),
      completeness: Math.round(completeness),
    };
    const score = Math.round(
      components.modelValue * 0.35 +
      components.comparableValue * 0.25 +
      components.localMarketPosition * 0.1 +
      components.confidence * 0.15 +
      components.freshness * 0.1 +
      components.completeness * 0.05,
    );

    return {
      ...base,
      status: "scored",
      prediction: {
        ...prediction,
        askingPrice: asking,
        askingVsPredictionPct: Number(modelGapPct.toFixed(2)),
        askingVsNearbyPct: comparableGapPct === null ? null : Number(comparableGapPct.toFixed(2)),
      },
      score,
      components,
    };
  }

  recommendations(limit = 20) {
    return this.store.getListings()
      .map((listing) => ({ listing, analysis: this.analyzeListing(listing) }))
      .filter(({ analysis }) => analysis?.status === "scored")
      .sort((left, right) => right.analysis.score - left.analysis.score)
      .slice(0, Math.max(1, Math.min(100, limit)))
      .map(({ listing, analysis }) => ({
        token: listing.token,
        url: listing.url,
        title: listing.title,
        coordinates: roundedPoint(coordinatePoint(listing)),
        spatialAreaId: analysis.area?.area.id ?? null,
        askingPrice: listing.pricing.price,
        score: analysis.score,
        components: analysis.components,
        nearby: {
          count: analysis.nearby.count,
          radiusMeters: analysis.nearby.radiusMeters,
          subjectPricePercentile: analysis.nearby.subjectPricePercentile,
        },
        prediction: analysis.prediction,
        warnings: analysis.warnings,
      }));
  }

  publicSnapshot() {
    const storedListings = this.store.getListings();
    const listings = storedListings.filter(inScope);
    const coordinateCount = listings.filter(coordinatePoint).length;
    const modelSummaries = Object.fromEntries(
      [...this.models.entries()].map(([key, model]) => [key, {
        featureVersion: model.state.featureVersion,
        count: model.state.count,
        updatedAt: model.state.updatedAt,
        status: model.state.count >= this.minModelSample ? "experimental-ready" : "collecting",
        minimumRequired: this.minModelSample,
      }]),
    );
    return {
      schemaVersion: "1.1.0",
      generatedAt: new Date().toISOString(),
      mode: "live-incremental-coordinate-based",
      listingCount: listings.length,
      excludedOutOfScope: storedListings.length - listings.length,
      categoryScope: "buy-residential-apartment",
      coordinateCoverage: {
        available: coordinateCount,
        missing: listings.length - coordinateCount,
        percentage: listings.length ? Number((coordinateCount / listings.length * 100).toFixed(2)) : 0,
      },
      spatialCellSizeMeters: this.spatialCellSizeMeters,
      spatialAreas: this.spatialMetrics(),
      onlineModels: modelSummaries,
      disclaimer: "Scores and predictions are experimental market-ranking aids, not investment advice. Coordinates may be approximate when the source listing masks its exact location.",
    };
  }

  async persistModelState() {
    await this.store.saveModelState({
      schemaVersion: "1.0.0",
      locationModelVersion: LOCATION_MODEL_VERSION,
      spatialCellSizeMeters: this.spatialCellSizeMeters,
      updatedAt: this.updatedAt,
      models: Object.fromEntries([...this.models.entries()].map(([key, model]) => [key, model.toJSON()])),
      seenFingerprints: this.seenFingerprints,
    });
  }
}

export const marketHelpers = {
  inScope,
  transactionType,
  saleEligible,
  coordinatePoint,
  spatialCellFor,
  comparableShape,
};
