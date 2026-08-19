# reclaimd — Claude Context

> This file gives Claude instant context about the project.
> Keep it updated as the project evolves. Reference it at the start of every session.
> **The single canonical build tracker is `docs/BUILD_PLAN.md`** — read it first,
> every session, to know which step is next and what's already done.

---

## Standing Instructions for Claude Sessions

- **Read `docs/BUILD_PLAN.md` at the start of every session** for step status and the
  current milestone. It is the single canonical tracker — update it whenever a step's
  status, scope, or a major decision changes (flip the row, add a note, record the
  decision). If BUILD_PLAN.md and reality disagree, BUILD_PLAN.md is the bug — fix it.
- **Never run `git commit`.** The developer commits manually. **This is absolute —
  never run `git commit` or `git push` yourself, even mid-walkthrough when the developer
  seems to be following along in real time; always hand over the commands and stop.**
- **Every commit command you give must also include the matching `git push` command**,
  so there's one copy-pasteable block instead of two separate asks. Never run `git push`
  yourself either — same rule as commit. If a push isn't appropriate yet (e.g. deliberately
  not ready to share), say so instead of including it. Flag other genuinely useful
  follow-ups (a `docs/` update, a worthwhile tag, an architecture-doc refresh) rather than
  staying silent because they weren't asked for.
- **Never execute a reclaim command — on the developer's machine or in a test.** No `rm`,
  no `trash`, no `simctl delete`/`simctl erase`, no `npm cache clean`, no
  `tmutil deletelocalsnapshots`, nothing that mutates the filesystem. This project's entire
  premise is that a **human** runs those commands. reclaimd emits them as text for a person
  to review and run. **Treat this exactly as seriously as the git rule.** There is no
  "just this once", no confirmation prompt that unlocks it, no test fixture that runs one.
  See "The Cardinal Rule" below.
- **Write explanations and plans to `docs/`** as `.md` files.
- **Keep this CLAUDE.md updated** whenever the structure or conventions change. **When you
  add a detector, add it to the File Structure and Detector Registry sections here** in the
  same step.
- **After every feature or change: update all relevant docs** — CLAUDE.md, the build-plan
  tracker (`docs/BUILD_PLAN.md`), and any architecture docs in `docs/`. Never let them
  drift from the code.
- **`packages/core/src/types.ts` is the contract.** The `Finding` and `Detector`
  interfaces are the boundary between the engine, every detector, and every UI surface
  (CLI, Raycast, and any future consumer). A change there ripples to all three — update
  the engine, every affected detector, and every consumer **in the same step**, never let
  them drift. This is the single-repo analogue of a cross-repo API contract: treat it with
  the same discipline you would a published API.
- **TypeScript, `strict`. Run `npm run typecheck` before showing any commit command**, and
  **run `npm test`** too once the safety-layer tests exist (they land in RS3). Never show a
  commit command over a red tree.
- **Never touch `~/Storage/CS/fayn-react-dev` or `~/Storage/CS/fayn-backend-dev`.** They are
  an unrelated live project — read-only reference at most, and only if explicitly asked.
- **Ask questions freely.**
- **Every prompt implicitly includes "ask questions if necessary and update docs if
  necessary."** Never wait to be reminded — ask when genuinely uncertain, and always update
  CLAUDE.md and the relevant docs after every change.

---

## What This Project Is

**reclaimd** is a macOS disk-space analysis tool that reproduces, as software, a hand audit
the developer did with Claude. The manual session: a Mac's "System Data" had ballooned to
~90 GB with 17 GB free on a 228 GB disk. We walked the filesystem path by path, found what
was reclaimable, and — the important part — for each candidate worked out **what it actually
was, when it was last used, what would break, what depended on it, and what it would cost to
get back.**

**The size number is the easy part and the least valuable part. The annotation is the
product.** Any `du` can tell you a folder is 7.5 GB. reclaimd's job is to tell you that the
7.5 GB is an iOS Simulator runtime last used 9 months ago, that its 26.2 sibling was used 4
weeks ago so you should keep that one, that removing it is reversible by re-downloading
through Xcode, and roughly what that re-download costs. That reasoning is what the manual
session produced by hand, and it's what reclaimd produces automatically.

