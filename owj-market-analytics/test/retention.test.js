import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { cleanupOldDebugArtifacts } from "../src/storage/retention.js";

test("debug retention removes only named expired artifacts", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "owj-retention-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.mkdir(path.join(root, "screenshots"), { recursive: true });
  await fs.mkdir(path.join(root, "data"), { recursive: true });
  const old = path.join(root, "screenshots", "search-debug.png");
  const keep = path.join(root, "screenshots", "keep.png");
  await fs.writeFile(old, "old");
  await fs.writeFile(keep, "keep");
  const oldTime = new Date("2026-01-01T00:00:00.000Z");
  await fs.utimes(old, oldTime, oldTime);
  const result = await cleanupOldDebugArtifacts(root, { maxAgeDays: 14, now: Date.parse("2026-10-20T00:00:00.000Z") });
  assert.deepEqual(result.removed, [old]);
  await assert.rejects(fs.access(old));
  await fs.access(keep);
});
