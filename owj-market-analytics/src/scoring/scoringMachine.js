import { assertNoNulls } from "./cleanListings.js";
import {
  clamp,
  haversineMeters,
  median,
  medianAbsoluteDeviation,
  percentileRank,
  quantile,
  summarize,
  weightedMedian,
} from "./statistics.js";

export const SCORING_VERSION = "location-value-score-v2";

function localEvidence(subject, records) {
  const latitudeWindow = 5_000 / 111_000;
  const longitudeWindow = 5_000 / (111_000 * Math.cos(subject.location.latitude * Math.PI / 180));
  const candidates = [];
  for (const candidate of records) {
    if (candidate.token === subject.token) continue;
    if (Math.abs(candidate.location.latitude - subject.location.latitude) > latitudeWindow) continue;
    if (Math.abs(candidate.location.longitude - subject.location.longitude) > longitudeWindow) continue;
    if (Math.abs(candidate.property.area - subject.property.area) / subject.property.area > 0.3) continue;
    if (Math.abs(candidate.property.rooms - subject.property.rooms) > 1) continue;
    const distanceMeters = haversineMeters(subject.location, candidate.location);
    if (distanceMeters > 5_000) continue;
    candidates.push({ listing: candidate, distanceMeters });
  }
  candidates.sort((left, right) => left.distanceMeters - right.distanceMeters);
  const nearest = candidates.slice(0, 30);
  const logPrices = nearest.map(({ listing }) => Math.log(listing.pricing.askingPricePerMeter));
  const logMedian = median(logPrices);
  const logThreshold = Math.max(0.25, medianAbsoluteDeviation(logPrices) * 1.4826 * 3);
  const robust = nearest.filter(({ listing }) => (
    Math.abs(Math.log(listing.pricing.askingPricePerMeter) - logMedian) <= logThreshold
  ));
  const selected = robust.length >= 5 ? robust : nearest;
  if (!selected.length) {
    return {
      comparableCount: 0,
      radiusMeters: 5_000,
      medianPricePerMeter: 0,
      subjectPricePercentile: 50,
      highestAskingPrice: 0,
      highestToken: "unavailable",
      highestUrl: "unavailable",
      removedOutliers: 0,
      comparables: [],
    };
  }
  const weightedPrices = selected.map(({ listing, distanceMeters }) => ({
    value: listing.pricing.askingPricePerMeter,
    weight: (listing.location.accuracy === "exact" ? 1 : 0.7) / (1 + distanceMeters / 500),
  }));
  const highest = [...selected].sort(
    (left, right) => right.listing.pricing.askingPrice - left.listing.pricing.askingPrice,
  )[0];
  const priceValues = selected.map(({ listing }) => listing.pricing.askingPricePerMeter).sort((a, b) => a - b);
  return {
    comparableCount: selected.length,
    radiusMeters: Math.round(selected.at(-1).distanceMeters),
    medianPricePerMeter: Math.round(weightedMedian(weightedPrices)),
    subjectPricePercentile: Number(percentileRank(
      priceValues,
      subject.pricing.askingPricePerMeter,
    ).toFixed(2)),
    highestAskingPrice: highest.listing.pricing.askingPrice,
    highestToken: highest.listing.token,
    highestUrl: highest.listing.url,
    removedOutliers: nearest.length - selected.length,
    comparables: selected.slice(0, 12).map(({ listing, distanceMeters }) => ({
      token: listing.token,
      url: listing.url,
      title: listing.title,
      neighborhood: listing.neighborhood,
      distanceMeters: Math.round(distanceMeters),
      area: listing.property.area,
      rooms: listing.property.rooms,
      askingPrice: listing.pricing.askingPrice,
      askingPricePerMeter: listing.pricing.askingPricePerMeter,
      coordinateAccuracy: listing.location.accuracy,
      subjectPriceDifferencePct: Number((
        (subject.pricing.askingPricePerMeter - listing.pricing.askingPricePerMeter) /
        listing.pricing.askingPricePerMeter * 100
      ).toFixed(2)),
    })),
  };
}

function scoreBand(score) {
  if (score >= 80) return "strong-value";
  if (score >= 65) return "promising";
  if (score >= 45) return "fair";
  return "weak-value";
}

