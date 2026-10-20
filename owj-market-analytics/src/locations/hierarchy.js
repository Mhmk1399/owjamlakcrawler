import fs from "node:fs";
import { fileURLToPath } from "node:url";

// Static reference data belongs beside the resolver, not in the disposable
// runtime data directory (which operators may clear between crawl runs).
const DEFAULT_PLACES_FILE = fileURLToPath(new URL("./places.json", import.meta.url));

export function normalizePersianPlaceName(value) {
  return String(value ?? "").normalize("NFKC")
    .replace(/[يى]/g, "ی").replace(/ك/g, "ک").replace(/[ةۀ]/g, "ه")
    .replace(/[أإٱ]/g, "ا").replace(/[\u064B-\u065F\u0670\u200c\u200d]/g, "")
    .replace(/[()،,._/\\-]+/g, " ").replace(/\s+/g, " ").trim().toLocaleLowerCase("fa");
}

const normalizeSlug = (value) => String(value ?? "").trim().toLowerCase();

function levenshtein(left, right) {
  if (left === right) return 0;
  let previous = [...Array(right.length + 1).keys()];
  for (let row = 1; row <= left.length; row += 1) {
    const current = [row];
    for (let column = 1; column <= right.length; column += 1) {
      current[column] = Math.min(current[column - 1] + 1, previous[column] + 1,
        previous[column - 1] + (left[row - 1] === right[column - 1] ? 0 : 1));
    }
    previous = current;
  }
  return previous[right.length];
}

const publicNode = (node) => node ? ({
  id: node.id, name: node.name, slug: node.slug, parent: node.parent, type: String(node.type),
}) : null;

export function createLocationHierarchy(places) {
  if (!Array.isArray(places)) throw new TypeError("Places document must be an array");
  const byId = new Map();
  const bySlug = new Map();
  const byName = new Map();
  const childrenByParent = new Map();
  for (const raw of places) {
    const id = Number(raw?.id);
    if (!Number.isInteger(id) || !raw?.name || !raw?.slug) continue;
    const node = publicNode({ ...raw, id, parent: Number(raw.parent) });
    byId.set(id, node);
    bySlug.set(normalizeSlug(node.slug), node);
    const name = normalizePersianPlaceName(node.name);
    byName.set(name, [...(byName.get(name) || []), node]);
    childrenByParent.set(node.parent, [...(childrenByParent.get(node.parent) || []), node]);
  }
  for (const children of childrenByParent.values()) {
    children.sort((a, b) => a.name.localeCompare(b.name, "fa") || a.id - b.id);
  }
  const getNodeById = (id) => byId.get(Number(id)) || null;
  const getNodeBySlug = (slug) => bySlug.get(normalizeSlug(slug)) || null;
  const getChildren = (parentId) => [...(childrenByParent.get(Number(parentId)) || [])];
  const getPath = (id) => {
    const path = [];
    const visited = new Set();
    let current = getNodeById(id);
    while (current && !visited.has(current.id)) {
      visited.add(current.id); path.unshift(current); current = getNodeById(current.parent);
    }
    return path;
  };
  function findByName(value, { parentId = null, type = null, fuzzy = true } = {}) {
    const query = normalizePersianPlaceName(value);
    if (!query) return null;
    const allowed = (node) => (parentId === null || node.parent === Number(parentId)) &&
      (type === null || node.type === String(type));
    const exact = (byName.get(query) || []).find(allowed);
    if (exact) return { node: exact, exact: true, similarity: 1 };
    if (!fuzzy || query.length < 3) return null;
    let best = null;
    for (const node of byId.values()) {
      if (!allowed(node)) continue;
      const candidate = normalizePersianPlaceName(node.name);
      const similarity = 1 - levenshtein(query, candidate) / Math.max(query.length, candidate.length);
      if (similarity >= 0.82 && (!best || similarity > best.similarity)) best = { node, exact: false, similarity };
    }
    return best;
  }
  function resolveListingLocation(listing) {
    const area = listing?.crawlPartition?.area;
    let match = area?.slug ? getNodeBySlug(area.slug) : null;
    let matchConfidence = match ? "exact-slug" : null;
    if (!match && Number.isInteger(area?.id)) {
      match = getNodeById(area.id); matchConfidence = match ? "crawl-partition" : null;
    }
    if (!match && area?.name) {
      match = findByName(area.name, { fuzzy: false })?.node || null;
      matchConfidence = match ? "crawl-partition" : null;
    }
    for (const [value, type] of [[listing?.neighborhood, "4"], [listing?.district, "4"], [listing?.city, "2"]]) {
      if (match || !value) continue;
      match = findByName(value, { type, fuzzy: false })?.node || null;
      matchConfidence = match ? "exact-name" : null;
    }
    if (!match) return { provinceId: null, cityId: null, neighborhoodId: null, slug: null, name: null, matchConfidence: "unmatched" };
    const path = getPath(match.id);
    const province = [...path].reverse().find((node) => node.type === "1");
    const city = [...path].reverse().find((node) => node.type === "2");
    const neighborhood = [...path].reverse().find((node) => node.type === "4");
    return { provinceId: province?.id ?? null, cityId: city?.id ?? null,
      neighborhoodId: neighborhood?.id ?? null, slug: match.slug, name: match.name, matchConfidence };
  }
  return { size: byId.size, getChildren, getPath, getNodeById, getNodeBySlug, findByName,
    findTehranNeighborhoods: () => getChildren(1).filter((node) => node.type === "4"), resolveListingLocation };
}

export const loadPlaces = (file = DEFAULT_PLACES_FILE) => JSON.parse(fs.readFileSync(file, "utf8"));
export const locationHierarchy = createLocationHierarchy(loadPlaces());
export const getChildren = locationHierarchy.getChildren;
export const getPath = locationHierarchy.getPath;
export const getNodeBySlug = locationHierarchy.getNodeBySlug;
export const getNodeById = locationHierarchy.getNodeById;
export const findTehranNeighborhoods = locationHierarchy.findTehranNeighborhoods;
export const resolveListingLocation = locationHierarchy.resolveListingLocation;