reclaimd is **UI-agnostic at its core**: the scanning engine, the detectors, and the finding
model live in `packages/core` and know nothing about any UI. A **CLI** (`packages/cli`) and a
**Raycast extension** (`packages/raycast`) are two thin consumers of that core; a menu-bar app
could be a third later without a rewrite.

---

## The Cardinal Rule — reclaimd never deletes

**reclaimd does not delete, move, trash, reset, or mutate anything. Ever. It emits commands
for a human to run.** This is not a v1 limitation to be lifted later — it is the product's
whole thesis. The value is the *annotated recommendation*; the human stays in the loop for
the *action* because only a human knows whether that 10 GB WhatsApp `Message` store is
disposable.

This is enforced structurally, not by convention:

- **`Finding.reclaim.command` is a display string.** It is rendered for the user to copy and
  run. It is **never** passed to any exec function. There is no code path from a finding's
  reclaim command to execution — do not add one, not behind a flag, not behind a
  confirmation dialog, not "stubbed for later".
- **`packages/core/src/fs/exec.ts` is a read-only allowlist wrapper.** It may only spawn
  binaries/subcommands on an explicit allowlist of *read-only* probes (`du`, `stat`, `ls`,
  `xcrun simctl list`, `tmutil listlocalsnapshots`, `brew --cache`, `go env`, …). It
  **refuses** to spawn anything mutating (`rm`, `simctl delete`, `simctl erase`,
  `npm cache clean`, `tmutil delete*`, …). This refusal is unit-tested.
- **The Raycast extension offers `Action.CopyToClipboard` for reclaim commands, never an
  execute action.** The CLI prints them. Neither runs them.

If a future step ever appears to require executing a reclaim command, that step is
misunderstood — **stop and raise it**, don't build the execute path.

---

## Stack

| Layer | Choice |
|-------|--------|
| Language | **TypeScript** (`strict` mode) everywhere. Where JS or TS is a choice, it's TS. |
| Runtime | Node.js (macOS host). Core shells out to macOS CLIs via the read-only `exec` allowlist. |
| Repo layout | **npm workspaces** monorepo — `packages/core`, `packages/cli`, `packages/raycast`. |
| Core deps | Kept **dependency-light** — ideally zero runtime deps. Core must never import a UI library. |
| CLI | `packages/cli` — thin consumer of core; the first-built, self-verifiable surface. |
| Raycast | `packages/raycast` — `@raycast/api` (React + TS). One consumer of core, not the core. |
| Tests | `node:test` run through `tsx` (no heavy test-framework dependency). Safety-layer tests are mandatory. |
| Typecheck | `tsc -b` via project references; `npm run typecheck` at the root covers every package. |
| Target OS | macOS only (Apple-silicon + Intel). Detectors probe macOS-specific known paths and tools. |

---

## Architecture

```
                       packages/core  (UI-AGNOSTIC — never imports @raycast/api)
                       ┌───────────────────────────────────────────────┐
   xcrun / du / stat / │  detectors/*  ──register──▶  registry          │
   tmutil / brew / …   │       │                          │             │
   (read-only, via     │       │ scan(ctx)                │ getDetectors │
    exec allowlist)    │       ▼                          ▼             │
        ▲              │  fs/ safety layer   ◀────────  engine.scan()   │
        └──────────────┤  (exec · sip · size · lastUsed · paths guard)  │
                       │                          │ Finding[] (streamed)│
                       └──────────────────────────┼──────────────────────┘
                                                  │
                          ┌───────────────────────┴───────────────────────┐
                          ▼                                                ▼
                 packages/cli                                    packages/raycast
             (prints findings, --json)                     (List + Detail, Copy action)
```

**Data flow:** `engine.scan()` walks the **registered** detectors (never a blind full-disk
walk), giving each a `DetectorContext` of read-only helpers. Each detector probes its own
known paths / tool metadata and returns `Finding[]`. Findings stream back through an
`onFinding` callback so a UI can render progressively while slow detectors are still running.

**Adding a detector = adding one file** in `packages/core/src/detectors/` that implements
`Detector` and self-registers, plus one import line in `detectors/index.ts` (the barrel).
**The engine never changes when a detector is added** — that's the plugin contract.

---

## The Finding Model (`packages/core/src/types.ts`)

