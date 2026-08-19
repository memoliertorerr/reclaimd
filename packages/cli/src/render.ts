import type { Finding, ScanResult, WarningLevel } from "@reclaimd/core";

/** Human-readable bytes (binary units). */
export function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  const v = n / 1024 ** i;
  return `${v >= 100 || i === 0 ? Math.round(v) : v.toFixed(1)} ${units[i]}`;
}

/** Render order and human labels for each level. */
const LEVELS: { level: WarningLevel; label: string }[] = [
  { level: "blocked", label: "BLOCKED — can't be reclaimed (SIP / system-critical)" },
  { level: "review", label: "REVIEW — real user data; you decide" },
  { level: "caution", label: "CAUTION — regenerable, but expensive or needs network" },
  { level: "safe", label: "SAFE — regenerable cache, no user data" },
];

function lastUsedLine(f: Finding): string {
  if (!f.lastUsedAt) {
    return f.lastUsedSource === "unknown" ? "Last used:   unknown" : `Last used:   unknown (${f.lastUsedSource})`;
  }
  const date = f.lastUsedAt.toISOString().slice(0, 10);
  switch (f.lastUsedSource) {
    case "tool-metadata":
      return `Last used:   ${date} (reported by the tool — reliable)`;
    case "mtime":
      return `Last used:   ${date} (file mtime)`;
    case "atime":
      return `Last used:   ~${date} (atime — unreliable on macOS, treat as approximate)`;
    default:
      return `Last used:   ${date}`;
  }
}

/** A concise one-liner streamed as each finding arrives. */
export function findingLine(f: Finding): string {
  return `  • [${f.level}] ${f.title} — ${formatBytes(f.sizeBytes)}`;
}

/** The full detail block for one finding. */
export function formatFinding(f: Finding): string {
  const lines: string[] = [];
  lines.push(`▸ ${f.title}`);
  // Only surface the apparent size when it EXCEEDS on-disk — that's the APFS
  // sparse/clone case (a big logical file backed by few real blocks). When
  // apparent < on-disk it's just block rounding on many small files; not noteworthy.
  const sparse = f.apparentSizeBytes !== undefined && f.apparentSizeBytes > f.sizeBytes;
  lines.push(`  Size:        ${formatBytes(f.sizeBytes)}${
    sparse ? ` on disk  (apparent ${formatBytes(f.apparentSizeBytes as number)} — APFS sparse/clone)` : ""
  }`);
  lines.push(`  ${lastUsedLine(f)}`);
  lines.push(`  What it is:  ${f.whatItIs}`);
  lines.push(`  If removed:  ${f.ifRemoved}`);
  if (f.dependents.length) lines.push(`  Depends on:  ${f.dependents.join("; ")}`);
  const rev = f.reversible.possible
    ? `yes${f.reversible.how ? ` — ${f.reversible.how}` : ""}${
        f.reversible.costBytes ? ` (~${formatBytes(f.reversible.costBytes)} to restore)` : ""
      }`
    : "no — not easily recoverable";
  lines.push(`  Reversible:  ${rev}`);
  lines.push(`  Path:        ${f.paths.join("\n               ")}`);
  if (f.level === "blocked") {
    lines.push(`  Blocked:     ${f.blockedReason ?? "system-restricted"}`);
  } else if (f.reclaim) {
    lines.push(`  Reclaim (run this yourself — reclaimd will NOT):`);
    lines.push(`      ${f.reclaim.requiresSudo ? "sudo " : ""}${f.reclaim.command}`);
  }
  return lines.join("\n");
}

/** The full grouped, sorted report plus the reclaimable-estimate summary. */
export function renderReport(result: ScanResult): string {
  const out: string[] = [];
  const { findings } = result;

  out.push("");
  out.push("═".repeat(72));
  out.push(`reclaimd — ${findings.length} finding${findings.length === 1 ? "" : "s"}`);
  out.push("═".repeat(72));

  for (const { level, label } of LEVELS) {
    const group = findings
      .filter((f) => f.level === level)
      .sort((a, b) => b.sizeBytes - a.sizeBytes);
    if (!group.length) continue;
    out.push("");
    out.push(`── ${label} ${"─".repeat(Math.max(0, 68 - label.length))}`);
    for (const f of group) {
      out.push("");
      out.push(formatFinding(f));
    }
  }

  // Reclaimable estimate: sum of safe + caution (never review/blocked).
  const reclaimable = findings
    .filter((f) => f.level === "safe" || f.level === "caution")
    .reduce((sum, f) => sum + (Number.isFinite(f.sizeBytes) ? f.sizeBytes : 0), 0);

  out.push("");
  out.push("─".repeat(72));
  out.push(
    `Estimated reclaimable (safe + caution, excludes review/blocked): ~${formatBytes(reclaimable)}`,
  );
  out.push("This is an estimate. reclaimd never deletes anything — you run the commands.");
  if (result.skipped.length) {
    const errored = result.skipped.filter((s) => s.reason === "error");
    if (errored.length) {
      out.push("");
      for (const s of errored) out.push(`(!) detector ${s.detector} errored: ${s.detail ?? "unknown"}`);
    }
  }
  out.push("");
  return out.join("\n");
}