function explanationFor(item) {
  const output = [];
  if (item.hybridDiscountPct >= 15) output.push("Asking price is materially below the blended benchmark.");
  else if (item.hybridDiscountPct <= -15) output.push("Asking price is materially above the blended benchmark.");
  else output.push("Asking price is close to the blended benchmark.");
  if (item.local.comparableCount >= 15) output.push("Nearby comparable evidence is strong.");
  else if (item.local.comparableCount >= 5) output.push("Nearby comparable evidence is moderate.");
  else output.push("Nearby comparable evidence is limited.");
  if (item.listing.location.accuracy === "approximate") {
    output.push("Location confidence is reduced because Divar supplied an approximate coordinate.");
  }
  if (item.listing.cleaning.imputationCount) {
    output.push(`${item.listing.cleaning.imputationCount} optional fields were imputed and recorded.`);
  }
  return output;
}

export function scoreListings(
  records,
  crossValidatedPredictions,
  model,
  { onEvent = () => {} } = {},
) {
  const actualPpm = records.map((listing) => listing.pricing.askingPricePerMeter);
  const predictionMinimum = quantile(actualPpm, 0.01);
  const predictionMaximum = quantile(actualPpm, 0.99);
  const preliminary = records.map((listing, index) => {
    const local = localEvidence(listing, records);
    const rawModelPrediction = crossValidatedPredictions.get(listing.token);
    const modelPricePerMeter = Math.round(clamp(
      rawModelPrediction,
      predictionMinimum,
      predictionMaximum,
    ));
    const nearbyPricePerMeter = local.medianPricePerMeter || modelPricePerMeter;
    const localBlend = clamp(local.comparableCount / 20, 0, 0.7) *
      (listing.location.accuracy === "exact" ? 1 : 0.8);
    const blendedPricePerMeter = Math.round(
      modelPricePerMeter * (1 - localBlend) + nearbyPricePerMeter * localBlend,
    );
    const asking = listing.pricing.askingPricePerMeter;
    const modelDiscountPct = (modelPricePerMeter - asking) / modelPricePerMeter * 100;
    const nearbyDiscountPct = (nearbyPricePerMeter - asking) / nearbyPricePerMeter * 100;
    const hybridDiscountPct = (blendedPricePerMeter - asking) / blendedPricePerMeter * 100;
    if ((index + 1) % 250 === 0) {
      onEvent({ type: "score.evidence.progress", processed: index + 1, total: records.length });
    }
    return {
      listing,
      local,
      modelPricePerMeter,
      nearbyPricePerMeter,
      blendedPricePerMeter,
      localBlend,
      modelDiscountPct,
      nearbyDiscountPct,
      hybridDiscountPct,
    };
  });

  const modelDiscounts = preliminary.map((item) => item.modelDiscountPct).sort((a, b) => a - b);
  const nearbyDiscounts = preliminary.map((item) => item.nearbyDiscountPct).sort((a, b) => a - b);
  const validationQuality = model.validation.qualityScore;
  const scored = preliminary.map((item) => {
    const modelValue = Math.round(percentileRank(modelDiscounts, item.modelDiscountPct));
    const nearbyValue = Math.round(percentileRank(nearbyDiscounts, item.nearbyDiscountPct));
    const localPosition = Math.round(clamp(100 - item.local.subjectPricePercentile, 0, 100));
    const comparableEvidence = Math.round(clamp(item.local.comparableCount / 20 * 100, 0, 100));
    const locationQuality = item.listing.location.accuracy === "exact" ? 100 : 65;
    const dataQuality = Math.round(clamp(
      100 - item.listing.cleaning.imputationCount * 10 - item.listing.source.missingFields.length * 2,
      35,
      100,
    ));
    const confidence = Math.round(
      validationQuality * 0.3 +
      comparableEvidence * 0.35 +
      locationQuality * 0.2 +
      dataQuality * 0.15,
    );
    const dealValue = Math.round(modelValue * 0.45 + nearbyValue * 0.4 + localPosition * 0.15);
    const confidenceGate = 0.55 + confidence / 100 * 0.45;
    const rawRecommendation = dealValue * confidenceGate;
    const recommendation = Math.round(rawRecommendation);
    const intervalPct = clamp(model.validation.medianAbsolutePercentageError * 1.5, 15, 75);
    const predictedPrice = Math.round(item.blendedPricePerMeter * item.listing.property.area);
    const warnings = [];
    if (item.local.comparableCount < 5) warnings.push("fewer-than-five-nearby-comparables");
    if (item.listing.location.accuracy === "approximate") warnings.push("approximate-coordinate");
    if (item.listing.cleaning.imputed) warnings.push("optional-fields-imputed");
    const output = {
      schemaVersion: "1.0.0",
      scoringVersion: SCORING_VERSION,
      rank: 0,
      token: item.listing.token,
      url: item.listing.url,
      title: item.listing.title,
      neighborhood: item.listing.neighborhood,
      property: item.listing.property,
      amenities: item.listing.amenities,
      location: item.listing.location,
      asking: item.listing.pricing,
      source: item.listing.source,
      cleaning: item.listing.cleaning,
      valuation: {
        method: "cross-validated-geo-ridge-plus-robust-nearby",
        predictedPricePerMeter: item.blendedPricePerMeter,
        predictedPrice,
        predictionRangeLow: Math.round(predictedPrice * (1 - intervalPct / 100)),
        predictionRangeHigh: Math.round(predictedPrice * (1 + intervalPct / 100)),
        modelPricePerMeter: item.modelPricePerMeter,
        nearbyPricePerMeter: item.nearbyPricePerMeter,
        modelDiscountPct: Number(item.modelDiscountPct.toFixed(2)),
        nearbyDiscountPct: Number(item.nearbyDiscountPct.toFixed(2)),
        blendedDiscountPct: Number(item.hybridDiscountPct.toFixed(2)),
        nearbyBlendWeightPct: Number((item.localBlend * 100).toFixed(2)),
        askingVsPrediction: predictedPrice - item.listing.pricing.askingPrice,
      },
      scores: {
        recommendation,
        dealValue,
        modelValue,
        nearbyValue,
        localPosition,
        confidence,
        dataQuality,
        band: scoreBand(recommendation),
      },
      evidence: {
        predictionIsOutOfFold: true,
        modelVersion: model.modelVersion,
        modelValidationMedianErrorPct: model.validation.medianAbsolutePercentageError,
        modelValidationRSquaredLog: model.validation.rSquaredLog,
        comparableCount: item.local.comparableCount,
        comparableRadiusMeters: item.local.radiusMeters,
        removedComparableOutliers: item.local.removedOutliers,
        highestNearbyAskingPrice: item.local.highestAskingPrice,
        highestNearbyToken: item.local.highestToken,
        highestNearbyUrl: item.local.highestUrl,
        comparables: item.local.comparables,
        imputedFields: item.listing.cleaning.imputedFields,
      },
      formula: {
        dealWeights: {
          modelValue: 0.45,
          nearbyValue: 0.4,
          localPosition: 0.15,
        },
        confidenceGateMinimum: 0.55,
        confidenceGateWeight: 0.45,
        appliedConfidenceGate: Number(confidenceGate.toFixed(4)),
        rawRecommendation: Number(rawRecommendation.toFixed(4)),
      },
      warnings,
      explanations: explanationFor(item),
    };
    return assertNoNulls(output, `scored listing ${item.listing.token}`);
  });

  scored.sort((left, right) => (
    right.scores.recommendation - left.scores.recommendation ||
    right.scores.confidence - left.scores.confidence ||
    left.token.localeCompare(right.token)
  ));
  scored.forEach((item, index) => { item.rank = index + 1; });
  return {
    listings: scored,
    summary: {
      scoredCount: scored.length,
      scoreDistribution: summarize(scored.map((item) => item.scores.recommendation)),
      dealValueDistribution: summarize(scored.map((item) => item.scores.dealValue)),
      confidenceDistribution: summarize(scored.map((item) => item.scores.confidence)),
      strongValueCount: scored.filter((item) => item.scores.band === "strong-value").length,
      promisingCount: scored.filter((item) => item.scores.band === "promising").length,
      fairCount: scored.filter((item) => item.scores.band === "fair").length,
      weakValueCount: scored.filter((item) => item.scores.band === "weak-value").length,
      exactCoordinateCount: scored.filter((item) => item.location.accuracy === "exact").length,
      approximateCoordinateCount: scored.filter((item) => item.location.accuracy === "approximate").length,
    },
  };
}

export const scoringHelpers = { localEvidence, scoreBand };
