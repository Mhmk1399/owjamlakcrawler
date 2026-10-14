import { randomUUID } from "node:crypto";

const TERMINAL = new Set(["complete", "failed", "expired"]);

export class LoginCoordinator {
  constructor({ deviceStore, accountStore, auth, ttlMs = 300_000, now = Date.now }) {
    this.deviceStore = deviceStore;
    this.accountStore = accountStore;
    this.auth = auth;
    this.ttlMs = ttlMs;
    this.now = now;
    this.requests = new Map();
  }

  expireRequests() {
    for (const request of this.requests.values()) {
      if (!TERMINAL.has(request.status) && request.expiresAt <= this.now()) {
        request.status = "expired";
        request.session = null;
      }
    }
  }

  create(phone, reason = "operator") {
    if (!/^09\d{9}$/.test(phone)) throw new Error("Phone must be like 09xxxxxxxxx");
    const device = this.deviceStore.findByPhone(phone);
    if (!device) throw new Error("No enabled device is registered for this phone");
    this.expireRequests();
    const existing = [...this.requests.values()].find(
      (item) => item.phone === phone && !TERMINAL.has(item.status),
    );
    if (existing) return this.publicRequest(existing);

    const createdAt = this.now();
    const request = {
      id: randomUUID(),
      phone,
      deviceId: device.deviceId,
      reason,
      status: "queued",
      createdAt,
      expiresAt: createdAt + this.ttlMs,
      session: null,
      error: null,
    };
    this.requests.set(request.id, request);
    return this.publicRequest(request);
  }

  nextForDevice(deviceId) {
    this.expireRequests();
    const request = [...this.requests.values()]
      .filter((item) => item.deviceId === deviceId && !TERMINAL.has(item.status))
      .sort((a, b) => a.createdAt - b.createdAt)[0];
    return request ? this.publicRequest(request) : null;
  }

  async ready(id, deviceId) {
    const request = this.requireActive(id, deviceId);
    if (request.status === "awaiting_otp") return this.publicRequest(request);
    if (request.status !== "queued") throw new Error(`Request is ${request.status}`);
    request.status = "requesting_otp";
    try {
      request.session = await this.auth.initiateLogin(request.phone);
      request.status = "awaiting_otp";
      return this.publicRequest(request);
    } catch (error) {
      request.status = "failed";
      request.error = error.message;
      request.session = null;
      throw error;
    }
  }

  async submitOtp(id, deviceId, otp) {
    const request = this.requireActive(id, deviceId);
    if (request.status !== "awaiting_otp" || !request.session) {
      throw new Error(`Request is ${request.status}`);
    }
    if (!/^\d{4,8}$/.test(otp)) throw new Error("OTP must contain 4 to 8 digits");
    request.status = "verifying";
    try {
      const account = await this.auth.completeLogin(request.session, otp);
      await this.accountStore.save({ ...account, status: "active" });
      request.status = "complete";
      request.session = null;
      return { request: this.publicRequest(request), account: this.publicAccount(account) };
    } catch (error) {
      request.status = "awaiting_otp";
      request.error = error.message;
      throw error;
    }
  }

  requireActive(id, deviceId) {
    this.expireRequests();
    const request = this.requests.get(id);
    if (!request || request.deviceId !== deviceId) throw new Error("Login request not found");
    if (TERMINAL.has(request.status)) throw new Error(`Request is ${request.status}`);
    return request;
  }

  publicRequest(request) {
    return {
      id: request.id,
      phone: request.phone,
      reason: request.reason,
      status: request.status,
      createdAt: new Date(request.createdAt).toISOString(),
      expiresAt: new Date(request.expiresAt).toISOString(),
      error: request.error,
    };
  }

  publicAccount(account) {
    return {
      phone: account.phone,
      loggedInAt: account.loggedInAt,
      status: account.status || "active",
    };
  }
}
