// src/crawler/contact.js

// ── Global CAPTCHA state ─────────────────────────────────────────────────────
let captchaPauseActive = false;

async function waitIfCaptchaActive() {
  if (!captchaPauseActive) return;
  console.log("⏸️  Worker paused - waiting for CAPTCHA...");
  await new Promise((resolve) => {
    const check = setInterval(() => {
      if (!captchaPauseActive) {
        clearInterval(check);
        resolve();
      }
    }, 500);
  });
  console.log("▶️  Worker resumed");
}

async function handleCaptchaChallenge(page, token) {
  if (captchaPauseActive) {
    await waitIfCaptchaActive();
    return;
  }
  captchaPauseActive = true;
  console.log("\n🚨 CAPTCHA / AUTH FAILURE - solve in browser window");
  console.log(`🚨 Trigger token: ${token}\n`);

  try {
    await page.goto(`https://divar.ir/v/x/${token}`, { waitUntil: "domcontentloaded" });
    await page.bringToFront();

    const maxWaitMs = 5 * 60 * 1000;
    const startedAt = Date.now();
    let solved = false;

    while (!solved && Date.now() - startedAt < maxWaitMs) {
      await new Promise((r) => setTimeout(r, 3000));
      const test = await callContactApi(page, token, "  [captcha-check] ");
      if (test.status === 200) {
        solved = true;
        console.log("\n✅ Session restored\n");
      } else {
        process.stdout.write(".");
      }
    }
    if (!solved) console.log("\n⛔ Timeout");
  } finally {
    captchaPauseActive = false;
  }
}

function isCaptchaOrAuthResponse(status, bodyText) {
  if (status === 401 || status === 403 || status === 429) return true;
  if (!bodyText) return false;
  const lower = bodyText.toLowerCase();
  return lower.includes("captcha") || lower.includes("challenge") || lower.includes("recaptcha");
}

// ─────────────────────────────────────────────────────────────────────────────
// ⭐ THE CRITICAL FUNCTION - now includes Authorization header
// ─────────────────────────────────────────────────────────────────────────────
async function callContactApi(page, token, logPrefix = "  [api] ") {
  // Step 1: Get sAccessToken from context cookies (attached to divar.ir)
  const context = page.context();
  const cookies = await context.cookies("https://divar.ir");
  const accessTokenCookie = cookies.find((c) => c.name === "sAccessToken");
  const accessToken = accessTokenCookie?.value;

  console.log(`${logPrefix}Token: ${token}`);
  console.log(`${logPrefix}sAccessToken found in cookies: ${accessToken ? "YES (length=" + accessToken.length + ")" : "❌ NO"}`);

  if (!accessToken) {
    console.log(`${logPrefix}⚠️  Cannot call API without sAccessToken`);
    // Debug: show what cookies WERE found
    console.log(`${logPrefix}Available cookies: ${cookies.map(c => c.name).join(", ")}`);
    return { status: 0, body: "no-access-token", data: null };
  }

  // Step 2: Call API from inside browser page, passing token as Authorization
  const result = await page.evaluate(
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
              Authorization: `Basic ${authToken}`,   // ← THE MISSING PIECE
            },
            body: JSON.stringify({}),
          }
        );
        const text = await r.text();
        let parsed = null;
        try { parsed = JSON.parse(text); } catch {}
        return { status: r.status, body: text, data: parsed };
      } catch (e) {
        return { status: 0, body: "fetch-error: " + e.message, data: null };
      }
    },
    { postToken: token, authToken: accessToken }
  );

  console.log(`${logPrefix}HTTP Status: ${result.status}`);
  console.log(`${logPrefix}Body preview: ${(result.body || "").slice(0, 200)}`);

  return result;
}

export async function inspectContactState(page) {
  try {
    return await page.evaluate(() => {
      const clean = (v) => (v || "").replace(/\s+/g, " ").trim();
      const btn = [...document.querySelectorAll('button, [role="button"]')].find(
        (el) =>
          clean(el.innerText).includes("اطلاعات تماس") ||
          clean(el.innerText).includes("نمایش شماره") ||
          clean(el.innerText).includes("تماس با")
      );
      if (!btn) {
        return {
          contactButtonAvailable: false,
          contactButton: { text: null, disabled: null, visible: false },
          requiresAuthentication: null,
          authenticated: null,
        };
      }
      const style = window.getComputedStyle(btn);
      const rect = btn.getBoundingClientRect();
      return {
        contactButtonAvailable: true,
        contactButton: {
          text: clean(btn.innerText),
          disabled: btn.disabled || btn.getAttribute("aria-disabled") === "true",
          visible: style.display !== "none" && style.visibility !== "hidden" && rect.width > 0,
        },
        requiresAuthentication: false,
        authenticated: true,
      };
    });
  } catch {
    return {
      contactButtonAvailable: false,
      contactButton: { text: null, disabled: null, visible: false },
      requiresAuthentication: null,
      authenticated: null,
    };
  }
}

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

