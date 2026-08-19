import type { ExecResult, SizeResult } from "../types.js";

/**
 * fs/size.ts — path sizing.
 *
 * `du -s -k <path>`      → on-disk size (allocated blocks), 1024-byte units.
 * `du -A -s -k <path>`   → apparent size (logical bytes), 1024-byte units.
 *
 * These DIVERGE for APFS sparse files and clones: a 10 GB `Docker.raw` or a
 * VM `rootfs.img` can be near-empty on disk (apparent >> on-disk). `diskBytes`
 * is the honest headline; `reclaimableBytes` defaults to `diskBytes` and a
 * detector may lower it when it knows the space is shared (e.g. APFS snapshots
 * share blocks with the live filesystem).
 *
 * Full Disk Access: `du` on a protected path (e.g. MobileSync backups) exits
 * non-zero with "Operation not permitted" — it does NOT throw. We DEGRADE that
 * to `unknown: true` rather than reporting 0 (which reads as "empty, ignore me").
 */

type ExecFn = (argv: string[]) => Promise<ExecResult>;

const UNKNOWN: SizeResult = { apparentBytes: 0, diskBytes: 0, reclaimableBytes: 0, unknown: true };

function isPermissionDenied(stderr: string): boolean {
  return /Operation not permitted|Permission denied/i.test(stderr);
}

/** Parse the leading integer (KB) of a `du` summary line and convert to bytes. */
function parseDuKilobytes(stdout: string): number {
  const line = stdout.trim().split("\n").pop() ?? "";
  const kb = Number.parseInt(line.split(/\s+/)[0] ?? "", 10);
  return Number.isFinite(kb) ? kb * 1024 : NaN;
}

export type DirSize = (path: string) => Promise<SizeResult>;

export function createDirSize(exec: ExecFn): DirSize {
  async function du(path: string, apparent: boolean): Promise<number | "denied"> {
    const argv = apparent ? ["du", "-A", "-s", "-k", path] : ["du", "-s", "-k", path];
    const { stdout, stderr, code } = await exec(argv);
    if (code !== 0) {
      if (isPermissionDenied(stderr)) return "denied";
      throw new Error(`du failed for ${path} (code ${code}): ${stderr.trim() || "unknown error"}`);
    }
    const bytes = parseDuKilobytes(stdout);
    if (!Number.isFinite(bytes)) {
      throw new Error(`du produced unparseable output for ${path}: ${JSON.stringify(stdout)}`);
    }
    return bytes;
  }

  return async function dirSize(path: string): Promise<SizeResult> {
    const disk = await du(path, false);
    if (disk === "denied") return UNKNOWN;
    const apparent = await du(path, true);
    // Apparent could still be denied in a race; treat the whole thing as unknown.
    if (apparent === "denied") return UNKNOWN;
    return { apparentBytes: apparent, diskBytes: disk, reclaimableBytes: disk };
  };
}
