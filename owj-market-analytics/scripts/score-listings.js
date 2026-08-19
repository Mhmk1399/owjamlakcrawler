import fs from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { once } from "node:events";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runScoringPipeline } from "../src/scoring/pipeline.js";

const serviceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const logFile = path.join(serviceRoot, "logs", "scoring.jsonl");

await fs.mkdir(path.dirname(logFile), { recursive: true });
const logStream = createWriteStream(logFile, { flags: "a" });

function log(event) {
  const line = JSON.stringify(event);
  process.stdout.write(`${line}\n`);
  logStream.write(`${line}\n`);
}

try {
  const result = await runScoringPipeline({}, {
    onEvent: log,
    onComplete: ({ report, topListings }) => log({
      timestamp: new Date().toISOString(),
      type: "pipeline.result",
      status: report.status,
      cleaning: report.cleaning,
      modelValidation: report.modelValidation,
      scoring: report.scoring,
      top: topListings.slice(0, 5).map((item) => ({
        rank: item.rank,
        token: item.token,
        score: item.scores.recommendation,
        confidence: item.scores.confidence,
      })),
    }),
  });
  process.stdout.write(`Scored listings: ${result.paths.scoredListings}\n`);
} catch (error) {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
} finally {
  logStream.end();
  await once(logStream, "close");
}
