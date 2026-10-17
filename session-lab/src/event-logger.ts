import { appendFile, chmod, mkdir } from "node:fs/promises";
import path from "node:path";
import { sanitizeMetadata } from "./sanitize.js";
import type { LabEvent, Severity } from "./types.js";

export class EventLogger {
  readonly eventsFile: string;
  private chain: Promise<void> = Promise.resolve();

  constructor(
    readonly experimentId: string,
    readonly experimentDirectory: string,
    private readonly sessionStartedAt: () => number | null,
  ) {
    this.eventsFile = path.join(experimentDirectory, "events.jsonl");
  }

  async init(): Promise<void> {
    await mkdir(this.experimentDirectory, { recursive: true, mode: 0o700 });
    await appendFile(this.eventsFile, "", { mode: 0o600 });
    await chmod(this.eventsFile, 0o600);
  }

  log(eventType: string, severity: Severity, metadata: Record<string, unknown> = {}): Promise<void> {
    const started = this.sessionStartedAt();
    const event: LabEvent = {
      experimentId: this.experimentId,
      timestamp: new Date().toISOString(),
      eventType,
      sessionAgeSeconds: started === null ? 0 : Math.max(0, Math.floor((Date.now() - started) / 1000)),
      severity,
      metadata: sanitizeMetadata(metadata) as Record<string, unknown>,
    };
    this.chain = this.chain.then(() => appendFile(this.eventsFile, `${JSON.stringify(event)}\n`, "utf8"));
    return this.chain;
  }

  async flush(): Promise<void> {
    await this.chain;
  }
}
