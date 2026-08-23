import { assertNoNulls } from "./cleanListings.js";
import {
  clamp,
  haversineMeters,
  mean,
  median,
  medianAbsoluteDeviation,
  percentileRank,
  quantile,
  summarize,
  weightedMedian,
} from "./statistics.js";

export const SCORING_VERSION = "similarity-adjusted-value-score-v3";

function similarityScore(subject, candidate, distanceMeters) {
  const exponential = (difference, scale) => Math.exp(-Math.abs(difference) / scale);
  const sameNeighborhood = subject.neighborhood === candidate.neighborhood;
  const geographic = Math.max(
    sameNeighborhood ? 0.9 : 0,
    exponential(distanceMeters, 1_500),
  );
  const area = exponential(Math.log(candidate.property.area / subject.property.area), 0.16);
  const age = exponential(
    candidate.property.buildingAge - subject.property.buildingAge,
    12,
  );
  const roomDifference = Math.abs(candidate.property.rooms - subject.property.rooms);
  const rooms = roomDifference === 0 ? 1 : roomDifference === 1 ? 0.55 : 0.15;
  const floor = exponential(
    candidate.property.floorRatio - subject.property.floorRatio,
    0.3,
  );
  const amenities = (
    (1 - Math.abs(candidate.amenities.elevator - subject.amenities.elevator)) * 0.3 +
    (1 - Math.abs(candidate.amenities.parking - subject.amenities.parking)) * 0.3 +
    (1 - Math.abs(candidate.amenities.storage - subject.amenities.storage)) * 0.2 +
    (1 - Math.abs(candidate.amenities.balcony - subject.amenities.balcony)) * 0.2
  );
  const unitDensity = exponential(
    Math.log(candidate.property.unitsPerFloor / subject.property.unitsPerFloor),
    0.7,
  );
  return clamp((
    geographic * 0.3 +
    area * 0.25 +
    age * 0.12 +
    rooms * 0.08 +
    floor * 0.1 +
    amenities * 0.1 +
    unitDensity * 0.05
  ) * 100, 0, 100);
}

