// Public API of @reclaimd/core — the UI-agnostic engine.
// The engine and registry are exported; detectors are NOT imported here
// (a consumer imports the detector barrel to self-register them, keeping the
// engine detector-agnostic).
export type * from "./types.js";
export { registerDetector, getDetectors, clearDetectors } from "./registry.js";
export { scan } from "./engine.js";
// Safety-layer helpers detectors and consumers may need directly.
export { ensureLevel, isProtected, protectedRoots, expandTilde, home } from "./fs/paths.js";
