import test from "node:test";
import assert from "node:assert/strict";
import { isTransientPublicError, parseRetryAfter, withRetry } from "../src/collector/retry.js";

test("retries transient public failures with exponential delays", async () => {
  const delays = [];
  const events = [];
  let calls = 0;
  const result = await withRetry(async () => {
    calls += 1;
    if (calls < 3) throw Object.assign(new Error("temporary"), { status: 503 });
    return "ok";
  }, {
    maxAttempts: 3,
    baseDelayMs: 100,
    jitterRatio: 0,
    sleep: async (delay) => delays.push(delay),
    onRetry: async (event) => events.push(event),
  });
  assert.equal(result, "ok");
  assert.equal(calls, 3);
  assert.deepEqual(delays, [100, 200]);
  assert.deepEqual(events.map((event) => event.nextAttempt), [2, 3]);
});

test("never retries conservative platform-limit responses", async () => {
  for (const status of [403, 429]) {
    let calls = 0;
    await assert.rejects(withRetry(async () => {
      calls += 1;
      throw Object.assign(new Error("platform limit"), { status });
    }, { maxAttempts: 3, sleep: async () => {} }), /platform limit/);
    assert.equal(calls, 1);
  }
});

test("parses Retry-After and classifies only safe transient failures", () => {
  assert.equal(parseRetryAfter("2"), 2_000);
  assert.equal(parseRetryAfter("invalid"), null);
  assert.equal(isTransientPublicError({ status: 500 }), true);
  assert.equal(isTransientPublicError({ status: 404 }), false);
  assert.equal(isTransientPublicError({ status: 429 }), false);
  assert.equal(isTransientPublicError({ code: "request-failed" }), true);
});
