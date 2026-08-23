import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assertNoNulls, cleanListings, CLEANING_VERSION } from "./cleanListings.js";
import { trainCrossValidatedPriceModel } from "./ridgePriceModel.js";
import { scoreListings, SCORING_VERSION } from "./scoringMachine.js";

const serviceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const DEFAULT_PATHS = Object.freeze({
  input: path.join(serviceRoot, "data", "listings.json"),
  scoringReady: path.join(serviceRoot, "data", "scoring-ready.json"),
  scoredListings: path.join(serviceRoot, "data", "scored-listings.json"),
  model: path.join(serviceRoot, "data", "scoring-model.json"),
  report: path.join(serviceRoot, "data", "scoring-report.json"),
});

async function writeJsonAtomic(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  await fs.writeFile(temporary, JSON.stringify(value, null, 2), "utf8");
  await fs.rename(temporary, file);
}

function invoke(callback, value) {
  if (typeof callback !== "function") return;
  try {
    callback(value);
  } catch {
    // Observability callbacks cannot interrupt deterministic scoring.
  }
}

export async function runScoringPipeline(
  options = {},
  callbacks = {},
) {
  const paths = { ...DEFAULT_PATHS, ...(options.paths || {}) };
  const events = [];
  const emit = (event) => {
    const enriched = { timestamp: new Date().toISOString(), ...event };
    events.push(enriched);
    invoke(callbacks.onEvent, enriched);
    if (event.type.endsWith(".start") || event.type.endsWith(".complete")) {
      invoke(callbacks.onStage, enriched);
    }
    if (event.type.includes("progress") || event.type === "model.fold.complete") {
      invoke(callbacks.onProgress, enriched);
    }
  };

  const startedAt = new Date().toISOString();
  try {
    emit({ type: "pipeline.start", input: paths.input });
    const input = JSON.parse(await fs.readFile(paths.input, "utf8"));
    const sourceListings = Array.isArray(input.listings) ? input.listings : [];
    emit({ type: "clean.start", inputCount: sourceListings.length });
    const cleaned = cleanListings(sourceListings, { onEvent: emit });
    const generatedAt = new Date().toISOString();
    const scoringReadyDocument = assertNoNulls({
      schemaVersion: "1.0.0",
      cleaningVersion: CLEANING_VERSION,
      generatedAt,
      source: {
        file: paths.input,
        updatedAt: typeof input.updatedAt === "string" ? input.updatedAt : "unknown",
      },
      cleaning: cleaned.summary,
      rejected: cleaned.rejected,
      listings: cleaned.records,
    }, "scoring-ready document");
    await writeJsonAtomic(paths.scoringReady, scoringReadyDocument);
    emit({
      type: "clean.complete",
      acceptedCount: cleaned.records.length,
      rejectedCount: cleaned.rejected.length,
      output: paths.scoringReady,
    });

    emit({ type: "model.start", recordCount: cleaned.records.length });
    const trained = trainCrossValidatedPriceModel(cleaned.records, {
      folds: options.folds || 5,
      lambda: options.lambda || 10,
      onEvent: emit,
    });
    const modelDocument = assertNoNulls({
      schemaVersion: "1.0.0",
      generatedAt: new Date().toISOString(),
      model: trained.model,
    }, "scoring model document");
    await writeJsonAtomic(paths.model, modelDocument);
    emit({
      type: "model.complete",
      validation: trained.model.validation,
      output: paths.model,
    });

    emit({ type: "score.start", recordCount: cleaned.records.length });
    const scored = scoreListings(
      cleaned.records,
      trained.predictions,
      trained.model,
      { onEvent: emit },
    );
    const scoredDocument = assertNoNulls({
      schemaVersion: "1.0.0",
      scoringVersion: SCORING_VERSION,
      generatedAt: new Date().toISOString(),
      source: {
        scoringReadyFile: paths.scoringReady,
        modelFile: paths.model,
      },
      modelValidation: trained.model.validation,
      valuationValidation: scored.summary.valuationValidation,
      summary: scored.summary,
      listings: scored.listings,
    }, "scored-listings document");
    await writeJsonAtomic(paths.scoredListings, scoredDocument);
    emit({
      type: "score.complete",
      scoredCount: scored.listings.length,
      distribution: scored.summary.scoreDistribution,
      output: paths.scoredListings,
    });

    const endedAt = new Date().toISOString();
    const report = assertNoNulls({
      schemaVersion: "1.0.0",
      pipelineVersion: `${CLEANING_VERSION}+${SCORING_VERSION}`,
      status: "completed",
      startedAt,
      endedAt,
      durationMs: Math.max(0, Date.parse(endedAt) - Date.parse(startedAt)),
      paths,
      cleaning: cleaned.summary,
      modelValidation: trained.model.validation,
      scoring: scored.summary,
      events,
    }, "scoring report");
    await writeJsonAtomic(paths.report, report);
    const result = { paths, report, topListings: scored.listings.slice(0, 20) };
    invoke(callbacks.onComplete, result);
    return result;
  } catch (error) {
    const failure = {
      timestamp: new Date().toISOString(),
      type: "pipeline.failure",
      error: error.stack || error.message,
    };
    invoke(callbacks.onEvent, failure);
    invoke(callbacks.onError, failure);
    throw error;
  }
}

export const pipelineDefaults = DEFAULT_PATHS;
