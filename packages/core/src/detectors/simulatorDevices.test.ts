import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDevices, runtimeLabel, buildDeviceFinding } from "./simulatorDevices.js";

test("parseDevices flattens simctl's runtime-keyed device map", () => {
  const json = {
    devices: {
      "com.apple.CoreSimulator.SimRuntime.iOS-26-0": [
        { udid: "AAA", name: "iPhone 17 Pro", dataPath: "/x/AAA/data", state: "Shutdown" },
        { udid: "BBB", name: "iPhone Air", dataPath: "/x/BBB/data" },
      ],
      "com.apple.CoreSimulator.SimRuntime.watchOS-11-0": [{ udid: "CCC", name: "Watch" }],
    },
  };
  const devices = parseDevices(json);
  assert.equal(devices.length, 3);
  assert.equal(devices[0]?.udid, "AAA");
  assert.equal(devices[2]?.runtime, "com.apple.CoreSimulator.SimRuntime.watchOS-11-0");
});

test("parseDevices tolerates junk without throwing", () => {
  assert.deepEqual(parseDevices(null), []);
  assert.deepEqual(parseDevices({}), []);
  assert.deepEqual(parseDevices({ devices: { rt: "not-an-array" } }), []);
});

test("runtimeLabel turns a runtime id into a readable OS version", () => {
  assert.equal(runtimeLabel("com.apple.CoreSimulator.SimRuntime.iOS-26-0"), "iOS 26.0");
  assert.equal(runtimeLabel("com.apple.CoreSimulator.SimRuntime.watchOS-11-2"), "watchOS 11.2");
});

test("a bloated device is RESET, not deleted — the core reset-over-delete guarantee", () => {
  const f = buildDeviceFinding(
    { udid: "9C3CB6DC", name: "iPhone 17 Pro", runtime: "com.apple.CoreSimulator.SimRuntime.iOS-26-0" },
    "/Users/x/Library/Developer/CoreSimulator/Devices/9C3CB6DC/data",
    5_900_000_000,
    { at: new Date("2026-01-01T00:00:00Z"), source: "mtime" },
  );
  assert.equal(f.reclaim?.kind, "reset", "reclaim kind must be reset, never delete");
  assert.equal(f.reclaim?.command, "xcrun simctl erase 9C3CB6DC");
  assert.equal(f.reclaim?.requiresSudo, false);
  assert.equal(f.level, "caution");
  // The annotation must make the reset semantics explicit.
  assert.match(f.ifRemoved, /device itself stays/i);
  assert.match(f.whatItIs, /iPhone 17 Pro/);
});
