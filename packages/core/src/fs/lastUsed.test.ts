import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveLastUsedFromStats, createLastUsed, type StatsLike } from "./lastUsed.js";
import { fileURLToPath } from "node:url";

test("mtime-present input resolves to source 'mtime'", () => {
  const stats: StatsLike = { mtimeMs: 1_700_000_000_000, atimeMs: 1_720_000_000_000 };
  const r = resolveLastUsedFromStats(stats);
  assert.equal(r.source, "mtime");
  assert.equal(r.at?.getTime(), 1_700_000_000_000);
});

test("mtime-absent falls back to atime, labeled 'atime' (never dressed as mtime)", () => {
  const stats: StatsLike = { mtimeMs: 0, atimeMs: 1_720_000_000_000 };
  const r = resolveLastUsedFromStats(stats);
  assert.equal(r.source, "atime");
  assert.equal(r.at?.getTime(), 1_720_000_000_000);
});

test("neither time usable resolves to 'unknown' with no date", () => {
  const r = resolveLastUsedFromStats({ mtimeMs: 0, atimeMs: 0 });
  assert.equal(r.source, "unknown");
  assert.equal(r.at, undefined);
});

test("createLastUsed on a real file reports mtime", async () => {
  const lastUsed = createLastUsed();
  const r = await lastUsed(fileURLToPath(import.meta.url));
  assert.equal(r.source, "mtime");
  assert.ok(r.at instanceof Date);
});

test("createLastUsed degrades to 'unknown' when stat fails", async () => {
  const lastUsed = createLastUsed();
  const r = await lastUsed("/no/such/reclaimd/path/xyz");
  assert.equal(r.source, "unknown");
});
