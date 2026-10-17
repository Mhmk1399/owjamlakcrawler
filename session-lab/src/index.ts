import { createInterface } from "node:readline";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LabBrowser } from "./browser.js";
import { SessionMonitor } from "./session-monitor.js";
import { NetworkMonitor } from "./network-monitor.js";
import { EventLogger } from "./event-logger.js";
import { CheckpointRunner } from "./checkpoint-runner.js";
import { generateReport } from "./report-generator.js";
import type { ErrorCategory, LabConfig } from "./types.js";

const labRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const config = JSON.parse(await readFile(path.join(labRoot, "config", "experiment.json"), "utf8")) as LabConfig;
const allowedHost = (input: string): boolean => {
  try {
    const host = new URL(input).hostname.toLowerCase();
    return host === "divar.ir" || host.endsWith(".divar.ir");
  } catch { return false; }
};
if (!allowedHost(config.startUrl) || !allowedHost(config.verificationUrl)) {
  throw new Error("For safety, startUrl and verificationUrl must point to divar.ir");
}
if (!Array.isArray(config.checkpointMinutes) ||
    config.checkpointMinutes.some((value) => !Number.isFinite(value) || value < 0)) {
  throw new Error("Invalid checkpointMinutes configuration");
}
if (config.contactObservation?.enabled) {
  throw new Error("Contact observation is not implemented in this session-only lab. Disable it.");
}
const profilePath = path.resolve(labRoot, config.profileDirectory);
const id = `experiment-${new Date().toISOString().slice(0, 10)}-${randomUUID().slice(0, 8)}`;
const experimentDirectory = path.resolve(labRoot, config.resultsDirectory, id);
let startedAt: number | null = null;
let paused = false;
let stoppedForRestriction: ErrorCategory | null = null;
let shuttingDown = false;
let currentCheckpoint: string | null = null;
let authenticationPoll: ReturnType<typeof setInterval> | null = null;
let timers: Array<ReturnType<typeof setTimeout>> = [];

const browser = new LabBrowser(config, profilePath);
const monitor = new SessionMonitor(() => browser.context, () => browser.page);
const logger = new EventLogger(id, experimentDirectory, () => startedAt);
const runner = new CheckpointRunner(browser, monitor, logger, config, () => startedAt);
function safetyStop(category: ErrorCategory): void {
  if (startedAt === null || stoppedForRestriction) return;
  stoppedForRestriction = category;
  paused = true;
  clearTimers();
  console.warn(`\nMonitoring PAUSED after a potential access restriction (${category}). Do not retry or rotate accounts.`);
  void logger.log("SAFETY_STOP", "warn", { errorCategory: category });
}
const network = new NetworkMonitor(logger, () => currentCheckpoint, safetyStop);

function clearTimers(): void {
  for (const timer of timers) clearTimeout(timer);
  timers = [];
}
async function saveReport(): Promise<void> {
  await logger.flush();
  await generateReport(experimentDirectory, id, config, startedAt, runner.records);
}
async function checkpoint(label: string): Promise<void> {
  if (stoppedForRestriction) {
    console.log(`Checkpoint prevented: restriction observed (${stoppedForRestriction}).`);
    return;
  }
  if (paused) { console.log("Checkpoint skipped: monitoring paused."); return; }
  currentCheckpoint = label;
  try {
    const record = await runner.run(label);
    if (record) {
      console.log(`[${label}] ${record.authenticationState}; HTTP ${record.httpStatus ?? "unknown"}; ${record.errorCategory}`);
      if (record.authenticationState === "UNAUTHENTICATED" || record.errorCategory === "AUTHENTICATION_REQUIRED") {
        paused = true;
        clearTimers();
        console.log("Active checks paused: session is no longer confirmed. No automatic OTP login will occur.");
      }
    }
    await saveReport();
  } finally { currentCheckpoint = null; }
}
function schedule(): void {
  clearTimers();
  if (paused || startedAt === null || stoppedForRestriction) return;
  for (const minutes of [...new Set(config.checkpointMinutes)].sort((a, b) => a - b)) {
    if (minutes === 0) continue;
    const delay = startedAt + minutes * 60_000 - Date.now();
    if (delay <= 0) continue; // Don't burst through missed checkpoints.
    const timer = setTimeout(() => {
      if (!paused && !stoppedForRestriction) void checkpoint(`T+${minutes}m`).catch(fatalLog);
    }, delay);
    timers.push(timer);
  }
}
async function startExperiment(source: "automatic" | "manual"): Promise<void> {
  if (startedAt !== null) return;
  startedAt = Date.now();
  await logger.log("LOGIN_CONFIRMED", "info", { confirmationSource: source });
  console.log(`Authentication marked at ${new Date(startedAt).toISOString()}. Starting checkpoints.`);
  schedule();
  await checkpoint("T+0m");
}
function fatalLog(error: unknown): void {
  console.error("Monitoring error:", error instanceof Error ? error.name : "unknown");
  void logger.log("MONITOR_ERROR", "error", { errorType: error instanceof Error ? error.name : "unknown" });
}

