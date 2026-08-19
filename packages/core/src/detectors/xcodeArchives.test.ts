import { test } from "node:test";
import assert from "node:assert/strict";
import { xcodeArchives, buildArchiveFinding } from "./xcodeDerivedData.js";
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

test("an archive finding is ALWAYS review, never safe, and carries NO reclaim command", () => {
  const f = buildArchiveFinding(
    "2026-08-19",
    "/Users/x/Library/Developer/Xcode/Archives/2026-08-19",
    3_000_000_000,
    undefined,
    { at: new Date("2026-08-19T00:00:00Z"), source: "mtime" },
  );
  assert.equal(f.level, "review");
  assert.equal(f.reclaim, undefined, "archives must never carry an aggressive reclaim command");
  assert.equal(f.reversible.possible, false, "an archive is not regenerable from source alone");
});

test("absent Archives dir contributes nothing (this dev machine's real state)", async () => {
  const findings = await xcodeArchives.scan(fakeCtx({}));
  assert.deepEqual(findings, []);
});
