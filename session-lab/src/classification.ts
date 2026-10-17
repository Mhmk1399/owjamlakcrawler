import type { ClassificationEvidence, ErrorCategory } from "./types.js";

export function classifyError(evidence: ClassificationEvidence): ErrorCategory {
  if (evidence.challengeObserved) return "VERIFICATION_REQUIRED";
  if (evidence.status === 429) return "RATE_LIMITED";
  if (evidence.networkFailure) return "NETWORK_FAILURE";
  if (evidence.explicitRevocationObserved) return "SESSION_REVOKED";
  if (evidence.status !== undefined && evidence.status >= 500) return "SERVER_ERROR";
  if (
    evidence.authenticationBefore === "AUTHENTICATED" &&
    evidence.authenticationAfter === "UNAUTHENTICATED"
  ) return "SESSION_EXPIRED";
  if (evidence.status === 401 && evidence.authenticationAfter === "UNAUTHENTICATED") {
    return "AUTHENTICATION_REQUIRED";
  }
  if (evidence.status === 403 && evidence.authenticationAfter === "AUTHENTICATED") {
    return "AUTHORIZATION_DENIED";
  }
  if (evidence.status !== undefined && evidence.status >= 400) return "UNKNOWN_ERROR";
  return "NONE";
}

export function isStopCategory(category: ErrorCategory): boolean {
  return ["RATE_LIMITED", "VERIFICATION_REQUIRED", "SESSION_REVOKED"].includes(category);
}
