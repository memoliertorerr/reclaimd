import { registerDetector } from "../registry.js";
import type { Detector, Finding } from "../types.js";

/**
 * sip-reporter — big trees under SIP that CANNOT be reclaimed.
 *
 * System Integrity Protection blocks removal of these paths even with
 * `sudo rm`. The whole point of this detector is to STOP the user (and any
 * future contributor) from wasting a round-trip trying — in the manual audit we
 * burned one attempting to `sudo rm /Library/Updates`. So these surface as
 * `level: "blocked"` with a `blockedReason` and, deliberately, NO `reclaim`
 * field at all — there is no command to offer.
 *
 * A target is only reported if it exists AND is genuinely SIP-restricted AND is
 * large enough to matter. If a target turns out NOT to be restricted, we skip it
 * here (it belongs to whatever normal detector owns it), never emit a bogus
 * blocked finding.
 */

/** Curated big system trees to check. Extend deliberately — each must be genuinely SIP-restricted. */
const TARGETS = ["/Library/Updates"];

const MIN_BYTES = 200 * 1024 * 1024; // don't bother reporting a small restricted dir

export const sipReporter: Detector = {
  id: "sip-reporter",
  title: "SIP-restricted system trees",
  cost: "fast",
  async scan(ctx): Promise<Finding[]> {
    const findings: Finding[] = [];

    for (const path of TARGETS) {
      if (!(await ctx.pathExists(path))) continue;
      // If it isn't actually restricted, this detector has no business flagging it.
      if (!(await ctx.isSipRestricted(path))) continue;

      const size = await ctx.dirSize(path);
      const bytes = size.unknown ? 0 : size.diskBytes;
      if (!size.unknown && bytes < MIN_BYTES) continue; // too small to be worth a blocked line

      findings.push({
        id: `sip-blocked:${path}`,
        detector: "sip-reporter",
        title: `System-restricted: ${path}`,
        paths: [path],
        sizeBytes: bytes,
        apparentSizeBytes: size.unknown ? undefined : size.apparentBytes,
        level: "blocked",
        lastUsedSource: "unknown",
        whatItIs:
          `${path} holds macOS-managed system data (e.g. downloaded software-update payloads). ` +
          "It's protected by System Integrity Protection (SIP).",
        ifRemoved:
          "You can't remove it. SIP blocks deletion even with `sudo rm`; the only way would be " +
          "to disable SIP from Recovery, which reclaimd does NOT recommend or script. macOS " +
          "manages and clears this space on its own.",
        dependents: [],
        reversible: {
          possible: true,
          how: "macOS repopulates/clears this automatically as needed",
        },
        blockedReason:
          "SIP-restricted — protected by System Integrity Protection; not removable even with sudo. " +
          "Reported so you don't waste time trying. No reclaim command is offered.",
        // NO `reclaim` field — deliberately. A blocked finding never carries a command.
      });
    }

    return findings;
  },
};

registerDetector(sipReporter);
