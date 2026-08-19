import "dotenv/config";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const botRoot = path.join(projectRoot, "owj-token-bot");
const tokenApiUrl = (process.env.TOKEN_API_URL || "http://127.0.0.1:3456").replace(/\/$/, "");
const pollIntervalMs = 2_000;

let botProcess;
let crawlerProcess;
let shuttingDown = false;

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function spawnNode(label, cwd, entrypoint, extraEnvironment = {}) {
  const child = spawn(process.execPath, [entrypoint], {
    cwd,
    env: { ...process.env, ...extraEnvironment },
    stdio: "inherit",
  });
  child.once("error", (error) => {
    console.error(`[STARTER] ${label} failed to spawn: ${error.message}`);
  });
  return child;
}

async function readHealth() {
  const response = await fetch(`${tokenApiUrl}/health`, {
    signal: AbortSignal.timeout(2_000),
  });
  if (!response.ok) throw new Error(`health check returned HTTP ${response.status}`);
  return response.json();
}

async function waitForBotApi(timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (botProcess?.exitCode !== null) {
      throw new Error(`token bot exited with code ${botProcess.exitCode}`);
    }
    try {
      return await readHealth();
    } catch {
      await delay(500);
    }
  }
  throw new Error(`token bot API did not become ready at ${tokenApiUrl}`);
}

async function waitForActiveToken(initialHealth) {
  let health = initialHealth;
  if (health.activeTokens > 0) return health;

  console.log("[STARTER] Waiting for Telegram login before starting the crawler...");
  console.log("[STARTER] In Telegram, send /login 09xxxxxxxxx and then send the OTP.");

  while (!shuttingDown) {
    if (botProcess?.exitCode !== null) {
      throw new Error(`token bot exited with code ${botProcess.exitCode}`);
    }
    await delay(pollIntervalMs);
    try {
      health = await readHealth();
      if (health.activeTokens > 0) return health;
    } catch {
      // The bot process exit handler or the next poll will report the failure.
    }
  }
  return null;
}

async function sendAlert(message, severity = "info") {
  try {
    await fetch(`${tokenApiUrl}/alert`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source: "starter", severity, message }),
      signal: AbortSignal.timeout(5_000),
    });
  } catch (error) {
    console.error(`[STARTER] Could not send Telegram alert: ${error.message}`);
  }
}

function stopChild(child, signal) {
  if (child && child.exitCode === null && child.signalCode === null) child.kill(signal);
}

async function shutdown(signal, exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[STARTER] Stopping both services (${signal})...`);
  stopChild(crawlerProcess, signal);
  stopChild(botProcess, signal);
  process.exitCode = exitCode;
}

async function main() {
  console.log("[STARTER] Starting Telegram token bot and local token API...");
  botProcess = spawnNode("token bot", botRoot, "src/index.js");

  botProcess.once("exit", (code, signal) => {
    if (shuttingDown) return;
    console.error(`[STARTER] Token bot stopped unexpectedly (${signal || `code ${code}`}).`);
    void shutdown("SIGTERM", code || 1);
  });

  const health = await waitForBotApi();
  console.log(`[STARTER] Token API ready; ${health.activeTokens} active account(s).`);
  const ready = await waitForActiveToken(health);
  if (!ready || shuttingDown) return;

  console.log(`[STARTER] Login ready; starting crawler with ${ready.activeTokens} active account(s)...`);
  crawlerProcess = spawnNode("crawler", projectRoot, "src/index.js", {
    TOKEN_API_URL: tokenApiUrl,
  });

  crawlerProcess.once("exit", async (code, signal) => {
    if (shuttingDown) return;
    const succeeded = code === 0;
    const result = signal ? `signal ${signal}` : `exit code ${code}`;
    await sendAlert(
      succeeded
        ? `✅ Crawler completed successfully (${result}).`
        : `💥 Crawler stopped unexpectedly (${result}). Check the terminal log.`,
      succeeded ? "info" : "error"
    );
    await shutdown("SIGTERM", succeeded ? 0 : code || 1);
  });
}

process.once("SIGINT", () => void shutdown("SIGINT", 130));
process.once("SIGTERM", () => void shutdown("SIGTERM", 143));

main().catch(async (error) => {
  console.error(`[STARTER] ${error.stack || error.message || error}`);
  await sendAlert(error.stack || error.message || String(error), "error");
  await shutdown("SIGTERM", 1);
});
