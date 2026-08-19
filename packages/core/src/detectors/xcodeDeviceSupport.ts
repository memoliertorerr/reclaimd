import { join } from "node:path";
import { registerDetector } from "../registry.js";
import { ensureLevel } from "../fs/paths.js";
import { listSubdirs } from "../fs/listDir.js";
import type { Detector, Finding, LastUsedResult } from "../types.js";

/**
 * xcode-device-support — per-OS-version device symbol caches.
 *
 * `~/Library/Developer/Xcode/{iOS,watchOS,tvOS} DeviceSupport` each hold one
 * subdir per OS version Xcode has debugged a physical device on (symbol files
 * for that OS build). Purely regenerated the next time you attach a device
 * running that OS version — safe to remove, per-version.
 */

const PLATFORMS: { label: string; dirName: string }[] = [
  { label: "iOS", dirName: "iOS DeviceSupport" },
  { label: "watchOS", dirName: "watchOS DeviceSupport" },
  { label: "tvOS", dirName: "tvOS DeviceSupport" },
];

/** Pure finding builder — exported so the per-version shape is unit-testable. */
export function buildDeviceSupportFinding(
  label: string,
  versionName: string,
  path: string,
  sizeBytes: number,
  apparentSizeBytes: number | undefined,
  lastUsed: LastUsedResult,
): Finding {
  return {
    id: `xcode-device-support:${label}:${versionName}`,
    detector: "xcode-device-support",
    title: `${label} DeviceSupport — ${versionName}`,
    paths: [path],
    sizeBytes,
    apparentSizeBytes,
    level: ensureLevel(path, "safe"),
    lastUsedAt: lastUsed.at,
    lastUsedSource: lastUsed.source,
    whatItIs:
      `Symbol files Xcode downloaded to debug a physical device running ${label} ` +
      `${versionName}. Pure debug-support cache — no source, no configuration.`,
    ifRemoved:
      `Nothing breaks. The next time you attach a physical device running ${label} ` +
      `${versionName} and try to debug it, Xcode re-downloads this automatically.`,
    dependents: [`Debugging a physical ${label} ${versionName} device`],
    reversible: {
      possible: true,
      how: "Regenerated automatically the next time you attach a device on this OS version",
    },
    reclaim: {
      command: `rm -rf "${path}"`,
      requiresSudo: false,
      kind: "delete",
    },
  };
}

export const xcodeDeviceSupport: Detector = {
  id: "xcode-device-support",
  title: "Xcode iOS/watchOS/tvOS DeviceSupport",
  cost: "fast",
  async scan(ctx): Promise<Finding[]> {
    const findings: Finding[] = [];

    for (const { label, dirName } of PLATFORMS) {
      const base = join(ctx.home, "Library/Developer/Xcode", dirName);
      if (!(await ctx.pathExists(base))) continue;

      for (const versionName of await listSubdirs(base)) {
        const path = join(base, versionName);
        const size = await ctx.dirSize(path);
        const bytes = size.unknown ? 0 : size.diskBytes;
        if (!size.unknown && bytes === 0) continue; // empty — nothing to report

        const lu = await ctx.lastUsed(path);
        findings.push(
          buildDeviceSupportFinding(label, versionName, path, bytes, size.unknown ? undefined : size.apparentBytes, lu),
        );
      }
    }

    return findings;
  },
};

registerDetector(xcodeDeviceSupport);
