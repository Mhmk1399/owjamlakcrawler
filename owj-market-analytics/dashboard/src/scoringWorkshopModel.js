export const DEFAULT_SCORING_CONFIG = Object.freeze({
  modelValue: 45, nearbyValue: 40, localPosition: 15,
  valuationWeight: 70, propertyWeight: 20, neighborhoodWeight: 10,
  confidenceFloor: 55, riskPenalty: 40,
  elevatorYes: 8, elevatorNo: -8, parkingYes: 10, parkingNo: -10,
  storageYes: 5, storageNo: -4, balconyYes: 3, balconyNo: -2,
  basementPenalty: -15, groundFloorPenalty: -5,
  floorAboveSecondPenalty: -2, noElevatorHighFloorPenalty: -4, topFloorPenalty: -4,
  newBuildBonus: 5, agePerYearPenalty: -0.45,
  singleUnitBonus: 4, extraUnitPenalty: -1,
  areaPer25Sqm: 1, roomPoint: 1,
  strongThreshold: 80, promisingThreshold: 65, fairThreshold: 45,
  neighborhoodScores: {},
});

const LEGACY_CONFIG = Object.freeze({ ...DEFAULT_SCORING_CONFIG, valuationWeight: 100, propertyWeight: 0, neighborhoodWeight: 0 });
export const SCORING_PRESETS = Object.freeze({
  detailed: { label: "پیشنهاد کامل", values: DEFAULT_SCORING_CONFIG },
  baseline: { label: "روش فعلی سامانه", values: LEGACY_CONFIG },
  conservative: { label: "سخت‌گیرانه", values: { ...DEFAULT_SCORING_CONFIG, valuationWeight: 65, propertyWeight: 15, neighborhoodWeight: 20, confidenceFloor: 45, riskPenalty: 55 } },
  local: { label: "تأکید بر محله", values: { ...DEFAULT_SCORING_CONFIG, modelValue: 25, nearbyValue: 50, localPosition: 25, valuationWeight: 60, propertyWeight: 15, neighborhoodWeight: 25 } },
});

const clamp = (value, minimum = 0, maximum = 100) => Math.max(minimum, Math.min(maximum, Number(value) || 0));
const amenityPoints = (value, yes, no) => value === 1 ? yes : value === 0 ? no : (yes + no) / 2;

export function scoreBand(score, config) {
  if (score >= config.strongThreshold) return "strong-value";
  if (score >= config.promisingThreshold) return "promising";
  if (score >= config.fairThreshold) return "fair";
  return "weak-value";
}

export function deriveNeighborhoodScores(listings) {
  const buckets = new Map();
  for (const listing of listings) {
    if (!Number.isFinite(listing.askingPricePerMeter)) continue;
    const values = buckets.get(listing.neighborhood) || [];
    values.push(listing.askingPricePerMeter); buckets.set(listing.neighborhood, values);
  }
  const rows = [...buckets].map(([name, values]) => {
    values.sort((a, b) => a - b);
    return { name, count: values.length, medianPricePerMeter: values[Math.floor(values.length / 2)] };
  }).sort((a, b) => a.medianPricePerMeter - b.medianPricePerMeter);
  return Object.fromEntries(rows.map((row, index) => {
    const percentile = rows.length <= 1 ? 50 : index / (rows.length - 1) * 100;
    const marketScore = 20 + percentile * 0.8;
    const reliability = Math.min(1, row.count / 20);
    return [row.name, { ...row, score: Math.round(50 + (marketScore - 50) * reliability) }];
  }));
}

export function calculatePropertyScore(listing, config) {
  const property = listing.property || {};
  const amenities = listing.amenities || {};
  const floor = Number(property.floor) || 0;
  const contributions = {
    elevator: amenityPoints(amenities.elevator, config.elevatorYes, config.elevatorNo),
    parking: amenityPoints(amenities.parking, config.parkingYes, config.parkingNo),
    storage: amenityPoints(amenities.storage, config.storageYes, config.storageNo),
    balcony: amenityPoints(amenities.balcony, config.balconyYes, config.balconyNo),
    floor: floor < 0 ? config.basementPenalty : floor === 0 ? config.groundFloorPenalty :
      floor > 2 ? (floor - 2) * config.floorAboveSecondPenalty : 0,
    noElevatorHighFloor: floor >= 3 && amenities.elevator === 0 ?
      (floor - 2) * config.noElevatorHighFloorPenalty : 0,
    topFloor: property.isTopFloor ? config.topFloorPenalty : 0,
    age: -(Number(property.buildingAge) || 0) * Math.abs(config.agePerYearPenalty),
    newBuild: property.isNewBuild ? config.newBuildBonus : 0,
    unitDensity: property.isSingleUnitFloor ? config.singleUnitBonus :
      -Math.max(0, (Number(property.unitsPerFloor) || 1) - 1) * Math.abs(config.extraUnitPenalty),
    area: ((Number(property.area) || 75) - 75) / 25 * config.areaPer25Sqm,
    rooms: ((Number(property.rooms) || 2) - 2) * config.roomPoint,
  };
  const adjustment = Object.values(contributions).reduce((sum, value) => sum + value, 0);
  return { score: Math.round(clamp(50 + adjustment)), adjustment: Number(adjustment.toFixed(1)), contributions };
}