await logger.init();
await browser.open();
if (browser.page) network.attach(browser.page);
try { await browser.navigateStart(); }
catch (error) { fatalLog(error); console.log("You can navigate manually in the browser."); }

console.log(`\nSession lab: ${id}`);
console.log("Complete the OTP login MANUALLY in Chromium. The lab never reads OTPs.");
console.log("Commands: help, login, status, checkpoint, mark <label>, restart, pause, resume, report, exit");
console.log(`Reports: ${experimentDirectory}`);

const rl = createInterface({ input: process.stdin, output: process.stdout, prompt: "lab> " });
let pollBusy = false;
authenticationPoll = setInterval(() => {
  if (pollBusy || shuttingDown || stoppedForRestriction) return;
  pollBusy = true;
  void monitor.observeAuthentication().then(async (observation) => {
    if (observation.challengeObserved) {
      if (startedAt !== null) safetyStop("VERIFICATION_REQUIRED");
      else console.warn("Verification challenge observed. No automatic action will be taken.");
      return;
    }
    if (startedAt === null && observation.state === "AUTHENTICATED") await startExperiment("automatic");
  }).catch(fatalLog).finally(() => { pollBusy = false; });
}, Math.max(config.authenticationPollMs, 1000));

async function shutdown(): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  if (authenticationPoll) clearInterval(authenticationPoll);
  clearTimers();
  await logger.log("EXPERIMENT_FINISHED", "info");
  await saveReport();
  network.detach();
  await browser.close();
  rl.close();
  console.log(`Saved: ${experimentDirectory}`);
}

rl.on("line", (raw) => {
  void (async () => {
    const [command, ...args] = raw.trim().split(/\s+/);
    switch (command) {
      case "help":
        console.log("login (manual confirmation), status, checkpoint, mark <label>, restart, pause, resume, report, exit");
        break;
      case "login": {
        if (startedAt !== null) { console.log("Already marked logged in."); break; }
        const observed = await monitor.observeAuthentication();
        if (observed.state === "UNAUTHENTICATED") {
          console.log("Login controls still visible; complete authentication first.");
          break;
        }
        if (observed.challengeObserved) { console.log("Verification challenge detected; cannot confirm login."); break; }
        monitor.setManualAuthentication("AUTHENTICATED");
        await startExperiment("manual");
        break;
      }
      case "status": {
        const snapshot = await monitor.snapshot();
        console.log(JSON.stringify({ experimentId: id, browserRunning: snapshot.browserRunning,
          authenticationState: snapshot.authenticationState, authEvidence: snapshot.authenticationEvidence,
          cookieCount: snapshot.cookieMetadata.length, storageKeys: snapshot.storageMetadata.length,
          elapsedMinutes: startedAt ? ((Date.now() - startedAt) / 60_000).toFixed(1) : null,
          paused, stoppedForRestriction, checkpoints: runner.records.length }, null, 2));
        break;
      }
      case "checkpoint":
        if (startedAt === null) console.log("Log in manually first.");
        else await checkpoint(`manual-${runner.records.length + 1}`);
        break;
      case "mark":
        if (args.length === 0) console.log("Usage: mark <non-sensitive label>");
        else { await logger.log("MANUAL_MARK", "info", { label: args.join(" ") }); console.log("Event marked."); }
        break;
      case "restart":
        if (stoppedForRestriction) { console.log("Safety stop active; restart not permitted."); break; }
        network.detach();
        await browser.restart();
        if (browser.page) network.attach(browser.page);
        await logger.log("BROWSER_RESTART", "info");
        console.log("Browser restarted with the same persistent profile. Run 'checkpoint' to verify session persistence.");
        break;
      case "pause":
        paused = true; clearTimers(); console.log("Active checkpoints paused.");
        break;
      case "resume":
        if (stoppedForRestriction) console.log("Safety stop is active; start a new approved experiment after review.");
        else { paused = false; schedule(); console.log("Remaining future checkpoints scheduled."); }
        break;
      case "report":
        await saveReport(); console.log(`Updated reports: ${experimentDirectory}`);
        break;
      case "exit":
        await shutdown(); break;
      case "": break;
      default: console.log("Unknown command. Type 'help'.");
    }
  })().catch(fatalLog).finally(() => { if (!shuttingDown) rl.prompt(); });
});
rl.on("close", () => { if (!shuttingDown) void shutdown().catch(fatalLog); });
process.on("SIGINT", () => { void shutdown().catch(fatalLog); });
process.on("SIGTERM", () => { void shutdown().catch(fatalLog); });
rl.prompt();
