import test from "node:test";
import assert from "node:assert/strict";
import {
  classifyAuthenticationEvidence,
  contactEnrichmentStatus,
  contactStatus,
  inspectContactState,
} from "../src/crawler/contact.js";
import { sessionStateFromAuthentication } from "../src/crawler/session.js";
import { normalizeRealEstateListing } from "../src/parsers/realEstate.js";

test("classifies authenticated, anonymous, and unknown session evidence", () => {
  assert.deepEqual(classifyAuthenticationEvidence({ texts: ["دیوار من"] }), { authenticated: true, evidence: "visible-account-control" });
  assert.deepEqual(classifyAuthenticationEvidence({ texts: ["ورود"] }), { authenticated: false, evidence: "visible-login-control" });
  assert.deepEqual(classifyAuthenticationEvidence({ texts: [] }), { authenticated: null, evidence: null });
  assert.equal(sessionStateFromAuthentication(true), "authenticated");
  assert.equal(sessionStateFromAuthentication(false), "anonymous");
  assert.equal(sessionStateFromAuthentication(null), "unknown");
});

test("contact status follows public, authentication, button, and unavailable priority", () => {
  assert.equal(contactStatus({ publicPhones: ["09121234567"], contactButtonAvailable: true, requiresAuthentication: true }), "public-phone-found");
  assert.equal(contactStatus({ contactButtonAvailable: true, requiresAuthentication: true }), "authentication-required");
  assert.equal(contactStatus({ contactButtonAvailable: true, requiresAuthentication: false }), "contact-button-available");
  assert.equal(contactStatus({}), "no-contact-information");
  assert.equal(contactEnrichmentStatus({ providerAvailable: true }), "authorized-provider-available");
  assert.equal(contactEnrichmentStatus({ contactButtonAvailable: true, requiresAuthentication: true }), "authentication-required");
});

test("inspects absence of a contact button without interaction", async () => {
  const responses = [{ texts: [], errorText: "" }, null];
  const page = { evaluate: async () => responses.shift() };
  const result = await inspectContactState(page);
  assert.deepEqual(result, {
    contactButtonAvailable: false,
    contactButton: { text: null, disabled: null, visible: false },
    requiresAuthentication: null,
    authenticated: null,
  });
});

test("marks a visible contact button as authentication-required for an anonymous session", async () => {
  const responses = [
    { texts: ["ورود"], errorText: "" },
    { text: "نمایش اطلاعات تماس", visible: true, disabled: false, authenticationHint: false },
  ];
  const page = { evaluate: async () => responses.shift() };
  const result = await inspectContactState(page);
  assert.equal(result.contactButtonAvailable, true);
  assert.deepEqual(result.contactButton, { text: "نمایش اطلاعات تماس", disabled: false, visible: true });
  assert.equal(result.requiresAuthentication, true);
  assert.equal(result.authenticated, false);
});

test("normalization tracks public number sources", () => {
  const listing = normalizeRealEstateListing({
    token: "public-contact",
    url: "https://divar.ir/v/example/public-contact",
    title: "نمونه",
    description: "تماس عمومی: ۰۹۱۲۱۲۳۴۵۶۷",
    contact: {
      contactButtonAvailable: false,
      contactButton: { text: null, disabled: null, visible: false },
      authenticated: null,
      requiresAuthentication: null,
    },
  });
  assert.deepEqual(listing.contact.publicPhones, ["09121234567"]);
  assert.deepEqual(listing.contact.publicPhoneSources, { "09121234567": "description" });
  assert.equal(listing.contact.source, "description");
  assert.equal(listing.contact.status, "public-phone-found");
});
