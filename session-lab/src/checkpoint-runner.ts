import { classifyError } from "./classification.js";
import type { LabBrowser } from "./browser.js";
import type { EventLogger } from "./event-logger.js";
import type { SessionMonitor } from "./session-monitor.js";
import type { CheckpointRecord, LabConfig } from "./types.js";

export class CheckpointRunner {
  readonly records: CheckpointRecord[] = [];
  private inProgress = false;

  constructor(
    private readonly browser: LabBrowser,
    private readonly monitor: SessionMonitor,
    private readonly logger: EventLogger,
    private readonly config: LabConfig,
    private readonly startedAt: () => number | null,
  ) {}

  async run(label: string): Promise<CheckpointRecord | null> {
    if (this.inProgress) {
      await this.logger.log("CHECKPOINT_SKIPPED", "warn", { reason: "already-running", label });
      return null;
    }
    this.inProgress = true;
    try {
      const before = this.records.at(-1)?.authenticationState;
      let httpStatus: number | null = null;
      let responseTimeMs: number | null = null;
      let navigationError = false;
      const start = Date.now();
      if (this.browser.running() && this.browser.page) {
        try {
          // One low-impact, account-owned verification navigation per checkpoint.
          const response = await this.browser.page.goto(this.config.verificationUrl, {
            waitUntil: "domcontentloaded",
            timeout: this.config.navigationTimeoutMs,
          });
          httpStatus = response?.status() ?? null;
          responseTimeMs = Date.now() - start;
        } catch {
          navigationError = true;
          responseTimeMs = Date.now() - start;
        }
      }
      const snapshot = await this.monitor.snapshot();
      const first = this.records.at(-1)?.snapshot;
      const secondsNow = Date.now() / 1000;
      const tokenExpirationObserved = snapshot.storageMetadata.some((item) =>
        item.jwtLifetime?.expiresAt !== undefined && item.jwtLifetime.expiresAt <= secondsNow,
      );
      const state = snapshot.authenticationState;
      const observation = await this.monitor.observeAuthentication();
      let errorCategory = classifyError({
        ...(httpStatus !== null ? { status: httpStatus } : {}),
        ...(before ? { authenticationBefore: before } : {}),
        authenticationAfter: state,
        challengeObserved: observation.challengeObserved,
        networkFailure: navigationError,
      });
      // A transition to logged-out is not proof of expiration: it might be an explicit logout.
      if (errorCategory === "SESSION_EXPIRED") errorCategory = "UNKNOWN_ERROR";
      const timeZero = this.startedAt();
      const record: CheckpointRecord = {
        checkpoint: label,
        timestamp: snapshot.timestamp,
        elapsedMinutes: timeZero === null ? 0 : Math.max(0, (Date.now() - timeZero) / 60_000),
        browserRunning: snapshot.browserRunning,
        authenticationState: state,
        cookieMetadataChanged: first ? first.cookieFingerprint !== snapshot.cookieFingerprint : false,
        tokenExpirationObserved,
        httpStatus,
        errorCategory,
        responseTimeMs,
        notes: navigationError ? "Verification navigation failed; authentication may be unknown" : "",
        snapshot,
      };
      this.records.push(record);
      await this.logger.log("SESSION_CHECK", errorCategory === "NONE" ? "info" : "warn", {
        checkpoint: label, authenticated: state, httpStatus,
        errorCategory, responseTimeMs, browserRunning: snapshot.browserRunning,
      });
      return record;
    } finally {
      this.inProgress = false;
    }
  }
}
