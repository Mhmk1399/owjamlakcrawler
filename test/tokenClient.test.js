import test from "node:test";
import assert from "node:assert/strict";

test("waitForToken detects a successful Telegram login and resumes", async (t) => {
  const originalFetch = globalThis.fetch;
  let attempts = 0;

  globalThis.fetch = async () => {
    attempts += 1;
    if (attempts < 3) {
      return {
        ok: false,
        status: 503,
        json: async () => ({ error: "No active tokens available" }),
      };
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({
        account: { phone: "09000000000", sAccessToken: "test-token" },
      }),
    };
  };

  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const { waitForToken } = await import(
    `../src/crawler/tokenClient.js?test=${Date.now()}`
  );
  const account = await waitForToken({ pollIntervalMs: 1 });

  assert.equal(account.phone, "09000000000");
  assert.equal(attempts, 3);
});
