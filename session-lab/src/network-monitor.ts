import type { Page, Request } from "playwright";
import { classifyError, isStopCategory } from "./classification.js";
import { sanitizedPath } from "./sanitize.js";
import type { EventLogger } from "./event-logger.js";
import type { ErrorCategory } from "./types.js";

const IGNORED_RESOURCES = new Set(["image", "font", "media", "stylesheet"]);

export class NetworkMonitor {
  private readonly started = new WeakMap<Request, number>();
  private detachFunctions: Array<() => void> = [];

  constructor(
    private readonly logger: EventLogger,
    private readonly checkpointId: () => string | null,
    private readonly onStopCondition: (category: ErrorCategory) => void,
  ) {}

  attach(page: Page): void {
    this.detach();
    const requestHandler = (request: Request) => {
      if (!IGNORED_RESOURCES.has(request.resourceType())) this.started.set(request, Date.now());
    };
    const responseHandler = (response: import("playwright").Response) => {
      const request = response.request();
      if (IGNORED_RESOURCES.has(request.resourceType())) return;
      const location = sanitizedPath(request.url());
      const status = response.status();
      const category = classifyError({ status });
      void this.logger.log("RESPONSE_RECEIVED", status >= 500 ? "error" : status >= 400 ? "warn" : "debug", {
        requestMethod: request.method(),
        requestHost: location.host,
        sanitizedRequestPath: location.path,
        responseStatus: status,
        durationMs: Math.max(0, Date.now() - (this.started.get(request) ?? Date.now())),
        errorCategory: category,
        checkpointId: this.checkpointId(),
      });
      // Only treat restrictions from the first-party platform as a safety stop.
      const platformHost = location.host === "divar.ir" || location.host.endsWith(".divar.ir");
      if (platformHost && (isStopCategory(category) || status === 401 || status === 403)) {
        this.onStopCondition(category);
      }
    };
    const failedHandler = (request: Request) => {
      if (IGNORED_RESOURCES.has(request.resourceType())) return;
      const location = sanitizedPath(request.url());
      void this.logger.log("REQUEST_FAILED", "warn", {
        requestMethod: request.method(), requestHost: location.host,
        sanitizedRequestPath: location.path,
        durationMs: Math.max(0, Date.now() - (this.started.get(request) ?? Date.now())),
        errorCategory: "NETWORK_FAILURE",
        failure: request.failure() ? "network-error" : "unknown",
        checkpointId: this.checkpointId(),
      });
    };
    const navigationHandler = (frame: import("playwright").Frame) => {
      if (frame !== page.mainFrame()) return;
      const location = sanitizedPath(frame.url());
      void this.logger.log("PAGE_NAVIGATION", "info", {
        requestHost: location.host,
        sanitizedRequestPath: location.path,
        checkpointId: this.checkpointId(),
      });
    };
    const pageErrorHandler = (error: Error) => void this.logger.log("PAGE_ERROR", "warn", {
      errorCategory: "UNKNOWN_ERROR", errorType: error.name, checkpointId: this.checkpointId(),
    });
    page.on("request", requestHandler);
    page.on("response", responseHandler);
    page.on("requestfailed", failedHandler);
    page.on("framenavigated", navigationHandler);
    page.on("pageerror", pageErrorHandler);
    this.detachFunctions = [
      () => page.off("request", requestHandler),
      () => page.off("response", responseHandler),
      () => page.off("requestfailed", failedHandler),
      () => page.off("framenavigated", navigationHandler),
      () => page.off("pageerror", pageErrorHandler),
    ];
  }

  detach(): void {
    for (const detach of this.detachFunctions) detach();
    this.detachFunctions = [];
  }
}
