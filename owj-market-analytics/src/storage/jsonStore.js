import fs from "node:fs/promises";
import path from "node:path";

async function readJson(file, fallback) {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return fallback;
    throw error;
  }
}

async function writeJsonAtomic(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  await fs.writeFile(temporary, JSON.stringify(value, null, 2), "utf8");
  await fs.rename(temporary, file);
}

function safeToken(token) {
  const value = String(token || "");
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error(`Unsafe listing token: ${value}`);
  return value;
}

function migrateListing(listing) {
  if (!listing || typeof listing !== "object" || listing.crawlPartition) return listing;
  return {
    ...listing,
    crawlPartition: {
      category: null,
      expectedSubcategory: listing.subcategory ?? null,
      area: null,
    },
  };
}

export class JsonMarketStore {
  constructor(paths, logger, { snapshotEvery = 25 } = {}) {
    this.paths = paths;
    this.logger = logger;
    this.listings = new Map();
    this.writeQueue = Promise.resolve();
    this.snapshotEvery = snapshotEvery;
    this.pendingSnapshotChanges = 0;
  }

  async init() {
    await fs.mkdir(this.paths.data, { recursive: true });
    await fs.mkdir(this.paths.observations, { recursive: true });
    await fs.mkdir(this.paths.listingRecords, { recursive: true });
    const document = await readJson(this.paths.listings, {
      schemaVersion: "1.0.0",
      updatedAt: null,
      listings: [],
    });
    for (const listing of document.listings || []) {
      if (listing?.token) this.listings.set(listing.token, migrateListing(listing));
    }
    for (const listing of this.listings.values()) {
      const recordFile = path.join(this.paths.listingRecords, `${safeToken(listing.token)}.json`);
      try {
        await fs.access(recordFile);
      } catch {
        await writeJsonAtomic(recordFile, listing);
      }
    }
    const recordNames = await fs.readdir(this.paths.listingRecords).catch((error) => {
      if (error.code === "ENOENT") return [];
      throw error;
    });
    for (const name of recordNames.filter((item) => item.endsWith(".json"))) {
      try {
        const listing = migrateListing(
          await readJson(path.join(this.paths.listingRecords, name), null),
        );
        if (listing?.token) this.listings.set(listing.token, listing);
      } catch (error) {
        this.logger.warn("store.record.invalid", "Ignoring invalid per-listing JSON record", {
          file: name,
          error: error.message,
        });
      }
    }
    this.logger.info("store.ready", "JSON market store loaded", {
      listingCount: this.listings.size,
      path: this.paths.listings,
    });
  }

  getListing(token) {
    return this.listings.get(token) || null;
  }

  getListings() {
    return [...this.listings.values()];
  }

  async upsertListing(listing, runId) {
    const existing = this.listings.get(listing.token);
    const changed = !existing || existing.contentFingerprint !== listing.contentFingerprint;
    const merged = {
      ...listing,
      firstSeenAt: existing?.firstSeenAt || listing.firstSeenAt,
      lastSeenAt: listing.lastSeenAt,
    };
    this.listings.set(listing.token, merged);

    this.writeQueue = this.writeQueue.then(async () => {
      const token = safeToken(listing.token);
      await writeJsonAtomic(path.join(this.paths.listingRecords, `${token}.json`), merged);
      if (changed) {
        const observationFile = path.join(this.paths.observations, `${token}.json`);
        const history = await readJson(observationFile, {
          schemaVersion: "1.0.0",
          token,
          observations: [],
        });
        history.observations.push({
          observedAt: listing.lastSeenAt,
          runId,
          listing: merged,
        });
        await writeJsonAtomic(observationFile, history);
      }
      this.pendingSnapshotChanges += 1;
      if (this.pendingSnapshotChanges >= this.snapshotEvery) {
        await this.writeListingsSnapshot();
      }
    });
    await this.writeQueue;
    return { listing: merged, changed, existed: Boolean(existing) };
  }

  async readModelState() {
    return readJson(this.paths.model, null);
  }

  async saveModelState(value) {
    this.writeQueue = this.writeQueue.then(() => writeJsonAtomic(this.paths.model, value));
    await this.writeQueue;
  }

  async saveAnalytics(value) {
    this.writeQueue = this.writeQueue.then(() => writeJsonAtomic(this.paths.analytics, value));
    await this.writeQueue;
  }

  async readServiceState() {
    return readJson(this.paths.serviceState, null);
  }

  async saveServiceState(value) {
    this.writeQueue = this.writeQueue.then(() => writeJsonAtomic(this.paths.serviceState, value));
    await this.writeQueue;
  }

  async flush() {
    await this.writeQueue;
    await this.writeListingsSnapshot();
  }

  async writeListingsSnapshot() {
    await writeJsonAtomic(this.paths.listings, {
      schemaVersion: "1.0.0",
      updatedAt: new Date().toISOString(),
      listings: this.getListings(),
    });
    this.pendingSnapshotChanges = 0;
  }
}

export const _jsonHelpers = { readJson, writeJsonAtomic, safeToken, migrateListing };
