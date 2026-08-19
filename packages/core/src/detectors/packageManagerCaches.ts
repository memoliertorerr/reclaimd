import { join } from "node:path";
import { registerDetector } from "../registry.js";
import { ensureLevel } from "../fs/paths.js";
import type { Detector, DetectorContext, Finding, ReclaimKind } from "../types.js";

/**
 * package-manager-caches — npm/yarn/pnpm/Homebrew/pip/cargo/go local caches.
 *
 * One detector, several managers. Each manager contributes zero or more cache
 * "specs" (a manager can own more than one distinct cache with its own reclaim
 * command — go's module cache and build cache are cleaned separately). A
 * manager that isn't installed, or whose cache dir doesn't exist yet,
 * contributes nothing — no error, no bogus finding.
 *
 * All caution: every cache here is regenerable, but the next install/build
 * that needs an evicted package re-downloads it over the network (the exact
 * npm `_cacache` reasoning from the manual audit).
 */

interface CacheSpec {
  /** Suffix for the Finding id, e.g. "npm", "go-modcache". */
  managerId: string;
  /** Human label, e.g. "npm", "Go module cache". */
  label: string;
  /** The path(s) that together make up this cache. */
  paths: string[];
  /** DISPLAY ONLY reclaim command — the manager's own prune where one exists. */
  command: string;
  kind: ReclaimKind;
  requiresSudo?: boolean;
  /** Extra context appended to whatItIs, e.g. why cargo gets a raw rm instead of a prune. */
  note?: string;
}

/** Run a read-only cache-location query; null if the tool is absent or the query fails. */
async function queryToolPath(ctx: DetectorContext, argv: string[]): Promise<string | null> {
  try {
    const res = await ctx.exec(argv);
    if (res.code !== 0) return null;
    return res.stdout.trim().split("\n")[0]?.trim() || null;
  } catch {
    return null; // tool not installed (ENOENT) — no-op, never an error
  }
}

// --- Per-manager resolvers -------------------------------------------------
// Resolve to real paths where possible via the tool's own query; npm and cargo
// have no such read-only query, so their paths are the well-known locations.

async function npmSpecs(ctx: DetectorContext): Promise<CacheSpec[]> {
  return [
    {
      managerId: "npm",
      label: "npm",
      paths: [join(ctx.home, ".npm", "_cacache")],
      command: "npm cache clean --force",
      kind: "app-managed",
    },
  ];
}

async function yarnSpecs(ctx: DetectorContext): Promise<CacheSpec[]> {
  const dir = await queryToolPath(ctx, ["yarn", "cache", "dir"]);
  if (!dir) return [];
  return [{ managerId: "yarn", label: "yarn", paths: [dir], command: "yarn cache clean", kind: "app-managed" }];
}

async function pnpmSpecs(ctx: DetectorContext): Promise<CacheSpec[]> {
  const dir = await queryToolPath(ctx, ["pnpm", "store", "path"]);
  if (!dir) return [];
  return [{ managerId: "pnpm", label: "pnpm", paths: [dir], command: "pnpm store prune", kind: "app-managed" }];
}

async function brewSpecs(ctx: DetectorContext): Promise<CacheSpec[]> {
  const dir = await queryToolPath(ctx, ["brew", "--cache"]);
  if (!dir) return [];
  return [
    { managerId: "homebrew", label: "Homebrew", paths: [dir], command: "brew cleanup -s", kind: "app-managed" },
  ];
}

async function pipSpecs(ctx: DetectorContext): Promise<CacheSpec[]> {
  const dir = await queryToolPath(ctx, ["pip", "cache", "dir"]);
  if (!dir) return [];
  return [{ managerId: "pip", label: "pip", paths: [dir], command: "pip cache purge", kind: "app-managed" }];
}

