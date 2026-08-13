import { extractPublicLandlines, extractPublicPhoneNumbers } from "../utils/phone.js";

const CONTACT_TEXT = /^(?:نمایش\s+)?(?:اطلاعات\s+تماس|تماس)$/;

export function extractPublicContactData(rawText) {
  return {
    publicPhones: extractPublicPhoneNumbers(rawText),
    publicLandlines: extractPublicLandlines(rawText),
  };
}

export function classifyAuthenticationEvidence({ texts = [], errorText = "" } = {}) {
  if (/خطا در شناسایی حساب کاربری/.test(errorText)) return { authenticated: null, evidence: "account-identification-error" };
  if (texts.some((text) => /^(?:ورود|ثبت.?نام|ورود و ثبت.?نام)$/.test(text))) {
    return { authenticated: false, evidence: "visible-login-control" };
  }
  if (texts.some((text) => /دیوار من|حساب من|خروج از حساب/.test(text))) {
    return { authenticated: true, evidence: "visible-account-control" };
  }
  return { authenticated: null, evidence: null };
}

export function contactStatus({ publicPhones = [], publicLandlines = [], contactButtonAvailable = false, requiresAuthentication = null }) {
  if (publicPhones.length || publicLandlines.length) return "public-phone-found";
  if (contactButtonAvailable && requiresAuthentication === true) return "authentication-required";
  if (contactButtonAvailable) return "contact-button-available";
  return "no-contact-information";
}

export function contactEnrichmentStatus({ hasPublicContact = false, contactButtonAvailable = false, requiresAuthentication = null, providerAvailable = false }) {
  if (providerAvailable) return "authorized-provider-available";
  if (contactButtonAvailable && requiresAuthentication === true) return "authentication-required";
  if (hasPublicContact || contactButtonAvailable) return "public-only";
  return "unavailable";
}

export async function inspectAuthenticationState(page) {
  try {
    const evidence = await page.evaluate(() => {
      const visible = (element) => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
      };
      return {
        errorText: document.querySelector("#error-state, [role=alert]")?.innerText || "",
        texts: [...document.querySelectorAll('a, button, [role="button"]')]
          .filter(visible)
          .map((element) => (element.innerText || element.textContent || "").replace(/\s+/g, " ").trim())
          .filter(Boolean),
      };
    });
    return classifyAuthenticationEvidence(evidence);
  } catch {
    return { authenticated: null, evidence: null };
  }
}

export async function inspectContactState(page) {
  const authentication = await inspectAuthenticationState(page);
  let button = null;
  try {
    button = await page.evaluate((patternSource) => {
      const pattern = new RegExp(patternSource);
      const visible = (element) => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
      };
      const elements = [...document.querySelectorAll('button, a, [role="button"]')];
      const match = elements.find((element) => pattern.test((element.innerText || element.textContent || "").replace(/\s+/g, " ").trim()));
      if (!match) return null;
      return {
        text: (match.innerText || match.textContent || "").replace(/\s+/g, " ").trim() || null,
        visible: visible(match),
        disabled: match.matches(":disabled") || match.getAttribute("aria-disabled") === "true",
        authenticationHint: /ورود|احراز هویت/.test(`${match.getAttribute("aria-label") || ""} ${match.title || ""}`),
      };
    }, CONTACT_TEXT.source);
  } catch {}

  let requiresAuthentication = null;
  if (button) {
    if (button.authenticationHint) requiresAuthentication = true;
    else if (authentication.authenticated === false) requiresAuthentication = true;
    else if (authentication.authenticated === true) requiresAuthentication = false;
  }

  return {
    contactButtonAvailable: Boolean(button),
    contactButton: {
      text: button?.text ?? null,
      disabled: button ? Boolean(button.disabled) : null,
      visible: Boolean(button?.visible),
    },
    requiresAuthentication,
    authenticated: authentication.authenticated,
  };
}