```ts
export type WarningLevel = "safe" | "caution" | "review" | "blocked";
export type LastUsedSource = "tool-metadata" | "mtime" | "atime" | "unknown";
export type ReclaimKind = "delete" | "reset" | "app-managed";

export interface Finding {
  id: string;
  detector: string;              // id of the detector that produced it
  title: string;                 // "iOS Simulator runtime — iOS 26.0.1"
  paths: string[];
  sizeBytes: number;             // headline: on-disk / best reclaimable estimate
  apparentSizeBytes?: number;    // logical size, when it diverges (APFS clones/sparse) — see Landmines
  level: WarningLevel;
  lastUsedAt?: Date;
  lastUsedSource: LastUsedSource;
  whatItIs: string;              // plain English, no jargon
  ifRemoved: string;             // observable behavior change
  dependents: string[];          // what else breaks or notices
  reversible: {
    possible: boolean;
    how?: string;                // "xcrun simctl runtime download …" / "Xcode ▸ Settings ▸ Platforms"
    costBytes?: number;          // re-download / rebuild size
  };
  reclaim?: {
    command: string;             // DISPLAY ONLY — NEVER executed
    requiresSudo: boolean;
    kind: ReclaimKind;
  };
  blockedReason?: string;        // set iff level === "blocked"
}
```

**Warning levels:**

| Level | Meaning |
|---|---|
| `safe` | Regenerable cache, no user data, no configuration. |
| `caution` | Regenerable but expensive to restore, or it changes a workflow (e.g. next install needs network). |
| `review` | Contains real user data — a **human** must decide. The tool only informs. |
| `blocked` | SIP-restricted or system-critical. Report it, **never offer a command.** `blockedReason` says why. |

**`lastUsedSource` confidence order:** `tool-metadata` (e.g. `simctl` reports a real *Last
Used At*) > `mtime` > `atime` > `unknown`. **`atime` is unreliable on macOS** and must never
be presented with the same confidence as tool metadata — the renderer de-emphasizes it and
labels the source.

---

## The Detector Interface (`packages/core/src/types.ts`)

```ts
export type DetectorCost = "fast" | "moderate" | "slow";

export interface Detector {
  id: string;                    // stable, kebab-case — the Finding.detector value
  title: string;                 // human label
  cost: DetectorCost;            // engine gates "slow" detectors behind opt-in
  enabledByDefault?: boolean;    // default true; slow detectors default false
  scan(ctx: DetectorContext): Promise<Finding[]>;
}

export interface DetectorContext {
  home: string;
  dirSize(path: string): Promise<SizeResult>;                 // apparent vs on-disk
  isSipRestricted(path: string): Promise<boolean>;            // ls -ldO / stat -f %Sf
  lastUsed(path: string): Promise<{ at?: Date; source: LastUsedSource }>;
  exec(argv: string[]): Promise<ExecResult>;                  // READ-ONLY allowlist only
  pathExists(path: string): Promise<boolean>;
  log(msg: string): void;
  signal?: AbortSignal;                                       // for cancellation
}
```

**Detectors declare their own `cost`** so slow ones (the bounded `node_modules` walk, Time
Machine snapshots) can be opt-in and kept out of the fast interactive path. A detector for a
tool that isn't installed on this machine (`brew`, `go`, Parallels, …) must **no-op
gracefully** — return `[]`, never throw.

---

## Safety Architecture (`packages/core/src/fs/`)

This is the heart of the project. Get this wrong and reclaimd either lies to the user or
becomes dangerous.

| Concern | File | Guarantee |
|---|---|---|
| Read-only execution | `fs/exec.ts` | Allowlist of read-only binaries/subcommands. Refuses every mutating argv. Unit-tested that `rm`, `simctl delete/erase`, `npm cache clean`, `tmutil delete*` are rejected. |
| SIP detection | `fs/sip.ts` | Before any command is offered for a path under `/System`, `/Library`, `/usr`, `/private/var`, probe the `restricted` flag (`ls -ldO` / `stat -f "%Sf"`). Restricted ⇒ `level: "blocked"`, `blockedReason` set, **no `reclaim`**. |
| Last-used resolution | `fs/lastUsed.ts` | Source precedence tool-metadata > mtime > atime > unknown; always records which. Never dresses `atime` up as confident. |
| Size | `fs/size.ts` | Returns apparent **and** on-disk bytes; the Finding headline is the reclaimable/on-disk estimate. Handles APFS sparse/clone divergence (see Landmines). |
| Never-safe guard | `fs/paths.ts` | `PROTECTED_ROOTS` (`~/Documents`, `~/Desktop`, `~/Pictures`, Photos libraries, `~/Downloads`, device backups). A guard refuses to let any detector mark a protected path `safe` — worst case it's forced to `review`. Belt-and-suspenders behind detector discipline. |

