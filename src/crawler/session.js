import { inspectAuthenticationState } from "./contact.js";

export function sessionStateFromAuthentication(authenticated) {
  return authenticated === true ? "authenticated" : authenticated === false ? "anonymous" : "unknown";
}

export async function checkDivarSession(page) {
  const result = await inspectAuthenticationState(page);
  return {
    state: sessionStateFromAuthentication(result.authenticated),
    checkedAt: new Date().toISOString(),
    evidence: result.evidence,
  };
}
