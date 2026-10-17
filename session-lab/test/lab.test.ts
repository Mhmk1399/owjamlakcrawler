import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { classifyError } from "../src/classification.js";
import { sanitizedPath, sanitizeMetadata } from "../src/sanitize.js";
import { generateReport } from "../src/report-generator.js";
import type { LabConfig } from "../src/types.js";

test("429 is rate limiting, not token expiration", () => {
  assert.equal(classifyError({ status: 429 }), "RATE_LIMITED");
});
test("401 without evidence cannot prove expiration", () => {
  assert.equal(classifyError({ status: 401 }), "UNKNOWN_ERROR");
});
test("403 with confirmed authentication is authorization denied", () => {
  assert.equal(classifyError({ status: 403, authenticationAfter: "AUTHENTICATED" }), "AUTHORIZATION_DENIED");
});
test("sanitize sensitive values and URL identifiers", () => {
  const result = sanitizeMetadata({ phone: "09123456789", Authorization: "Bearer secret", label: "OTP 123456" });
  assert.deepEqual(result, { phone: "[REDACTED]", Authorization: "[REDACTED]", label: "OTP [REDACTED_CODE]" });
  const pathInfo = sanitizedPath("https://divar.ir/v/abcdefghijklmnopq?otp=123456");
  assert.equal(pathInfo.path, "/v/[ID]");
  assert.ok(!JSON.stringify(pathInfo).includes("123456"));
});
test("report generator writes parseable empty CSV, JSON and markdown", async () => {
  const folder = await mkdtemp(path.join(os.tmpdir(), "session-lab-test-"));
  const config: LabConfig = {
    startUrl: "https://divar.ir/", verificationUrl: "https://divar.ir/my-divar/my-posts",
    checkpointMinutes: [0, 15], navigationTimeoutMs: 1000, authenticationPollMs: 1000,
    timezone: "Asia/Tehran", profileDirectory: ".profile", resultsDirectory: "results",
    contactObservation: { enabled: false, allowedListingTokens: [] },
  };
  try {
    await generateReport(folder, "experiment-test", config, null, []);
    assert.match(await readFile(path.join(folder, "checkpoints.csv"), "utf8"), /Checkpoint/);
    const json = JSON.parse(await readFile(path.join(folder, "session-report.json"), "utf8"));
    assert.equal(json.checkpointCount, 0);
    assert.match(await readFile(path.join(folder, "session-report.md"), "utf8"), /Divar Authentication/);
  } finally { await rm(folder, { recursive: true, force: true }); }
});

test("manual confirmation does not permanently hide unauthenticated state", async () => {
  const { SessionMonitor } = await import("../src/session-monitor.js");
  const page = {
    isClosed: () => false,
    evaluate: async () => ({ positive: false, negative: false, challenge: false, path: "/" }),
  };
  const monitor = new SessionMonitor(() => null, () => page as never);
  monitor.setManualAuthentication("AUTHENTICATED");
  assert.equal((await monitor.observeAuthentication()).state, "AUTHENTICATED");
  assert.equal((await monitor.observeAuthentication()).state, "UNKNOWN");
});
