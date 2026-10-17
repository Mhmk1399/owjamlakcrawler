import { createHash } from "node:crypto";
import type { BrowserContext, Page } from "playwright";
import type {
  AuthenticationState,
  CookieMetadata,
  SessionSnapshot,
  StorageKeyMetadata,
} from "./types.js";

interface AuthenticationObservation {
  state: AuthenticationState;
  evidence: string[];
  challengeObserved: boolean;
}

export class SessionMonitor {
  private manualAuthentication: AuthenticationState | null = null;

  constructor(private readonly context: () => BrowserContext | null, private readonly page: () => Page | null) {}

  setManualAuthentication(state: AuthenticationState | null): void {
    this.manualAuthentication = state;
  }

  async observeAuthentication(): Promise<AuthenticationObservation> {
    const page = this.page();
    if (!page || page.isClosed()) return { state: "UNKNOWN", evidence: ["browser-unavailable"], challengeObserved: false };
    const observation = await page.evaluate(() => {
      const clean = (value: string | null | undefined) => (value ?? "").replace(/\s+/g, " ").trim();
      const controls = [...document.querySelectorAll("a,button,[role='button']")]
        .map((element) => ({
          text: clean((element as HTMLElement).innerText),
          href: element instanceof HTMLAnchorElement ? element.href : "",
        }))
        .filter((item) => item.text || item.href);
      const positive = controls.some((item) =>
        /دیوار من|حساب من|خروج از حساب/.test(item.text) || /\/my-divar(?:\/|$)/.test(item.href),
      );
      const negative = controls.some((item) => /^(ورود|ثبت.?نام)$|ورود به حساب/.test(item.text));
      const visibleText = clean(document.body?.innerText).slice(0, 20_000);
      const challenge = /کپچا|captcha|تأیید.*انسان|فعالیت غیرعادی/i.test(visibleText) ||
        /captcha|challenge|verify/i.test(location.pathname);
      return { positive, negative, challenge, path: location.pathname };
    }).catch(() => ({ positive: false, negative: false, challenge: false, path: "unavailable" }));

    const evidence: string[] = [];
    if (observation.positive) evidence.push("visible-account-control");
    if (observation.negative) evidence.push("visible-login-control");
    if (observation.path.startsWith("/auth")) evidence.push("authentication-route");
    if (this.manualAuthentication) evidence.push("manual-confirmation");
    const inferred: AuthenticationState = observation.positive
      ? "AUTHENTICATED"
      : observation.negative || observation.path.startsWith("/auth")
        ? "UNAUTHENTICATED"
        : "UNKNOWN";
    // Manual confirmation is a one-time fallback only when the UI is inconclusive.
    // It must not override later evidence of logout or expiration.
    const manualConfirmation = this.manualAuthentication;
    this.manualAuthentication = null;
    return {
      state: inferred === "UNKNOWN" && manualConfirmation ? manualConfirmation : inferred,
      evidence: evidence.length ? evidence : ["insufficient-visible-evidence"],
      challengeObserved: observation.challenge,
    };
  }

  async snapshot(): Promise<SessionSnapshot> {
    const context = this.context();
    const page = this.page();
    const authentication = await this.observeAuthentication();
    const cookies: CookieMetadata[] = context ? (await context.cookies()).map((cookie) => ({
      name: cookie.name,
      domain: cookie.domain,
      path: cookie.path,
      expires: cookie.expires,
      session: cookie.expires === -1,
      secure: cookie.secure,
      httpOnly: cookie.httpOnly,
      sameSite: cookie.sameSite,
    })).sort((left, right) => `${left.domain}:${left.name}`.localeCompare(`${right.domain}:${right.name}`)) : [];

    const storageMetadata: StorageKeyMetadata[] = page && !page.isClosed()
      ? await page.evaluate(() => {
          const decodeJwtLifetime = (value: string): { issuedAt?: number; expiresAt?: number } | null => {
            const parts = value.split(".");
            if (parts.length !== 3 || !parts[1]) return null;
            try {
              const normalized = parts[1].replace(/-/g, "+").replace(/_/g, "/");
              const payload = JSON.parse(atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "="))) as Record<string, unknown>;
              const lifetime: { issuedAt?: number; expiresAt?: number } = {};
              if (typeof payload.iat === "number") lifetime.issuedAt = payload.iat;
              if (typeof payload.exp === "number") lifetime.expiresAt = payload.exp;
              return lifetime;
            } catch {
              return null;
            }
          };
          const inspect = (storage: Storage, area: "localStorage" | "sessionStorage") =>
            Array.from({ length: storage.length }, (_, index) => storage.key(index))
              .filter((key): key is string => Boolean(key))
              .map((key) => {
                const value = storage.getItem(key) ?? "";
                const lifetime = decodeJwtLifetime(value);
                return {
                  area,
                  key,
                  valueType: value.length === 0 ? "empty" as const : lifetime ? "jwt-like" as const : "opaque" as const,
                  ...(lifetime ? { jwtLifetime: lifetime } : {}),
                };
              });
          return [...inspect(localStorage, "localStorage"), ...inspect(sessionStorage, "sessionStorage")];
        }).catch(() => [])
      : [];

    const cookieFingerprint = createHash("sha256")
      .update(JSON.stringify(cookies))
      .digest("hex");
    return {
      timestamp: new Date().toISOString(),
      browserRunning: Boolean(context && page && !page.isClosed()),
      authenticationState: authentication.state,
      authenticationEvidence: authentication.evidence,
      cookieMetadata: cookies,
      storageMetadata,
      cookieFingerprint,
    };
  }
}
