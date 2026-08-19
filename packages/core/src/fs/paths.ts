import { homedir } from "node:os";
import { join } from "node:path";
import type { WarningLevel } from "../types.js";

/**
 * fs/paths.ts — home resolution, known-path builders, and the never-safe guard.
 *
 * The guard (`ensureLevel`) is a BACKSTOP behind detector discipline, not a
 * substitute for it: even if a detector wrongly proposes `"safe"` for a path
 * holding real user data, this forces it to `"review"`. Detectors should still
 * classify correctly on their own.
 */

/** The user's home directory. */
export function home(): string {
  return homedir();
}

/** Expand a leading `~` / `~/…` to the home directory; other paths pass through. */
export function expandTilde(path: string, homeDir: string = home()): string {
  if (path === "~") return homeDir;
  if (path.startsWith("~/")) return join(homeDir, path.slice(2));
  return path;
}

/**
 * Roots that must NEVER be marked `safe` — they hold user-chosen files or real
 * user data, so removal is always a human decision. Absolute, under `home`.
 */
export function protectedRoots(homeDir: string = home()): string[] {
  return [
    join(homeDir, "Documents"),
    join(homeDir, "Desktop"),
    join(homeDir, "Pictures"), // also covers "Pictures/Photos Library.photoslibrary"
    join(homeDir, "Downloads"),
    join(homeDir, "Library", "Application Support", "MobileSync", "Backup"),
  ];
}

/** Whether `path` is at or under a protected root (tilde-expanded first). */
export function isProtected(path: string, homeDir: string = home()): boolean {
  const abs = expandTilde(path, homeDir);
  return protectedRoots(homeDir).some((root) => abs === root || abs.startsWith(root + "/"));
}

/**
 * The never-safe guard. If a detector proposes `"safe"` for a protected path,
 * downgrade to `"review"`. Any other proposed level passes through unchanged —
 * the guard only ever makes a finding MORE cautious, never less.
 */
export function ensureLevel(path: string, proposed: WarningLevel, homeDir: string = home()): WarningLevel {
  if (proposed === "safe" && isProtected(path, homeDir)) return "review";
  return proposed;
}
