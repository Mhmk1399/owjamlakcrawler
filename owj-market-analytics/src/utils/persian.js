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
