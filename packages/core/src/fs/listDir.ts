import { readdir } from "node:fs/promises";

/**
 * Immediate subdirectory names of `path` (directories only, not files).
 * Returns `[]` if the path is missing, isn't a directory, or is unreadable —
 * never throws. A pure read-only fs call (not a subprocess), so — like
 * fs/exists.ts and fs/lastUsed.ts — it doesn't go through the exec allowlist;
 * that allowlist exists to gate spawned binaries, not plain Node fs reads.
 */
export async function listSubdirs(path: string): Promise<string[]> {
  try {
    const entries = await readdir(path, { withFileTypes: true });
    return entries.filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
    return [];
  }
}
