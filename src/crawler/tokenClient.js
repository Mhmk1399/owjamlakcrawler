// src/crawler/tokenClient.js

const TOKEN_API = process.env.TOKEN_API_URL || "http://localhost:3456";
const WORKER_ID = process.env.WORKER_ID || "worker-standalone";

let currentAccount = null;
let lastFetchedAt = 0;

/**
 * Get assigned token for this worker from the bot API
 */
export async function getAssignedToken({ quiet = false } = {}) {
  try {
    const res = await fetch(`${TOKEN_API}/assign/${WORKER_ID}`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      if (!quiet) {
        console.error(
          `[TOKEN] Failed to get token: HTTP ${res.status}`,
          err.error || ""
        );
      }
      return null;
    }
    const data = await res.json();
    currentAccount = data.account;
    lastFetchedAt = Date.now();

    console.log(`[TOKEN] Assigned account: ${currentAccount.phone}`);
    return currentAccount;
  } catch (e) {
    console.error(`[TOKEN] API unreachable: ${e.message}`);
    return null;
  }
}

/**
 * Get current token (cached) or fetch new one
 */
export async function getCurrentToken() {
  // Refresh every 30 minutes (tokens expire in ~3 hours)
  if (!currentAccount || Date.now() - lastFetchedAt > 30 * 60 * 1000) {
    return getAssignedToken();
  }
  return currentAccount;
}

/**
 * Report CAPTCHA hit — bot will alert user and try to assign replacement
 */
export async function reportCaptcha(listingToken) {
  if (!currentAccount) return null;

  console.log(
    `\n🚨 [TOKEN] Reporting CAPTCHA for ${currentAccount.phone}...`
  );

  try {
    const res = await fetch(`${TOKEN_API}/report-captcha`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        workerId: WORKER_ID,
        phone: currentAccount.phone,
        token: listingToken,
      }),
    });

    const data = await res.json();

    if (data.replacement) {
      console.log(
        `[TOKEN] Got replacement: ${data.replacement.phone}`
      );
      currentAccount = data.replacement;
      lastFetchedAt = Date.now();
      return currentAccount;
    }

    console.log(`[TOKEN] No replacement available. Waiting...`);
    currentAccount = null;
    return null;
  } catch (e) {
    console.error(`[TOKEN] Report failed: ${e.message}`);
    return null;
  }
}

/**
 * Wait until a token becomes available after a Telegram login.
 */
export async function waitForToken({ pollIntervalMs = 2_000 } = {}) {
  let token = await getCurrentToken();
  if (token) return token;

  console.log(
    `[TOKEN] No tokens available. Waiting for Telegram login (checking every ${pollIntervalMs / 1000}s)...`
  );

  while (!token) {
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    token = await getAssignedToken({ quiet: true });
  }

  console.log(`[TOKEN] Fresh login detected. Resuming crawler.`);
  return token;
}

/**
 * Report successful use of token (marks it active in bot)
 */
export async function reportSuccess() {
  if (!currentAccount) return;
  try {
    await fetch(`${TOKEN_API}/report-success`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: currentAccount.phone }),
    });
  } catch {}
}
