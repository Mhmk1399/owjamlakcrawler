function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function percentage(count, total) {
  return total ? round(count / total * 100) : 0;
}

function average(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

export function buildScoreDetail(document, token) {
  const listing = document?.listings?.find((item) => item.token === token);
  if (!listing) return null;
  const total = document.listings.length;
  return {
    schemaVersion: "1.0.0",
    generatedAt: document.generatedAt,
    scoringVersion: document.scoringVersion,
    modelValidation: document.modelValidation,
    valuationValidation: document.valuationValidation || document.summary?.valuationValidation || document.modelValidation,
    population: {
      total,
      rank: listing.rank,
      topPercent: total ? round(listing.rank / total * 100) : 0,
      outranksPercent: total > 1 ? round((total - listing.rank) / (total - 1) * 100) : 100,
      scoreDistribution: document.summary?.scoreDistribution || {},
    },
    listing,
  };
}

export function buildScoringAnalytics(document, report = {}) {
  const listings = document?.listings || [];
  const total = listings.length;
  const bins = Array.from({ length: 10 }, (_, index) => ({
    minimum: index * 10,
    maximum: index === 9 ? 100 : index * 10 + 9,
    label: index === 9 ? "90–100" : `${index * 10}–${index * 10 + 9}`,
    count: 0,
  }));
  for (const listing of listings) {
    const index = Math.min(9, Math.max(0, Math.floor(listing.scores.recommendation / 10)));
    bins[index].count += 1;
  }
  for (const bin of bins) bin.percentage = percentage(bin.count, total);

  const bandDefinitions = [
    ["strong-value", "Strong value", 80, 100],
    ["promising", "Promising", 65, 79],
    ["fair", "Fair", 45, 64],
    ["weak-value", "Weak value", 0, 44],
  ];
  const bands = bandDefinitions.map(([key, label, minimum, maximum]) => {
    const count = listings.filter((item) => item.scores.band === key).length;
    return { key, label, minimum, maximum, count, percentage: percentage(count, total) };
  });

  const byNeighborhood = new Map();
  for (const listing of listings) {
    const bucket = byNeighborhood.get(listing.neighborhood) || [];
    bucket.push(listing);
    byNeighborhood.set(listing.neighborhood, bucket);
  }
  const neighborhoods = [...byNeighborhood.entries()].map(([name, rows]) => ({
    name,
    count: rows.length,
    averageScore: round(average(rows.map((item) => item.scores.recommendation)), 1),
    averageConfidence: round(average(rows.map((item) => item.scores.confidence)), 1),
    averagePropertyQuality: round(average(rows.map((item) => item.scores.propertyQuality)), 1),
    averageRisk: round(average(rows.map((item) => item.scores.risk)), 1),
    averageAskingPricePerMeter: Math.round(average(rows.map((item) => item.asking.askingPricePerMeter))),
    averageModelDiscountPct: round(average(rows.map((item) => item.valuation.modelDiscountPct)), 1),
    strongValueCount: rows.filter((item) => item.scores.band === "strong-value").length,
    highRiskCount: rows.filter((item) => item.scores.risk >= 55).length,
  })).filter((item) => item.count >= 5)
    .sort((left, right) => right.count - left.count || right.averageScore - left.averageScore)
    .slice(0, 30);

  const summary = document?.summary || {};
  const exact = summary.exactCoordinateCount || 0;
  const approximate = summary.approximateCoordinateCount || 0;
  return {
    schemaVersion: "1.0.0",
    generatedAt: document?.generatedAt || "unknown",
    scoringVersion: document?.scoringVersion || "unknown",
    total,
    modelValidation: document?.modelValidation || {},
    valuationValidation: document?.valuationValidation || document?.summary?.valuationValidation || document?.modelValidation || {},
    distributions: {
      score: summary.scoreDistribution || {},
      dealValue: summary.dealValueDistribution || {},
      confidence: summary.confidenceDistribution || {},
      propertyQuality: summary.propertyQualityDistribution || {},
      risk: summary.riskDistribution || {},
      highRiskCount: summary.highRiskCount || 0,
      histogram: bins,
      bands,
    },
    coordinates: {
      exact,
      approximate,
      exactPercentage: percentage(exact, total),
      approximatePercentage: percentage(approximate, total),
    },
    cleaning: report.cleaning || {
      inputCount: total,
      acceptedCount: total,
      rejectedCount: 0,
      recordsWithImputation: 0,
      rejectionCounts: {},
      imputationCounts: {},
    },
    neighborhoods,
    methodology: {
      target: "Public asking price per square metre",
      validation: "Five-fold cross-fitted model with subject-excluded adjusted comparables",
      recommendationFormula: "deal value × confidence gate × risk gate",
      limitations: [
        "Divar asking prices are not verified completed sale prices.",
        "Approximate coordinates represent privacy-shifted locations and reduce confidence.",
        "The model ranks listings inside this collected dataset; it is not investment advice.",
      ],
    },
  };
}
