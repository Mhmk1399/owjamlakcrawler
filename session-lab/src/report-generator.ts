import { chmod, mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { CheckpointRecord, LabConfig } from "./types.js";

const csvHeaders = [
  "Checkpoint", "Timestamp", "Elapsed Minutes", "Browser Running",
  "Authentication State", "Cookie Metadata Changed", "Token Expiration Observed",
  "HTTP Status", "Error Category", "Response Time Ms", "Notes",
];
const csvCell = (value: unknown): string => {
  const string = String(value ?? "");
  const safe = /^[=+@\-\t\r]/.test(string) ? `'${string}` : string;
  return `"${safe.replaceAll('"', '""')}"`;
};

async function atomicWrite(file: string, contents: string): Promise<void> {
  const temporary = `${file}.${process.pid}.tmp`;
  await writeFile(temporary, contents, { mode: 0o600 });
  await rename(temporary, file);
  await chmod(file, 0o600);
}

export async function generateReport(
  experimentDirectory: string,
  experimentId: string,
  config: LabConfig,
  startedAt: number | null,
  records: CheckpointRecord[],
): Promise<void> {
  await mkdir(experimentDirectory, { recursive: true, mode: 0o700 });
  const sorted = [...records].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  const rows = sorted.map((entry) => [
    entry.checkpoint, entry.timestamp, entry.elapsedMinutes.toFixed(2),
    entry.browserRunning, entry.authenticationState,
    entry.cookieMetadataChanged, entry.tokenExpirationObserved,
    entry.httpStatus ?? "", entry.errorCategory, entry.responseTimeMs ?? "", entry.notes,
  ]);
  const csv = [csvHeaders, ...rows].map((row) => row.map(csvCell).join(",")).join("\n") + "\n";
  const lastAuthenticated = [...sorted].reverse().find((item) => item.authenticationState === "AUTHENTICATED");
  const firstUnauthenticated = sorted.find((item) =>
    item.authenticationState === "UNAUTHENTICATED" &&
    (lastAuthenticated ? item.timestamp > lastAuthenticated.timestamp : true),
  );
  const summary = firstUnauthenticated && lastAuthenticated
    ? `Authentication changed between ${lastAuthenticated.timestamp} and ${firstUnauthenticated.timestamp}; cause is undetermined.`
    : lastAuthenticated
      ? `Authenticated at least until ${lastAuthenticated.timestamp}; end-of-session time not established.`
      : "No confirmed authenticated checkpoint yet.";
  const report = {
    experimentId, accountType: "pro", startedAt: startedAt ? new Date(startedAt).toISOString() : null,
    generatedAt: new Date().toISOString(), checkpointCount: sorted.length,
    checkpointScheduleMinutes: config.checkpointMinutes,
    verificationUrl: config.verificationUrl,
    summary, checkpoints: sorted,
  };
  const header = [
    "# Divar Authentication Session Lifecycle Analysis", "",
    `Experiment: ${experimentId}`, `Account type: Pro`,
    `Started: ${report.startedAt ?? "not confirmed"}`,
    `Generated: ${report.generatedAt}`, "",
    "## Summary", summary, "", "## Checkpoints", "",
    "| Checkpoint | UTC time | Minutes | State | HTTP | Category |",
    "|---|---|---:|---|---:|---|",
    ...sorted.map((item) =>
      `| ${item.checkpoint} | ${item.timestamp} | ${item.elapsedMinutes.toFixed(1)} | ${item.authenticationState} | ${item.httpStatus ?? "-"} | ${item.errorCategory} |`,
    ), "", "## Interpretation", "",
    "This report records observations, not proof of a vulnerability or exact token expiry.",
    "HTTP 401, 403 and 429 alone do not prove session expiration.", "",
  ].join("\n");
  await atomicWrite(path.join(experimentDirectory, "checkpoints.csv"), csv);
  await atomicWrite(path.join(experimentDirectory, "session-report.json"), JSON.stringify(report, null, 2) + "\n");
  await atomicWrite(path.join(experimentDirectory, "session-report.md"), header);
}
