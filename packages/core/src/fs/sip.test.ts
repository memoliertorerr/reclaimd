import { test } from "node:test";
import assert from "node:assert/strict";
import { createSipProbe } from "./sip.js";
import { exec } from "./exec.js";
import { pathExists } from "./exists.js";
import { homedir } from "node:os";

const bound = (argv: string[]) => exec(argv);

test("a known SIP-restricted system path is restricted", async () => {
  const isSipRestricted = createSipProbe(bound, pathExists);
  assert.equal(await isSipRestricted("/System/Library/CoreServices"), true);
});

test("a home path is not restricted", async () => {
  const isSipRestricted = createSipProbe(bound, pathExists);
  assert.equal(await isSipRestricted(homedir()), false);
});

test("a nonexistent path is not restricted (nothing to block)", async () => {
  const isSipRestricted = createSipProbe(bound, pathExists);
  assert.equal(await isSipRestricted("/no/such/reclaimd/path/xyz"), false);
});

test("the probe caches within a scan (stat runs once per path)", async () => {
  let statCalls = 0;
  const countingExec = (argv: string[]) => {
    if (argv[0] === "stat") statCalls++;
    return bound(argv);
  };
  const isSipRestricted = createSipProbe(countingExec, pathExists);
  await isSipRestricted("/System/Library/CoreServices");
  await isSipRestricted("/System/Library/CoreServices");
  assert.equal(statCalls, 1, "second call served from cache");
});
