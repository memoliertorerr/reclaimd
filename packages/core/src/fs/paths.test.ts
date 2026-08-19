import { test } from "node:test";
import assert from "node:assert/strict";
import { ensureLevel, isProtected, expandTilde, protectedRoots } from "./paths.js";
import { homedir } from "node:os";
import { join } from "node:path";

const HOME = homedir();

test("ensureLevel downgrades a protected path away from 'safe'", () => {
  assert.equal(ensureLevel("~/Documents/whatever", "safe"), "review");
  assert.equal(ensureLevel(join(HOME, "Downloads", "big.zip"), "safe"), "review");
  assert.equal(ensureLevel(join(HOME, "Library/Application Support/MobileSync/Backup/UDID"), "safe"), "review");
});

test("ensureLevel leaves a non-protected path's 'safe' intact", () => {
  assert.equal(ensureLevel(join(HOME, "Library/Developer/Xcode/DerivedData"), "safe"), "safe");
});

test("the guard only ever makes a finding MORE cautious, never less", () => {
  // A protected path proposed as caution/review/blocked passes through unchanged.
  assert.equal(ensureLevel("~/Documents/x", "caution"), "caution");
  assert.equal(ensureLevel("~/Documents/x", "review"), "review");
  assert.equal(ensureLevel("~/Documents/x", "blocked"), "blocked");
});

test("isProtected matches roots and their subpaths, tilde or absolute", () => {
  assert.equal(isProtected("~/Pictures"), true);
  assert.equal(isProtected(join(HOME, "Pictures", "Photos Library.photoslibrary")), true);
  assert.equal(isProtected(join(HOME, "Desktop")), true);
  assert.equal(isProtected(join(HOME, "Library/Caches/Homebrew")), false);
  // A sibling that merely shares a prefix string is NOT protected.
  assert.equal(isProtected(join(HOME, "DocumentsBackup")), false);
});

test("expandTilde expands ~ and ~/… but leaves absolute paths alone", () => {
  assert.equal(expandTilde("~"), HOME);
  assert.equal(expandTilde("~/x"), join(HOME, "x"));
  assert.equal(expandTilde("/abs/path"), "/abs/path");
});

test("protectedRoots are all absolute under home", () => {
  for (const root of protectedRoots()) {
    assert.ok(root.startsWith(HOME + "/"), `${root} should be under home`);
  }
});
