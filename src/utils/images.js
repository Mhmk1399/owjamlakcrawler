const EXCLUDED_IMAGE = /(?:mapimage\.divarcdn\.com|android-chrome|favicon|logo|avatar|user[_-]?pic|profile|sprite|marker|placeholder|\/maps?\/|\.svg(?:\?|$))/i;

function imageUrl(value) {
  if (typeof value === "string") return value;
  if (value && typeof value.url === "string") return value.url;
  return null;
}

export function isListingImage(value) {
  const url = imageUrl(value);
  if (!url || !/^https?:\/\//i.test(url) || EXCLUDED_IMAGE.test(url)) return false;

  try {
    const parsed = new URL(url);
    return /divarcdn\.com$/i.test(parsed.hostname) || /divar\.ir$/i.test(parsed.hostname);
  } catch {
    return false;
  }
}

function underlyingImageKey(value) {
  const url = new URL(imageUrl(value));
  const decodedPath = decodeURIComponent(url.pathname);
  const uuid = decodedPath.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i)?.[1];
  if (uuid) return `${url.hostname}/${uuid.toLowerCase()}`;
  return `${url.hostname}${decodedPath}`
    .toLowerCase()
    .replace(/(?:webp[_-]?)?(?:post|thumbnail|thumb|small|medium|large)/g, "")
    .replace(/\.(?:webp|jpe?g|png)$/i, "")
    .replace(/[/_.-]+/g, "/")
    .replace(/^\/|\/$/g, "");
}

function quality(value) {
  const url = imageUrl(value);
  const variant = typeof value === "object" ? value.variant || "" : "";
  const text = `${variant} ${url}`.toLowerCase();
  if (/webp[_-]?post/.test(text)) return 50;
  if (/\bpost\b/.test(text) && /\.webp/.test(text)) return 45;
  if (/\.webp(?:\?|$)/.test(url)) return 40;
  if (/thumbnail|thumb|small/.test(text)) return 10;
  return 30;
}

export function filterListingImages(values = []) {
  const selected = new Map();

  for (const value of values) {
    if (!isListingImage(value)) continue;
    const url = imageUrl(value);
    const key = underlyingImageKey(value);
    const existing = selected.get(key);
    if (!existing || quality(value) > quality(existing)) selected.set(key, value);
  }

  return [...selected.values()].map(imageUrl);
}
