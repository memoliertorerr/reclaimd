import { scan } from "@reclaimd/core";
// Importing the detector barrel runs each detector's self-registration. The CLI
// (a consumer) opts into the standard detector set here; the engine never does.
import "@reclaimd/core/detectors";
import { findingLine, renderReport } from "./render.js";

const USAGE = `reclaimd — macOS disk-space analysis

Reports reclaimable disk space with annotated, human-reviewed recommendations.
reclaimd never deletes, resets, or mutates anything — every reclaim command it
shows is display-only, for a human to review and run themselves.

Usage:
  reclaimd [options]

Options:
  --help       Show this help and exit
  --slow       Include slow/opt-in detectors                (none exist until RS11)
  --json       Print findings as machine-readable JSON      (not yet implemented — RS12)`;

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) {
    console.log(USAGE);
    return;
  }
  const includeSlow = args.includes("--slow");

  console.error("Scanning… (findings stream in as detectors finish)\n");
  const result = await scan({
    includeSlow,
    onFinding: (f) => console.error(findingLine(f)),
  });

  console.log(renderReport(result));
}

main().catch((err) => {
  console.error("reclaimd failed:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
