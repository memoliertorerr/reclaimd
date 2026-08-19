import { stat } from "node:fs/promises";
import type { LastUsedResult } from "../types.js";

/**
 * fs/lastUsed.ts — resolve a "last used" date with an honest source label.
 *
 * Precedence: tool-metadata > mtime > atime > unknown. Detectors that have real
 * tool metadata (e.g. simctl's "Last Used At") build that `LastUsedResult`
 * themselves; THIS helper covers the filesystem cases — prefer `mtime`, fall
 * back to `atime`, else `unknown`.
 *
 * `atime` is unreliable on macOS (frequently disabled or updated lazily), so it
 * is only ever the LAST filesystem resort and is always labeled `"atime"` — it
 * is never dressed up as `mtime`.
 */

/** The mtime/atime inputs the resolver needs — a subset of `fs.Stats`, for easy testing. */
export interface StatsLike {
  mtimeMs: number;
  atimeMs: number;
}

function isUsableTime(ms: number): boolean {
  return Number.isFinite(ms) && ms > 0;
}

/** Pure resolver: pick a date + source from stat times. Never labels atime as mtime. */
export function resolveLastUsedFromStats(stats: StatsLike): LastUsedResult {
  if (isUsableTime(stats.mtimeMs)) return { at: new Date(stats.mtimeMs), source: "mtime" };
  if (isUsableTime(stats.atimeMs)) return { at: new Date(stats.atimeMs), source: "atime" };
  return { source: "unknown" };
}

type StatFn = (path: string) => Promise<StatsLike>;

export type LastUsed = (path: string) => Promise<LastUsedResult>;

/** Build the filesystem-backed `lastUsed(path)`. A stat failure degrades to `unknown`. */
export function createLastUsed(statFn: StatFn = stat): LastUsed {
  return async function lastUsed(path: string): Promise<LastUsedResult> {
    try {
      return resolveLastUsedFromStats(await statFn(path));
    } catch {
      return { source: "unknown" };
    }
  };
}
