// src/crawler/contact.js

import { config } from "../config.js";
import {
  getCurrentToken,
  reportCaptcha,
  waitForToken,
  reportSuccess,
} from "./tokenClient.js";
export { contactEnrichmentStatus, contactStatus } from "../utils/contactStatus.js";

const WORKER_ID = process.env.WORKER_ID || "worker-standalone";

// ── Global CAPTCHA gate (shared by all workers in this process) ──────────────
let captchaPauseActive = false;
let captchaWaiters = [];

// Contact request throttling — guarantees requests are at least
// `contactRequestIntervalMs` apart even when workers run concurrently.
let contactRequestSchedule = Promise.resolve();
let lastContactRequestAt = 0;

async function waitForContactRequestSlot(token) {
  const scheduled = contactRequestSchedule.then(async () => {
    const elapsed = Date.now() - lastContactRequestAt;
    const waitMs = Math.max(0, config.crawler.contactRequestIntervalMs - elapsed);
    if (waitMs > 0) {
      console.log(
        `[CONTACT] waiting ${(waitMs / 1000).toFixed(1)}s before requesting ${token}`
      );
      await new Promise((r) => setTimeout(r, waitMs));
    }
    lastContactRequestAt = Date.now();
  });
  contactRequestSchedule = scheduled.catch(() => {});
  await scheduled;
}

function pauseAllWorkersForCaptcha() {
  captchaPauseActive = true;
}

function resumeAllWorkers() {
  captchaPauseActive = false;
  for (const resolve of captchaWaiters) resolve();
  captchaWaiters = [];
}

async function waitIfCaptchaActive() {
  if (!captchaPauseActive) return;
  console.log("⏸️  Worker paused — waiting for CAPTCHA solve...");
  await new Promise((resolve) => captchaWaiters.push(resolve));
  console.log("▶️  Worker resumed");
}

// ── Low-level API call using account from token-bot ──────────────────────────
async function callContactApi(page, token, account) {
  await waitForContactRequestSlot(token);

  return page.evaluate(
    async ({ postToken, authToken }) => {
      try {
        const r = await fetch(
          `https://api.divar.ir/v8/postcontact/web/contact_info_v2/${postToken}`,
          {
            method: "POST",
            credentials: "include",
            headers: {
              "Content-Type": "application/json",
              Accept: "application/json",
              "x-standard-divar-error": "true",
              Authorization: `Basic ${authToken}`,
            },
            body: JSON.stringify({}),
          }
        );
        const text = await r.text();
        let data = null;
        try { data = JSON.parse(text); } catch {}
        return { status: r.status, body: text, data };
      } catch (e) {
        return { status: 0, body: e.message, data: null };
      }
    },
    { postToken: token, authToken: account.sAccessToken }
  );
}

// ── Response classifiers ─────────────────────────────────────────────────────
function isCaptchaPayload(data, body) {
  if (data?.hip_action?.method === "CAPTCHA") return true;
  if (data?.hip_action?.method?.toUpperCase?.() === "CAPTCHA") return true;
  const text = (body || "").toLowerCase();
  return (
    text.includes('"method": "captcha"') ||
    text.includes('"method":"captcha"')
  );
}

function isAuthFailure(status) {
  return status === 401 || status === 403 || status === 429;
}

// ── Phone parsers ────────────────────────────────────────────────────────────
function normalizePhone(raw) {
  if (!raw || typeof raw !== "string") return null;
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("09")) return digits;
  if (digits.length === 12 && digits.startsWith("989")) return "0" + digits.slice(2);
  if (digits.length === 10 && digits.startsWith("9")) return "0" + digits;
  return null;
}

function parsePhoneFromApiResponse(json) {
  if (!json || !Array.isArray(json.widget_list)) return null;
  for (const widget of json.widget_list) {
    const p = widget?.data?.action?.payload?.phone_number;
    if (p) {
      const n = normalizePhone(String(p));
      if (n) return n;
    }
    const v = widget?.data?.value;
    if (v && typeof v === "string") {
      const n = normalizePhone(v);
      if (n) return n;
    }
  }
  return null;
}

