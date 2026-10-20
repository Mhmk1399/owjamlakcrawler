import fs from "node:fs/promises";
import path from "node:path";

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
const SENSITIVE_KEY = /phone|email|authorization|cookie|password|secret|access.?token|front.?token/i;
const PHONE_LIKE = /(?<!\d)(?:(?:\+98|0098|0)[\d -]{9,16}\d)(?!\d)/g;
const EMAIL_LIKE = /[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g;

function sanitize(value, seen = new WeakSet()) {
  if (typeof value === "string") {
    return value.replace(PHONE_LIKE, "[redacted-phone]").replace(EMAIL_LIKE, "[redacted-email]");
  }
  if (!value || typeof value !== "object") return value;
  if (seen.has(value)) return "[circular]";
  seen.add(value);
  if (Array.isArray(value)) return value.map((item) => sanitize(item, seen));
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      SENSITIVE_KEY.test(key) ? "[redacted]" : sanitize(item, seen),
    ]),
  );
}

export class StructuredLogger {
  constructor({ file, level = "info", recentLimit = 500, maxBytes = 25_000_000, archives = 5 }) {
    this.file = file;
    this.level = LEVELS[level] ?? LEVELS.info;
    this.recentLimit = recentLimit;
    this.recent = [];
    this.writeQueue = Promise.resolve();
    this.maxBytes = maxBytes;
    this.archives = archives;
  }

  async init() {
    await fs.mkdir(path.dirname(this.file), { recursive: true });
    const stat = await fs.stat(this.file).catch((error) => error.code === "ENOENT" ? null : Promise.reject(error));
    if (stat?.size >= this.maxBytes) {
      await fs.rm(`${this.file}.${this.archives}`, { force: true });
      for (let index = this.archives - 1; index >= 1; index -= 1) {
        await fs.rename(`${this.file}.${index}`, `${this.file}.${index + 1}`).catch((error) => {
          if (error.code !== "ENOENT") throw error;
        });
      }
      await fs.rename(this.file, `${this.file}.1`);
    }
  }

  log(level, event, message, context = {}) {
    if ((LEVELS[level] ?? LEVELS.info) < this.level) return;
    const record = {
      timestamp: new Date().toISOString(),
      level,
      event,
      message,
      ...sanitize(context),
    };
    this.recent.push(record);
    if (this.recent.length > this.recentLimit) this.recent.shift();
    const line = `${JSON.stringify(record)}\n`;
    const output = level === "error" ? console.error : level === "warn" ? console.warn : console.log;
    output(`[${record.timestamp}] [${level.toUpperCase()}] [${event}] ${message}`, sanitize(context));
    this.writeQueue = this.writeQueue
      .then(() => fs.appendFile(this.file, line, "utf8"))
      .catch((error) => console.error(`[LOGGER] ${error.message}`));
  }

  debug(event, message, context) { this.log("debug", event, message, context); }
  info(event, message, context) { this.log("info", event, message, context); }
  warn(event, message, context) { this.log("warn", event, message, context); }
  error(event, message, context) { this.log("error", event, message, context); }

  getRecent(limit = 100) {
    return this.recent.slice(-Math.max(1, Math.min(500, limit)));
  }

  async flush() {
    await this.writeQueue;
  }
}
