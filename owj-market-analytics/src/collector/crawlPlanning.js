export function rotate(items, offset = 0) {
  if (!items.length) return [];
  const start = ((Math.floor(offset) % items.length) + items.length) % items.length;
  return [...items.slice(start), ...items.slice(0, start)];
}

export function planAdaptivePartitions(partitions, listings, {
  totalBudget,
  maxAreas = 0,
  offset = 0,
  minimumPerArea = 1,
} = {}) {
  const rotated = rotate(partitions, offset);
  const selected = maxAreas > 0 ? rotated.slice(0, Math.floor(maxAreas)) : rotated;
  if (!selected.length) return { partitions: [], nextOffset: 0, totalBudget: 0 };
  const budget = Math.max(selected.length * minimumPerArea, Math.floor(totalBudget));
  const now = Date.now();
  const byArea = new Map();
  for (const listing of listings) {
    const id = Number(listing.crawlPartition?.area?.id);
    if (!Number.isInteger(id)) continue;
    const bucket = byArea.get(id) || { count: 0, stale: 0, weak: 0 };
    bucket.count += 1;
    if (now - Date.parse(listing.lifecycle?.detailFetchedAt || listing.lastSeenAt) > 24 * 3_600_000) bucket.stale += 1;
    if (listing.quality?.outcome !== "scoring-ready") bucket.weak += 1;
    byArea.set(id, bucket);
  }
  const weighted = selected.map((partition) => {
    const stats = byArea.get(Number(partition.area.id)) || { count: 0, stale: 0, weak: 0 };
    const shortage = 1 / Math.sqrt(stats.count + 1);
    const staleRate = stats.count ? stats.stale / stats.count : 1;
    const weakRate = stats.count ? stats.weak / stats.count : 1;
    return { partition, weight: 1 + shortage * 2 + staleRate + weakRate * 0.5 };
  });
  const remaining = Math.max(0, budget - selected.length * minimumPerArea);
  const weightTotal = weighted.reduce((sum, item) => sum + item.weight, 0) || 1;
  let assigned = selected.length * minimumPerArea;
  const planned = weighted.map((item) => {
    const extra = Math.floor(remaining * item.weight / weightTotal);
    assigned += extra;
    return { ...item.partition, limit: minimumPerArea + extra };
  });
  for (let index = 0; assigned < budget; index = (index + 1) % planned.length) {
    planned[index].limit += 1;
    assigned += 1;
  }
  return {
    partitions: planned,
    nextOffset: partitions.length ? (offset + selected.length) % partitions.length : 0,
    totalBudget: assigned,
  };
}

export class RequestBudget {
  constructor({ maxPerRun = 5_000, maxPerMinute = 45, now = () => Date.now(), sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)) } = {}) {
    this.maxPerRun = maxPerRun;
    this.maxPerMinute = maxPerMinute;
    this.now = now;
    this.total = 0;
    this.byKind = {};
    this.timestamps = [];
    this.sleep = sleep;
  }

  async acquire(kind) {
    if (this.total >= this.maxPerRun) return this.record(kind);
    const now = this.now();
    this.timestamps = this.timestamps.filter((time) => now - time < 60_000);
    if (this.timestamps.length >= this.maxPerMinute) {
      const waitMs = Math.max(1, 60_000 - (now - this.timestamps[0]) + 10);
      await this.sleep(waitMs);
    }
    return this.record(kind);
  }

  record(kind) {
    const now = this.now();
    this.timestamps = this.timestamps.filter((time) => now - time < 60_000);
    if (this.total >= this.maxPerRun) throw Object.assign(new Error("Per-run public request budget exhausted"), { code: "request-budget-exhausted" });
    if (this.timestamps.length >= this.maxPerMinute) throw Object.assign(new Error("Per-minute public request budget exhausted"), { code: "request-rate-budget-exhausted" });
    this.total += 1;
    this.timestamps.push(now);
    this.byKind[kind] = (this.byKind[kind] || 0) + 1;
    return this.snapshot();
  }

  snapshot() { return { total: this.total, lastMinute: this.timestamps.length, byKind: { ...this.byKind }, maxPerRun: this.maxPerRun, maxPerMinute: this.maxPerMinute }; }
}