// ── CAPTCHA handler ──────────────────────────────────────────────────────────
// 1) Report to token-bot immediately (which alerts you via Telegram)
// 2) Try to get a replacement token
// 3) If no replacement exists, wait for /login and immediately resume
async function handleCaptchaChallenge(_page, listingToken) {
  // If another worker already handling — just wait
  if (captchaPauseActive) {
    await waitIfCaptchaActive();
    const replacementAccount = await getCurrentToken();
    return { phone: null, replacementAccount };
  }

  pauseAllWorkersForCaptcha();

  console.log("\n🚨════════════════════════════════════════════════════");
  console.log(`🚨  CAPTCHA on listing ${listingToken}`);
  console.log(`🚨  Reporting to token-bot for replacement...`);
  console.log("🚨════════════════════════════════════════════════════\n");

  try {
    // ── Step 1: report to bot → get replacement token ────────────────────────
    const replacement = await reportCaptcha(listingToken);

    if (replacement) {
      console.log(
        `[${WORKER_ID}] 🔄 Replacement token: ${replacement.phone}. Resuming.`
      );
      return { phone: null, replacementAccount: replacement };
    }

    // ── Step 2: no replacement — wait directly for Telegram /login ──────────
    console.log(`[${WORKER_ID}] ⏸️  Waiting for a successful Telegram /login...`);
    const fresh = await waitForToken();
    return { phone: null, replacementAccount: fresh };
  } catch (err) {
    console.log(`⚠️  CAPTCHA handler error: ${err.message}`);
    return { phone: null, replacementAccount: null };
  } finally {
    resumeAllWorkers();
  }
}

export function classifyAuthenticationEvidence({ texts = [], errorText = "" } = {}) {
  const normalized = [...texts, errorText]
    .map((value) => String(value || "").replace(/\s+/g, " ").trim())
    .filter(Boolean);

  if (normalized.some((text) => /دیوار من|حساب من|خروج از حساب/.test(text))) {
    return { authenticated: true, evidence: "visible-account-control" };
  }
  if (normalized.some((text) => /^(ورود|ثبت.?نام)$|ورود به حساب/.test(text))) {
    return { authenticated: false, evidence: "visible-login-control" };
  }
  return { authenticated: null, evidence: null };
}

// ── Public: inspect contact button and visible login state ───────────────────
export async function inspectContactState(page) {
  try {
    const evidence = await page.evaluate(() => ({
      texts: [...document.querySelectorAll("a, button")]
        .map((element) => (element.innerText || "").replace(/\s+/g, " ").trim())
        .filter((text) => /دیوار من|حساب من|خروج از حساب|ورود|ثبت.?نام/.test(text)),
      errorText: document.querySelector('[role="alert"], [class*="error"]')?.innerText || "",
    }));
    const authentication = classifyAuthenticationEvidence(evidence);
    const button = await page.evaluate(() => {
      const clean = (v) => (v || "").replace(/\s+/g, " ").trim();
      const btn = [...document.querySelectorAll("button, a, [role='button']")].find(
        (el) => {
          const t = clean(el.innerText);
          return (
            t.includes("اطلاعات تماس") ||
            t.includes("نمایش شماره") ||
            t.includes("تماس")
          );
        }
      );
      if (!btn) {
        return null;
      }
      const style = window.getComputedStyle(btn);
      const rect = btn.getBoundingClientRect();
      return {
        text: clean(btn.innerText),
        disabled: btn.disabled || btn.getAttribute("aria-disabled") === "true",
        visible:
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          rect.width > 0,
      };
    });
    if (!button) {
      return {
        contactButtonAvailable: false,
        contactButton: { text: null, disabled: null, visible: false },
        requiresAuthentication: null,
        authenticated: null,
      };
    }
    return {
      contactButtonAvailable: true,
      contactButton: {
        text: button.text ?? null,
        disabled: button.disabled ?? null,
        visible: Boolean(button.visible),
      },
      requiresAuthentication:
        authentication.authenticated === null ? null : !authentication.authenticated,
      authenticated: authentication.authenticated,
    };
  } catch {
    return {
      contactButtonAvailable: false,
      contactButton: { text: null, disabled: null, visible: false },
      requiresAuthentication: null,
      authenticated: null,
    };
  }
}

