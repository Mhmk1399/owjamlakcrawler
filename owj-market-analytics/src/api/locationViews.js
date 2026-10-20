import { locationHierarchy } from "../locations/hierarchy.js";

function median(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function listingBelongsTo(node, listing) {
  const location = listing.resolvedLocation;
  if (node.type === "0") return true;
  if (node.type === "1") return location?.provinceId === node.id;
  if (node.type === "2") return location?.cityId === node.id;
  if (node.type === "4") return location?.neighborhoodId === node.id;
  return location?.slug === node.slug;
}

function summarize(listings, scoreByToken) {
  const scores = listings.map((item) => scoreByToken.get(item.token)?.scores?.recommendation).filter(Number.isFinite);
  return {
    listingCount: listings.length,
    medianPrice: median(listings.map((item) => item.pricing?.price)),
    medianPricePerMeter: median(listings.map((item) => item.pricing?.pricePerMeter)),
    averageScore: scores.length ? Number((scores.reduce((sum, score) => sum + score, 0) / scores.length).toFixed(1)) : null,
    scoreDistribution: {
      strong: scores.filter((score) => score >= 75).length,
      promising: scores.filter((score) => score >= 55 && score < 75).length,
      fair: scores.filter((score) => score >= 35 && score < 55).length,
      weak: scores.filter((score) => score < 35).length,
      unscored: listings.length - scores.length,
    },
  };
}

export function buildLocationView({ identifier = "iran", listings = [], scoredListings = [] } = {}) {
  const node = /^\d+$/.test(String(identifier))
    ? locationHierarchy.getNodeById(identifier)
    : locationHierarchy.getNodeBySlug(identifier);
  if (!node) return null;
  const scoreByToken = new Map(scoredListings.map((item) => [item.token, item]));
  const matching = listings.filter((listing) => listingBelongsTo(node, listing));
  const children = locationHierarchy.getChildren(node.id).map((child) => {
    const childListings = listings.filter((listing) => listingBelongsTo(child, listing));
    return { ...child, summary: summarize(childListings, scoreByToken) };
  });
  return {
    schemaVersion: "1.0.0",
    generatedAt: new Date().toISOString(),
    node,
    breadcrumb: locationHierarchy.getPath(node.id),
    summary: summarize(matching, scoreByToken),
    children,
    listings: matching.slice(0, 200).map((listing) => {
      const scored = scoreByToken.get(listing.token);
      return {
        token: listing.token, url: listing.url, title: listing.title,
        neighborhood: listing.neighborhood, resolvedLocation: listing.resolvedLocation,
        area: listing.property?.area ?? null, price: listing.pricing?.price ?? null,
        pricePerMeter: listing.pricing?.pricePerMeter ?? null,
        score: scored?.scores?.recommendation ?? null, scoreBand: scored?.scores?.band ?? null,
      };
    }),
  };
}

export const locationViewHelpers = { median, listingBelongsTo, summarize };
