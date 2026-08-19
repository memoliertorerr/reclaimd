import { test } from "node:test";
import assert from "node:assert/strict";
import { xcodeDeviceSupport, buildDeviceSupportFinding } from "./xcodeDeviceSupport.js";
import type { DetectorContext } from "../types.js";

function fakeCtx(over: Partial<DetectorContext>): DetectorContext {
  return {
    home: "/Users/x",
    dirSize: async () => ({ apparentBytes: 0, diskBytes: 0, reclaimableBytes: 0 }),
    isSipRestricted: async () => false,
    lastUsed: async () => ({ source: "mtime", at: new Date("2026-01-01T00:00:00Z") }),
    exec: async () => ({ stdout: "", stderr: "", code: 0 }),
    pathExists: async () => false,
    log: () => {},
    ...over,
  };
}

test("a per-version finding is always level safe with a delete reclaim", () => {
  const f = buildDeviceSupportFinding(
    "iOS",
    "18.5 (22F76)",
    "/Users/x/Library/Developer/Xcode/iOS DeviceSupport/18.5 (22F76)",
    900_000_000,
    undefined,
    { at: new Date("2026-06-01T00:00:00Z"), source: "mtime" },
  );
  assert.equal(f.level, "safe");
  assert.equal(f.reclaim?.kind, "delete");
  assert.match(f.title, /iOS DeviceSupport — 18\.5/);
  assert.equal(f.lastUsedSource, "mtime");
});

test("absent DeviceSupport dirs contribute nothing (no error)", async () => {
  const findings = await xcodeDeviceSupport.scan(fakeCtx({}));
  assert.deepEqual(findings, []);
});

test("an existing but empty DeviceSupport dir (this dev machine's real state) yields no findings", async () => {
  // Regression for the real machine state: iOS DeviceSupport exists but has
  // zero version subdirs — must degrade to nothing, not error.
  const findings = await xcodeDeviceSupport.scan(
    fakeCtx({ pathExists: async (p) => p === "/Users/x/Library/Developer/Xcode/iOS DeviceSupport" }),
  );
  assert.deepEqual(findings, []);
});
