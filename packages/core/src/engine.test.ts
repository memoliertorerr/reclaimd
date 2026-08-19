import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { scan } from "./engine.js";
import { registerDetector, getDetectors, clearDetectors } from "./registry.js";
import type { Detector, Finding } from "./types.js";

// Registry state is module-global; reset it before each test so the fakes
// registered here never leak between tests (or into a real scan).
beforeEach(() => clearDetectors());

/** A minimal hand-built Finding for a fake detector to return. */
function fakeFinding(id: string, detector: string): Finding {
  return {
    id,
    detector,
    title: `fake finding ${id}`,
    paths: [`/tmp/reclaimd-fake/${id}`],
    sizeBytes: 1234,
    level: "safe",
    lastUsedSource: "unknown",
    whatItIs: "a fabricated finding for the engine test",
    ifRemoved: "nothing — it does not exist on disk",
    dependents: [],
    reversible: { possible: true },
  };
}

/** A fake detector that returns the given findings and records that it ran. */
function fakeDetector(overrides: Partial<Detector> & Pick<Detector, "id">): Detector {
  return {
    title: `fake ${overrides.id}`,
    cost: "fast",
    scan: async () => [fakeFinding(`${overrides.id}-f1`, overrides.id)],
    ...overrides,
  };
}

test("scan runs a fast detector, streams via onFinding, and carries the finding", async () => {
  registerDetector(fakeDetector({ id: "fake-fast" }));

  const streamed: Finding[] = [];
  const result = await scan({ onFinding: (f) => streamed.push(f) });

  assert.equal(result.findings.length, 1, "one finding in the result");
  assert.equal(result.findings[0]?.detector, "fake-fast");
  assert.equal(streamed.length, 1, "onFinding fired once");
  assert.equal(streamed[0]?.id, "fake-fast-f1", "streamed the same finding");
  assert.deepEqual(result.ranDetectors, ["fake-fast"]);
  assert.equal(result.skipped.length, 0);
  assert.ok(result.finishedAt.getTime() >= result.startedAt.getTime());
});

test("a slow detector is skipped by default and runs only with includeSlow", async () => {
  registerDetector(fakeDetector({ id: "fake-slow", cost: "slow" }));

  const byDefault = await scan();
  assert.deepEqual(byDefault.ranDetectors, [], "slow detector did not run by default");
  assert.equal(byDefault.findings.length, 0);
  assert.equal(byDefault.skipped[0]?.detector, "fake-slow");
  assert.equal(byDefault.skipped[0]?.reason, "slow");

  const optedIn = await scan({ includeSlow: true });
  assert.deepEqual(optedIn.ranDetectors, ["fake-slow"], "slow detector ran with includeSlow");
  assert.equal(optedIn.findings.length, 1);
});

test("enabledByDefault:false is gated like slow, and includeSlow opts it in", async () => {
  registerDetector(fakeDetector({ id: "fake-disabled", cost: "fast", enabledByDefault: false }));

  const byDefault = await scan();
  assert.deepEqual(byDefault.ranDetectors, []);
  assert.equal(byDefault.skipped[0]?.reason, "slow");

  const optedIn = await scan({ includeSlow: true });
  assert.deepEqual(optedIn.ranDetectors, ["fake-disabled"]);
});

test("the only filter runs just the named detector and marks the rest filtered", async () => {
  registerDetector(fakeDetector({ id: "fake-a" }));
  registerDetector(fakeDetector({ id: "fake-b" }));

  const result = await scan({ only: ["fake-a"] });
  assert.deepEqual(result.ranDetectors, ["fake-a"]);
  assert.equal(result.skipped.find((s) => s.detector === "fake-b")?.reason, "filtered");
});

test("a detector that throws is recorded, not fatal — other detectors still run", async () => {
  registerDetector(fakeDetector({ id: "fake-boom", scan: async () => { throw new Error("kaboom"); } }));
  registerDetector(fakeDetector({ id: "fake-ok" }));

  const result = await scan();
  assert.deepEqual(result.ranDetectors, ["fake-ok"], "the good detector still ran");
  const boom = result.skipped.find((s) => s.detector === "fake-boom");
  assert.equal(boom?.reason, "error");
  assert.equal(boom?.detail, "kaboom");
});

test("an already-aborted signal skips every detector as aborted", async () => {
  registerDetector(fakeDetector({ id: "fake-x" }));
  const result = await scan({ signal: AbortSignal.abort() });
  assert.deepEqual(result.ranDetectors, []);
  assert.equal(result.skipped[0]?.reason, "aborted");
});

test("registerDetector throws on a duplicate id", () => {
  registerDetector(fakeDetector({ id: "dup" }));
  assert.throws(() => registerDetector(fakeDetector({ id: "dup" })), /Duplicate detector id: "dup"/);
  assert.equal(getDetectors().length, 1, "the duplicate was not added");
});
