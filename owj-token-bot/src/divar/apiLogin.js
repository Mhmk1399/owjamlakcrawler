// src/divar/apiLogin.js
import { randomUUID } from "crypto";

const API_INITIATE = "https://api.divar.ir/v8/auth/open-initiate-page";
const API_CONSUME = "https://api.divar.ir/v8/authenticate/signinup/code/consume";

const USER_AGENT =
  "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/150.0.0.0 Mobile Safari/537.36";

function cookieString(did, cdid) {
  return `did=${did}; cdid=${cdid}; city=tehran; multi-city=tehran%7C; theme=dark`;
}

function initiateHeaders(did, cdid) {
  return {
    accept: "application/json-divar-filled",
    "content-type": "application/json",
    origin: "https://divar.ir",
    referer: "https://divar.ir/",
    "x-standard-divar-error": "true",
    "user-agent": USER_AGENT,
    cookie: cookieString(did, cdid),
  };
}

function consumeHeaders(did, cdid) {
  return {
    accept: "application/json, text/plain, */*",
    "content-type": "application/json",
    origin: "https://divar.ir",
    referer: "https://divar.ir/",
    "rid": "passwordless",             // ← SuperTokens recipe ID
    "st-auth-mode": "cookie",          // ← SuperTokens cookie mode
    "x-standard-divar-error": "true",
    "user-agent": USER_AGENT,
    cookie: cookieString(did, cdid),
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function extractHiddenString(data, key) {
  const widgets = data?.page?.widget_list || [];
  for (const w of widgets) {
    if (w.widget_type !== "I_HIDDEN_ROW") continue;
    const field = w.data?.string_field;
    if (field?.key === key) return field.default || null;
  }
  const json = JSON.stringify(data);
  const re = new RegExp(`"key"\\s*:\\s*"${key}"[\\s\\S]*?"default"\\s*:\\s*"([^"]+)"`);
  const m = json.match(re);
  return m?.[1] || null;
}

function parseSetCookies(response) {
  const list =
    typeof response.headers.getSetCookie === "function"
      ? response.headers.getSetCookie()
      : [];

  const joined = list.length
    ? list.join("; ")
    : response.headers.get("set-cookie") || "";

  const get = (name) => {
    const m = joined.match(new RegExp(`${name}=([^;]+)`));
    return m ? decodeURIComponent(m[1]) : null;
  };

  return {
    sAccessToken: get("sAccessToken"),
    sFrontToken: get("sFrontToken"),
    raw: joined,
  };
}

async function post(url, body, headers) {
  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch {}
  return { res, data, text, cookies: parseSetCookies(res) };
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Step 1: request OTP for a phone number
 */
export async function initiateLogin(phone) {
  if (!/^09\d{9}$/.test(phone)) {
    throw new Error("Phone must be like 09xxxxxxxxx");
  }

  const did = randomUUID();
  const cdid = randomUUID();
  const headers = initiateHeaders(did, cdid);

  // Page 0 — open modal
  await post(
    API_INITIATE,
    { specification: { page: 0, is_reload: false } },
    headers
  );

  // Page 1 — submit phone → server sends OTP SMS
  const { res, data, text } = await post(
    API_INITIATE,
    {
      specification: {
        page: 1,
        data: {
          data: { phone: { str: { value: phone } } },
          online_request_response_data: {},
        },
        is_reload: false,
      },
    },
    headers
  );

  if (!res.ok) {
    throw new Error(`Phone step failed HTTP ${res.status}: ${text.slice(0, 300)}`);
  }

  const preAuthSessionId = extractHiddenString(data, "pre_auth_session_id");
  const deviceId = extractHiddenString(data, "device_id");

  if (!preAuthSessionId || !deviceId) {
    throw new Error(`Missing session ids in response: ${text.slice(0, 500)}`);
  }

  return {
    phone,
    did,
    cdid,
    preAuthSessionId,
    deviceId,
    startedAt: Date.now(),
  };
}

/**
 * Step 2: consume OTP → returns tokens
 */
export async function completeLogin(session, otp) {
  if (!/^\d{4,8}$/.test(otp)) throw new Error("OTP must be digits");

  console.log("\n═══════════════ CONSUME LOGIN ═══════════════");
  console.log("[LOGIN] Phone:", session.phone);
  console.log("[LOGIN] preAuthSessionId:", session.preAuthSessionId);
  console.log("[LOGIN] deviceId:", session.deviceId);

  const { res, data, text, cookies } = await post(
    API_CONSUME,
    {
      preAuthSessionId: session.preAuthSessionId,
      deviceId: session.deviceId,
      userInputCode: otp,
    },
    consumeHeaders(session.did, session.cdid)
  );

  console.log("[LOGIN] Consume HTTP:", res.status);
  console.log(
    "[LOGIN] Tokens received:",
    `access=${cookies.sAccessToken ? "yes" : "no"}`,
    `front=${cookies.sFrontToken ? "yes" : "no"}`
  );
  console.log("[LOGIN] Body:", text.slice(0, 400));
  console.log("═══════════════════════════════════════════\n");

  if (!res.ok) {
    throw new Error(`Consume HTTP ${res.status}: ${text.slice(0, 300)}`);
  }

  // Preferred: tokens in Set-Cookie
  if (cookies.sAccessToken) {
    return buildAccount(session, cookies);
  }

  // Fallback: some SuperTokens setups return status in body
  if (data?.status && data.status !== "OK") {
    // e.g. "RESTART_FLOW_ERROR", "INCORRECT_USER_INPUT_CODE_ERROR"
    throw new Error(`Divar rejected OTP: ${data.status}`);
  }

  // Fallback: extract from body if present
  const bodyToken = text.match(/sAccessToken["']?\s*[:=]\s*["']([^"']+)/);
  if (bodyToken) {
    return buildAccount(session, {
      sAccessToken: bodyToken[1],
      sFrontToken:
        text.match(/sFrontToken["']?\s*[:=]\s*["']([^"']+)/)?.[1] || null,
      raw: text,
    });
  }

  throw new Error(
    "Consume returned OK but no tokens found. Response: " + text.slice(0, 400)
  );
}

function buildAccount(session, cookies) {
  return {
    phone: session.phone,
    sAccessToken: cookies.sAccessToken,
    sFrontToken: cookies.sFrontToken,
    did: session.did,
    cdid: session.cdid,
    deviceId: session.deviceId,
    loggedInAt: new Date().toISOString(),
    status: "active",
  };
}