export async function extractPhoneNumber(page, token) {
  console.log(`\n╔══════════════════════════════════════════════════════`);
  console.log(`║ 📡 extractPhoneNumber called`);
  console.log(`║ Token: ${token}`);
  console.log(`║ Page URL: ${page.url()}`);
  console.log(`╚══════════════════════════════════════════════════════`);

  try {
    if (!token) {
      console.log(`❌ NO TOKEN PROVIDED`);
      return { authenticatedPhone: null, source: "no-token" };
    }

    await waitIfCaptchaActive();

    // ── Get cookies ──────────────────────────────────────────────────────────
    const context = page.context();
    const cookies = await context.cookies("https://divar.ir");
    console.log(`🍪 Total cookies found: ${cookies.length}`);
    console.log(`🍪 Cookie names: ${cookies.map(c => c.name).join(", ")}`);
    
    const accessTokenCookie = cookies.find((c) => c.name === "sAccessToken");
    console.log(`🔑 sAccessToken cookie: ${accessTokenCookie ? `FOUND (${accessTokenCookie.value.length} chars)` : "❌ NOT FOUND"}`);

    if (!accessTokenCookie) {
      console.log(`⚠️  Cannot proceed without sAccessToken`);
      return { authenticatedPhone: null, source: "no-token-cookie" };
    }

    const accessToken = accessTokenCookie.value;

    // ── Call API ─────────────────────────────────────────────────────────────
    console.log(`📞 Making API call to: https://api.divar.ir/v8/postcontact/web/contact_info_v2/${token}`);
    console.log(`📞 With Authorization: Basic ${accessToken.slice(0, 30)}...`);

    const result = await page.evaluate(
      async ({ postToken, authToken }) => {
        try {
          const url = `https://api.divar.ir/v8/postcontact/web/contact_info_v2/${postToken}`;
          console.log(`[BROWSER] Fetching: ${url}`);
          
          const r = await fetch(url, {
            method: "POST",
            credentials: "include",
            headers: {
              "Content-Type": "application/json",
              Accept: "application/json",
              "x-standard-divar-error": "true",
              Authorization: `Basic ${authToken}`,
            },
            body: JSON.stringify({}),
          });
          
          const text = await r.text();
          console.log(`[BROWSER] Response status: ${r.status}`);
          console.log(`[BROWSER] Response text: ${text.slice(0, 300)}`);
          
          let parsed = null;
          try { parsed = JSON.parse(text); } catch (e) {
            console.log(`[BROWSER] JSON parse failed: ${e.message}`);
          }
          
          return { status: r.status, body: text, data: parsed };
        } catch (e) {
          console.log(`[BROWSER] Fetch error: ${e.message}`);
          return { status: 0, body: "fetch-error: " + e.message, data: null };
        }
      },
      { postToken: token, authToken: accessToken }
    );

    console.log(`\n📥 API Response received:`);
    console.log(`📥 HTTP Status: ${result.status}`);
    console.log(`📥 Body (first 400 chars): ${result.body?.slice(0, 400)}`);
    console.log(`📥 Data parsed: ${result.data ? "YES" : "NO"}`);
    
    if (result.data) {
      console.log(`📥 widget_list exists: ${Array.isArray(result.data.widget_list)}`);
      console.log(`📥 widget_list length: ${result.data.widget_list?.length}`);
    }

    if (result.status !== 200) {
      console.log(`❌ Non-200 status: ${result.status}`);
      return { authenticatedPhone: null, source: `http-${result.status}` };
    }

    // ── Parse phone ──────────────────────────────────────────────────────────
    console.log(`\n🔎 Parsing response for phone...`);
    const phone = parsePhoneFromApiResponse(result.data);
    
    if (phone) {
      console.log(`\n✅✅✅ PHONE FOUND: ${phone} for token ${token} ✅✅✅\n`);
      return { authenticatedPhone: phone, source: "divar-api" };
    }

    console.log(`⚠️  Response was 200 but couldn't extract phone`);
    console.log(`⚠️  Full data: ${JSON.stringify(result.data, null, 2)}`);
    return { authenticatedPhone: null, source: "api-no-phone" };
    
  } catch (error) {
    console.log(`\n💥 EXCEPTION in extractPhoneNumber:`);
    console.log(`💥 Message: ${error.message}`);
    console.log(`💥 Stack: ${error.stack}`);
    return { authenticatedPhone: null, source: "error" };
  }
}
export async function inspectAuthenticationState(page) {
  try {
    return await page.evaluate(() => {
      const clean = (v) => (v || "").replace(/\s+/g, " ").trim();
      const accountControl = document.querySelector(
        '[data-testid*="account"], [class*="account-control"], [href*="/my-divar"], [href*="/profile"]'
      );
      if (accountControl) return { authenticated: true, evidence: "visible-account-control" };

      const loginButton = [...document.querySelectorAll("a, button")].find((el) => {
        const t = clean(el.innerText);
        return t === "ورود" || t === "ثبت‌نام" || t.includes("ورود به حساب");
      });
      if (loginButton) return { authenticated: false, evidence: "login-button-visible" };

      const hasAuthCookie =
        document.cookie.includes("sAccessToken") || document.cookie.includes("sFrontToken");
      if (hasAuthCookie) return { authenticated: true, evidence: "auth-cookie-present" };

      return { authenticated: null, evidence: "no-indicator-found" };
    });
  } catch (error) {
    return { authenticated: null, evidence: `error: ${error.message}` };
  }
}

export function contactStatus({ publicPhones, publicLandlines, contactButtonAvailable, requiresAuthentication }) {
  if (publicPhones?.length > 0 || publicLandlines?.length > 0) return "public";
  if (contactButtonAvailable && requiresAuthentication === false) return "contact-button-available";
  if (contactButtonAvailable && requiresAuthentication === true) return "requires-auth";
  if (contactButtonAvailable) return "contact-button-available";
  return "no-contact";
}

export function contactEnrichmentStatus({ hasPublicContact, contactButtonAvailable, requiresAuthentication, providerAvailable }) {
  if (hasPublicContact) return "public-only";
  if (contactButtonAvailable && !requiresAuthentication) return "enrichable";
  if (providerAvailable) return "provider-available";
  return "not-enrichable";
}