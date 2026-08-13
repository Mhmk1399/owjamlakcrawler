import fs from "node:fs/promises";
import path from "node:path";

export const listingsDirectory = path.resolve("data/listings");

function safeToken(token) {
  const value = String(token || "");
  if (!value || !/^[a-zA-Z0-9_-]+$/.test(value)) throw new Error(`Unsafe listing token: ${value || "(missing)"}`);
  return value;
}

export function listingFilePath(token, directory = listingsDirectory) {
  return path.join(directory, `${safeToken(token)}.json`);
}

export async function writeListingAtomic(listing, directory = listingsDirectory) {
  if (!listing?.token) throw new Error("Cannot persist a listing without a token");
  await fs.mkdir(directory, { recursive: true });
  const destination = listingFilePath(listing.token, directory);
  const temporary = `${destination}.tmp`;
  await fs.writeFile(temporary, JSON.stringify(listing, null, 2), "utf8");
  await fs.rename(temporary, destination);
  return destination;
}

export async function validSavedTokens(directory = listingsDirectory) {
  let names = [];
  try { names = await fs.readdir(directory); } catch (error) {
    if (error.code === "ENOENT") return new Set();
    throw error;
  }
  const tokens = new Set();
  for (const name of names) {
    if (!name.endsWith(".json")) continue;
    const token = name.slice(0, -5);
    try {
      const parsed = JSON.parse(await fs.readFile(path.join(directory, name), "utf8"));
      if (parsed?.token === token && parsed?.url && parsed?.title) tokens.add(token);
    } catch {}
  }
  return tokens;
}

export async function generateCombinedListings({
  directory = listingsDirectory,
  output = path.resolve("data/listings.json"),
} = {}) {
  const names = (await fs.readdir(directory).catch((error) => error.code === "ENOENT" ? [] : Promise.reject(error)))
    .filter((name) => name.endsWith(".json"))
    .sort();
  const listings = [];
  for (const name of names) {
    try {
      const parsed = JSON.parse(await fs.readFile(path.join(directory, name), "utf8"));
      if (parsed?.token) listings.push(parsed);
    } catch {}
  }
  await fs.mkdir(path.dirname(output), { recursive: true });
  const temporary = `${output}.tmp`;
  await fs.writeFile(temporary, JSON.stringify(listings, null, 2), "utf8");
  await fs.rename(temporary, output);
  return { count: listings.length, output };
}

export async function summarizeListingFiles(directory = listingsDirectory) {
  const names = (await fs.readdir(directory).catch((error) => error.code === "ENOENT" ? [] : Promise.reject(error)))
    .filter((name) => name.endsWith(".json"));
  const summary = { records: 0, publicPhones: 0, publicLandlines: 0, contactButtons: 0 };
  for (const name of names) {
    try {
      const listing = JSON.parse(await fs.readFile(path.join(directory, name), "utf8"));
      summary.records += 1;
      summary.publicPhones += listing.contact?.publicPhones?.length || 0;
      summary.publicLandlines += listing.contact?.publicLandlines?.length || 0;
      if (listing.contact?.contactButtonAvailable) summary.contactButtons += 1;
    } catch {}
  }
  return summary;
}
