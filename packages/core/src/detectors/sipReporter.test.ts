import { test } from "node:test";
import assert from "node:assert/strict";
import { sipReporter } from "./sipReporter.js";
import type { DetectorContext } from "../types.js";

// A fake ctx lets us drive sip-reporter deterministically, without depending on
// the machine's real /Library/Updates.
function fakeCtx(over: Partial<DetectorContext>): DetectorContext {
  return {
    home: "/Users/x",
    dirSize: async () => ({ apparentBytes: 0, diskBytes: 0, reclaimableBytes: 0 }),
    isSipRestricted: async () => false,
    lastUsed: async () => ({ source: "unknown" }),
    exec: async () => ({ stdout: "", stderr: "", code: 0 }),
    pathExists: async () => true,
    log: () => {},
    ...over,
  };
}

test("a restricted, large target becomes a BLOCKED finding with NO reclaim command", async () => {
  const findings = await sipReporter.scan(
    fakeCtx({
      pathExists: async () => true,
      isSipRestricted: async () => true,
      dirSize: async () => ({ apparentBytes: 2_300_000_000, diskBytes: 2_300_000_000, reclaimableBytes: 2_300_000_000 }),
    }),
  );
  assert.equal(findings.length, 1);
  const f = findings[0];
  assert.equal(f?.level, "blocked");
  assert.equal(f?.reclaim, undefined, "a blocked finding must NEVER carry a reclaim command");
  assert.ok(f?.blockedReason && f.blockedReason.length > 0, "blockedReason must be set");
});

test("a target that isn't actually SIP-restricted is skipped, not falsely blocked", async () => {
  const findings = await sipReporter.scan(
    fakeCtx({ pathExists: async () => true, isSipRestricted: async () => false }),
  );
  assert.deepEqual(findings, []);
});

test("a restricted-but-small target is not worth a blocked line", async () => {
  const findings = await sipReporter.scan(
    fakeCtx({
      isSipRestricted: async () => true,
      dirSize: async () => ({ apparentBytes: 1_000_000, diskBytes: 1_000_000, reclaimableBytes: 1_000_000 }),
    }),
  );
  assert.deepEqual(findings, []);
});
