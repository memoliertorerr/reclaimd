import type { Detector } from "./types.js";

/**
 * The detector plugin registry.
 *
 * Detectors self-register by importing a barrel (packages/core/src/detectors/
 * — added in RS4) that has each detector call `registerDetector`. The engine
 * NEVER imports detectors directly; it only reads the registry. This keeps the
 * engine detector-agnostic — adding a detector never touches the engine.
 */
const detectors: Detector[] = [];

/**
 * Register a detector. Throws on a duplicate id — two detectors sharing an id
 * is a programming error, not a runtime condition to tolerate.
 */
export function registerDetector(detector: Detector): void {
  if (detectors.some((d) => d.id === detector.id)) {
    throw new Error(`Duplicate detector id: "${detector.id}"`);
  }
  detectors.push(detector);
}

/** The registered detectors, read-only. This is how the engine reads the registry. */
export function getDetectors(): readonly Detector[] {
  return detectors;
}

/**
 * Remove all registered detectors. Intended for test isolation (and, later, for
 * reloading user-defined detectors — see CLAUDE.md "What's Not Built Yet").
 * Not used on any normal scan path.
 */
export function clearDetectors(): void {
  detectors.length = 0;
}
