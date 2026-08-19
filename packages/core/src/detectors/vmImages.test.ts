import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildDockerFinding,
  buildParallelsFinding,
  buildUtmFinding,
  buildClaudeVmFinding,
  vmImages,
} from "./vmImages.js";
import type { DetectorContext } from "../types.js";

const LU = { at: new Date("2026-08-01T00:00:00Z"), source: "mtime" as const };

test("Docker: review level, sparse divergence carried, app-managed reclaim (never a raw rm)", () => {
  const f = buildDockerFinding("/x/Docker.raw", 3_400_000_000, 48_000_000_000, LU);
  assert.equal(f.level, "review");
  assert.equal(f.apparentSizeBytes, 48_000_000_000);
  assert.equal(f.sizeBytes, 3_400_000_000);
  assert.equal(f.reclaim?.kind, "app-managed");
  assert.equal(f.reclaim?.command, "docker system prune");
  assert.doesNotMatch(f.reclaim?.command ?? "", /^rm /, "must never be a raw rm of the VM disk");
});

test("Parallels: review, NOT regenerable, and NO reclaim command offered", () => {
  const f = buildParallelsFinding("Windows 11", "/x/Parallels/Windows 11.pvm", 20_000_000_000, undefined, LU);
  assert.equal(f.level, "review");
  assert.equal(f.reversible.possible, false);
  assert.equal(f.reclaim, undefined, "no safe automated command exists for Parallels — inform only");
});

test("UTM: review, NOT regenerable, and NO reclaim command offered", () => {
  const f = buildUtmFinding("Debian", "/x/UTM/Debian.utm", 8_000_000_000, undefined, LU);
  assert.equal(f.level, "review");
  assert.equal(f.reversible.possible, false);
  assert.equal(f.reclaim, undefined);
});

test("Claude VM: the ONE case that deviates from review — caution, because it's VERIFIED regenerable", () => {
  const f = buildClaudeVmFinding("/x/vm_bundles/claudevm.bundle/rootfs.img", 10_737_418_240, undefined, LU);
  assert.equal(f.level, "caution", "proven to hold nothing irreplaceable, so it's not review like the others");
  assert.match(f.whatItIs, /Verified/, "the annotation must state this was verified, not assumed");
  assert.match(f.whatItIs, /~\/\.claude\//);
  assert.deepEqual(f.dependents, [], "nothing genuinely depends on this specific image");
  assert.equal(f.reversible.possible, true);
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

test("scan(): no VM tooling installed anywhere contributes nothing (no error)", async () => {
  const findings = await vmImages.scan(fakeCtx({}));
  assert.deepEqual(findings, []);
});
