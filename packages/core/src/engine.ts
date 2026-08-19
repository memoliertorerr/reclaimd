import { homedir } from "node:os";
import { getDetectors } from "./registry.js";
import type {
  DetectorContext,
  ScanOptions,
  ScanResult,
  SkippedDetector,
  Finding,
} from "./types.js";

/**
 * RS2 placeholder context. The fs helpers throw until the real safety layer
 * lands in RS3, which replaces this factory with one wired to fs/exec, fs/sip,
 * fs/size, fs/lastUsed, fs/paths. `home`, `log`, and `signal` are already real
 * — they aren't fs helpers, and detectors legitimately need them.
 */
function createContext(signal?: AbortSignal): DetectorContext {
  const notYet = (helper: string) => (): never => {
    throw new Error(`DetectorContext.${helper} is not implemented until RS3 (fs safety layer)`);
  };
  return {
    home: homedir(),
    dirSize: notYet("dirSize"),
    isSipRestricted: notYet("isSipRestricted"),
    lastUsed: notYet("lastUsed"),
    exec: notYet("exec"),
    pathExists: notYet("pathExists"),
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
