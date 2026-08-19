import { test } from "node:test";
import assert from "node:assert/strict";
import { buildStagingFinding, stagingLeftovers } from "./stagingLeftovers.js";
import type { DetectorContext } from "../types.js";

const LU = { at: new Date("2026-08-01T00:00:00Z"), source: "mtime" as const };

test("sibling EXISTS: caution, targeted delete of staging ONLY, sibling listed as must-keep", () => {
  const f = buildStagingFinding(
    "/Users/x/Library/Arduino15/staging",
    2_700_000_000,
    undefined,
    LU,
    "/Users/x/Library/Arduino15/packages",
    true,
  );
  assert.equal(f.level, "caution");
  assert.equal(f.reclaim?.kind, "delete");
  assert.equal(f.reclaim?.command, `rm -rf "/Users/x/Library/Arduino15/staging"`);
  assert.equal(f.paths.length, 1, "the reclaim must target staging only, never the sibling");
  assert.match(f.dependents.join(" "), /packages.*must be kept/i);
});

test("sibling MISSING: don't assume — degrades to review with NO reclaim command", () => {
  const f = buildStagingFinding(
    "/Users/x/Library/Arduino15/staging",
    2_700_000_000,
    undefined,
    LU,
    "/Users/x/Library/Arduino15/packages",
    false,
  );
  assert.equal(f.level, "review");
  assert.equal(f.reclaim, undefined, "unverified — must not offer a delete command");
});

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

test("scan(): staging absent contributes nothing", async () => {
  const findings = await stagingLeftovers.scan(fakeCtx({}));
  assert.deepEqual(findings, []);
});

test("scan(): staging present + sibling present end to end via the full detector", async () => {
  const findings = await stagingLeftovers.scan(
    fakeCtx({
      pathExists: async (p) =>
        p === "/Users/x/Library/Arduino15/staging" || p === "/Users/x/Library/Arduino15/packages",
      dirSize: async () => ({ apparentBytes: 1_340_000, diskBytes: 1_340_000, reclaimableBytes: 1_340_000 }),
    }),
  );
  assert.equal(findings.length, 1);
  assert.equal(findings[0]?.level, "caution");
  assert.equal(findings[0]?.sizeBytes, 1_340_000);
});

test("scan(): staging present but sibling absent yields the unverified review finding", async () => {
  const findings = await stagingLeftovers.scan(
    fakeCtx({
      pathExists: async (p) => p === "/Users/x/Library/Arduino15/staging",
      dirSize: async () => ({ apparentBytes: 500_000, diskBytes: 500_000, reclaimableBytes: 500_000 }),
    }),
  );
  assert.equal(findings.length, 1);
  assert.equal(findings[0]?.level, "review");
  assert.equal(findings[0]?.reclaim, undefined);
});
