import assert from "node:assert/strict";
import test from "node:test";
import { LoginCoordinator } from "../src/coordinator.js";

test("device-ready ordering requests OTP then stores completed account", async () => {
  const saved = [];
  const coordinator = new LoginCoordinator({
    deviceStore: { findByPhone: () => ({ deviceId: "device-123" }) },
    accountStore: { save: async (account) => saved.push(account) },
    auth: {
      initiateLogin: async (phone) => ({ phone, secretSession: "not-public" }),
      completeLogin: async (session, otp) => ({
        phone: session.phone,
        sAccessToken: `token-${otp}`,
        loggedInAt: "2026-10-11T00:00:00.000Z",
      }),
    },
  });

  const queued = coordinator.create("09123456789");
  assert.equal(queued.status, "queued");
  assert.equal(queued.secretSession, undefined);
  const ready = await coordinator.ready(queued.id, "device-123");
  assert.equal(ready.status, "awaiting_otp");
  const result = await coordinator.submitOtp(queued.id, "device-123", "12345");
  assert.equal(result.request.status, "complete");
  assert.equal(saved[0].sAccessToken, "token-12345");
  assert.equal(result.account.sAccessToken, undefined);
});

test("request is bound to the registered device", async () => {
  const coordinator = new LoginCoordinator({
    deviceStore: { findByPhone: () => ({ deviceId: "right-device" }) },
    accountStore: { save: async () => {} },
    auth: { initiateLogin: async () => ({}) },
  });
  const request = coordinator.create("09123456789");
  await assert.rejects(() => coordinator.ready(request.id, "wrong-device"), /not found/);
});
