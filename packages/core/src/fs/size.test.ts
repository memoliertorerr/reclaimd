import { test } from "node:test";
import assert from "node:assert/strict";
import { createDirSize } from "./size.js";
import { exec } from "./exec.js";
import type { ExecResult } from "../types.js";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));

test("dirSize reports real on-disk bytes for an existing dir", async () => {
  const dirSize = createDirSize((argv) => exec(argv));
  const size = await dirSize(here);
  assert.equal(size.unknown, undefined);
  assert.ok(size.diskBytes > 0, "the fs source dir is not empty");
  assert.ok(size.apparentBytes > 0);
  assert.equal(size.reclaimableBytes, size.diskBytes, "reclaimable defaults to on-disk");
});

test("EPERM degrades to unknown, never 0", async () => {
  // Fake exec: `du` exits non-zero with a permission error (as it does on a
  // MobileSync backup without Full Disk Access). No real filesystem touched.
  const deniedExec = async (): Promise<ExecResult> => ({
    stdout: "",
    stderr: "du: /some/protected/path: Operation not permitted",
    code: 1,
  });
  const dirSize = createDirSize(deniedExec);
  const size = await dirSize("/some/protected/path");
  assert.equal(size.unknown, true);
  assert.equal(size.diskBytes, 0);
});

test("a genuine du failure throws (not silently zero)", async () => {
  const brokenExec = async (): Promise<ExecResult> => ({
    stdout: "",
    stderr: "du: some unexpected catastrophe",
    code: 2,
  });
  const dirSize = createDirSize(brokenExec);
  await assert.rejects(() => dirSize("/whatever"), /du failed/);
});

test("parses du KB output into bytes", async () => {
  const fakeDu = async (): Promise<ExecResult> => ({ stdout: "56\t/x\n", stderr: "", code: 0 });
  const dirSize = createDirSize(fakeDu);
  const size = await dirSize("/x");
  assert.equal(size.diskBytes, 56 * 1024);
});
