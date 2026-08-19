import { join } from "node:path";
import { registerDetector } from "../registry.js";
import { listSubdirs } from "../fs/listDir.js";
import type { Detector, DetectorContext, Finding, LastUsedResult } from "../types.js";

/**
 * vm-images — Docker/Parallels/UTM/Claude VM disk images.
 *
 * The size number is trivial here (`du` on a known path); the ANNOTATION is
 * the whole value. Almost every candidate is `review` — a VM disk can hold
 * real, unbacked-up guest state — and we only ever offer a `reclaim` command
 * when the owning tool has a genuinely safe, app-managed one (Docker's own
 * `system prune`). We never invent a raw `rm` of a VM image: for Parallels and
 * UTM there's no command we can vouch for as safe, so those are inform-only.
 */

/** VM disk images are sparse files; `dirSize` works on a single file path too (`du` doesn't care). */
async function sizeOf(ctx: DetectorContext, path: string) {
  const size = await ctx.dirSize(path);
  return {
    bytes: size.unknown ? 0 : size.diskBytes,
    apparent: size.unknown ? undefined : size.apparentBytes,
    unknown: size.unknown,
  };
}

// --- Docker -----------------------------------------------------------------

export function buildDockerFinding(
  path: string,
  sizeBytes: number,
  apparentSizeBytes: number | undefined,
  lastUsed: LastUsedResult,
): Finding {
  return {
    id: `vm-image:docker:${path}`,
    detector: "vm-images",
    title: "Docker Desktop VM disk (Docker.raw)",
    paths: [path],
    sizeBytes,
    apparentSizeBytes,
    level: "review", // real, unbacked-up images/containers/volumes may live only here
    lastUsedAt: lastUsed.at,
    lastUsedSource: lastUsed.source,
    whatItIs:
      "Docker Desktop's virtual machine disk — every image, container, and volume you've " +
      "pulled or built lives inside this single sparse file. Its logical size can dwarf what's " +
      "actually allocated on disk (APFS sparse file), so the number you see in Finder or a " +
      "naive size tool can badly overstate real usage.",
    ifRemoved:
      "`docker system prune` (or Docker Desktop ▸ Troubleshoot ▸ Clean / Uninstall) frees " +
      "whatever Docker itself identifies as unused — dangling images, stopped containers, " +
      "unused volumes, build cache — not necessarily this file's whole footprint. This is real " +
      "state: any image/container/volume you haven't pushed to a registry exists only here.",
    dependents: ["Every local Docker image, container, and volume"],
    reversible: {
      possible: true,
      how: "Images/containers are re-pulled or rebuilt from your Dockerfiles/registries; a full Docker Desktop reset recreates the VM entirely",
    },
    reclaim: {
      command: "docker system prune",
      requiresSudo: false,
      kind: "app-managed",
    },
  };
}

async function findDockerImages(ctx: DetectorContext): Promise<Finding[]> {
  const vmsRoot = join(ctx.home, "Library/Containers/com.docker.docker/Data/vms");
  if (!(await ctx.pathExists(vmsRoot))) return [];

  const findings: Finding[] = [];
  for (const vmDir of await listSubdirs(vmsRoot)) {
    const rawPath = join(vmsRoot, vmDir, "data", "Docker.raw");
    if (!(await ctx.pathExists(rawPath))) continue;
    const size = await sizeOf(ctx, rawPath);
    if (!size.unknown && size.bytes === 0) continue;
    const lu = await ctx.lastUsed(rawPath);
    findings.push(buildDockerFinding(rawPath, size.bytes, size.apparent, lu));
  }
  return findings;
}

// --- Parallels ----------------------------------------------------------------

export function buildParallelsFinding(
  name: string,
  path: string,
  sizeBytes: number,
  apparentSizeBytes: number | undefined,
  lastUsed: LastUsedResult,
): Finding {
  return {
    id: `vm-image:parallels:${path}`,
    detector: "vm-images",
    title: `Parallels Desktop VM — ${name}`,
    paths: [path],
    sizeBytes,
    apparentSizeBytes,
    level: "review",
    lastUsedAt: lastUsed.at,
    lastUsedSource: lastUsed.source,
    whatItIs: `A Parallels Desktop virtual machine bundle ("${name}") — a complete guest OS disk, snapshots, and configuration.`,
    ifRemoved:
      "This is real, potentially unbacked-up state — the guest OS, installed software, and " +
      "any files inside it. There's no automated prune reclaimd can vouch for; if you want to " +
      "reclaim this space, review and remove the VM yourself in Parallels Desktop.",
    dependents: [`Everything installed or stored inside the "${name}" guest OS`],
    reversible: { possible: false },
    // No reclaim — informational only; no safe automated command to offer.
  };
}

async function findParallelsVms(ctx: DetectorContext): Promise<Finding[]> {
  const root = join(ctx.home, "Parallels");
  if (!(await ctx.pathExists(root))) return [];

  const findings: Finding[] = [];
  for (const entry of await listSubdirs(root)) {
    if (!entry.endsWith(".pvm")) continue;
    const path = join(root, entry);
    const size = await sizeOf(ctx, path);
    if (!size.unknown && size.bytes === 0) continue;
    const lu = await ctx.lastUsed(path);
    findings.push(buildParallelsFinding(entry.replace(/\.pvm$/, ""), path, size.bytes, size.apparent, lu));
  }
  return findings;
}

