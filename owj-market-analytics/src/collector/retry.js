export class RetryExhaustedError extends Error {
  constructor(message, { cause, attempts }) {
    super(message, { cause });
    this.name = "RetryExhaustedError";
    this.attempts = attempts;
    this.status = cause?.status ?? null;
    this.code = cause?.code ?? "retry-exhausted";
  }
}

export function parseRetryAfter(value, now = Date.now()) {
  if (value === undefined || value === null || value === "") return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.round(seconds * 1_000);
  const timestamp = Date.parse(String(value));
  return Number.isFinite(timestamp) ? Math.max(0, timestamp - now) : null;
}

export function isTransientPublicError(error) {
  if ([403, 429].includes(error?.status)) return false;
  if (Number.isFinite(error?.status)) return error.status >= 500 && error.status <= 599;
  return ["request-failed", "invalid-json", "invalid-shape"].includes(error?.code);
}

export async function withRetry(operation, {
  maxAttempts = 3,
  baseDelayMs = 1_000,
  maxDelayMs = 15_000,
  jitterRatio = 0.2,
  shouldRetry = isTransientPublicError,
  sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  random = Math.random,
  onRetry = async () => {},
} = {}) {
  const attempts = Math.max(1, Math.floor(maxAttempts));
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation({ attempt, maxAttempts: attempts });
    } catch (error) {
      lastError = error;
      if (attempt >= attempts || !shouldRetry(error)) throw error;
      const exponential = Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1));
      const jitter = exponential * jitterRatio * ((random() * 2) - 1);
      const delayMs = Math.max(0, Math.round(error.retryAfterMs ?? exponential + jitter));
      await onRetry({ attempt, nextAttempt: attempt + 1, maxAttempts: attempts, delayMs, error });
      await sleep(delayMs);
    }
  }
  throw new RetryExhaustedError("Public request retry budget exhausted", {
    cause: lastError,
    attempts,
  });
}
