import http from "node:http";
import { URL } from "node:url";
import { constantTimeEqual, randomToken } from "./security.js";

function json(response, status, body) {
  const payload = JSON.stringify(body);
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(payload),
    "cache-control": "no-store",
  });
  response.end(payload);
}

async function body(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 16_384) throw new Error("Request body too large");
    chunks.push(chunk);
  }
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {};
}

function bearer(request) {
  const value = request.headers.authorization || "";
  return value.startsWith("Bearer ") ? value.slice(7) : "";
}

export function createServer({ config, deviceStore, accountStore, coordinator }) {
  const assignments = new Map();

  function operatorAllowed(request) {
    return constantTimeEqual(bearer(request), config.operatorKey);
  }

  function deviceFor(request, deviceId) {
    return deviceStore.authenticate(deviceId, bearer(request));
  }

  return http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);

      if (request.method === "GET" && url.pathname === "/health") {
        const accounts = accountStore.list();
        return json(response, 200, {
          status: "ok",
          activeTokens: accounts.filter((item) => item.status === "active").length,
          totalTokens: accounts.length,
          pendingLogins: [...coordinator.requests.values()].filter(
            (item) => !["complete", "failed", "expired"].includes(item.status),
          ).length,
        });
      }

      if (request.method === "POST" && url.pathname === "/api/devices/register") {
        if (!constantTimeEqual(request.headers["x-enrollment-key"], config.enrollmentKey)) {
          return json(response, 401, { error: "invalid-enrollment-key" });
        }
        const input = await body(request);
        if (!/^[A-Za-z0-9._-]{6,128}$/.test(input.deviceId || "")) {
          return json(response, 400, { error: "invalid-device-id" });
        }
        if (!/^09\d{9}$/.test(input.phone || "")) {
          return json(response, 400, { error: "invalid-phone" });
        }
        const deviceToken = randomToken();
        const device = await deviceStore.register({
          deviceId: input.deviceId,
          phone: input.phone,
          name: String(input.name || "Android device").slice(0, 100),
          token: deviceToken,
        });
        return json(response, 201, { device, deviceToken });
      }

      if (request.method === "POST" && url.pathname === "/api/login-requests") {
        if (!operatorAllowed(request)) return json(response, 401, { error: "unauthorized" });
        const input = await body(request);
        const loginRequest = coordinator.create(input.phone, input.reason || "operator");
        return json(response, 202, { request: loginRequest });
      }

      if (request.method === "GET" && url.pathname === "/api/mobile/requests/next") {
        const deviceId = url.searchParams.get("deviceId") || "";
        if (!deviceFor(request, deviceId)) return json(response, 401, { error: "unauthorized" });
        return json(response, 200, { request: coordinator.nextForDevice(deviceId) });
      }

      const readyMatch = url.pathname.match(/^\/api\/mobile\/requests\/([^/]+)\/ready$/);
      if (request.method === "POST" && readyMatch) {
        const input = await body(request);
        if (!deviceFor(request, input.deviceId)) return json(response, 401, { error: "unauthorized" });
        return json(response, 200, { request: await coordinator.ready(readyMatch[1], input.deviceId) });
      }

      const otpMatch = url.pathname.match(/^\/api\/mobile\/requests\/([^/]+)\/otp$/);
      if (request.method === "POST" && otpMatch) {
        const input = await body(request);
        if (!deviceFor(request, input.deviceId)) return json(response, 401, { error: "unauthorized" });
        return json(response, 200, await coordinator.submitOtp(otpMatch[1], input.deviceId, input.otp));
      }

      const assignMatch = url.pathname.match(/^\/assign\/([^/]+)$/);
      if (request.method === "GET" && assignMatch) {
        const active = accountStore.list().filter((item) => item.status === "active");
        if (!active.length) return json(response, 503, { error: "No active tokens available" });
        const workerId = decodeURIComponent(assignMatch[1]);
        const existing = active.find((item) => item.phone === assignments.get(workerId));
        const chosen = existing || active.sort((a, b) => {
          const count = (phone) => [...assignments.values()].filter((value) => value === phone).length;
          return count(a.phone) - count(b.phone);
        })[0];
        assignments.set(workerId, chosen.phone);
        return json(response, 200, { assigned: true, account: chosen });
      }

      if (request.method === "POST" && url.pathname === "/report-success") {
        const input = await body(request);
        if (input.phone) await accountStore.markStatus(input.phone, "active");
        return json(response, 200, { ok: true });
      }

      if (request.method === "POST" && url.pathname === "/report-captcha") {
        const input = await body(request);
        await accountStore.markStatus(input.phone, "captcha");
        if (input.workerId) assignments.delete(input.workerId);
        let renewal = null;
        try { renewal = coordinator.create(input.phone, "captcha-renewal"); } catch {}
        const replacement = accountStore.list().find(
          (item) => item.status === "active" && item.phone !== input.phone,
        ) || null;
        if (replacement && input.workerId) assignments.set(input.workerId, replacement.phone);
        return json(response, 200, { acknowledged: true, replacement, renewal });
      }

      if (request.method === "POST" && url.pathname === "/alert") {
        return json(response, 200, { ok: true, sent: false, message: "Telegram is disabled" });
      }

      return json(response, 404, { error: "not-found" });
    } catch (error) {
      console.error(`[token-service] ${error.stack || error.message}`);
      const clientError = /invalid|must|not found|Request is|No enabled|JSON/.test(error.message);
      return json(response, clientError ? 400 : 502, { error: error.message });
    }
  });
}