// --- UTM ------------------------------------------------------------------

export function buildUtmFinding(
  name: string,
  path: string,
  sizeBytes: number,
  apparentSizeBytes: number | undefined,
  lastUsed: LastUsedResult,
): Finding {
  return {
    id: `vm-image:utm:${path}`,
    detector: "vm-images",
    title: `UTM VM — ${name}`,
    paths: [path],
    sizeBytes,
    apparentSizeBytes,
    level: "review",
    lastUsedAt: lastUsed.at,
    lastUsedSource: lastUsed.source,
    whatItIs: `A UTM virtual machine bundle ("${name}") — a complete guest OS disk and configuration.`,
    ifRemoved:
      "This is real, potentially unbacked-up state — the guest OS and anything stored inside " +
      "it. There's no automated prune reclaimd can vouch for; review and remove it yourself in UTM.",
    dependents: [`Everything installed or stored inside the "${name}" guest OS`],
    reversible: { possible: false },
    // No reclaim — informational only; no safe automated command to offer.
  };
}

async function findUtmVms(ctx: DetectorContext): Promise<Finding[]> {
  const root = join(ctx.home, "Library/Containers/com.utmapp.UTM/Data/Documents");
  if (!(await ctx.pathExists(root))) return [];

  const findings: Finding[] = [];
  for (const entry of await listSubdirs(root)) {
    if (!entry.endsWith(".utm")) continue;
    const path = join(root, entry);
    const size = await sizeOf(ctx, path);
    if (!size.unknown && size.bytes === 0) continue;
    const lu = await ctx.lastUsed(path);
    findings.push(buildUtmFinding(entry.replace(/\.utm$/, ""), path, size.bytes, size.apparent, lu));
  }
  return findings;
}

// --- Claude VM --------------------------------------------------------------

/**
 * Claude Code's local sandboxed-execution VM disk. This is the ONE image
 * where we deviate from the default `review` — because it's been VERIFIED
 * (not assumed) that session/project/settings state lives on the HOST at
 * `~/.claude/`, never inside this image. Deleting/recreating it costs nothing
 * a user would miss, so it's `caution` (regenerable, app-managed), not
 * `review`. We still don't offer a reclaim command: recreation is the app's
 * own responsibility, not a user-safe action to script.
 */
export function buildClaudeVmFinding(
  path: string,
  sizeBytes: number,
  apparentSizeBytes: number | undefined,
  lastUsed: LastUsedResult,
): Finding {
  return {
    id: `vm-image:claude:${path}`,
    detector: "vm-images",
    title: "Claude Code sandbox VM disk (rootfs.img)",
    paths: [path],
    sizeBytes,
    apparentSizeBytes,
    level: "caution", // proven regenerable — see whatItIs — unlike the other VM kinds above
    lastUsedAt: lastUsed.at,
    lastUsedSource: lastUsed.source,
    whatItIs:
      "The disk image backing Claude Code's local sandboxed execution environment. Verified: " +
      "on this machine, session history, per-project state, and settings all live on the HOST " +
      "filesystem under ~/.claude/ (real session and project directories confirmed there) — " +
      "NOT inside this image. That's why this is `caution`, not `review`, unlike the other VM " +
      "kinds above: this specific image genuinely holds nothing irreplaceable.",
    ifRemoved:
      "Nothing is lost. The image is regenerated automatically by the app the next time it " +
      "needs a sandboxed environment; your actual sessions, projects, and settings in " +
      "~/.claude/ are untouched, since they never lived in this file.",
    dependents: [],
    reversible: {
      possible: true,
      how: "Regenerated automatically by the app the next time a sandboxed session starts",
    },
    // No reclaim — recreating this image is the app's own responsibility, not
    // a user-triggered action reclaimd can safely script.
  };
}

async function findClaudeVmImages(ctx: DetectorContext): Promise<Finding[]> {
  const root = join(ctx.home, "Library/Application Support/Claude/vm_bundles");
  if (!(await ctx.pathExists(root))) return [];

  const findings: Finding[] = [];
  for (const bundleDir of await listSubdirs(root)) {
    const rootfsPath = join(root, bundleDir, "rootfs.img");
    if (!(await ctx.pathExists(rootfsPath))) continue;
    const size = await sizeOf(ctx, rootfsPath);
    if (!size.unknown && size.bytes === 0) continue;
    const lu = await ctx.lastUsed(rootfsPath);
    findings.push(buildClaudeVmFinding(rootfsPath, size.bytes, size.apparent, lu));
  }
  return findings;
}

// --- Detector -----------------------------------------------------------------

export const vmImages: Detector = {
  id: "vm-images",
  title: "VM disk images (Docker/Parallels/UTM/Claude)",
  cost: "moderate",
  async scan(ctx): Promise<Finding[]> {
    return [
      ...(await findDockerImages(ctx)),
      ...(await findParallelsVms(ctx)),
      ...(await findUtmVms(ctx)),
      ...(await findClaudeVmImages(ctx)),
    ];
  },
};

registerDetector(vmImages);
