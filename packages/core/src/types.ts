/**
 * reclaimd core contract.
 *
 * This file is THE boundary between the engine, every detector, and every UI
 * surface (CLI, Raycast, any future consumer). A change here ripples to all
 * three — treat it with the discipline of a published API. See CLAUDE.md
 * ("The Finding Model", "The Detector Interface").
 *
 * SAFETY: nothing in this contract executes anything. `reclaim.command` is a
 * DISPLAY-ONLY string. There is deliberately no field, anywhere, that carries
 * an executable action.
 */

// ---------------------------------------------------------------------------
// String-literal unions
// ---------------------------------------------------------------------------

/**
 * How dangerous it is to reclaim a finding.
 * - `safe`    — regenerable cache, no user data, no configuration.
 * - `caution` — regenerable but expensive to restore, or it changes a workflow
 *               (e.g. the next install needs the network).
 * - `review`  — contains real user data; a HUMAN must decide. The tool only informs.
 * - `blocked` — SIP-restricted or system-critical. Report it, never offer a
 *               command. `blockedReason` says why.
 */
export type WarningLevel = "safe" | "caution" | "review" | "blocked";

/**
 * Where a `lastUsedAt` date came from, in descending confidence order.
 * `atime` is unreliable on macOS and must never be presented with the same
 * confidence as tool metadata — renderers de-emphasize and label it.
 */
export type LastUsedSource = "tool-metadata" | "mtime" | "atime" | "unknown";

/**
 * The shape of a reclaim action (for display only — see `Finding.reclaim`).
 * - `delete`      — a targeted removal of a specific subtree.
 * - `reset`       — the owning tool resets the thing without destroying it
 *                   (e.g. `simctl erase` keeps the device, drops the bloat).
 *                   Preferred over `delete` when available.
 * - `app-managed` — the owning tool's own prune/cleanup subcommand.
 */
export type ReclaimKind = "delete" | "reset" | "app-managed";

/** How costly a detector is to run — the engine gates `slow` behind opt-in. */
export type DetectorCost = "fast" | "moderate" | "slow";

// ---------------------------------------------------------------------------
// The Finding model
// ---------------------------------------------------------------------------

export interface Finding {
  /** Stable, unique id for this finding (a detector may emit several). */
  id: string;
  /** Id of the detector that produced this finding (`Detector.id`). */
  detector: string;
  /** Human title, e.g. "iOS Simulator runtime — iOS 26.0.1". */
  title: string;
  /** The exact path(s) this finding covers — a targeted subtree, never a whole app container. */
  paths: string[];
  /** Headline size: the on-disk / best reclaimable estimate, in bytes. */
  sizeBytes: number;
  /**
   * Logical size, only when it meaningfully diverges from `sizeBytes`
   * (APFS clones / sparse files). Optional — omit when it equals `sizeBytes`.
   */
  apparentSizeBytes?: number;
  level: WarningLevel;
  /** Best-known last-used timestamp, if any. Confidence is carried by `lastUsedSource`. */
  lastUsedAt?: Date;
  /** Where `lastUsedAt` came from. Always set, even when `lastUsedAt` is absent (`"unknown"`). */
  lastUsedSource: LastUsedSource;
  /** Plain English, no jargon: what this actually is. */
  whatItIs: string;
  /** The observable behavior change if it's removed. */
  ifRemoved: string;
  /** What else breaks or notices — sibling data, tools, workflows. */
  dependents: string[];
  reversible: {
    possible: boolean;
    /** How to get it back, e.g. "Xcode ▸ Settings ▸ Platforms". */
    how?: string;
    /** Re-download / rebuild cost in bytes, when known. */
    costBytes?: number;
  };
  /**
   * The reclaim recommendation, when one exists.
   *
   * `reclaim.command` is **DISPLAY ONLY — never executed.** It is rendered for
   * a human to copy and run themselves. There is no code path from this string
   * to execution anywhere in reclaimd, and none may ever be added. A `blocked`
   * finding has no `reclaim` at all.
   */
  reclaim?: {
    /** DISPLAY ONLY — never executed. Rendered for a human to copy and run. */
    command: string;
    requiresSudo: boolean;
    kind: ReclaimKind;
  };
  /** Set **iff** `level === "blocked"` — explains why no command is offered. */
  blockedReason?: string;
}

// ---------------------------------------------------------------------------
// Shapes returned by the fs safety layer (implemented in RS3)
// ---------------------------------------------------------------------------

