/**
 * Detector barrel — the registration seam.
 *
 * Importing this module runs each detector file's top-level `registerDetector`
 * call, populating the registry. A CONSUMER (the CLI, the Raycast extension)
 * imports this barrel to opt into the standard detector set; the ENGINE never
 * imports it, so `engine.scan()` stays detector-agnostic. Adding a detector =
 * add its file + one import line here — the engine doesn't change.
 */
import "./simulatorRuntimes.js";
import "./simulatorDevices.js";
import "./simulatorDyldCaches.js";
import "./xcodeDerivedData.js";
import "./sipReporter.js";
