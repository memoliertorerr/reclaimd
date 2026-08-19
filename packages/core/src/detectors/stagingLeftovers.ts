import { join } from "node:path";
import { registerDetector } from "../registry.js";
import { ensureLevel } from "../fs/paths.js";
import type { Detector, Finding, LastUsedResult } from "../types.js";

/**
 * staging-leftovers — installer staging whose payload is already extracted
 * into a sibling dir that must be kept.
 *
 * The audit's concrete case: `~/Library/Arduino15/staging` holds downloaded
 * board/library archives the Arduino IDE already extracted into a sibling
 * `~/Library/Arduino15/packages`. Once that sibling exists, the staging
 * archives are redundant — but we only claim that when the sibling is
 * VERIFIABLY present. If it's missing, we don't assume the archives are safe
 * to drop; the finding degrades to `review` with no reclaim command.
 */

const STAGING_PATH = "Library/Arduino15/staging";
const SIBLING_PATH = "Library/Arduino15/packages";

/** Pure finding builder — exported so both the sibling-present and sibling-absent shapes are testable. */
export function buildStagingFinding(
  stagingPath: string,
  sizeBytes: number,
  apparentSizeBytes: number | undefined,
  lastUsed: LastUsedResult,
  siblingPath: string,
  siblingExists: boolean,
): Finding {
  if (siblingExists) {
    return {
      id: `staging-leftovers:${stagingPath}`,
      detector: "staging-leftovers",
      title: "Arduino IDE installer staging (payload already extracted)",
      paths: [stagingPath],
      sizeBytes,
      apparentSizeBytes,
      level: ensureLevel(stagingPath, "caution"),
      lastUsedAt: lastUsed.at,
      lastUsedSource: lastUsed.source,
      whatItIs:
        "Downloaded installer archives the Arduino IDE's board/library manager staged before " +
        `extracting them. Verified: their extracted payload already lives in the sibling ` +
        `${siblingPath} — this staging copy is now redundant.`,
      ifRemoved:
        "Nothing breaks: the extracted board/library packages you actually use stay in place " +
        `at ${siblingPath}. If the IDE needs to re-stage an archive later (e.g. reinstalling a ` +
        "board package), it re-downloads it.",
      dependents: [`${siblingPath} — already-extracted installer payload, must be kept`],
      reversible: {
        possible: true,
        how: "Re-downloaded by the Arduino IDE's board/library manager if needed again",
      },
      reclaim: {
        command: `rm -rf "${stagingPath}"`,
        requiresSudo: false,
        kind: "delete",
      },
    };
  }

  // Sibling missing — can't prove the archives are redundant. Inform, don't
  // assume; no reclaim command.
  return {
    id: `staging-leftovers:${stagingPath}`,
    detector: "staging-leftovers",
    title: "Arduino IDE installer staging (unverified)",
    paths: [stagingPath],
    sizeBytes,
    apparentSizeBytes,
    level: "review",
    lastUsedAt: lastUsed.at,
    lastUsedSource: lastUsed.source,
    whatItIs:
      "Downloaded installer archives the Arduino IDE's board/library manager staged. These are " +
      `normally redundant once extracted into a sibling ${siblingPath} — but that sibling ` +
      "doesn't exist on this machine, so reclaimd can't confirm the archives were actually " +
      "extracted anywhere else.",
    ifRemoved:
      "Unknown. reclaimd could not verify an extracted payload exists elsewhere, so removing " +
      "this may or may not lose something you'd need — investigate before deleting.",
    dependents: [],
    reversible: {
      possible: true,
      how: "Re-downloaded by the Arduino IDE if it turns out you do need it again",
    },
    // No reclaim — can't confidently recommend removal without the sibling proof.
  };
}

export const stagingLeftovers: Detector = {
  id: "staging-leftovers",
  title: "Installer staging leftovers",
  cost: "moderate",
  async scan(ctx): Promise<Finding[]> {
    const stagingPath = join(ctx.home, STAGING_PATH);
    if (!(await ctx.pathExists(stagingPath))) return [];

    const size = await ctx.dirSize(stagingPath);
    const bytes = size.unknown ? 0 : size.diskBytes;
    if (!size.unknown && bytes === 0) return []; // empty — nothing to report

    const siblingPath = join(ctx.home, SIBLING_PATH);
    const siblingExists = await ctx.pathExists(siblingPath);
    const lu = await ctx.lastUsed(stagingPath);

    return [
      buildStagingFinding(stagingPath, bytes, size.unknown ? undefined : size.apparentBytes, lu, siblingPath, siblingExists),
    ];
  },
};

registerDetector(stagingLeftovers);
