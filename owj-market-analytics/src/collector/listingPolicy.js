const HOUR = 3_600_000;

export function classifyListingQuality(listing) {
  const reasons = [];
  if (listing?.subcategory !== "buy-residential-apartment") reasons.push("subcategory-out-of-scope");
  if (!Number.isFinite(listing?.property?.area) || listing.property.area <= 0) reasons.push("missing-or-invalid-area");
  if (!Number.isFinite(listing?.pricing?.price) || listing.pricing.price <= 0) reasons.push("missing-or-invalid-price");
  if (!listing?.resolvedLocation || listing.resolvedLocation.matchConfidence === "unmatched") reasons.push("unmatched-location");
  return {
    outcome: reasons.length ? "history-only" : "scoring-ready",
    reasons,
  };
}

export function refreshDecision(existing, {
  now = Date.now(),
  freshHours = 6,
  changedHours = 2,
  staleHours = 24,
} = {}) {
  if (!existing) return { refresh: true, reason: "new-token", ageMs: null };
  const fetchedAt = Date.parse(existing.lifecycle?.detailFetchedAt || existing.lastSeenAt);
  if (!Number.isFinite(fetchedAt)) return { refresh: true, reason: "unknown-freshness", ageMs: null };
  const ageMs = Math.max(0, now - fetchedAt);
  const intervalHours = existing.lifecycle?.status !== "active"
    ? changedHours
    : existing.lifecycle?.lastContentChangedAt === existing.lifecycle?.detailFetchedAt
      ? changedHours
      : existing.quality?.outcome === "history-only" ? staleHours : freshHours;
  return ageMs >= intervalHours * HOUR
    ? { refresh: true, reason: "refresh-due", ageMs, intervalHours }
    : { refresh: false, reason: "recently-refreshed", ageMs, intervalHours };
}

export function nextLifecycleStatus(misses, removalThreshold = 3) {
  if (misses <= 0) return "active";
  if (misses >= removalThreshold) return "removed";
  if (misses >= 2) return "possibly-removed";
  return "not-seen";
}
