const DIVAR_ORIGIN = "https://divar.ir";

export function canonicalizeDivarUrl(value) {
  if (!value) return null;
  try {
    const url = new URL(value, DIVAR_ORIGIN);
    const parts = url.pathname.split("/").filter(Boolean);
    if (url.hostname !== "divar.ir" && !url.hostname.endsWith(".divar.ir")) return null;
    if (parts[0] !== "v" || parts.length < 2 || !parts.at(-1)) return null;
    const pathname = parts.map((part) => encodeURIComponent(decodeURIComponent(part))).join("/");
    return `${DIVAR_ORIGIN}/${pathname}`;
  } catch {
    return null;
  }
}

export function getDivarToken(value) {
  const url = canonicalizeDivarUrl(value);
  if (!url) return null;
  try {
    return decodeURIComponent(new URL(url).pathname.split("/").filter(Boolean).at(-1));
  } catch {
    return null;
  }
}
