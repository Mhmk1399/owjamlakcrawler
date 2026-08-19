import express from "express";
import {
  loadAccounts,
  saveAccount,
  listAccounts,
  markAccountStatus,
} from "../divar/tokens.js";
import { initiateLogin, completeLogin } from "../divar/apiLogin.js";

// Track which worker has which token
const assignments = new Map(); // workerId → phone
let telegramBot = null;
let alertChatIds = [];

export function setBotReference(bot, chatIds) {
  telegramBot = bot;
  alertChatIds = (Array.isArray(chatIds) ? chatIds : [chatIds])
    .map((chatId) => String(chatId || "").trim())
    .filter(Boolean);
}

export async function notifyAdmins(message) {
  if (!telegramBot || alertChatIds.length === 0) return false;

  const text = String(message || "Unknown notification").slice(0, 4000);
  const results = await Promise.allSettled(
    alertChatIds.map((chatId) => telegramBot.telegram.sendMessage(chatId, text))
  );
  const failures = results.filter((result) => result.status === "rejected");
  for (const failure of failures) {
    console.error(`[TELEGRAM] Notification failed: ${failure.reason?.message || failure.reason}`);
  }
  return failures.length < results.length;
}

export function createApiServer(port = 3456, host = "127.0.0.1") {
  const app = express();
  app.use(express.json());

  // ── GET /tokens — return all active tokens ──────────────────────
  app.get("/tokens", async (req, res) => {
    try {
      const accounts = await listAccounts();
      const active = accounts.filter((a) => a.status === "active");
      res.json({
        total: accounts.length,
        active: active.length,
        tokens: active.map((a) => ({
          phone: a.phone,
          sAccessToken: a.sAccessToken,
          sFrontToken: a.sFrontToken,
          did: a.did,
          cdid: a.cdid,
          deviceId: a.deviceId,
          loggedInAt: a.loggedInAt,
          status: a.status,
        })),
      });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── GET /assign/:workerId — assign a token to a specific worker ─
  app.get("/assign/:workerId", async (req, res) => {
    try {
      const { workerId } = req.params;
      const accounts = await listAccounts();
      const active = accounts.filter((a) => a.status === "active");

      if (active.length === 0) {
        return res.status(503).json({ error: "No active tokens available" });
      }

      // Check if worker already has an assignment
      const existingPhone = assignments.get(workerId);
      const existing = active.find((a) => a.phone === existingPhone);
      if (existing) {
        return res.json({ assigned: true, account: existing });
      }

      // Find least-used token (token assigned to fewest workers)
      const usageCounts = new Map();
      for (const a of active) usageCounts.set(a.phone, 0);
      for (const phone of assignments.values()) {
        if (usageCounts.has(phone)) {
          usageCounts.set(phone, usageCounts.get(phone) + 1);
        }
      }

      const sorted = active.sort(
        (a, b) =>
          (usageCounts.get(a.phone) || 0) - (usageCounts.get(b.phone) || 0)
      );

      const chosen = sorted[0];
      assignments.set(workerId, chosen.phone);

      console.log(`[API] Assigned ${chosen.phone} to ${workerId}`);
      res.json({ assigned: true, account: chosen });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── POST /report-captcha — worker reports CAPTCHA hit ───────────
  app.post("/report-captcha", async (req, res) => {
    try {
      const { workerId, phone, token: listingToken } = req.body;

      console.log(
        `\n🚨 [API] CAPTCHA reported by ${workerId} for account ${phone}`
      );

      // Mark account as needing re-login
      await markAccountStatus(phone, "captcha");

      // Remove assignment so worker gets a fresh token next time
      assignments.delete(workerId);

      // Alert via Telegram
      await notifyAdmins(
        `🚨 CAPTCHA HIT\n\n` +
          `Worker: ${workerId}\n` +
          `Account: ${phone}\n` +
          `Listing: ${listingToken || "unknown"}\n` +
          `Time: ${new Date().toLocaleString("en-GB")}\n\n` +
          `Account marked inactive. Use /login ${phone} to renew it.`
      );

      // Find a replacement token for this worker
      const accounts = await listAccounts();
      const active = accounts.filter(
        (a) => a.status === "active" && a.phone !== phone
      );

      if (active.length > 0) {
        const replacement = active[0];
        assignments.set(workerId, replacement.phone);
        console.log(
          `[API] Assigned replacement ${replacement.phone} to ${workerId}`
        );
        res.json({
          acknowledged: true,
          replacement: replacement,
          message: "Replacement token assigned",
        });
      } else {
        // No active tokens left — alert urgently
        await notifyAdmins(
          "⛔ ALL TOKENS EXHAUSTED\n\n" +
            "No active accounts remain. The crawler is paused until you use /login with an account."
        );
        res.json({
          acknowledged: true,
          replacement: null,
          message: "No active tokens left. Crawler should pause.",
        });
      }
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── POST /report-success — worker confirms token works ──────────
  app.post("/report-success", async (req, res) => {
    try {
      const { phone } = req.body;
      if (phone) await markAccountStatus(phone, "active");
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── POST /alert — local crawler/launcher notifications ─────────
  app.post("/alert", async (req, res) => {
    try {
      const source = String(req.body?.source || "crawler").slice(0, 80);
      const severity = String(req.body?.severity || "error").toUpperCase().slice(0, 20);
      const message = String(req.body?.message || "").trim();
      if (!message) return res.status(400).json({ error: "message is required" });

      const sent = await notifyAdmins(
        `⚠️ ${severity} FROM ${source.toUpperCase()}\n\n${message.slice(0, 3600)}`
      );
      res.json({ ok: true, sent });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── GET /health — for Docker health checks ─────────────────────
  app.get("/health", async (_req, res) => {
    try {
      const accounts = await listAccounts();
      const active = accounts.filter((a) => a.status === "active");
      res.json({
        status: "ok",
        activeTokens: active.length,
        totalTokens: accounts.length,
        telegramAdmins: alertChatIds.length,
        assignments: Object.fromEntries(assignments),
      });
    } catch (e) {
      res.status(500).json({ status: "error", error: e.message });
    }
  });

  const server = app.listen(port, host, () => {
    console.log(`🌐 Token API running on http://${host}:${port}`);
    console.log(`   GET  /tokens`);
    console.log(`   GET  /assign/:workerId`);
    console.log(`   POST /report-captcha`);
    console.log(`   POST /alert`);
    console.log(`   GET  /health`);
  });

  return server;
}
