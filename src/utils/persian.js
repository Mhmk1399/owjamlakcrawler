const PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
const ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";

export function convertPersianDigits(value) {
  if (value === null || value === undefined) return value;

  return String(value)
    .replace(/[۰-۹]/g, (digit) => String(PERSIAN_DIGITS.indexOf(digit)))
    .replace(/[٠-٩]/g, (digit) => String(ARABIC_DIGITS.indexOf(digit)));
}

export function normalizePersianText(value) {
  if (value === null || value === undefined) return null;

  const normalized = String(value)
    .replace(/ي/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/\u200c{2,}/g, "\u200c")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return normalized || null;
}

export function extractPersianNumbers(value) {
  if (value === null || value === undefined) return [];

  const normalized = convertPersianDigits(value);
  const matches = normalized.match(/-?\d[\d,٬،.\s]*/g) || [];

  return matches
    .map((match) => match.replace(/[,٬،\s]/g, ""))
    .map((match) => Number(match))
    .filter(Number.isFinite);
}

export function parsePersianNumber(value) {
  const numbers = extractPersianNumbers(value);
  return numbers.length === 1 ? numbers[0] : null;
}

export function parsePersianMoney(value) {
  const number = parsePersianNumber(value);
  if (number === null) return null;

  const text = normalizePersianText(value);
  if (/میلیارد/.test(text)) return number * 1_000_000_000;
  if (/میلیون/.test(text)) return number * 1_000_000;
  if (/\bهزار\b/.test(text)) return number * 1_000;
  return number;
}

export function parsePersianBoolean(value) {
  const text = normalizePersianText(value);
  if (!text) return null;

  if (/ندارد|فاقد|بدون/.test(text)) return false;
  if (/دارد|موجود|هست/.test(text)) return true;
  return null;
}