export function calculateScenario(listings, config = DEFAULT_SCORING_CONFIG) {
  const dealWeightTotal = config.modelValue + config.nearbyValue + config.localPosition;
  const overallWeightTotal = config.valuationWeight + config.propertyWeight + config.neighborhoodWeight;
  const dealDenominator = dealWeightTotal || 1;
  const overallDenominator = overallWeightTotal || 1;
  const derivedNeighborhoods = deriveNeighborhoodScores(listings);
  const rows = listings.map((listing) => {
    const calculatedDealValue = (listing.scores.modelValue * config.modelValue + listing.scores.nearbyValue * config.nearbyValue +
      listing.scores.localPosition * config.localPosition) / dealDenominator;
    const dealValue = config.modelValue === 45 && config.nearbyValue === 40 && config.localPosition === 15 &&
      Number.isFinite(listing.scores.dealValue) ? listing.scores.dealValue : calculatedDealValue;
    const property = calculatePropertyScore(listing, config);
    const derivedNeighborhood = derivedNeighborhoods[listing.neighborhood]?.score ?? 50;
    const neighborhoodScore = clamp(config.neighborhoodScores?.[listing.neighborhood] ?? derivedNeighborhood);
    const composite = (dealValue * config.valuationWeight + property.score * config.propertyWeight +
      neighborhoodScore * config.neighborhoodWeight) / overallDenominator;
    const confidenceGate = clamp(config.confidenceFloor) / 100 + listing.scores.confidence / 100 *
      (1 - clamp(config.confidenceFloor) / 100);
    const riskGate = 1 - listing.scores.risk / 100 * clamp(config.riskPenalty) / 100;
    const recommendation = Math.round(clamp(composite * confidenceGate * riskGate));
    return { ...listing, scenario: { dealValue: Math.round(dealValue), property, neighborhoodScore,
      derivedNeighborhoodScore: derivedNeighborhood, composite: Number(composite.toFixed(1)), confidenceGate,
      riskGate, recommendation, band: scoreBand(recommendation, config), rank: 0 } };
  }).sort((left, right) => right.scenario.recommendation - left.scenario.recommendation ||
    right.scores.confidence - left.scores.confidence || left.token.localeCompare(right.token));
  rows.forEach((row, index) => { row.scenario.rank = index + 1; });
  const histogram = Array.from({ length: 10 }, (_, index) => ({ label: index === 9 ? "90–100" : `${index * 10}–${index * 10 + 9}`,
    count: rows.filter((row) => Math.min(9, Math.floor(row.scenario.recommendation / 10)) === index).length }));
  const scores = rows.map((row) => row.scenario.recommendation).sort((a, b) => a - b);
  return { rows, histogram, dealWeightTotal, overallWeightTotal, neighborhoods: derivedNeighborhoods,
    summary: { average: rows.length ? Number((scores.reduce((sum, score) => sum + score, 0) / rows.length).toFixed(1)) : 0,
      median: scores.length ? scores[Math.floor(scores.length / 2)] : 0,
      strong: rows.filter((row) => row.scenario.band === "strong-value").length,
      promising: rows.filter((row) => row.scenario.band === "promising").length,
      fair: rows.filter((row) => row.scenario.band === "fair").length,
      weak: rows.filter((row) => row.scenario.band === "weak-value").length,
      bandChanges: rows.filter((row) => row.scores.band !== row.scenario.band).length,
      topTenChanges: rows.slice(0, 10).filter((row) => row.rank > 10).length } };
}

export const LEGACY_SCORING_CONFIG = LEGACY_CONFIG;
