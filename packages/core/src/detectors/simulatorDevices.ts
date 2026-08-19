import { join } from "node:path";
import { registerDetector } from "../registry.js";
import { ensureLevel } from "../fs/paths.js";
import type { Detector, Finding, LastUsedResult } from "../types.js";

/**
 * simulator-devices — per-device Simulator data dirs.
 *
 * Each simulator device keeps its own data (installed apps, user data, caches)
 * under ~/Library/Developer/CoreSimulator/Devices/<UUID>/data. A heavily-used
 * device can balloon to GBs while every fresh device sits at ~17 MB.
 *
 * RESET, not delete: the reclaim is `simctl erase <UUID>`, which keeps the
 * device (its identity, OS pairing, name) and only clears its data back to
 * factory. That's strictly better than deleting the device — hence
 * `reclaim.kind: "reset"`. Only devices above a threshold are surfaced, so the
 * dozens of pristine 17 MB devices don't spam the list.
 */

const THRESHOLD_BYTES = 200 * 1024 * 1024; // skip pristine ~17 MB devices

interface DeviceRecord {
  udid: string;
  name?: string;
  dataPath?: string;
  state?: string;
  lastBootedAt?: string;
  runtime: string;
}

/** Flatten simctl's `{ devices: { "<runtimeId>": [ … ] } }` into a flat list. */
export function parseDevices(parsed: unknown): DeviceRecord[] {
  const out: DeviceRecord[] = [];
  const root = parsed as { devices?: Record<string, unknown> } | null;
  const devices = root?.devices;
  if (!devices || typeof devices !== "object") return out;
  for (const [runtime, arr] of Object.entries(devices)) {
    if (!Array.isArray(arr)) continue;
    for (const d of arr) {
      if (d && typeof d === "object" && typeof (d as DeviceRecord).udid === "string") {
        const rec = d as Partial<DeviceRecord>;
        out.push({
          udid: rec.udid as string,
          name: rec.name,
          dataPath: rec.dataPath,
          state: rec.state,
          lastBootedAt: rec.lastBootedAt,
          runtime,
        });
      }
    }
  }
  return out;
}

/** "com.apple.CoreSimulator.SimRuntime.iOS-26-0" → "iOS 26.0". */
export function runtimeLabel(runtime: string): string {
  const m = runtime.match(/SimRuntime\.([A-Za-z]+)-([\d-]+)$/);
  if (!m) return "unknown runtime";
  return `${m[1]} ${(m[2] ?? "").replace(/-/g, ".")}`;
}

/** Pure finding builder — exported so the reset-over-delete logic is unit-testable. */
export function buildDeviceFinding(
  device: DeviceRecord,
  dataPath: string,
  sizeBytes: number,
  lastUsed: LastUsedResult,
): Finding {
  const os = runtimeLabel(device.runtime);
  const name = device.name ?? "Simulator device";
  return {
    id: `simulator-device:${device.udid}`,
    detector: "simulator-devices",
    title: `Simulator device data — ${name} (${os})`,
    paths: [dataPath],
    sizeBytes,
    level: ensureLevel(dataPath, "caution"),
    lastUsedAt: lastUsed.at,
    lastUsedSource: lastUsed.source,
    whatItIs:
      `The data volume for the "${name}" ${os} simulator — installed apps, their data, and ` +
      `caches this device accumulated. The device itself is a lightweight record; this is its bloat.`,
    ifRemoved:
      "Resets the device to factory state: the device itself stays (same name, UUID, OS " +
      "pairing), but its installed apps and their data are cleared. Nothing outside this " +
      "simulator is affected.",
    dependents: [`Apps and data installed on the "${name}" simulator`],
    reversible: {
      possible: true,
      how: "Reinstall apps / re-run your app onto the device",
    },
    reclaim: {
      command: `xcrun simctl erase ${device.udid}`,
      requiresSudo: false,
      kind: "reset", // keep the device, drop the bloat — preferred over delete
    },
  };
}

async function resolveDeviceLastUsed(
  device: DeviceRecord,
  dataPath: string,
  ctx: { lastUsed: (p: string) => Promise<LastUsedResult> },
): Promise<LastUsedResult> {
  // Prefer simctl's own lastBootedAt (tool metadata) when present; else fall
  // back to the data dir's mtime, labeled honestly.
  if (device.lastBootedAt) {
    const at = new Date(device.lastBootedAt);
    if (!Number.isNaN(at.getTime())) return { at, source: "tool-metadata" };
  }
  return ctx.lastUsed(dataPath);
}

export const simulatorDevices: Detector = {
  id: "simulator-devices",
  title: "Simulator device data",
  cost: "moderate",
  async scan(ctx): Promise<Finding[]> {
    let raw: string;
    try {
      const res = await ctx.exec(["xcrun", "simctl", "list", "devices", "--json"]);
      if (res.code !== 0) return [];
      raw = res.stdout;
    } catch {
      return []; // no xcrun/simctl — no-op
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      ctx.log("simulator-devices: could not parse `simctl list devices --json`");
      return [];
    }

    const findings: Finding[] = [];
    for (const device of parseDevices(parsed)) {
      const dataPath =
        device.dataPath ??
        join(ctx.home, "Library/Developer/CoreSimulator/Devices", device.udid, "data");
      if (!(await ctx.pathExists(dataPath))) continue;

      const size = await ctx.dirSize(dataPath);
      const bytes = size.unknown ? 0 : size.diskBytes;
      if (bytes <= THRESHOLD_BYTES) continue; // pristine device — don't spam

      const lastUsed = await resolveDeviceLastUsed(device, dataPath, ctx);
      findings.push(buildDeviceFinding(device, dataPath, bytes, lastUsed));
    }
    return findings;
  },
};

registerDetector(simulatorDevices);
