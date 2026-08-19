import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn as nodeSpawn } from "node:child_process";
import { exec, execWith, isAllowed, assertAllowed } from "./exec.js";

// argv invocations that MUST be refused — the core safety promise. Each is a
// real mutating command reclaimd must never run.
const MUTATING_ARGVS: string[][] = [
  ["rm", "-rf", "x"],
  ["xcrun", "simctl", "delete", "x"],
  ["xcrun", "simctl", "erase", "x"],
  ["xcrun", "simctl", "boot", "x"],
  ["xcrun", "simctl", "shutdown", "x"],
  ["npm", "cache", "clean", "--force"],
  ["tmutil", "deletelocalsnapshots", "x"],
  ["tmutil", "thinlocalsnapshots", "/", "1"],
  ["brew", "cleanup", "-s"],
  ["go", "clean", "-modcache"],
  ["go", "clean", "-cache"],
  ["defaults", "write", "com.example", "k", "v"],
  ["yarn", "cache", "clean"],
  ["pnpm", "store", "prune"],
  ["pip", "cache", "purge"],
  ["rm", "-rf", "/"],
];

test("allowlisted read-only invocation returns output", async () => {
  const { stdout, code } = await exec(["sw_vers"]);
  assert.equal(code, 0);
  assert.match(stdout, /ProductName/);
});

test("each mutating argv THROWS and never reaches spawn (spy guard)", () => {
  for (const argv of MUTATING_ARGVS) {
    let spawnCalled = false;
    const spy: typeof nodeSpawn = ((...args: Parameters<typeof nodeSpawn>) => {
      spawnCalled = true;
      return nodeSpawn(...args);
    }) as typeof nodeSpawn;

    // execWith throws synchronously (assertAllowed runs before spawnFn).
    assert.throws(() => execWith(spy, argv), /REFUSED/, `expected refusal for [${argv.join(" ")}]`);
    assert.equal(spawnCalled, false, `spawn must not be called for [${argv.join(" ")}]`);
  }
});

test("isAllowed accepts read-only probes and rejects mutating ones", () => {
  assert.equal(isAllowed(["du", "-s", "-k", "/tmp"]), true);
  assert.equal(isAllowed(["stat", "-f", "%Sf", "/tmp"]), true);
  assert.equal(isAllowed(["xcrun", "simctl", "list"]), true);
  assert.equal(isAllowed(["xcrun", "simctl", "runtime", "list"]), true);
  assert.equal(isAllowed(["tmutil", "listlocalsnapshots", "/"]), true);
  assert.equal(isAllowed(["brew", "--cache"]), true);
  assert.equal(isAllowed(["go", "env", "GOMODCACHE"]), true);
  assert.equal(isAllowed(["defaults", "read", "com.example"]), true);
  assert.equal(isAllowed(["yarn", "cache", "dir"]), true);
  assert.equal(isAllowed(["pnpm", "store", "path"]), true);
  assert.equal(isAllowed(["pip", "cache", "dir"]), true);

  assert.equal(isAllowed([]), false);
  assert.equal(isAllowed(["xcrun", "simctl", "runtime", "delete", "x"]), false);
  assert.equal(isAllowed(["xcrun", "xcodebuild"]), false); // xcrun only gates simctl
  assert.equal(isAllowed(["tmutil", "deletelocalsnapshots", "x"]), false);
  assert.equal(isAllowed(["brew", "install", "wget"]), false);
  assert.equal(isAllowed(["npm", "install"]), false);
  assert.equal(isAllowed(["yarn", "cache", "clean"]), false);
  assert.equal(isAllowed(["pnpm", "store", "prune"]), false);
  assert.equal(isAllowed(["pip", "cache", "purge"]), false);
});

test("assertAllowed throws with a loud, informative message", () => {
  assert.throws(() => assertAllowed(["rm", "-rf", "x"]), /reclaimd exec REFUSED/);
});
