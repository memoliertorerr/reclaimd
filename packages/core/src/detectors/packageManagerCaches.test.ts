import { test } from "node:test";
import assert from "node:assert/strict";
import { packageManagerCaches } from "./packageManagerCaches.js";
import type { DetectorContext, ExecResult } from "../types.js";

function fakeCtx(over: Partial<DetectorContext>): DetectorContext {
  return {
    home: "/Users/x",
    dirSize: async () => ({ apparentBytes: 0, diskBytes: 0, reclaimableBytes: 0 }),
    isSipRestricted: async () => false,
    lastUsed: async () => ({ source: "mtime", at: new Date("2026-01-01T00:00:00Z") }),
    exec: async () => {
      throw new Error("ENOENT (fake: tool not installed)");
    },
    pathExists: async () => false,
    log: () => {},
    ...over,
  };
}

test("npm's hardcoded _cacache path becomes a caution, app-managed finding", async () => {
  const findings = await packageManagerCaches.scan(
    fakeCtx({
      pathExists: async (p) => p === "/Users/x/.npm/_cacache",
      dirSize: async () => ({ apparentBytes: 5_200_000_000, diskBytes: 5_200_000_000, reclaimableBytes: 5_200_000_000 }),
    }),
  );
  const npm = findings.find((f) => f.id === "package-manager-cache:npm");
  assert.ok(npm, "npm finding present");
  assert.equal(npm?.level, "caution");
  assert.equal(npm?.reclaim?.kind, "app-managed");
  assert.equal(npm?.reclaim?.command, "npm cache clean --force");
  assert.equal(npm?.sizeBytes, 5_200_000_000);
});

test("a manager whose binary is absent contributes nothing (no error, no bogus finding)", async () => {
  // Default fakeCtx: exec always throws (ENOENT), pathExists always false.
  const findings = await packageManagerCaches.scan(fakeCtx({}));
  assert.deepEqual(findings, [], "no tool installed, no cache dirs — nothing to report");
});

test("a manager whose query succeeds but cache dir doesn't exist yet contributes nothing", async () => {
  const findings = await packageManagerCaches.scan(
    fakeCtx({
      exec: async (argv): Promise<ExecResult> => {
        if (argv[0] === "yarn" && argv[1] === "cache" && argv[2] === "dir") {
          return { stdout: "/Users/x/Library/Caches/Yarn\n", stderr: "", code: 0 };
        }
        throw new Error("ENOENT");
      },
      pathExists: async () => false, // the resolved dir doesn't actually exist
    }),
  );
  assert.deepEqual(findings, []);
});

test("go contributes TWO findings with two DISTINCT reclaim commands (modcache vs buildcache)", async () => {
  const findings = await packageManagerCaches.scan(
    fakeCtx({
      exec: async (argv): Promise<ExecResult> => {
        if (argv[0] === "go" && argv[1] === "env") {
          return { stdout: "/Users/x/go/pkg/mod\n/Users/x/Library/Caches/go-build\n", stderr: "", code: 0 };
        }
        throw new Error("ENOENT");
      },
      pathExists: async (p) => p === "/Users/x/go/pkg/mod" || p === "/Users/x/Library/Caches/go-build",
      dirSize: async () => ({ apparentBytes: 1_000_000, diskBytes: 1_000_000, reclaimableBytes: 1_000_000 }),
    }),
  );
  const mod = findings.find((f) => f.id === "package-manager-cache:go-modcache");
  const build = findings.find((f) => f.id === "package-manager-cache:go-buildcache");
  assert.ok(mod && build, "both go findings present");
  assert.equal(mod?.reclaim?.command, "go clean -modcache");
  assert.equal(build?.reclaim?.command, "go clean -cache");
  assert.notEqual(mod?.reclaim?.command, build?.reclaim?.command);
});

test("cargo combines both subdirs into ONE finding with a targeted rm (kind delete)", async () => {
  const findings = await packageManagerCaches.scan(
    fakeCtx({
      pathExists: async (p) =>
        p === "/Users/x/.cargo/registry/cache" || p === "/Users/x/.cargo/registry/src",
      dirSize: async () => ({ apparentBytes: 2_000_000, diskBytes: 2_000_000, reclaimableBytes: 2_000_000 }),
    }),
  );
  const cargo = findings.find((f) => f.id === "package-manager-cache:cargo");
  assert.ok(cargo);
  assert.equal(cargo?.reclaim?.kind, "delete");
  assert.deepEqual(cargo?.paths, ["/Users/x/.cargo/registry/cache", "/Users/x/.cargo/registry/src"]);
  assert.match(cargo?.reclaim?.command ?? "", /rm -rf/);
  assert.equal(cargo?.sizeBytes, 4_000_000, "summed across both subdirs");
});

test("every finding is caution (never safe) and labels its lastUsedSource honestly", async () => {
  const findings = await packageManagerCaches.scan(
    fakeCtx({
      pathExists: async (p) => p === "/Users/x/.npm/_cacache",
      dirSize: async () => ({ apparentBytes: 100, diskBytes: 100, reclaimableBytes: 100 }),
    }),
  );
  for (const f of findings) {
    assert.equal(f.level, "caution");
    assert.equal(f.lastUsedSource, "mtime");
  }
});
