import { join } from "node:path";
import { registerDetector } from "../registry.js";
import { ensureLevel } from "../fs/paths.js";
import { listSubdirs } from "../fs/listDir.js";
import type { Detector, Finding, LastUsedResult } from "../types.js";

/**
 * sparkle-caches — Sparkle updater caches ONLY, never the enclosing container.
 *
 * The Sparkle framework's own convention is a directory literally named
 * "Sparkle" appended to the app's caches dir:
 *   - per-app:         ~/Library/Caches/<bundle-id>/Sparkle
 *   - group-container: ~/Library/Group Containers/<group-id>/Library/Caches/Sparkle
 *
 * We build these candidate paths deterministically from a shallow, bounded
 * listing of the two known parent roots (Ground Rule 10 — no blind full-disk
 * walk) and check existence — we do NOT recursively search for anything named
 * "sparkle". That distinction matters: on the dev machine, a case-insensitive
 * substring search would have false-positived on
 * ".../AnimatedEmojis/iOS_Sparkles_2728_v1" (a WhatsApp emoji asset — nothing
 * to do with the Sparkle updater). Only an exact "Sparkle" path SEGMENT counts.
 *
 * CRITICAL (from the manual audit): the same app can hold a disposable Sparkle
 * cache AND an irreplaceable data store side by side (WhatsApp: its Sparkle
 * cache is safe to remove; its sibling Group Containers/…/Message store is
 * 10 GB of real chat media — the opposite verdict). A Finding's `paths` here
 * is ALWAYS exactly the "…/Sparkle" leaf directory — it must never widen to
 * include the parent bundle-id/group-id folder or any sibling.
 */

type PathExists = (p: string) => Promise<boolean>;
type ListSubdirsFn = (p: string) => Promise<string[]>;

/**
 * Per-app candidates: ~/Library/Caches/<bundle-id>/Sparkle. Injectable
 * pathExists/listSubdirs so the "never a sibling" guarantee is unit-testable
 * without touching real disk.
 */
export async function findPerAppSparkleCaches(
  pathExists: PathExists,
  listSubdirsFn: ListSubdirsFn,
  cachesRoot: string,
): Promise<string[]> {
  const found: string[] = [];
  for (const bundleId of await listSubdirsFn(cachesRoot)) {
    const candidate = join(cachesRoot, bundleId, "Sparkle");
    if (await pathExists(candidate)) found.push(candidate);
  }
  return found;
}

/** Group-container candidates: ~/Library/Group Containers/<group-id>/Library/Caches/Sparkle. */
export async function findGroupContainerSparkleCaches(
  pathExists: PathExists,
  listSubdirsFn: ListSubdirsFn,
  groupContainersRoot: string,
): Promise<string[]> {
  const found: string[] = [];
  for (const groupId of await listSubdirsFn(groupContainersRoot)) {
    const candidate = join(groupContainersRoot, groupId, "Library/Caches/Sparkle");
    if (await pathExists(candidate)) found.push(candidate);
  }
  return found;
}

/** Derive a readable app label from the Sparkle leaf's parent (bundle-id or group-id). */
export function appLabelFromSparklePath(sparklePath: string): string {
  const parts = sparklePath.split("/");
  const sparkleIdx = parts.lastIndexOf("Sparkle");
  // Group-container form: …/<group-id>/Library/Caches/Sparkle — walk back past Library/Caches.
  if (sparkleIdx >= 2 && parts[sparkleIdx - 1] === "Caches" && parts[sparkleIdx - 2] === "Library") {
    return parts[sparkleIdx - 3] ?? "unknown app";
  }
  // Per-app form: …/Caches/<bundle-id>/Sparkle
  return parts[sparkleIdx - 1] ?? "unknown app";
}

/**
 * Pure finding builder — exported so the "paths are exactly the Sparkle leaf,
 * never a sibling" guarantee is unit-testable.
 */
export function buildSparkleFinding(
  sparklePath: string,
  sizeBytes: number,
  apparentSizeBytes: number | undefined,
  lastUsed: LastUsedResult,
): Finding {
  const appLabel = appLabelFromSparklePath(sparklePath);
  return {
    id: `sparkle-cache:${sparklePath}`,
    detector: "sparkle-caches",
    title: `Sparkle updater cache — ${appLabel}`,
    // Exactly the Sparkle leaf — never the enclosing bundle-id/group-id container.
    paths: [sparklePath],
    sizeBytes,
    apparentSizeBytes,
    level: ensureLevel(sparklePath, "safe"),
    lastUsedAt: lastUsed.at,
    lastUsedSource: lastUsed.source,
    whatItIs:
      `The Sparkle auto-update framework's download/staging cache for "${appLabel}" — ` +
      "update packages it fetched and verified before installing. This targets ONLY that " +
      "Sparkle subtree; any of the app's real data living alongside it (in the same cache " +
      "root or group container) is a separate, untouched location.",
    ifRemoved:
      "Nothing breaks. Sparkle re-downloads whatever it needs the next time it checks for " +
      "or installs an update.",
    dependents: [`${appLabel}'s auto-update check`],
    reversible: {
      possible: true,
      how: "Re-downloaded automatically on the app's next update check",
    },
    reclaim: {
      command: `rm -rf "${sparklePath}"`,
      requiresSudo: false,
      kind: "delete",
    },
  };
}

export const sparkleCaches: Detector = {
  id: "sparkle-caches",
  title: "Sparkle updater caches",
  cost: "moderate",
  async scan(ctx): Promise<Finding[]> {
    const cachesRoot = join(ctx.home, "Library/Caches");
    const groupContainersRoot = join(ctx.home, "Library/Group Containers");

    const candidates = [
      ...(await findPerAppSparkleCaches(ctx.pathExists, listSubdirs, cachesRoot)),
      ...(await findGroupContainerSparkleCaches(ctx.pathExists, listSubdirs, groupContainersRoot)),
    ];

    const findings: Finding[] = [];
    for (const sparklePath of candidates) {
      const size = await ctx.dirSize(sparklePath);
      const bytes = size.unknown ? 0 : size.diskBytes;
      if (!size.unknown && bytes === 0) continue; // empty — nothing to report

      const lu = await ctx.lastUsed(sparklePath);
      findings.push(buildSparkleFinding(sparklePath, bytes, size.unknown ? undefined : size.apparentBytes, lu));
    }

    return findings;
  },
};

registerDetector(sparkleCaches);
