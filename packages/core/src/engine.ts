import { getDetectors } from "./registry.js";
import { exec as realExec, type ExecOptions } from "./fs/exec.js";
import { createSipProbe } from "./fs/sip.js";
import { createDirSize } from "./fs/size.js";
import { createLastUsed } from "./fs/lastUsed.js";
import { pathExists } from "./fs/exists.js";
import { home as homeDir } from "./fs/paths.js";
import type {
  DetectorContext,
  ExecResult,
  ScanOptions,
  ScanResult,
  SkippedDetector,
  Finding,
} from "./types.js";

/**
 * Build the real DetectorContext for a scan, backed by the fs safety layer.
 * Every subprocess goes through the read-only `exec` allowlist, bound to this
 * scan's AbortSignal so cancellation propagates into `du`/`stat`/`simctl`/…
 */
function createContext(signal?: AbortSignal): DetectorContext {
  const boundExec = (argv: string[], opts: ExecOptions = {}): Promise<ExecResult> =>
    realExec(argv, { signal, ...opts });

  return {
    home: homeDir(),
    dirSize: createDirSize(boundExec),
    isSipRestricted: createSipProbe(boundExec, pathExists),
    lastUsed: createLastUsed(),
    exec: (argv: string[]) => boundExec(argv),
    pathExists,
    log: (msg: string) => console.error(`[reclaimd] ${msg}`),
    signal,
  };
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Whether a detector runs on a default scan: `fast`/`moderate` do,
 * `slow` does not, and an explicit `enabledByDefault` wins either way.
 */
function isDefaultEnabled(cost: string, enabledByDefault?: boolean): boolean {
  if (enabledByDefault !== undefined) return enabledByDefault;
  return cost !== "slow";
}

/**
 * Run every registered detector, streaming findings as they are produced.
 *
 * Skips a detector when an `only` filter excludes it, or when it's gated off
 * (slow / not enabled by default) and the scan didn't opt in via `includeSlow`.
 * Per-detector errors are caught and recorded so one bad detector can't sink
 * the scan. Cancellation is honored between detectors.
 */
export async function scan(opts: ScanOptions = {}): Promise<ScanResult> {
  const startedAt = new Date();
  const findings: Finding[] = [];
  const ranDetectors: string[] = [];
  const skipped: SkippedDetector[] = [];
  const ctx = createContext(opts.signal);

  for (const detector of getDetectors()) {
    if (opts.signal?.aborted) {
      skipped.push({ detector: detector.id, reason: "aborted" });
      continue;
    }
    if (opts.only && !opts.only.includes(detector.id)) {
      skipped.push({ detector: detector.id, reason: "filtered" });
      continue;
    }
    if (!isDefaultEnabled(detector.cost, detector.enabledByDefault) && !opts.includeSlow) {
      skipped.push({ detector: detector.id, reason: "slow" });
      continue;
    }

    try {
      const produced = await detector.scan(ctx);
      ranDetectors.push(detector.id);
      for (const finding of produced) {
        findings.push(finding);
        opts.onFinding?.(finding);
      }
    } catch (err) {
      skipped.push({ detector: detector.id, reason: "error", detail: errorMessage(err) });
    }
  }

  return { findings, startedAt, finishedAt: new Date(), ranDetectors, skipped };
}