export interface SizeResult {
  /** Logical size (sum of file sizes), in bytes. */
  apparentBytes: number;
  /** On-disk size (actual blocks consumed), in bytes — the honest figure for APFS clones/sparse. */
  diskBytes: number;
  /**
   * The honest reclaimable estimate, in bytes. Defaults to `diskBytes` unless a
   * detector knows better (e.g. APFS snapshots share blocks with the live FS).
   */
  reclaimableBytes: number;
  /**
   * True when the size could not be determined (e.g. `EPERM` without Full Disk
   * Access). Consumers must render "size unknown", never treat the bytes as 0.
   */
  unknown?: boolean;
}

export interface ExecResult {
  stdout: string;
  stderr: string;
  /** Process exit code (null if terminated by signal). */
  code: number | null;
}

/** Result of resolving a last-used date for a path, with its provenance. */
export interface LastUsedResult {
  at?: Date;
  source: LastUsedSource;
}

// ---------------------------------------------------------------------------
// The Detector interface + its read-only context
// ---------------------------------------------------------------------------

/**
 * The read-only helpers handed to every detector. Every helper here is
 * observe-only — there is deliberately no mutate/delete/exec-arbitrary helper.
 * `exec` runs a read-only allowlist only (enforced in RS3's fs/exec.ts).
 */
export interface DetectorContext {
  /** The user's home directory. */
  home: string;
  /** Size a path (apparent vs on-disk vs reclaimable). */
  dirSize(path: string): Promise<SizeResult>;
  /** Whether a path carries the SIP `restricted` flag. Non-existent paths → false. */
  isSipRestricted(path: string): Promise<boolean>;
  /** Resolve a last-used date + its source (mtime/atime/unknown; tools pass tool-metadata directly). */
  lastUsed(path: string): Promise<LastUsedResult>;
  /** Run a READ-ONLY allowlisted invocation. Rejects any mutating argv. Never a shell string. */
  exec(argv: string[]): Promise<ExecResult>;
  /** Whether a path exists. */
  pathExists(path: string): Promise<boolean>;
  /** Emit a diagnostic line (routed by the engine/consumer). */
  log(msg: string): void;
  /** Cancellation signal for the current scan, if any. */
  signal?: AbortSignal;
}

export interface Detector {
  /** Stable, kebab-case id — the `Finding.detector` value. */
  id: string;
  /** Human label. */
  title: string;
  /** How costly this detector is; the engine gates `slow` detectors behind opt-in. */
  cost: DetectorCost;
  /**
   * Whether this detector runs on a default scan. Defaults to `true` for
   * `fast`/`moderate` detectors and `false` for `slow` ones. When `false`,
   * the detector only runs when the scan opts into slow/disabled detectors.
   */
  enabledByDefault?: boolean;
  /** Probe known paths / tool metadata and return findings. Must no-op (return []) when its tool/path is absent. */
  scan(ctx: DetectorContext): Promise<Finding[]>;
}

// ---------------------------------------------------------------------------
// Scan options + result
// ---------------------------------------------------------------------------

export interface ScanOptions {
  /** Include `slow` / not-enabled-by-default detectors. Default false. */
  includeSlow?: boolean;
  /** If set, only run detectors whose id is in this list. */
  only?: string[];
  /** Cancellation signal — honored between detectors. */
  signal?: AbortSignal;
  /** Called for each finding as it is produced, so a UI can render progressively. */
  onFinding?: (finding: Finding) => void;
}

/** Why a detector did not contribute findings to a scan. */
export type SkipReason =
  /** Cost `slow` (or explicitly disabled) and the scan didn't opt in. */
  | "slow"
  /** Excluded by an `only` filter. */
  | "filtered"
  /** Threw during `scan()` — one bad detector must not sink the whole scan. */
  | "error"
  /** The scan was aborted before this detector ran. */
  | "aborted"
  /**
   * The detector's underlying tool isn't installed. Reserved: v1 detectors
   * no-op by returning `[]` (so they appear in `ranDetectors` with zero
   * findings); surfacing this distinctly is a future refinement.
   */
  | "not-installed";

export interface SkippedDetector {
  /** The skipped detector's id. */
  detector: string;
  reason: SkipReason;
  /** Extra context, e.g. the error message when `reason === "error"`. */
  detail?: string;
}

export interface ScanResult {
  findings: Finding[];
  startedAt: Date;
  finishedAt: Date;
  /** Ids of detectors that ran to completion (may have produced zero findings). */
  ranDetectors: string[];
  /** Detectors that did not run (or errored), each with a reason. */
  skipped: SkippedDetector[];
}
