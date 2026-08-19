import type { ExecResult } from "../types.js";

/**
 * fs/sip.ts — System Integrity Protection probe.
 *
 * A SIP-`restricted` path cannot be removed even with `sudo rm`, so offering a
 * command for one wastes the user's time (we burned a round-trip on
 * `/Library/Updates` in the manual session). Detectors call this before
 * offering any command under a system root; a restricted path becomes
 * `level: "blocked"` with no `reclaim`.
 *
 * Probe: `stat -f "%Sf" <path>` prints the file flags, comma-separated
 * ("restricted,hidden") or "-" when there are none. This is more robust than
 * parsing `ls -ldO` columns. Results are cached within a scan.
 */

type ExecFn = (argv: string[]) => Promise<ExecResult>;
type ExistsFn = (path: string) => Promise<boolean>;

export type SipProbe = (path: string) => Promise<boolean>;

/** Build a scan-scoped SIP probe (its cache lives as long as the returned closure). */
export function createSipProbe(exec: ExecFn, pathExists: ExistsFn): SipProbe {
  const cache = new Map<string, boolean>();

  return async function isSipRestricted(path: string): Promise<boolean> {
    const cached = cache.get(path);
    if (cached !== undefined) return cached;

    // A path that doesn't exist can't be blocked — nothing to restrict.
    if (!(await pathExists(path))) {
      cache.set(path, false);
      return false;
    }

    const { stdout, code } = await exec(["stat", "-f", "%Sf", path]);
    const flags = stdout.trim().split(",").map((f) => f.trim());
    const restricted = code === 0 && flags.includes("restricted");
    cache.set(path, restricted);
    return restricted;
  };
}
