import { config } from "./config.js";
import { StructuredLogger } from "./logging/logger.js";
import { JsonMarketStore } from "./storage/jsonStore.js";
import { LiveMarketEngine } from "./analytics/marketEngine.js";
import { PublicCrawler } from "./collector/publicCrawler.js";
import { createAnalyticsServer } from "./api/server.js";

process.chdir(config.serviceRoot);

const logger = new StructuredLogger({
  file: config.paths.logFile,
  level: config.logLevel,
  maxBytes: config.retention.maxLogBytes,
  archives: config.retention.logArchives,
});
await logger.init();

const store = new JsonMarketStore(config.paths, logger, {
  snapshotEvery: config.jsonSnapshotEvery,
});
await store.init();

const analytics = new LiveMarketEngine({
  store,
  logger,
  minSpatialSample: config.analytics.minSpatialSample,
  minModelSample: config.analytics.minModelSample,
  spatialCellSizeMeters: config.analytics.spatialCellSizeMeters,
});
await analytics.init();

const crawler = new PublicCrawler({ config, store, analytics, logger });
const server = createAnalyticsServer({ config, store, analytics, crawler, logger });

let shuttingDown = false;
let crawlTimer = null;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  if (crawlTimer) clearTimeout(crawlTimer);
  logger.warn("service.shutdown", "Analytics service shutdown requested", { signal });
  server.close();
  await crawler.stop().catch((error) => {
    logger.error("service.shutdown.crawler", "Crawler shutdown failed", { error: error.message });
  });
  await store.flush();
  await logger.flush();
}

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));

server.listen(config.port, config.host, () => {
  logger.info("service.ready", "Market analytics JSON server is ready", {
    host: config.host,
    port: config.port,
    autoCrawl: config.autoCrawl,
    crawlIntervalMs: config.crawlIntervalMs,
    dataMode: "live-incremental-json",
    contactMode: "blocked",
  });
  if (config.autoCrawl) {
    const runAutomaticCrawl = async () => {
      if (shuttingDown) return;
      const result = crawler.start();
      logger.info("service.auto-crawl", "Completion-based automatic crawl requested", result);
      await crawler.waitForCompletion();
      if (shuttingDown) return;
      logger.info("service.auto-crawl.scheduled", "Next crawl scheduled after completed run", {
        intervalMs: config.crawlIntervalMs,
        nextRunAt: new Date(Date.now() + config.crawlIntervalMs).toISOString(),
      });
      crawlTimer = setTimeout(() => void runAutomaticCrawl(), config.crawlIntervalMs);
    };
    void runAutomaticCrawl();
  }
});

server.on("error", async (error) => {
  logger.error("service.server.error", "Analytics server failed", { error: error.stack || error.message });
  await shutdown("SERVER_ERROR");
  process.exitCode = 1;
});
