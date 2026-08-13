import { convertPersianDigits } from "./persian.js";

function candidates(text) {
  if (!text) return [];
  const normalized = convertPersianDigits(text);
  return normalized.match(/(?<!\d)(?:\+?98|0098|0)?[\d][\d\s-]{8,16}\d(?!\d)/g) || [];
}

function normalizeIranianNumber(candidate) {
  let digits = candidate.replace(/\D/g, "");
  if (digits.startsWith("0098")) digits = digits.slice(4);
  else if (digits.startsWith("98")) digits = digits.slice(2);

  if (digits.length === 10 && /^[1-9]/.test(digits)) digits = `0${digits}`;
  return digits;
}

export function extractPublicPhoneNumbers(text) {
  return [...new Set(candidates(text)
    .map(normalizeIranianNumber)
    .filter((number) => /^09\d{9}$/.test(number)))];
}

export function extractPublicLandlines(text) {
  return [...new Set(candidates(text)
    .map(normalizeIranianNumber)
    .filter((number) => /^0[1-8]\d{9}$/.test(number)))];
}
