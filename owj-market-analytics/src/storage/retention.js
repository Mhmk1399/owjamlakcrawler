import fs from "node:fs/promises";
import path from "node:path";

export async function cleanupOldDebugArtifacts(serviceRoot, {
  maxAgeDays = 14,
  now = Date.now(),
} = {}) {
  const targets = [
    path.join(serviceRoot, "screenshots", "search-debug.png"),
    path.join(serviceRoot, "data", "search-debug.html"),
  ];
  const removed = [];
  for (const file of targets) {
    const stat = await fs.stat(file).catch((error) => error.code === "ENOENT" ? null : Promise.reject(error));
    if (!stat || now - stat.mtimeMs <= maxAgeDays * 86_400_000) continue;
    await fs.rm(file);
    removed.push(file);
  }
  return { checked: targets.length, removed, maxAgeDays };
}
