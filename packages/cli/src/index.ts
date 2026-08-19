const USAGE = `reclaimd — macOS disk-space analysis

Reports reclaimable disk space with annotated, human-reviewed recommendations.
reclaimd never deletes, resets, or mutates anything — every reclaim command it
shows is display-only, for a human to review and run themselves.

Usage:
  reclaimd [options]

Options:
  --help       Show this help and exit
  --json       Print findings as machine-readable JSON      (not yet implemented — RS12)
  --slow       Include slow/opt-in detectors                (not yet implemented — RS11)

No scan is implemented yet (see RS4 in docs/BUILD_PLAN.md).`;

function main(): void {
  console.log(USAGE);
}

main();
