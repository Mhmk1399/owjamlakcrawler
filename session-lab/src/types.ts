export type AuthenticationState = "AUTHENTICATED" | "UNAUTHENTICATED" | "UNKNOWN";

export type ErrorCategory =
  | "AUTHENTICATION_REQUIRED"
  | "SESSION_EXPIRED"
  | "SESSION_REVOKED"
  | "AUTHORIZATION_DENIED"
  | "RATE_LIMITED"
  | "VERIFICATION_REQUIRED"
  | "NETWORK_FAILURE"
  | "SERVER_ERROR"
  | "UNKNOWN_ERROR"
  | "NONE";

export type Severity = "debug" | "info" | "warn" | "error";

export interface LabConfig {
  startUrl: string;
  verificationUrl: string;
  checkpointMinutes: number[];
  navigationTimeoutMs: number;
  authenticationPollMs: number;
  timezone: string;
  profileDirectory: string;
  resultsDirectory: string;
  contactObservation: {
    enabled: boolean;
    allowedListingTokens: string[];
  };
}

export interface CookieMetadata {
  name: string;
  domain: string;
  path: string;
  expires: number;
  session: boolean;
  secure: boolean;
  httpOnly: boolean;
  sameSite: string;
}

export interface StorageKeyMetadata {
  area: "localStorage" | "sessionStorage";
  key: string;
  valueType: "jwt-like" | "opaque" | "empty";
  jwtLifetime?: { issuedAt?: number; expiresAt?: number };
}

export interface SessionSnapshot {
  timestamp: string;
  browserRunning: boolean;
  authenticationState: AuthenticationState;
  authenticationEvidence: string[];
  cookieMetadata: CookieMetadata[];
  storageMetadata: StorageKeyMetadata[];
  cookieFingerprint: string;
}

export interface CheckpointRecord {
  checkpoint: string;
  timestamp: string;
  elapsedMinutes: number;
  browserRunning: boolean;
  authenticationState: AuthenticationState;
  cookieMetadataChanged: boolean;
  tokenExpirationObserved: boolean;
  httpStatus: number | null;
  errorCategory: ErrorCategory;
  responseTimeMs: number | null;
  notes: string;
  snapshot: SessionSnapshot;
}

export interface LabEvent {
  experimentId: string;
  timestamp: string;
  eventType: string;
  sessionAgeSeconds: number;
  severity: Severity;
  metadata: Record<string, unknown>;
}

export interface ClassificationEvidence {
  status?: number;
  authenticationBefore?: AuthenticationState;
  authenticationAfter?: AuthenticationState;
  challengeObserved?: boolean;
  explicitRevocationObserved?: boolean;
  networkFailure?: boolean;
}