async function cargoSpecs(ctx: DetectorContext): Promise<CacheSpec[]> {
  const cacheDir = join(ctx.home, ".cargo", "registry", "cache");
  const srcDir = join(ctx.home, ".cargo", "registry", "src");
  return [
    {
      managerId: "cargo",
      label: "Cargo",
      paths: [cacheDir, srcDir],
      command: `rm -rf "${cacheDir}" "${srcDir}"`,
      kind: "delete",
      note: "cargo has no first-class prune command, so this is a targeted removal of the registry cache and extracted sources only — never the crates themselves in your project's target/ dirs",
    },
  ];
}

async function goSpecs(ctx: DetectorContext): Promise<CacheSpec[]> {
  let stdout: string;
  try {
    const res = await ctx.exec(["go", "env", "GOMODCACHE", "GOCACHE"]);
    if (res.code !== 0) return [];
    stdout = res.stdout;
  } catch {
    return []; // go not installed
  }
  const [modCache, buildCache] = stdout.split("\n").map((l) => l.trim());

  const specs: CacheSpec[] = [];
  if (modCache) {
    specs.push({
      managerId: "go-modcache",
      label: "Go module cache",
      paths: [modCache],
      command: "go clean -modcache",
      kind: "app-managed",
    });
  }
  if (buildCache) {
    specs.push({
      managerId: "go-buildcache",
      label: "Go build cache",
      paths: [buildCache],
      command: "go clean -cache",
      kind: "app-managed",
    });
  }
  return specs;
}

const RESOLVERS: ((ctx: DetectorContext) => Promise<CacheSpec[]>)[] = [
  npmSpecs,
  yarnSpecs,
  pnpmSpecs,
  brewSpecs,
  pipSpecs,
  cargoSpecs,
  goSpecs,
];

/** Build a Finding from a spec, or null if the cache doesn't exist / is empty. */
async function buildFinding(ctx: DetectorContext, spec: CacheSpec): Promise<Finding | null> {
  const existingPaths: string[] = [];
  for (const p of spec.paths) {
    if (await ctx.pathExists(p)) existingPaths.push(p);
  }
  if (existingPaths.length === 0) return null; // manager present, no cache yet

  let totalBytes = 0;
  let anyUnknown = false;
  for (const p of existingPaths) {
    const size = await ctx.dirSize(p);
    if (size.unknown) anyUnknown = true;
    else totalBytes += size.diskBytes;
  }
  if (!anyUnknown && totalBytes === 0) return null; // empty cache — nothing to report

  const lu = await ctx.lastUsed(existingPaths[0] as string);
  const noteSuffix = spec.note ? ` ${spec.note}.` : "";

  return {
    id: `package-manager-cache:${spec.managerId}`,
    detector: "package-manager-caches",
    title: `${spec.label} package cache`,
    paths: existingPaths,
    sizeBytes: anyUnknown ? 0 : totalBytes,
    level: ensureLevel(existingPaths[0] as string, "caution"),
    lastUsedAt: lu.at,
    lastUsedSource: lu.source,
    whatItIs: `${spec.label}'s local package cache — downloaded packages kept so future installs skip the network.${noteSuffix}`,
    ifRemoved:
      `Nothing breaks immediately. The next ${spec.label} install or build that needs a ` +
      `package no longer cached here re-downloads it over the network instead of using this local copy.`,
    dependents: [`${spec.label} installs/builds that would otherwise be served from this cache`],
    reversible: {
      possible: true,
      how: `Repopulated automatically as ${spec.label} re-downloads what it needs`,
    },
    reclaim: {
      command: spec.command,
      requiresSudo: spec.requiresSudo ?? false,
      kind: spec.kind,
    },
  };
}

export const packageManagerCaches: Detector = {
  id: "package-manager-caches",
  title: "Package-manager caches",
  cost: "moderate",
  async scan(ctx): Promise<Finding[]> {
    const findings: Finding[] = [];
    for (const resolve of RESOLVERS) {
      let specs: CacheSpec[];
      try {
        specs = await resolve(ctx);
      } catch {
        continue; // a resolver's own query blew up unexpectedly — skip that manager, not the scan
      }
      for (const spec of specs) {
        const finding = await buildFinding(ctx, spec);
        if (finding) findings.push(finding);
      }
    }
    return findings;
  },
};

registerDetector(packageManagerCaches);
