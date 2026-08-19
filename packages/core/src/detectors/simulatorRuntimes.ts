import { registerDetector } from "../registry.js";
import type { Detector, Finding, LastUsedResult } from "../types.js";

/**
 * simulator-runtimes — iOS/watchOS/tvOS/visionOS Simulator runtimes.
 *
 * `xcrun simctl runtime list --json` reports each runtime with a real
 * `sizeBytes` and `lastUsedAt` (tool metadata — the most trustworthy source we
 * get). The reclaim is the tool's own `simctl runtime delete <id>`, NOT an `rm`
 * of the on-disk asset (which lives under SIP-restricted /System/…/AssetsV2 and
 * is managed by simctl).
 *
 * Age reasoning is the product here: a runtime used weeks ago is a keeper; one
 * untouched for months is the real candidate. We compute the age and say so.
 *
 * JSON shape varies across Xcode versions — parse defensively, degrade a
 * missing field rather than throwing. If xcrun/simctl is absent, no-op ([]).
 */

/** A normalized runtime record — every field optional, because Xcode versions differ. */
interface RuntimeRecord {
  identifier?: string;
  version?: string;
  name?: string;
  sizeBytes?: number;
  lastUsedAt?: string;
  isAvailable?: boolean;
  deletable?: boolean;
  platformIdentifier?: string;
  runtimeIdentifier?: string;
  runtimeBundlePath?: string;
  path?: string;
  mountPath?: string;
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const MONTH_MS = 30 * 24 * 60 * 60 * 1000;

/** Accepts the keyed-object form (`{ "<uuid>": {…} }`), an array, or `{ runtimes: [...] }`. */
function normalizeRuntimes(parsed: unknown): RuntimeRecord[] {
  if (Array.isArray(parsed)) return parsed as RuntimeRecord[];
  if (parsed && typeof parsed === "object") {
    const obj = parsed as Record<string, unknown>;
    if (Array.isArray(obj.runtimes)) return obj.runtimes as RuntimeRecord[];
    // Keyed-object form: values are the runtime records.
    const values = Object.values(obj).filter(
      (v): v is RuntimeRecord => !!v && typeof v === "object",
    );
    // Only treat as runtime records if they look like one.
    if (values.some((v) => "version" in v || "runtimeIdentifier" in v || "identifier" in v)) {
      return values;
    }
  }
  return [];
}

/** "com.apple.platform.iphonesimulator" / "…SimRuntime.iOS-26-2" → "iOS". */
function osLabel(r: RuntimeRecord): string {
  const p = r.platformIdentifier ?? "";
  if (p.includes("iphone")) return "iOS";
  if (p.includes("appletv")) return "tvOS";
  if (p.includes("watch")) return "watchOS";
  if (p.includes("xr") || p.includes("vision")) return "visionOS";
  const rid = r.runtimeIdentifier ?? "";
  const m = rid.match(/SimRuntime\.([A-Za-z]+)/);
  return m?.[1] ?? "Simulator";
}

function humanAge(from: Date, now: Date): string {
  const ms = now.getTime() - from.getTime();
  if (ms < 0) return "in the future (clock skew?)";
  const days = Math.floor(ms / (24 * 60 * 60 * 1000));
  if (days < 14) return `${days} day${days === 1 ? "" : "s"} ago`;
  if (ms < MONTH_MS * 2) return `${Math.round(ms / WEEK_MS)} weeks ago`;
  const months = Math.round(ms / MONTH_MS);
  if (months < 12) return `${months} month${months === 1 ? "" : "s"} ago`;
  const years = (ms / (MONTH_MS * 12)).toFixed(1);
  return `${years} years ago`;
}

/** Keeper vs candidate judgment from the age. */
function judgeAge(last: Date | undefined, now: Date): { verdict: string; keeper: boolean } {
  if (!last) return { verdict: "with no recorded last-used date", keeper: false };
  const ms = now.getTime() - last.getTime();
  if (ms < MONTH_MS * 2) return { verdict: "likely a keeper", keeper: true };
  if (ms < MONTH_MS * 6) return { verdict: "used a while ago", keeper: false };
  return { verdict: "untouched for months — a strong candidate to reclaim", keeper: false };
}

async function resolveLastUsed(
  r: RuntimeRecord,
  ctx: { lastUsed: (p: string) => Promise<LastUsedResult> },
): Promise<LastUsedResult> {
  // Tool metadata first (most trustworthy).
  if (r.lastUsedAt) {
    const at = new Date(r.lastUsedAt);
    if (!Number.isNaN(at.getTime())) return { at, source: "tool-metadata" };
  }
  // Fall back to the filesystem on a real on-disk path, labeled honestly.
  const probe = r.runtimeBundlePath ?? r.mountPath ?? r.path;
  if (probe) return ctx.lastUsed(probe);
  return { source: "unknown" };
}

export const simulatorRuntimes: Detector = {
  id: "simulator-runtimes",
  title: "iOS/watchOS/tvOS Simulator runtimes",
  cost: "fast",
  async scan(ctx): Promise<Finding[]> {
    let raw: string;
    try {
      const res = await ctx.exec(["xcrun", "simctl", "runtime", "list", "--json"]);
      if (res.code !== 0) return []; // simctl present but unhappy — degrade quietly
      raw = res.stdout;
    } catch {
      return []; // xcrun/simctl not installed — no-op
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      ctx.log("simulator-runtimes: could not parse `simctl runtime list --json`");
      return [];
    }

    const now = new Date();
    const findings: Finding[] = [];

    for (const r of normalizeRuntimes(parsed)) {
      const os = osLabel(r);
      const version = r.version ?? "unknown version";
      const id = r.identifier ?? r.runtimeIdentifier;
      if (!id) continue; // can't offer a targeted command without an id

      // Size: prefer tool-reported sizeBytes; fall back to du on an on-disk path.
      let sizeBytes = typeof r.sizeBytes === "number" && r.sizeBytes > 0 ? r.sizeBytes : 0;
      if (sizeBytes === 0) {
        const probe = r.runtimeBundlePath ?? r.mountPath;
        if (probe && (await ctx.pathExists(probe))) {
          const s = await ctx.dirSize(probe);
          if (!s.unknown) sizeBytes = s.diskBytes;
        }
      }

      const lu = await resolveLastUsed(r, ctx);
      const { verdict, keeper } = judgeAge(lu.at, now);
      const ageStr = lu.at ? humanAge(lu.at, now) : "unknown";

      const paths = [r.runtimeBundlePath, r.path].filter((p): p is string => !!p);

      findings.push({
        id: `simulator-runtime:${id}`,
        detector: "simulator-runtimes",
        title: `${os} Simulator runtime — ${os} ${version}`,
        paths: paths.length ? paths : [String(id)],
        sizeBytes,
        level: "caution",
        lastUsedAt: lu.at,
        lastUsedSource: lu.source,
        whatItIs:
          `A full ${os} ${version} Simulator runtime (the OS image the Simulator boots). ` +
          `Last used ${ageStr} — ${verdict}.`,
        ifRemoved: keeper
            ? `You'd lose the ${os} ${version} simulator until re-downloaded; since it was used recently, ` +
              `keeping it is probably right. Removing it means the next build/test targeting ${os} ${version} ` +
              `must re-download it (GB-scale, needs network).`
            : `Nothing breaks now, but the next time you build or test against ${os} ${version} the Simulator ` +
              `will re-download the runtime (GB-scale, needs network) before it can boot.`,
        dependents: [`Simulator devices running ${os} ${version}`, "Xcode build/test targeting this runtime"],
        reversible: {
          possible: true,
          how: "Re-download via Xcode ▸ Settings ▸ Platforms (or `simctl runtime` add-download)",
          costBytes: sizeBytes || undefined,
        },
        reclaim: {
          command: `xcrun simctl runtime delete ${id}`,
          requiresSudo: false,
          kind: "delete",
        },
      });
    }

    return findings;
  },
};

registerDetector(simulatorRuntimes);
