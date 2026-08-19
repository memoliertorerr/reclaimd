import { useEffect, useState } from "react";
import { List, ActionPanel, Action, Color, Icon, getPreferenceValues } from "@raycast/api";
import { scan } from "@reclaimd/core";
import type { Finding, WarningLevel } from "@reclaimd/core";
// Importing the detector barrel self-registers the standard detector set. The
// extension (a consumer) opts in here; the engine never imports detectors.
import "@reclaimd/core/detectors";

interface Prefs {
  includeSlow: boolean;
}

/** Human-readable bytes (binary units). Local to the extension — not core contract code. */
function humanBytes(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  const v = n / 1024 ** i;
  return `${v >= 100 || i === 0 ? Math.round(v) : v.toFixed(1)} ${units[i]}`;
}

const LEVELS: { level: WarningLevel; title: string; color: Color }[] = [
  { level: "blocked", title: "Blocked — can't be reclaimed (SIP / system)", color: Color.Red },
  { level: "review", title: "Review — real user data; you decide", color: Color.Orange },
  { level: "caution", title: "Caution — regenerable, but costly or needs network", color: Color.Yellow },
  { level: "safe", title: "Safe — regenerable cache, no user data", color: Color.Green },
];

function lastUsedLine(f: Finding): string {
  if (!f.lastUsedAt) return f.lastUsedSource === "unknown" ? "unknown" : `unknown (${f.lastUsedSource})`;
  const date = f.lastUsedAt.toISOString().slice(0, 10);
  switch (f.lastUsedSource) {
    case "tool-metadata":
      return `${date} — reported by the tool (reliable)`;
    case "mtime":
      return `${date} — file mtime`;
    case "atime":
      return `~${date} — atime (unreliable on macOS, approximate)`;
    default:
      return date;
  }
}

/** The full annotation, rendered as Markdown for the item detail pane. */
function toMarkdown(f: Finding): string {
  const lines: string[] = [];
  lines.push(`# ${f.title}`);
  const sizeStr =
    f.apparentSizeBytes !== undefined && f.apparentSizeBytes > f.sizeBytes
      ? `**${humanBytes(f.sizeBytes)}** on disk  ·  apparent ${humanBytes(f.apparentSizeBytes)} (APFS sparse/clone)`
      : `**${humanBytes(f.sizeBytes)}**`;
  lines.push(`Size: ${sizeStr}`);
  lines.push(`Last used: ${lastUsedLine(f)}`);
  lines.push("");
  lines.push(`**What it is** — ${f.whatItIs}`);
  lines.push("");
  lines.push(`**If removed** — ${f.ifRemoved}`);
  if (f.dependents.length) {
    lines.push("");
    lines.push(`**Depends on** — ${f.dependents.join("; ")}`);
  }
  lines.push("");
  const rev = f.reversible.possible
    ? `yes${f.reversible.how ? ` — ${f.reversible.how}` : ""}${
        f.reversible.costBytes ? ` (~${humanBytes(f.reversible.costBytes)} to restore)` : ""
      }`
    : "no — not easily recoverable";
  lines.push(`**Reversible** — ${rev}`);
  lines.push("");
  lines.push(`**Path**`);
  for (const p of f.paths) lines.push(`- \`${p}\``);
  lines.push("");
  if (f.level === "blocked") {
    lines.push(`> **Blocked:** ${f.blockedReason ?? "system-restricted"}`);
  } else if (f.reclaim) {
    lines.push(`**Reclaim command** (run it yourself — reclaimd will _not_):`);
    lines.push("```sh");
    lines.push(`${f.reclaim.requiresSudo ? "sudo " : ""}${f.reclaim.command}`);
    lines.push("```");
  }
  return lines.join("\n");
}

/** Copy-only actions. There is deliberately NO execute action anywhere. */
function FindingActions({ finding }: { finding: Finding }) {
  const canCopyCommand = finding.level !== "blocked" && finding.reclaim !== undefined;
  return (
    <ActionPanel>
      {canCopyCommand && finding.reclaim && (
        <Action.CopyToClipboard
          title="Copy Reclaim Command (Run It Yourself)"
          icon={Icon.Clipboard}
          content={`${finding.reclaim.requiresSudo ? "sudo " : ""}${finding.reclaim.command}`}
        />
      )}
      <Action.CopyToClipboard title="Copy Path" icon={Icon.Finder} content={finding.paths.join("\n")} />
    </ActionPanel>
  );
}

export default function Command() {
  const { includeSlow } = getPreferenceValues<Prefs>();
  const [findings, setFindings] = useState<Finding[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    setFindings([]);
    setIsLoading(true);
    scan({
      includeSlow,
      signal: controller.signal,
      onFinding: (f) => setFindings((prev) => [...prev, f]),
    })
      .catch(() => {
        // Per-detector errors are already isolated inside scan(); nothing to do here.
      })
      .finally(() => setIsLoading(false));
    return () => controller.abort();
  }, [includeSlow]);

  return (
    <List isLoading={isLoading} isShowingDetail>
      {LEVELS.map(({ level, title, color }) => {
        const group = findings
          .filter((f) => f.level === level)
          .sort((a, b) => b.sizeBytes - a.sizeBytes);
        if (!group.length) return null;
        return (
          <List.Section key={level} title={title} subtitle={String(group.length)}>
            {group.map((f) => (
              <List.Item
                key={f.id}
                title={f.title}
                icon={{ source: Icon.HardDrive, tintColor: color }}
                accessories={[{ tag: { value: humanBytes(f.sizeBytes), color } }]}
                detail={<List.Item.Detail markdown={toMarkdown(f)} />}
                actions={<FindingActions finding={f} />}
              />
            ))}
          </List.Section>
        );
      })}
      {!isLoading && findings.length === 0 && (
        <List.EmptyView title="No findings" description="Nothing reclaimable was detected on this Mac." />
      )}
    </List>
  );
}