// ── Public: main phone extraction ────────────────────────────────────────────
export async function extractPhoneNumber(page, token) {
  console.log(`\n╔══════════════════════════════════════════════════════`);
  console.log(`║ 📡 extractPhoneNumber (worker: ${WORKER_ID})`);
  console.log(`║ Token: ${token}`);
  console.log(`╚══════════════════════════════════════════════════════`);

  try {
    if (!token) return { authenticatedPhone: null, source: "no-token" };

    await waitIfCaptchaActive();

    // ── Step 1: get token from bot API ───────────────────────────────────────
    let account = await getCurrentToken();
    if (!account) {
      console.log(`[${WORKER_ID}] ⏸️  No token available. Waiting for bot...`);
      account = await waitForToken();
    }

    console.log(`🔑 Using account: ${account.phone}`);

    // ── Step 2: try direct API ───────────────────────────────────────────────
    let result = await callContactApi(page, token, account);
    console.log(`📥 HTTP ${result.status}`);
    console.log(`📥 Body: ${(result.body || "").slice(0, 250)}`);

    // ── Step 3: CAPTCHA path ─────────────────────────────────────────────────
    if (isCaptchaPayload(result.data, result.body)) {
      console.log(`🚨 CAPTCHA challenge detected for ${token}`);
      const { phone, replacementAccount } = await handleCaptchaChallenge(page, token);

      if (phone) {
        return { authenticatedPhone: phone, source: "manual-captcha-solve" };
      }

      if (replacementAccount) {
        // Retry once with fresh token
        console.log(
          `[${WORKER_ID}] 🔄 Retrying with replacement: ${replacementAccount.phone}`
        );
        result = await callContactApi(page, token, replacementAccount);
        console.log(`📥 Retry HTTP ${result.status}`);
        console.log(`📥 Retry body: ${(result.body || "").slice(0, 250)}`);

        // If replacement ALSO gets CAPTCHA, give up on this listing
        if (isCaptchaPayload(result.data, result.body)) {
          console.log(`[${WORKER_ID}] 🚨 Replacement token also CAPTCHA'd`);
          await reportCaptcha(token);
          return { authenticatedPhone: null, source: "all-tokens-captcha" };
        }
      } else {
        return { authenticatedPhone: null, source: "captcha-unresolved" };
      }
    }

    // ── Step 4: Auth failures (401/403/429) ─────────────────────────────────
    if (isAuthFailure(result.status)) {
      console.log(`🚨 Auth failure HTTP ${result.status}`);
      const { phone, replacementAccount } = await handleCaptchaChallenge(page, token);

      if (phone) {
        return { authenticatedPhone: phone, source: "manual-after-auth-fail" };
      }

      if (replacementAccount) {
        result = await callContactApi(page, token, replacementAccount);
      } else {
        return { authenticatedPhone: null, source: `http-${result.status}` };
      }
    }

    // ── Step 5: unexpected non-200 ───────────────────────────────────────────
    if (result.status !== 200) {
      return { authenticatedPhone: null, source: `http-${result.status}` };
    }

    if (isCaptchaPayload(result.data, result.body)) {
      return { authenticatedPhone: null, source: "captcha-unresolved" };
    }

    // ── Step 6: parse phone ──────────────────────────────────────────────────
    const phone = parsePhoneFromApiResponse(result.data);
    if (phone) {
      await reportSuccess();
      console.log(`\n✅✅✅ PHONE: ${phone} (${token}) ✅✅✅\n`);
      return { authenticatedPhone: phone, source: "divar-api" };
    }

    console.log(`⚠️  200 but no phone. Data: ${JSON.stringify(result.data).slice(0, 400)}`);
    return { authenticatedPhone: null, source: "api-no-phone" };
  } catch (error) {
    console.log(`💥 extractPhoneNumber error: ${error.message}`);
    return { authenticatedPhone: null, source: "error" };
  }
}

// ── Session helper used by session.js ────────────────────────────────────────
// Now checks bot API — cookies in browser don't matter since we use bearer token
export async function inspectAuthenticationState(page) {
  try {
    const account = await getCurrentToken();
    if (account?.sAccessToken) {
      return { authenticated: true, evidence: `token-bot: ${account.phone}` };
    }
  } catch {}

  // Fallback: check browser cookies for backward compatibility
  try {
    return await page.evaluate(() => {
      const clean = (v) => (v || "").replace(/\s+/g, " ").trim();
      const accountControl = document.querySelector(
        '[data-testid*="account"], [class*="account-control"], [href*="/my-divar"], [href*="/profile"]'
      );
      if (accountControl)
        return { authenticated: true, evidence: "visible-account-control" };

      const loginButton = [...document.querySelectorAll("a, button")].find((el) => {
        const t = clean(el.innerText);
        return t === "ورود" || t === "ثبت‌نام" || t.includes("ورود به حساب");
      });
      if (loginButton)
        return { authenticated: false, evidence: "login-button-visible" };

      if (
        document.cookie.includes("sAccessToken") ||
        document.cookie.includes("sFrontToken")
      ) {
        return { authenticated: true, evidence: "auth-cookie-present" };
      }
      return { authenticated: null, evidence: "no-indicator-found" };
    });
  } catch (error) {
    return { authenticated: null, evidence: `error: ${error.message}` };
  }
}