function localEvidence(subject, records, crossValidatedPredictions = new Map()) {
  const latitudeWindow = 5_000 / 111_000;
  const longitudeWindow = 5_000 / (111_000 * Math.cos(subject.location.latitude * Math.PI / 180));
  const candidates = [];
  for (const candidate of records) {
    if (candidate.token === subject.token) continue;
    if (Math.abs(candidate.location.latitude - subject.location.latitude) > latitudeWindow) continue;
    if (Math.abs(candidate.location.longitude - subject.location.longitude) > longitudeWindow) continue;
    if (Math.abs(Math.log(candidate.property.area / subject.property.area)) > Math.log(1.7)) continue;
    if (Math.abs(candidate.property.rooms - subject.property.rooms) > 2) continue;
    const distanceMeters = haversineMeters(subject.location, candidate.location);
    if (distanceMeters > 5_000) continue;
    const similarity = similarityScore(subject, candidate, distanceMeters);
    if (similarity < 25) continue;
    const subjectModel = crossValidatedPredictions.get(subject.token);
    const candidateModel = crossValidatedPredictions.get(candidate.token);
    const adjustmentFactor = Number.isFinite(subjectModel) && Number.isFinite(candidateModel)
      ? clamp(subjectModel / candidateModel, 0.55, 1.8)
      : 1;
    candidates.push({
      listing: candidate,
      distanceMeters,
      similarity,
      adjustmentFactor,
      adjustedPricePerMeter: Math.round(candidate.pricing.askingPricePerMeter * adjustmentFactor),
    });
  }
  candidates.sort((left, right) => (
    right.similarity - left.similarity || left.distanceMeters - right.distanceMeters
  ));
  const nearest = candidates.slice(0, 30);
  const logPrices = nearest.map(({ adjustedPricePerMeter }) => Math.log(adjustedPricePerMeter));
  const logMedian = median(logPrices);
  const logThreshold = Math.max(0.25, medianAbsoluteDeviation(logPrices) * 1.4826 * 3);
  const robust = nearest.filter(({ adjustedPricePerMeter }) => (
    Math.abs(Math.log(adjustedPricePerMeter) - logMedian) <= logThreshold
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
      averageSimilarity: 0,
      adjustedPriceDispersionPct: 100,
      evidenceStrength: 0,
      comparables: [],
    };
  }
  const weightedPrices = selected.map(({ listing, distanceMeters, similarity, adjustedPricePerMeter }) => ({
    value: adjustedPricePerMeter,
    weight: (similarity / 100) ** 2 *
      (listing.location.accuracy === "exact" ? 1 : 0.75) /
      (1 + distanceMeters / 2_000),
  }));
  const highest = [...selected].sort(
    (left, right) => right.listing.pricing.askingPrice - left.listing.pricing.askingPrice,
  )[0];
  const priceValues = selected.map(({ adjustedPricePerMeter }) => adjustedPricePerMeter).sort((a, b) => a - b);
  const localMedian = weightedMedian(weightedPrices);
  const averageSimilarity = mean(selected.map(({ similarity }) => similarity));
  const adjustedPriceDispersionPct = localMedian
    ? medianAbsoluteDeviation(priceValues) * 1.4826 / localMedian * 100
    : 100;
  const evidenceStrength = clamp(
    Math.min(1, selected.length / 15) *
    (averageSimilarity / 100) *
    clamp(1 - adjustedPriceDispersionPct / 55, 0.25, 1) *
    100,
    0,
    100,
  );
  return {
    comparableCount: selected.length,
    radiusMeters: Math.round(Math.max(...selected.map(({ distanceMeters }) => distanceMeters))),
    medianPricePerMeter: Math.round(localMedian),
    subjectPricePercentile: Number(percentileRank(
      priceValues,
      subject.pricing.askingPricePerMeter,
    ).toFixed(2)),
    highestAskingPrice: highest.listing.pricing.askingPrice,
    highestToken: highest.listing.token,
    highestUrl: highest.listing.url,
    removedOutliers: nearest.length - selected.length,
    averageSimilarity: Number(averageSimilarity.toFixed(2)),
    adjustedPriceDispersionPct: Number(adjustedPriceDispersionPct.toFixed(2)),
    evidenceStrength: Number(evidenceStrength.toFixed(2)),
    comparables: selected.slice(0, 12).map(({
      listing,
      distanceMeters,
      similarity,
      adjustmentFactor,
      adjustedPricePerMeter,
    }) => ({
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
      constructionYear: listing.property.constructionYear,
      floor: listing.property.floor,
      totalFloors: listing.property.totalFloors,
      unitsPerFloor: listing.property.unitsPerFloor,
      elevator: listing.amenities.elevator,
      parking: listing.amenities.parking,
      storage: listing.amenities.storage,
      balcony: listing.amenities.balcony,
      similarity: Number(similarity.toFixed(2)),
      adjustmentFactor: Number(adjustmentFactor.toFixed(4)),
      adjustedPricePerMeter,
      subjectPriceDifferencePct: Number((
        (subject.pricing.askingPricePerMeter - listing.pricing.askingPricePerMeter) /
        listing.pricing.askingPricePerMeter * 100
      ).toFixed(2)),
      subjectAdjustedPriceDifferencePct: Number((
        (subject.pricing.askingPricePerMeter - adjustedPricePerMeter) /
        adjustedPricePerMeter * 100
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
  if (item.local.evidenceStrength >= 70) output.push("Attribute-adjusted nearby comparable evidence is strong.");
  else if (item.local.evidenceStrength >= 40) output.push("Attribute-adjusted nearby comparable evidence is moderate.");
  else output.push("Nearby comparable evidence is limited.");
  if (item.listing.location.accuracy === "approximate") {
    output.push("Location confidence is reduced because Divar supplied an approximate coordinate.");
  }
  if (item.listing.cleaning.imputationCount) {
    output.push(`${item.listing.cleaning.imputationCount} optional fields were imputed and recorded.`);
  }
  if (item.risk >= 55) output.push("The price or evidence pattern is unusual, so the risk gate reduced the recommendation.");
  return output;
}

function propertyQualityScore(listing) {
  const age = clamp(100 - listing.property.buildingAge * 2.2, 10, 100);
  const elevator = listing.property.floor <= 1
    ? 70 + listing.amenities.elevator * 30
    : listing.amenities.elevator * 100;
  const parking = listing.amenities.parking * 100;
  const storage = listing.amenities.storage * 100;
  const balcony = listing.amenities.balcony * 100;
  const floor = listing.property.isBasement
    ? 10
    : listing.property.isGroundFloor
      ? 45
      : listing.property.isTopFloor
        ? 72
        : 85;
  const unitDensity = clamp(110 - listing.property.unitsPerFloor * 15, 25, 100);
  return Math.round(
    age * 0.25 +
    parking * 0.22 +
    elevator * 0.18 +
    storage * 0.1 +
    balcony * 0.07 +
    floor * 0.1 +
    unitDensity * 0.08,
  );
}

function blendedValidation(items) {
  const percentageErrors = items.map((item) => (
    Math.abs(item.blendedPricePerMeter - item.listing.pricing.askingPricePerMeter) /
    item.listing.pricing.askingPricePerMeter * 100
  ));
  const actualLogs = items.map((item) => Math.log(item.listing.pricing.askingPricePerMeter));
  const predictedLogs = items.map((item) => Math.log(item.blendedPricePerMeter));
  const actualMean = mean(actualLogs);
  const totalVariance = actualLogs.reduce((sum, value) => sum + (value - actualMean) ** 2, 0);
  const residualVariance = actualLogs.reduce(
    (sum, value, index) => sum + (value - predictedLogs[index]) ** 2,
    0,
  );
  return {
    method: "cross-fitted-model-plus-subject-excluded-adjusted-comparables",
    sampleCount: items.length,
    medianAbsolutePercentageError: Number(median(percentageErrors).toFixed(2)),
    meanAbsolutePercentageError: Number(mean(percentageErrors).toFixed(2)),
    within20Percent: Number((percentageErrors.filter((value) => value <= 20).length / items.length * 100).toFixed(2)),
    within30Percent: Number((percentageErrors.filter((value) => value <= 30).length / items.length * 100).toFixed(2)),
    rSquaredLog: Number((totalVariance ? 1 - residualVariance / totalVariance : 0).toFixed(4)),
  };
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
    const local = localEvidence(listing, records, crossValidatedPredictions);
    const rawModelPrediction = crossValidatedPredictions.get(listing.token);
    const modelPricePerMeter = Math.round(clamp(
      rawModelPrediction,
      predictionMinimum,
      predictionMaximum,
    ));
    const nearbyPricePerMeter = local.medianPricePerMeter || modelPricePerMeter;
    const localBlend = clamp(local.evidenceStrength / 100 * 0.65, 0, 0.65) *
      (listing.location.accuracy === "exact" ? 1 : 0.85);
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
  const valuationValidation = blendedValidation(preliminary);
  const validationQuality = model.validation.qualityScore;
  const scored = preliminary.map((item) => {
    const modelValue = Math.round(percentileRank(modelDiscounts, item.modelDiscountPct));
    const nearbyValue = Math.round(percentileRank(nearbyDiscounts, item.nearbyDiscountPct));
    const localPosition = Math.round(clamp(100 - item.local.subjectPricePercentile, 0, 100));
    const comparableEvidence = Math.round(item.local.evidenceStrength);
    const locationQuality = item.listing.location.accuracy === "exact" ? 100 : 65;
    const dataQuality = Math.round(clamp(
      100 - item.listing.cleaning.imputationCount * 10 - item.listing.source.missingFields.length * 2,
      35,
      100,
    ));
    const confidence = Math.round(
      validationQuality * 0.25 +
      comparableEvidence * 0.4 +
      locationQuality * 0.15 +
      dataQuality * 0.2,
    );
    const propertyQuality = propertyQualityScore(item.listing);
    const disagreementPct = Math.abs(item.modelPricePerMeter - item.nearbyPricePerMeter) /
      item.blendedPricePerMeter * 100;
    const extremePriceRisk = clamp((Math.abs(item.hybridDiscountPct) - 30) / 40 * 100, 0, 100);
    const disagreementRisk = clamp((disagreementPct - 10) / 35 * 100, 0, 100);
    const dispersionRisk = clamp(item.local.adjustedPriceDispersionPct / 45 * 100, 0, 100);
    const evidenceRisk = 100 - item.local.evidenceStrength;
    const dataRisk = clamp(
      item.listing.cleaning.imputationCount * 9 +
      (item.listing.location.accuracy === "approximate" ? 12 : 0),
      0,
      100,
    );
    const risk = Math.round(
      extremePriceRisk * 0.35 +
      disagreementRisk * 0.2 +
      dispersionRisk * 0.15 +
      evidenceRisk * 0.2 +
      dataRisk * 0.1,
    );
    const dealValue = Math.round(modelValue * 0.45 + nearbyValue * 0.4 + localPosition * 0.15);
    const confidenceGate = 0.55 + confidence / 100 * 0.45;
    const riskGate = 1 - risk / 100 * 0.4;
    const rawRecommendation = dealValue * confidenceGate * riskGate;
    const recommendation = Math.round(rawRecommendation);
    const intervalPct = clamp(valuationValidation.medianAbsolutePercentageError * 1.5, 15, 75);
    const predictedPrice = Math.round(item.blendedPricePerMeter * item.listing.property.area);
    const warnings = [];
    if (item.local.comparableCount < 5) warnings.push("fewer-than-five-nearby-comparables");
    if (item.listing.location.accuracy === "approximate") warnings.push("approximate-coordinate");
    if (item.listing.cleaning.imputed) warnings.push("optional-fields-imputed");
    if (risk >= 55) warnings.push("high-valuation-or-listing-risk");
    if (item.local.adjustedPriceDispersionPct >= 35) warnings.push("high-comparable-price-dispersion");
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
        method: "cross-fitted-hedonic-ridge-plus-similarity-adjusted-nearby",
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
        propertyQuality,
        risk,
        band: scoreBand(recommendation),
      },
      evidence: {
        predictionIsOutOfFold: true,
        modelVersion: model.modelVersion,
        modelValidationMedianErrorPct: model.validation.medianAbsolutePercentageError,
        modelValidationRSquaredLog: model.validation.rSquaredLog,
        valuationValidationMedianErrorPct: valuationValidation.medianAbsolutePercentageError,
        valuationValidationRSquaredLog: valuationValidation.rSquaredLog,
        comparableCount: item.local.comparableCount,
        comparableRadiusMeters: item.local.radiusMeters,
        removedComparableOutliers: item.local.removedOutliers,
        averageComparableSimilarity: item.local.averageSimilarity,
        adjustedComparableDispersionPct: item.local.adjustedPriceDispersionPct,
        comparableEvidenceStrength: item.local.evidenceStrength,
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
        riskGateWeight: 0.4,
        appliedRiskGate: Number(riskGate.toFixed(4)),
        rawRecommendation: Number(rawRecommendation.toFixed(4)),
      },
      warnings,
      explanations: explanationFor({ ...item, risk }),
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
      propertyQualityDistribution: summarize(scored.map((item) => item.scores.propertyQuality)),
      riskDistribution: summarize(scored.map((item) => item.scores.risk)),
      highRiskCount: scored.filter((item) => item.scores.risk >= 55).length,
      strongValueCount: scored.filter((item) => item.scores.band === "strong-value").length,
      promisingCount: scored.filter((item) => item.scores.band === "promising").length,
      fairCount: scored.filter((item) => item.scores.band === "fair").length,
      weakValueCount: scored.filter((item) => item.scores.band === "weak-value").length,
      exactCoordinateCount: scored.filter((item) => item.location.accuracy === "exact").length,
      approximateCoordinateCount: scored.filter((item) => item.location.accuracy === "approximate").length,
      valuationValidation,
    },
  };
}

export const scoringHelpers = { localEvidence, scoreBand };
