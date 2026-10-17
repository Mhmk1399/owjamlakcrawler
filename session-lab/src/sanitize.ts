const SENSITIVE_KEY = /authorization|cookie|set-cookie|password|otp|phone|secret|tokenvalue|body/i;
const IRANIAN_PHONE = /(?:\+98|0098|0)?9\d{9}/g;
const OTP_LIKE = /\b\d{4,8}\b/g;

export function sanitizedPath(input: string): { host: string; path: string } {
  try {
    const url = new URL(input);
    const path = url.pathname.split("/").map((segment) => {
      const decoded = (() => { try { return decodeURIComponent(segment); } catch { return segment; } })();
      if (/(?:\+98|0098|0)?9\d{9}/.test(decoded)) return "[REDACTED]";
      if (/^\d{4,}$/.test(decoded) || /^[a-zA-Z0-9_-]{16,}$/.test(decoded)) return "[ID]";
      return segment;
    }).join("/");
    return { host: url.hostname, path };
  } catch {
    return { host: "invalid", path: "/" };
  }
}

function redactString(value: string): string {
  return value.replace(IRANIAN_PHONE, "[REDACTED_PHONE]").replace(OTP_LIKE, "[REDACTED_CODE]");
}

export function sanitizeMetadata(value: unknown, key = "metadata"): unknown {
  if (SENSITIVE_KEY.test(key)) return "[REDACTED]";
  if (typeof value === "string") return redactString(value);
  if (Array.isArray(value)) return value.map((item) => sanitizeMetadata(item));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([childKey, child]) => [
      childKey,
      sanitizeMetadata(child, childKey),
    ]));
  }
  return value;
}
