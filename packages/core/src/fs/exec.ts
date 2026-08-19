import { spawn as nodeSpawn, type SpawnOptions } from "node:child_process";
import type { ExecResult } from "../types.js";

/**
 * fs/exec.ts — the ONLY place reclaimd spawns a subprocess.
 *
 * Everything here is a READ-ONLY allowlist. `exec` validates argv against the
 * allowlist BEFORE spawning; a non-allowlisted or mutating invocation THROWS
 * (synchronously, before any process is created) rather than running. This is
 * the structural half of the Cardinal Rule: there is no code path from a
 * finding's display-only reclaim command to this function.
 *
 * Extend the allowlist in later steps ONLY with deliberate, reviewed read-only
 * probes. Never add a mutating subcommand, not behind a flag, not "just once".
 */

/** A rule decides whether an argv (given its `argv[0]` already matched) is a permitted read-only call. */
type ArgvRule = (rest: readonly string[]) => boolean;

/** Wholesale read-only binaries — these never mutate, so any args are allowed. */
const ALWAYS_READ_ONLY: ArgvRule = () => true;

/**
 * The allowlist: `argv[0]` → a rule over the remaining args.
 * A binary absent from this map is rejected outright.
 */
const ALLOWLIST: Record<string, ArgvRule> = {
  // Pure read-only inspectors.
  du: ALWAYS_READ_ONLY,
  stat: ALWAYS_READ_ONLY,
  ls: ALWAYS_READ_ONLY,
  mdls: ALWAYS_READ_ONLY,
  sw_vers: ALWAYS_READ_ONLY,

  // Tools with BOTH read and mutating subcommands — gate to the read-only ones.
  xcrun: (rest) => rest[0] === "simctl" && isReadOnlySimctl(rest.slice(1)),
  tmutil: (rest) => rest[0] === "listlocalsnapshots",
  brew: (rest) => rest[0] === "--cache" || rest[0] === "--prefix",
  go: (rest) => rest[0] === "env",
  defaults: (rest) => rest[0] === "read",
};

/**
 * Read-only `simctl` subcommands only. Explicitly NEVER delete/erase/boot/
 * shutdown/create/spawn/install/uninstall/io/… — those mutate simulator state.
 */
function isReadOnlySimctl(sub: readonly string[]): boolean {
  const cmd = sub[0];
  if (cmd === "list" || cmd === "help") return true;
  // `runtime` has both read (list/match/add-download-info) and mutating
  // (delete/…) forms — allow only its read-only `list`.
  if (cmd === "runtime") return sub[1] === "list";
  return false;
}

/** True iff `argv` is a permitted read-only invocation. Pure — never spawns. */
export function isAllowed(argv: readonly string[]): boolean {
  if (argv.length === 0) return false;
  const [bin, ...rest] = argv;
  const rule = bin === undefined ? undefined : ALLOWLIST[bin];
  return rule !== undefined && rule(rest);
}

/** Throws (loudly) if `argv` is not an allowlisted read-only invocation. Pure — never spawns. */
export function assertAllowed(argv: readonly string[]): void {
  if (!isAllowed(argv)) {
    throw new Error(
      `reclaimd exec REFUSED a non-allowlisted or mutating invocation: [${argv.join(" ")}]. ` +
        `fs/exec.ts only spawns read-only probes; reclaim commands are display-only and never executed.`,
    );
  }
}

export interface ExecOptions {
  /** Kill the child after this many ms. Default 120s (du can be slow on big trees). */
  timeoutMs?: number;
  /** Abort the child when this fires. */
  signal?: AbortSignal;
}

type SpawnFn = typeof nodeSpawn;

/**
 * Internal spawn runner, parameterized by the spawn implementation so tests can
 * inject a spy and PROVE that a refused argv never reaches spawn. `assertAllowed`
 * runs first, so a mutating argv throws before `spawnFn` is ever called.
 */
export function execWith(
  spawnFn: SpawnFn,
  argv: readonly string[],
  opts: ExecOptions = {},
): Promise<ExecResult> {
  assertAllowed(argv); // throws synchronously on a refused argv — no spawn happens
  const [bin, ...args] = argv as string[];
  const { timeoutMs = 120_000, signal } = opts;

  return new Promise<ExecResult>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error("exec aborted before start"));
      return;
    }
    const spawnOpts: SpawnOptions = { stdio: ["ignore", "pipe", "pipe"] };
    if (signal) spawnOpts.signal = signal;

    const child = spawnFn(bin as string, args, spawnOpts);
    let stdout = "";
    let stderr = "";
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      child.kill("SIGKILL");
    }, timeoutMs);

    child.stdout?.on("data", (d: Buffer) => (stdout += d.toString()));
    child.stderr?.on("data", (d: Buffer) => (stderr += d.toString()));

    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(err); // e.g. ENOENT when the tool isn't installed — detectors catch and no-op
    });

    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ stdout, stderr, code });
    });
  });
}

/**
 * Run a READ-ONLY allowlisted invocation. Throws synchronously if `argv` is not
 * allowlisted (a programming error — surface it loud). Never accepts a shell
 * string; argv array only, so there is no shell interpolation.
 */
export function exec(argv: readonly string[], opts: ExecOptions = {}): Promise<ExecResult> {
  return execWith(nodeSpawn, argv, opts);
}
