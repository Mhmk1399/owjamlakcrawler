import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { CheckpointRecord, LabConfig } from "./types.js";
import { generateReport } from "./report-generator.js";

const labRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const config = JSON.parse(await readFile(path.join(labRoot, "config", "experiment.json"), "utf8")) as LabConfig;
const resultRoot = path.resolve(labRoot, config.resultsDirectory);
const experimentDirectories = await readdir(resultRoot).catch(() => []);
const byLastModified = await Promise.all(experimentDirectories.map(async (name) => ({
  name, modified: (await stat(path.join(resultRoot, name)).catch(() => null))?.mtimeMs ?? 0,
})));
const mostRecent = byLastModified.sort((a, b) => b.modified - a.modified)[0]?.name;
const id = process.argv[2] ?? mostRecent;
if (!id || !/^experiment-[a-zA-Z0-9-]+$/.test(id)) {
  console.error("No experiment found. Pass a valid experiment ID.");
  process.exitCode = 1;
} else {
  const experimentDirectory = path.join(resultRoot, id);
  if (!(await stat(experimentDirectory).catch(() => null))?.isDirectory()) {
    console.error(`Unknown experiment: ${id}`);
    process.exitCode = 1;
  } else {
    const previous = JSON.parse(await readFile(path.join(experimentDirectory, "session-report.json"), "utf8")) as {
      startedAt: string | null; checkpoints: CheckpointRecord[];
    };
    await generateReport(experimentDirectory, id, config,
      previous.startedAt ? Date.parse(previous.startedAt) : null, previous.checkpoints);
    console.log(`Reports generated in ${experimentDirectory}`);
  }
}
