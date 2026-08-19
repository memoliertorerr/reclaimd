import { join } from "node:path";
import { registerDetector } from "../registry.js";
import { ensureLevel } from "../fs/paths.js";
import type { Detector, Finding } from "../types.js";

/**
 * simulator-dyld-caches — CoreSimulator's shared dyld cache.
 *
 * `~/Library/Developer/CoreSimulator/Caches/dyld` is a pure build artifact: the
 * dynamic-linker shared cache the Simulator rebuilds on next launch. Safe to
 * remove; the only cost is a slower first Simulator boot afterward. If the dir
 * doesn't exist, no-op.
 */
export const simulatorDyldCaches: Detector = {
  id: "simulator-dyld-caches",
  title: "CoreSimulator dyld caches",
  cost: "fast",
  async scan(ctx): Promise<Finding[]> {
    const path = join(ctx.home, "Library/Developer/CoreSimulator/Caches/dyld");
    if (!(await ctx.pathExists(path))) return [];

    const size = await ctx.dirSize(path);
    if (!size.unknown && size.diskBytes === 0) return []; // empty — nothing to report

    return [
      {
        id: "simulator-dyld-caches",
        detector: "simulator-dyld-caches",
        title: "CoreSimulator dyld shared caches",
        paths: [path],
        sizeBytes: size.unknown ? 0 : size.diskBytes,
        apparentSizeBytes: size.unknown ? undefined : size.apparentBytes,
        level: ensureLevel(path, "safe"),
        lastUsedSource: "unknown",
        whatItIs:
          "The dynamic-linker (dyld) shared cache the iOS Simulator builds for faster app " +
          "launches. Pure build artifact — no user data, no configuration.",
        ifRemoved:
          "Nothing breaks. The Simulator rebuilds this cache on its next launch; the only " +
          "cost is a slower first boot while it regenerates.",
        dependents: [],
        reversible: {
          possible: true,
          how: "Rebuilt automatically on the next Simulator launch",
          costBytes: 0,
        },
        reclaim: {
          command: `rm -rf "${path}"`,
          requiresSudo: false,
          kind: "delete",
        },
      },
    ];
  },
};

registerDetector(simulatorDyldCaches);
