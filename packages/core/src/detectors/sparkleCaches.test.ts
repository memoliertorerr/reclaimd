import { test } from "node:test";
import assert from "node:assert/strict";
import {
  findPerAppSparkleCaches,
  findGroupContainerSparkleCaches,
  buildSparkleFinding,
  appLabelFromSparklePath,
} from "./sparkleCaches.js";

test("findPerAppSparkleCaches finds ONLY the Sparkle subdir for a bundle-id app cache", async () => {
  const listSubdirsFn = async (root: string) => (root === "/Users/x/Library/Caches" ? ["net.whatsapp.WhatsApp"] : []);
  const pathExists = async (p: string) => p.endsWith("/Sparkle");
  const found = await findPerAppSparkleCaches(pathExists, listSubdirsFn, "/Users/x/Library/Caches");
  assert.deepEqual(found, ["/Users/x/Library/Caches/net.whatsapp.WhatsApp/Sparkle"]);
});

test("REGRESSION: an emoji asset shaped like '…/iOS_Sparkles_2728_v1' is never matched (real false positive found on the dev machine)", async () => {
  const listSubdirsFn = async () => ["com.some.app"];
  // Only a path shaped like the real false positive "exists" — the exact
  // "Sparkle" segment we construct never matches it.
  const pathExists = async (p: string) => p.includes("iOS_Sparkles_2728_v1");
  const found = await findPerAppSparkleCaches(pathExists, listSubdirsFn, "/Users/x/Library/Caches");
  assert.deepEqual(found, [], "a substring match on 'sparkle' must never count — only the exact segment");
});

test("findGroupContainerSparkleCaches resolves under Library/Caches/Sparkle", async () => {
  const listSubdirsFn = async (root: string) =>
    root === "/Users/x/Library/Group Containers" ? ["group.net.whatsapp.WhatsApp.shared"] : [];
  const pathExists = async (p: string) => p.endsWith("Library/Caches/Sparkle");
  const found = await findGroupContainerSparkleCaches(pathExists, listSubdirsFn, "/Users/x/Library/Group Containers");
  assert.deepEqual(found, [
    "/Users/x/Library/Group Containers/group.net.whatsapp.WhatsApp.shared/Library/Caches/Sparkle",
  ]);
});

test("a group container with BOTH Sparkle and a real data dir (Message) yields only the Sparkle candidate", async () => {
  // Directly models the audit's WhatsApp case: Sparkle (safe) sits beside
  // Message (10 GB of real chat media) in the SAME group container.
  const listSubdirsFn = async (root: string) =>
    root === "/Users/x/Library/Group Containers" ? ["group.net.whatsapp.WhatsApp.shared"] : [];
  // pathExists is asked about many candidate shapes; only the Sparkle one is true.
  const pathExists = async (p: string) => p.endsWith("Library/Caches/Sparkle");
  const found = await findGroupContainerSparkleCaches(pathExists, listSubdirsFn, "/Users/x/Library/Group Containers");
  assert.equal(found.length, 1);
  assert.equal(found[0]?.includes("Message"), false);
});

test("appLabelFromSparklePath reads the bundle-id / group-id, not 'Sparkle' itself", () => {
  assert.equal(appLabelFromSparklePath("/Users/x/Library/Caches/net.whatsapp.WhatsApp/Sparkle"), "net.whatsapp.WhatsApp");
  assert.equal(
    appLabelFromSparklePath(
      "/Users/x/Library/Group Containers/group.net.whatsapp.WhatsApp.shared/Library/Caches/Sparkle",
    ),
    "group.net.whatsapp.WhatsApp.shared",
  );
});

test("buildSparkleFinding's paths are EXACTLY the Sparkle leaf — never widens to a sibling like Message", () => {
  const sparklePath =
    "/Users/x/Library/Group Containers/group.net.whatsapp.WhatsApp.shared/Library/Caches/Sparkle";
  const f = buildSparkleFinding(sparklePath, 886_000_000, undefined, {
    at: new Date("2026-01-01T00:00:00Z"),
    source: "mtime",
  });
  assert.deepEqual(f.paths, [sparklePath]);
  assert.equal(f.paths.length, 1, "must be exactly one path — the Sparkle leaf, nothing else");
  assert.equal(f.paths.some((p) => p.includes("Message")), false, "must never include the sibling data store");
  assert.equal(f.level, "safe");
  assert.equal(f.reclaim?.command, `rm -rf "${sparklePath}"`);
});