**Reset over delete.** When the owning tool provides a reset that fixes the bloat without
destroying the thing, model it as `reclaim.kind: "reset"` (e.g. `simctl erase <UUID>` keeps
the simulator device, drops the bloat). Prefer it over a raw delete.

**Targeted subtrees, never whole app containers.** A detector aims at a *specific* cache
subtree (e.g. an app's `…/Caches/…/Sparkle`), never the app's whole Group Container — the
same app can hold a disposable updater cache *and* a 10 GB irreplaceable message store. **If a
detector can't prove a subtree is a cache, the finding is `review`, not `safe`.**

**Full Disk Access degradation.** Some paths (device backups, others) can't be sized without
Full Disk Access. On `EPERM`, the detector surfaces the finding with the size marked unknown
and a note that FDA is needed — it never crashes, and never reports `0` as if the thing were
empty.

---

## File Structure

> Target layout the build plan realizes. `docs/BUILD_PLAN.md` tracks which parts exist yet.
> **Add each new detector to this tree and to the Detector Registry table below as it lands.**

```
reclaim/                              ← repo root (project name: reclaimd)
  package.json                        ← npm workspaces root; typecheck/test/reclaimd scripts
  tsconfig.json                       ← project references over the three packages
  packages/
    core/                             ← @reclaimd/core — UI-AGNOSTIC engine. Never imports @raycast/api.
      src/
        types.ts                      ← THE CONTRACT: Finding, Detector, WarningLevel, DetectorContext, …
        registry.ts                   ← detector plugin registry (registerDetector / getDetectors)
        engine.ts                     ← scan(): runs registered detectors, streams Findings, gates slow ones
        fs/
          exec.ts                     ← read-only spawn allowlist (refuses all mutating argv)
          sip.ts                      ← SIP restricted-flag probe
          size.ts                     ← du wrapper; apparent vs on-disk (APFS-aware)
          lastUsed.ts                 ← lastUsedAt + source tagging
          paths.ts                    ← known paths, PROTECTED_ROOTS, never-safe guard
        detectors/
          index.ts                    ← barrel: imports every detector so it self-registers
          simulatorRuntimes.ts        ← iOS/watchOS/tvOS runtimes (simctl Last Used At)
          simulatorDevices.ts         ← per-device data; reclaim.kind "reset" (simctl erase)
          simulatorDyldCaches.ts      ← CoreSimulator dyld caches (safe; rebuilt on launch)
          xcodeDerivedData.ts         ← DerivedData (safe) + Archives (review)
          xcodeDeviceSupport.ts       ← iOS DeviceSupport symbol caches (safe; regenerated on attach)
          packageManagerCaches.ts     ← npm/yarn/pnpm/Homebrew/pip/cargo/go (caution; app-managed prunes)
          sparkleCaches.ts            ← Sparkle updater caches ONLY (never the app's data subtrees)
          vmImages.ts                 ← Docker/Parallels/UTM/Claude disk images (mostly review)
          stagingLeftovers.ts         ← installer staging whose payload is extracted in a sibling dir
          sipReporter.ts              ← big things under SIP roots → blocked, no command
          trashAndDownloads.ts        ← ~/.Trash + ~/Downloads (review — user data)
          mobileSyncBackups.ts        ← iOS device backups (review — user data)
          timeMachineSnapshots.ts     ← APFS local snapshots (slow/opt-in; tmutil)
          orphanedNodeModules.ts      ← node_modules under stale project roots (slow/opt-in; bounded walk)
    cli/                              ← @reclaimd/cli — thin, self-verifiable consumer of core
      src/
        index.ts                      ← runs engine.scan(), prints findings
        render.ts                     ← text/table + (later) --json / --markdown formatting
    raycast/                          ← the Raycast extension — one consumer of core
      package.json                    ← @raycast/api manifest (commands, preferences)
      src/
        list.tsx                      ← findings List + Detail; Copy-reclaim-command action (never execute)
  docs/
    BUILD_PLAN.md                     ← THE canonical step tracker (read first every session)
    ARCHITECTURE.md                   ← deeper architecture notes as they accrue (optional, created when needed)
  CLAUDE.md                           ← this file
```

---

## Detector Registry (v1)

> Each detector is grounded in the real hand-audit — every one is proven to find something on
> the developer's machine. "Real-audit finding" is the specific candidate from that session
> the detector reproduces.

| Detector | Targets | Default level | Real-audit finding it reproduces |
|---|---|---|---|
| `simulatorRuntimes` | `~/Library/Developer/CoreSimulator/…/Runtimes` (via `simctl runtime list`) | caution | iOS 26.0.1 runtime, 7.5 GB, last used 9 mo ago (keep the 26.2 sibling used 4 wk ago) |
| `simulatorDevices` | `~/Library/Developer/CoreSimulator/Devices/<UUID>` | caution (**reset**) | Two bloated sim devices, 5.9 GB — reclaim via `simctl erase`, not delete (every other device 17 MB) |
| `simulatorDyldCaches` | `~/Library/Developer/CoreSimulator/Caches/dyld` | safe | Simulator dyld caches, 7.7 GB — pure build artifact, rebuilt on next launch |
| `xcodeDerivedData` | `~/Library/Developer/Xcode/DerivedData` (safe) + `…/Archives` (review) | safe / review | DerivedData rebuild cache; Archives are real shippable artifacts (review) |
| `xcodeDeviceSupport` | `~/Library/Developer/Xcode/iOS DeviceSupport` | safe | Per-iOS-version symbol caches — regenerated on next device attach *(added to v1 set)* |
| `packageManagerCaches` | npm/yarn/pnpm/Homebrew/pip/cargo/go cache dirs | caution | `~/.npm/_cacache`, 5.2 GB — regenerable, but next install needs network |
| `sparkleCaches` | app `…/Caches/…/Sparkle` subtrees ONLY | safe | WhatsApp Sparkle updater leftovers, 886 MB — safe (its `…/Message` 10 GB store is untouched) |
| `vmImages` | Docker/Parallels/UTM/Claude disk images | review | Claude VM `rootfs.img`, 10 GB — sessions live on the host in `~/.claude/`, not the image (proving it took real investigation) |
| `stagingLeftovers` | installer `staging/` with an extracted sibling `packages/` | caution/safe | `~/Library/Arduino15/staging`, 2.7 GB — archives already extracted into a sibling `packages/` that must be kept |
| `sipReporter` | big trees under `/System`, `/Library`, `/usr`, `/private/var` | **blocked** | `/Library/Updates` payloads, 2.2 GB — SIP-restricted, `sudo rm` fails; offering a command is a wasted instruction |
| `trashAndDownloads` | `~/.Trash`, `~/Downloads` | review | User-chosen files — informs, never auto-empties, never `safe` |
| `mobileSyncBackups` | `~/Library/Application Support/MobileSync/Backup` | review | iOS device backups — real user data |
| `timeMachineSnapshots` | APFS local snapshots (`tmutil`) | caution (slow/opt-in) | Local snapshots — macOS auto-thins; reclaimable ≠ apparent (APFS) |
| `orphanedNodeModules` | `node_modules` under stale project roots | caution (slow/opt-in) | Regenerable via `npm install` (needs network); "stale" is a judgment → never `safe` |

---

## What's Not Built Yet

> All designed, none built in v1. See the **Later** section of `docs/BUILD_PLAN.md`.

| Feature | Notes |
|---|---|
| Diff / history mode ("what grew since last scan") | Reads the persisted scan-result store (laid down in the final v1 step). Store keyed scans, compute deltas. Not built. |
| Scheduled background scans | launchd agent or a Raycast background command. Designed around the same `engine.scan()`; not built. |
| Custom user-defined detectors | The `Detector` interface + registry already support it — load a user detector directory at runtime. Not wired. |
| Export to Markdown | A `Finding[]` → Markdown report; the `--json` output shipped in v1 is the foundation. Not built. |
| Menu-bar app | A third consumer of `packages/core`. Core is kept UI-agnostic precisely so this needs no rewrite. Not built. |
| Full Disk Access onboarding UX | v1 degrades to "size unknown" without FDA; guiding the user to grant it is a nicer-UX follow-up, not built. |
