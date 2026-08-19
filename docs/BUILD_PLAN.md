# reclaimd — v1 Build Plan

> Building **reclaimd**: a macOS disk-space analysis tool that reproduces, as software, a
> hand audit the developer did with Claude — walking known filesystem paths and, for each
> reclaim candidate, working out **what it is, when it was last used, what breaks, what
> depends on it, and what it costs to get back**. The size is the easy part; the annotation
> is the product.
>
> **In scope for v1:** a UI-agnostic core (finding model + engine + detector registry + the
> read-only safety layer), a thin CLI that makes findings self-verifiable, a Raycast list
> that renders them, and **14 detectors** drawn from the real audit — each proven to find
> something on the developer's machine.
>
> **Explicitly NOT in scope for v1** (designed, deferred — see **Later**): diff/history mode,
> scheduled background scans, custom user-defined detectors, Markdown export, a menu-bar app,
> Full Disk Access onboarding UX.
>
> **Non-negotiable, baked into every step:** reclaimd **never deletes, resets, trashes, or
> mutates anything** — it emits commands for a human to run. No execute path exists anywhere,
> not in the app, not in tests. See Ground Rules 5–11. **Claude never commits** — it hands
> over a paired commit+push block and stops.
>
> Format mirrors `~/Storage/CS/fayn-react-dev/docs/DESIGN_STANDALONE_PLAN.md` (read-only
> reference): progress tracker, opening prompt, per-step copy-paste prompts, verify table,
> rollback, landmines. **One step = one commit = one reviewable unit.**

---

## Progress Tracker

> Each session flips its own row to ✅ as the final action of the step, in the same commit as
> the change. Read this table at the start of a session to know where to resume. (Status
> proposed by the session; the developer's commit is the real confirmation.)

| Step | Scope | Model | Status |
|------|-------|-------|--------|
| RS1  | Scaffolding — npm-workspaces monorepo (`core`/`cli`/`raycast`), `strict` tsconfig + project references, root `typecheck`/`test`/`reclaimd` scripts, `node:test`+`tsx` runner, CLI `--help` stub | Sonnet 5 | ✅ done |
| RS2  | **The contract** — `core/src/types.ts` (`Finding`, `Detector`, `WarningLevel`, `DetectorContext`), `registry.ts`, `engine.ts` scan loop (streams findings, gates slow detectors). No detectors, no fs helpers yet | **Opus** | ✅ done |
| RS3  | **Safety layer** — `fs/exec.ts` (read-only allowlist, refuses mutating argv), `fs/sip.ts`, `fs/size.ts`, `fs/lastUsed.ts`, `fs/paths.ts` (never-safe guard) **+ unit tests** proving the guarantees | **Opus** | ✅ done |
| RS4  | **First runnable (CLI)** — 3 detectors (`simulatorRuntimes`, `simulatorDyldCaches`, `xcodeDerivedData`) + CLI renderer grouping findings by level with the annotation fields | Sonnet 5 | ✅ done |
| RS5  | **First runnable (Raycast)** — Raycast `List` + `Detail` over `engine.scan()`, streamed; Copy-reclaim-command action (never execute) | Sonnet 5 *(Opus for the Raycast-in-workspace spike if it fights back)* | ✅ done |
| RS6  | `simulatorDevices` (reset-over-delete via `simctl erase`) + `sipReporter` (`/Library/Updates` → blocked, no command) | Sonnet 5 | ✅ done |
| RS7  | `packageManagerCaches` — npm/yarn/pnpm/Homebrew/pip/cargo/go, each via its own cache-dir query + prune command (app-managed) | Sonnet 5 | ✅ done |
| RS8  | `xcodeDeviceSupport` + Xcode `Archives` (review) split + `sparkleCaches` (targeted subtree; never the app's data) | Sonnet 5 | ⬜ todo |
| RS9  | `vmImages` (Docker/Parallels/UTM/Claude — mostly review; the rootfs investigation annotation) + `stagingLeftovers` (Arduino sibling-`packages/` dependency check) | Sonnet 5 | ⬜ todo |
| RS10 | `trashAndDownloads` + `mobileSyncBackups` — user-data detectors, review-only, exercise the never-safe guard | Sonnet 5 | ⬜ todo |
| RS11 | `timeMachineSnapshots` + `orphanedNodeModules` — **slow/opt-in** detectors (bounded walk, APFS-reclaimable caveat) | Sonnet 5 | ⬜ todo |
| RS12 | Scan-result cache (`~/Library/Caches/reclaimd/last-scan.json`) + `reclaimd --json` — responsiveness + the foundation the Later diff mode reads. Diff itself NOT built | Sonnet 5 | ⬜ todo |

**Overall status: RS7 done — package-manager caches (npm/Homebrew real on this Mac; yarn/pnpm/cargo/go no-op or empty). RS8 (Xcode DeviceSupport + Archives + Sparkle) is next.** The plan front-loads the two safety- and
contract-critical steps (RS2, RS3) so every detector afterward is written against a stable,
tested foundation, then reaches a **runnable milestone fast**: a working CLI at RS4 and a
working Raycast list at RS5, both with three real detectors, well before the detector set is
complete. Everything RS6→RS11 is additive detector work that the CLI verifies end-to-end as it
lands. RS12 closes v1 with a result store that keeps the UI responsive and seeds the deferred
diff mode without building it.

**Model note:** most steps are **Sonnet 5** — once the contract and safety layer exist, each
detector is careful-but-pattern work against known paths and proven tool output. **RS2 and RS3
are Opus.** RS2 designs `types.ts`, the contract that ripples to the engine, every detector,
and every UI surface — a wrong shape here is expensive to unwind later. RS3 is the read-only
`exec` allowlist, the SIP probe, and the never-safe guard: this is the layer where a subtle bug
stops being a rendering glitch and becomes a *safety* bug (a wrongly-unblocked SIP path, or an
`exec` that accepts a mutating argv). Those two steps carry the project's core correctness
guarantees, so they get the stronger model. RS5's only real risk is bundling a Raycast
extension that imports a workspace package — if `ray develop`/`ray build` fights the monorepo
layout, escalate that spike to Opus (mirrors how the reference plan handled its WebView spike).

**Session split** — natural review checkpoints:
1. **RS1 → RS3** — foundation. Stop and review when the safety-layer tests are green and the
   contract is stable; nothing else should be built until this is solid.
2. **RS4 → RS5** — first runnable milestone. Stop and actually *run it* (CLI output, then the
   Raycast window) before pouring in more detectors.
3. **RS6 → RS9** — the deterministic detector bulk (sim devices/SIP, package caches, the Xcode
   cluster, VM/staging).
4. **RS10 → RS12** — user-data detectors, the opt-in slow detectors, and the result store.

One session can carry several steps back-to-back; the phases are just suggested checkpoints.
Never start a step with uncommitted changes in the tree.

---

## How To Run This

1. Open a **new Claude Code session** in `~/Storage/CS/reclaim`. CLAUDE.md auto-loads.
2. **Paste the Opening prompt below first.** Wait for its green light (it confirms git state
   and which step is next, then stops).
3. Paste the **PROMPT** for the next unfinished step.
4. The session does the work, runs `npm run typecheck` (and `npm test` from RS3 on), ticks its
   tracker row, and shows a diff + a paired commit+push block. **It never commits.**
5. You review, run it where relevant, and commit if it looks right.

### Opening prompt — every step

```text
You are building reclaimd, a macOS disk-space analysis tool, in ~/Storage/CS/reclaim.
Before any work:
1. Read CLAUDE.md and docs/BUILD_PLAN.md in this repo, in full.
2. Run `git status` and `git branch --show-current`. Confirm the tree is clean and the
   branch is feature/reclaimd-v1. If the repo/branch doesn't exist yet, tell me the
   commands from "0. Before Starting" and STOP until I've run them.
3. Confirm you are on macOS (`sw_vers`) — every detector is macOS-specific.
4. Restate, in one line each, the two rules you will not break this session:
   (a) you never run `git commit` or `git push` — you hand me a paired block and stop;
   (b) reclaimd never executes a reclaim command — not in code, not in a test, not to
       "check it works". Reclaim commands are display-only strings.
5. Read the Progress Tracker and tell me which step is next (the first ⬜ todo).
Then wait. Do not implement anything until I paste the step prompt.
```

### Who verifies what

| Check | Who | "Green" looks like |
|---|---|---|
| `npm run typecheck` | Claude | No errors, clean exit across all packages |
| `npm test` (safety-layer + detector unit tests, from RS3 on) | Claude | All tests pass; the exec-allowlist tests prove mutating argv is rejected |
| **No-execute guarantee** | Claude | No reclaim command reaches `exec`; Raycast actions are Copy-only; the allowlist rejects `rm`/`simctl delete|erase`/`npm cache clean`/`tmutil delete*` (asserted by test) |
| CLI findings on the real Mac (RS4+) | Claude | `npm run reclaimd` prints real, annotated findings with sizes, last-used + source, and levels |
| Reproduces the hand-audit corpus | Claude **+ you** | Claude runs it on this machine and compares sizes/levels against the audit table; **you** confirm the annotations read right |
| **Raycast list renders** (RS5+) | **you** | You run `ray develop`; the list + detail look right. **Claude cannot see a Raycast UI render** — it verifies the code (typecheck, Copy-only actions, no exec path); the visual check is yours |
| SIP paths reported as blocked, no command (RS6) | Claude | `/Library/Updates` surfaces as `blocked` with a `blockedReason` and **no** `reclaim` |

Claude self-verifies everything the CLI can print (it runs on this Mac). The **only** checks
that fall to you are the Raycast *visual* render and the final "do the annotations read
right?" judgment — Claude will always tell you exactly what to look at.

---

## Ground Rules

1. **Branch:** `feature/reclaimd-v1`. Tag `pre-reclaimd` right after the first commit.
2. **One step = one commit**, message prefixed `rs-step-N:`.
3. **Verify before every commit.** `npm run typecheck` (and `npm test` from RS3 on) must be
   green. Never commit red.
4. **Claude never commits** — paired commit+push block, then stop. Never runs `git push` either.
5. **reclaimd never deletes, resets, trashes, or mutates anything.** No `rm`, no `trash`, no
   `simctl delete`/`erase`, no `npm cache clean`, no `tmutil delete*` — not in the app, not in
   a test, not behind a confirmation. `reclaim.command` is a **display-only** string; `exec` is
   a **read-only allowlist**. There is no code path from a finding's command to execution — do
   not add one. A step that seems to need one is misunderstood: STOP and raise it.
6. **SIP check before any command under `/System`, `/Library`, `/usr`, `/private/var`.** Probe
   the `restricted` flag (`ls -ldO` / `stat -f "%Sf"`). Restricted ⇒ `level: "blocked"`,
   `blockedReason` set, **no `reclaim`**. (We burned a full round-trip on `/Library/Updates` in
   the manual session — the whole point of `sipReporter` is to never offer that command.)
7. **`atime` is never presented as high-confidence.** Prefer tool-reported metadata; always
   record `lastUsedSource`. An `atime`-derived date is de-emphasized and labeled as such.
8. **Detectors target specific subtrees, never whole app containers.** If a detector can't
   prove a subtree is a cache, the finding is `review`, not `safe`.
9. **Prefer reset over delete** when the owning tool offers one (`reclaim.kind: "reset"`).
10. **No blind full-disk walk.** Detectors are targeted probes at known paths. The single
    bounded walk (`orphanedNodeModules`) is opt-in, root-scoped, and depth-capped.
11. **Never mark `~/Documents`, `~/Desktop`, `~/Pictures`, Photos libraries, `~/Downloads`, or
    device backups as `safe`.** Enforced by the never-safe guard in `fs/paths.ts`, behind
    detector discipline.
12. **Core never imports `@raycast/api`.** The engine, registry, detectors, and finding model
    are UI-agnostic. UI lives in `packages/cli` and `packages/raycast` only.
13. **Never touch `~/Storage/CS/fayn-react-dev` or `~/Storage/CS/fayn-backend-dev`.**
14. **Every step:** ask questions if genuinely uncertain, update CLAUDE.md + this tracker +
    any architecture docs. Add new detectors to CLAUDE.md's File Structure and Detector
    Registry.

### Rollback

| Situation | Command |
|---|---|
| Step wrong, uncommitted | `git restore . && git clean -fd` |
| A committed step is bad | `git revert <sha>` |
| Abandon the whole thing | `git reset --hard pre-reclaimd` |

---

## 0. Before Starting

Run once, to create the repo and branch (Claude will hand you this block and stop — it does not
run git for you):

```bash
cd ~/Storage/CS/reclaim
git init
git add CLAUDE.md docs/BUILD_PLAN.md
git commit -m "rs-step-0: scope docs (CLAUDE.md + build plan)"
git tag pre-reclaimd
git branch -M main
git checkout -b feature/reclaimd-v1
# add a GitHub remote and push whenever you're ready to share:
# git remote add origin <url> && git push -u origin feature/reclaimd-v1
```

---

## Steps

### RS1 — Scaffolding · Sonnet 5

**Verify:** `npm install` succeeds; `npm run typecheck` is clean across all three packages;
`npm run reclaimd -- --help` prints a usage stub; `npm test` runs (zero tests is fine at this
step) without config errors. No detectors, no engine logic yet.
**Commit:** `rs-step-1: scaffold npm-workspaces monorepo (core/cli/raycast) with strict TS`

```text
Scaffold the reclaimd monorepo. No product logic yet — just the skeleton every later step
builds on.

1. Root package.json with npm workspaces: "workspaces": ["packages/*"]. Scripts:
   - "typecheck": "tsc -b"
   - "test": run node:test files through tsx across packages (e.g.
     "node --import tsx --test \"packages/**/*.test.ts\"") — pick the exact incantation that
     actually works with the installed Node; document it in a comment.
   - "reclaimd": run packages/cli (e.g. "tsx packages/cli/src/index.ts")
   Dev deps at the root only: typescript, tsx, @types/node. Nothing else yet.

2. Three packages, each its own package.json + tsconfig.json:
   - packages/core   — name "@reclaimd/core". Zero dependencies. This is the UI-agnostic
     engine home. tsconfig extends a shared base with strict: true, composite: true.
   - packages/cli    — name "@reclaimd/cli". Depends on @reclaimd/core (workspace).
     src/index.ts prints a --help usage stub (no scan yet) and exits 0.
   - packages/raycast — the Raycast extension. Minimal @raycast/api manifest + a src/list.tsx
     that renders an empty List with a "No findings yet" placeholder. It must typecheck; it
     does NOT need to run in Raycast yet (RS5 wires it to the engine). Depends on
     @reclaimd/core (workspace).

3. Root tsconfig.json uses project references over the three packages so `tsc -b` builds core
   first. strict everywhere. No `any` escape hatches in the scaffold.

4. .gitignore: node_modules, dist, *.tsbuildinfo, .DS_Store, and any Raycast build output.

5. A one-paragraph packages/README note is optional; do NOT write architecture prose here —
   CLAUDE.md already holds it.

Do NOT add: any runtime dependency to core, any test framework beyond node:test+tsx, any
linter config (out of scope for v1). If the Raycast manifest needs a field you're unsure about,
add the minimal valid value and note it — RS5 revisits the manifest.

Ask if the workspace + Raycast-manifest combination needs a decision I should make.

Run npm run typecheck and npm test. Flip RS1 to ✅ in docs/BUILD_PLAN.md in the same change,
then show me the diff and a single block with BOTH the git commit
("rs-step-1: scaffold npm-workspaces monorepo (core/cli/raycast) with strict TS") AND git push.
Do not commit.
```

---

### RS2 — The contract: types + registry + engine loop · Opus

**Verify:** `npm run typecheck` clean; `core/src/types.ts` exports `Finding`, `Detector`,
`WarningLevel`, `LastUsedSource`, `ReclaimKind`, `DetectorContext`, `DetectorCost`,
`SizeResult`, `ExecResult`, `ScanOptions`, `ScanResult` exactly as CLAUDE.md's Finding Model
and Detector Interface describe; `registry.ts` register/get round-trips; `engine.scan()`
iterates registered detectors and streams findings via `onFinding`. A trivial in-file fake
detector (deleted before commit, or kept as a `*.test.ts`) proves the loop runs.
**Commit:** `rs-step-2: core contract — Finding/Detector types, registry, engine scan loop`

```text
Build the reclaimd core contract. This is THE step the whole project hangs off — CLAUDE.md
calls types.ts the contract; treat it that way. No detectors, no fs helpers, no UI.

1. packages/core/src/types.ts — implement exactly the interfaces in CLAUDE.md's "The Finding
   Model" and "The Detector Interface" sections:
   - WarningLevel, LastUsedSource, ReclaimKind, DetectorCost (string-literal unions).
   - Finding (including optional apparentSizeBytes, reversible, reclaim, blockedReason).
   - SizeResult { apparentBytes; diskBytes; reclaimableBytes } and ExecResult
     { stdout; stderr; code } — the shapes the fs layer (RS3) will return.
   - DetectorContext with the read-only helpers (dirSize, isSipRestricted, lastUsed, exec,
     pathExists, log, signal). In RS2 these are TYPES only — no implementation.
   - Detector { id; title; cost; enabledByDefault?; scan(ctx) }.
   - ScanOptions { includeSlow?; only?; signal?; onFinding? } and ScanResult
     { findings; startedAt; finishedAt; ranDetectors; skipped } (skipped = slow detectors
     omitted because includeSlow was false, plus tools not installed).
   Add doc comments on the safety-critical fields: reclaim.command is "DISPLAY ONLY — never
   executed"; blockedReason is "set iff level === 'blocked'". These comments are load-bearing.

2. packages/core/src/registry.ts:
   - A module-level array + registerDetector(d) (dedupe by id — throw on duplicate id, that's
     a programming error) + getDetectors(): readonly Detector[].
   - Export a way for the engine to read the registry; do NOT auto-import detectors here.

3. packages/core/src/engine.ts:
   - scan(opts: ScanOptions): Promise<ScanResult>. Iterate getDetectors(); skip a detector
     when opts.only is set and doesn't include its id, or when it's cost "slow" and
     !opts.includeSlow (record it in skipped). Call detector.scan(ctx) with a ctx whose fs
     helpers are, for RS2 ONLY, thin placeholders that throw "not implemented until RS3" if
     called — the engine wiring is what's under test here, not the fs layer. Await each
     detector, catch per-detector errors so one bad detector can't sink the scan (record it),
     and fire opts.onFinding for each finding as it's produced (streaming).
   - Respect opts.signal for cancellation between detectors.

4. Prove the loop with a test (packages/core/src/engine.test.ts): register a fake fast
   detector that returns one hand-built Finding, run scan(), assert onFinding fired and the
   ScanResult carries it; register a fake slow detector and assert it's skipped unless
   includeSlow. Do NOT ship the fake detector outside the test.

Nothing in this step imports @raycast/api or touches the real filesystem.

Run npm run typecheck and npm test. Flip RS2 to ✅ in docs/BUILD_PLAN.md in the same change,
then show me the diff and a single block with BOTH the git commit
("rs-step-2: core contract — Finding/Detector types, registry, engine scan loop") AND git push.
Do not commit.
```

---

### RS3 — The safety layer + tests · Opus

**Verify:** `npm run typecheck` clean; `npm test` green including tests that **assert the exec
allowlist rejects** `rm`, `simctl delete`, `simctl erase`, `npm cache clean`, and
`tmutil deletelocalsnapshots`; `isSipRestricted('/System/Library/CoreServices')` is true and a
path in the home dir is false; the never-safe guard forces a `~/Documents` finding away from
`safe`. `fs/lastUsed.ts` reports the correct `source` for a tool-metadata vs mtime vs atime
input.
**Commit:** `rs-step-3: read-only safety layer — exec allowlist, SIP probe, never-safe guard`

```text
Build packages/core/src/fs/ — the read-only safety layer. This is the step where reclaimd's
promises become code. Prioritize correctness and tests over surface area.

1. fs/exec.ts — the ONLY place the project spawns a subprocess.
   - An explicit ALLOWLIST of read-only invocations, matched on argv[0] + subcommand where
     relevant. Start with: du, stat, ls, mdls, sw_vers, xcrun (only `simctl list`,
     `simctl runtime list`, and other read-only simctl subcommands — NEVER delete/erase/boot/
     shutdown), tmutil (only listlocalsnapshots), brew (only --cache / --prefix), go (only
     env), defaults (only read). Extend this list in later steps as detectors need more
     read-only probes — every addition is a deliberate, reviewed line.
   - exec(argv) validates argv against the allowlist BEFORE spawning. On a non-allowlisted or
     mutating invocation, THROW (do not spawn) — this is a programming error, surface it loud.
   - Never accepts a shell string; argv array only (no shell interpolation).
   - Return ExecResult { stdout, stderr, code }. Reasonable timeout; respect an AbortSignal.

2. fs/sip.ts — isSipRestricted(path): probe the restricted flag via `ls -ldO <path>` (parse
   the flags field) or `stat -f "%Sf" <path>`. Cache within a scan. Any path that doesn't
   exist → false (nothing to block). Used by detectors before offering a command under a
   system root.

3. fs/size.ts — dirSize(path): SizeResult with apparentBytes, diskBytes, reclaimableBytes.
   Use `du` for on-disk (diskBytes). Note in comments where apparent and disk diverge (APFS
   sparse/clones) — reclaimableBytes is the honest headline; default it to diskBytes unless a
   detector knows better (e.g. snapshots). Degrade on EPERM: return a SizeResult flagged
   unknown rather than 0 or a throw (see the Full Disk Access landmine).

4. fs/lastUsed.ts — lastUsed(path): resolve a last-used date with source precedence
   tool-metadata > mtime > atime > unknown. This helper handles the mtime/atime/unknown cases
   from the filesystem; detectors pass tool-metadata dates in directly (they own that source).
   Return { at?, source }. Never returns atime as if it were mtime.

5. fs/paths.ts — home dir resolution, known-path builders, PROTECTED_ROOTS
   (~/Documents, ~/Desktop, ~/Pictures, ~/Library/…/Photos Library.photoslibrary, ~/Downloads,
   ~/Library/Application Support/MobileSync/Backup), and a guard:
   ensureLevel(path, proposedLevel) that DOWNGRADES a protected path away from "safe"
   (to "review") and returns the safe level. Detectors call it; it's the backstop behind
   discipline, not a substitute for it.

6. Wire these real implementations into the engine's DetectorContext (replace the RS2
   placeholders). engine.scan() now hands detectors a real ctx.

7. Tests (fs/*.test.ts) — these are the point of the step:
   - exec: allowlisted read-only invocation returns output; each of `rm -rf x`,
     `xcrun simctl delete x`, `xcrun simctl erase x`, `npm cache clean --force`,
     `tmutil deletelocalsnapshots x` THROWS without spawning. Assert it never spawned (e.g.
     spy/guard), not just that it returned an error.
   - sip: a known restricted system path is true; a home path is false.
   - paths: ensureLevel('~/Documents/whatever', 'safe') returns 'review'.
   - lastUsed: given mtime-only input, source==='mtime'; atime path labeled 'atime'.

If any macOS-specific probe behaves differently than assumed on this machine, tell me what you
found and adjust — don't paper over it.

Run npm run typecheck and npm test. Flip RS3 to ✅ in docs/BUILD_PLAN.md in the same change,
then show me the diff and a single block with BOTH the git commit
("rs-step-3: read-only safety layer — exec allowlist, SIP probe, never-safe guard") AND
git push. Do not commit.
```

---

### RS4 — First runnable (CLI): 3 detectors + renderer · Sonnet 5

**Verify:** `npm run typecheck` clean; `npm test` green; **`npm run reclaimd` on this Mac prints
real findings** — the iOS Simulator runtimes with per-runtime last-used dates (source
`tool-metadata`), the CoreSimulator dyld caches as `safe`, and Xcode DerivedData as `safe` —
each showing size, level, whatItIs/ifRemoved/dependents, reversible, and (where applicable) a
copy-ready reclaim command. Compare the runtime sizes/dates against the hand-audit table.
**Commit:** `rs-step-4: first runnable CLI — simulator-runtime/dyld + DerivedData detectors`

```text
Ship the first three detectors and the CLI renderer, so reclaimd actually runs and prints
annotated findings. This is the CLI runnable milestone.

1. detectors/simulatorRuntimes.ts — id "simulator-runtimes", cost "fast".
   - Read `xcrun simctl runtime list --json` (via ctx.exec). Parse defensively — the JSON
     shape varies across Xcode versions; if a field is missing, degrade, don't throw.
   - One Finding per runtime. lastUsedAt from the runtime's reported "Last Used At" (or
     equivalent) with lastUsedSource "tool-metadata"; if the tool doesn't report it, fall back
     to ctx.lastUsed on the runtime path and label the source honestly.
   - level: caution (regenerable but re-download needs network and is GB-scale). Annotate that
     a recently-used runtime is a keeper and an old one (months) is the candidate — put the
     age reasoning in whatItIs/ifRemoved.
   - reclaim: xcrun simctl runtime delete <id>, kind "delete", requiresSudo false. reversible:
     possible true, how "re-download via Xcode ▸ Settings ▸ Platforms", costBytes ~ size.
   - If xcrun/simctl isn't present, return [] (no-op), don't error.

2. detectors/simulatorDyldCaches.ts — id "simulator-dyld-caches", cost "fast".
   - Target ~/Library/Developer/CoreSimulator/Caches/dyld specifically. level: safe (pure
     build artifact, rebuilt on next simulator launch). reclaim: rm -rf of that dir, kind
     "delete". reversible: possible true, how "rebuilt automatically on next Simulator launch",
     costBytes 0 (cost is a slower first boot, say so in ifRemoved).

3. detectors/xcodeDerivedData.ts — id "xcode-derived-data", cost "fast".
   - Target ~/Library/Developer/Xcode/DerivedData. level: safe (regenerable build cache).
     reclaim rm -rf, kind "delete". reversible: rebuilt on next Xcode build.
   - (Archives is a DIFFERENT, review-level finding — that lands in RS8, not here. Keep this
     detector to DerivedData only.)

4. detectors/index.ts — the barrel that imports each detector file so it self-registers. Import
   the barrel from wherever the CLI/engine bootstraps (the engine itself must NOT import
   detectors — the consumer does, keeping the engine detector-agnostic). Document this seam.

5. cli/render.ts + cli/src/index.ts:
   - Run engine.scan({ onFinding }) and render findings grouped by level (blocked, review,
     caution, safe), sorted by size within a group. For each: title, size (human-readable),
     level, last-used + its source (de-emphasize/annotate atime), whatItIs, ifRemoved,
     dependents, reversible (how + cost), and the reclaim command clearly marked "run this
     yourself — reclaimd will not". Stream lines as findings arrive.
   - A one-line total-reclaimable summary at the end (sum of non-review, non-blocked sizes,
     clearly labeled an estimate).

Run it on this machine and paste me the real output. Confirm the runtime last-used dates look
like tool metadata (not mtime), and sanity-check sizes against the audit corpus in the plan's
intro.

Run npm run typecheck and npm test, then run npm run reclaimd. Flip RS4 to ✅ in
docs/BUILD_PLAN.md in the same change, then show me the diff and a single block with BOTH the
git commit ("rs-step-4: first runnable CLI — simulator-runtime/dyld + DerivedData detectors")
AND git push. Do not commit.
```

---

### RS5 — First runnable (Raycast) · Sonnet 5 *(Opus for the Raycast-in-workspace spike if it fights back)*

**Verify:** `npm run typecheck` clean; the Raycast extension imports `@reclaimd/core`, runs
`engine.scan()`, and renders findings in a `List` with a `Detail` per finding; the reclaim
command is offered **only** as `Action.CopyToClipboard` (grep the extension: no exec, no
`child_process`, no execute action). **You** run `ray develop` and confirm the list + detail
render and the copy action works. Claude states plainly it cannot see the render.
**Commit:** `rs-step-5: raycast list + detail over core engine (copy-only actions)`

```text
Wire the Raycast extension to the core engine so there's a working Raycast window. Same three
detectors as RS4 — this step is about the surface, not new detectors.

1. packages/raycast/src/list.tsx:
   - Import { scan } from @reclaimd/core and the detector barrel so detectors register. Run
     scan() and render a <List>, streaming results in as onFinding fires (useState + push;
     show isLoading while scanning). Group or tag by level with a colored accessory
     (blocked/review/caution/safe).
   - Each row opens a <Detail> (or a List item detail) showing the full annotation: whatItIs,
     ifRemoved, dependents, reversible (how + cost), last-used + source, size.
   - Reclaim command: <Action.CopyToClipboard> ONLY, titled e.g. "Copy reclaim command (run it
     yourself)". For blocked findings, render NO command action at all — show the
     blockedReason instead. THERE IS NO EXECUTE ACTION. Do not import child_process or exec
     anywhere in packages/raycast.

2. If `ray develop`/`ray build` struggles to resolve the @reclaimd/core workspace dependency
   (bundling a TS workspace package into a Raycast extension is the known risk here — see
   Landmines), STOP and tell me what the tooling wants before hacking around it. Options to
   weigh with me: consuming core's compiled output vs. its TS source, a tsconfig path, or a
   build step. Escalate to Opus if it turns into a real spike. Do NOT solve it by copying core
   code into the extension — that would fork the contract.

3. Add a Raycast preference toggle "Include slow detectors" (maps to scan's includeSlow) even
   though the slow detectors don't exist until RS11 — the plumbing is cheap now and RS11 just
   registers into it.

I cannot see the Raycast UI render — after typecheck passes and I've confirmed the code has no
execute path, run `ray develop` yourself and tell me whether the list, the detail, and the copy
action look right. Tell me exactly what to click.

Run npm run typecheck. Flip RS5 to ✅ in docs/BUILD_PLAN.md in the same change, then show me the
diff and a single block with BOTH the git commit
("rs-step-5: raycast list + detail over core engine (copy-only actions)") AND git push.
Do not commit.
```

---

### RS6 — Simulator devices (reset) + SIP reporter · Sonnet 5

**Verify:** `npm run typecheck` + `npm test` green; on this Mac, bloated simulator devices
surface with `reclaim.kind: "reset"` and command `xcrun simctl erase <UUID>` (NOT delete), and
17 MB-class devices are filtered out by a size threshold; `/Library/Updates` (and any other
big SIP-restricted tree) surfaces as `level: "blocked"` with a `blockedReason` and **no**
reclaim command.
**Commit:** `rs-step-6: simulator-devices (reset-over-delete) + sip-reporter (blocked, no command)`

```text
Two detectors that prove two core concepts end-to-end: reset-over-delete, and blocked-no-command.

1. detectors/simulatorDevices.ts — id "simulator-devices", cost "moderate".
   - `xcrun simctl list devices --json` to enumerate devices; size each device's data dir
     under ~/Library/Developer/CoreSimulator/Devices/<UUID> via ctx.dirSize.
   - Only surface devices above a threshold (e.g. > 200 MB) — in the audit every non-bloated
     device was ~17 MB; don't spam the list with them.
   - level: caution. reclaim: xcrun simctl erase <UUID>, kind "RESET" — this keeps the device
     and drops the bloat. Say so explicitly in whatItIs/ifRemoved: "resets the device to
     factory state; the device itself stays, installed apps + data are cleared". reversible:
     possible true, how "reinstall apps / re-run your app onto it", costBytes unknown.
   - lastUsedAt via ctx.lastUsed on the device dir (source mtime — label it, it's not tool
     metadata).

2. detectors/sipReporter.ts — id "sip-reporter", cost "fast".
   - Probe a known set of big system trees (start with /Library/Updates; add others only if
     they're genuinely large + SIP-restricted on this machine). For each that exists AND
     ctx.isSipRestricted is true: emit level "blocked", blockedReason explaining SIP prevents
     removal even with sudo, NO reclaim field at all. whatItIs explains what it is; ifRemoved
     notes it can't be removed by the user without disabling SIP (which we do NOT recommend or
     script).
   - This detector's entire job is to stop the user (and any future contributor) wasting a
     round-trip trying to rm a restricted path. If a target isn't restricted after all, don't
     emit a blocked finding for it — hand it to whatever normal detector owns it, or skip.

Verify on this machine: erase (not delete) for sim devices; /Library/Updates blocked with no
command. Paste the relevant CLI output.

Run npm run typecheck and npm test, then npm run reclaimd. Flip RS6 to ✅ in docs/BUILD_PLAN.md
in the same change, then show me the diff and a single block with BOTH the git commit
("rs-step-6: simulator-devices (reset-over-delete) + sip-reporter (blocked, no command)") AND
git push. Do not commit.
```

---

### RS7 — Package-manager caches · Sonnet 5

**Verify:** `npm run typecheck` + `npm test` green; on this Mac, the installed package managers'
caches surface as `level: "caution"` with the tool's own prune command (app-managed) where one
exists — at minimum `~/.npm/_cacache` reproduces the audit's 5.2 GB npm finding; uninstalled
managers no-op (no error, no bogus finding).
**Commit:** `rs-step-7: package-manager cache detector (npm/yarn/pnpm/brew/pip/cargo/go)`

```text
detectors/packageManagerCaches.ts — id "package-manager-caches", cost "moderate". One detector,
several managers; emit one Finding per manager that's actually present with a cache.

For each manager, resolve its cache dir via the tool where possible (never hardcode blindly),
size it, and prefer the tool's own prune command:
- npm:   ~/.npm/_cacache — reclaim "npm cache clean --force" (kind "app-managed").
- yarn:  `yarn cache dir` — reclaim "yarn cache clean" (app-managed).
- pnpm:  `pnpm store path` — reclaim "pnpm store prune" (app-managed).
- Homebrew: `brew --cache` (~/Library/Caches/Homebrew) — reclaim "brew cleanup -s"
  (app-managed).
- pip:   ~/Library/Caches/pip — reclaim "pip cache purge" (app-managed).
- cargo: ~/.cargo/registry/cache + ~/.cargo/registry/src — no first-class prune; reclaim a
  targeted rm of those subdirs (kind "delete"), reversible via re-fetch on next build.
- go:    `go env GOMODCACHE` and `go env GOCACHE` — reclaim "go clean -modcache" /
  "go clean -cache" (app-managed).

All caution: regenerable, but the next install/build needs network (this is exactly the npm
_cacache reasoning from the audit — put it in ifRemoved). lastUsedSource mtime (label it).
A manager that isn't installed, or whose cache dir doesn't exist, contributes nothing — return
early per manager; never throw because `go` or `brew` is missing.

Add any newly-needed read-only invocation (yarn/pnpm/pip cache-dir queries) to the exec
allowlist in fs/exec.ts — read-only queries only, and only the ones you actually call.

Verify on this machine; paste the findings (npm should reproduce the audit's ~5.2 GB).

Run npm run typecheck and npm test, then npm run reclaimd. Flip RS7 to ✅ in docs/BUILD_PLAN.md
in the same change, then show me the diff and a single block with BOTH the git commit
("rs-step-7: package-manager cache detector (npm/yarn/pnpm/brew/pip/cargo/go)") AND git push.
Do not commit.
```

---

### RS8 — Xcode DeviceSupport + Archives split + Sparkle caches · Sonnet 5

**Verify:** `npm run typecheck` + `npm test` green; `~/Library/Developer/Xcode/iOS DeviceSupport`
surfaces per-version as `safe`; Xcode `Archives` surfaces as **`review`** (real shippable
artifacts, not a cache) distinct from RS4's DerivedData; Sparkle updater caches surface as
`safe` **and the detector demonstrably targets only the `…/Sparkle` subtree** — a sibling data
store in the same container (e.g. a messaging app's `Message` dir) is never included in the
finding's paths.
**Commit:** `rs-step-8: xcode DeviceSupport + Archives(review) + sparkle caches (subtree-scoped)`

```text
Complete the Xcode cluster and add the Sparkle detector — the clearest cache-vs-data-in-one-app
case in the whole set.

1. detectors/xcodeDeviceSupport.ts — id "xcode-device-support", cost "fast".
   - ~/Library/Developer/Xcode/iOS DeviceSupport (and watchOS/tvOS DeviceSupport if present),
     one Finding per OS-version subdir. level: safe — regenerated when you next attach a device
     on that OS version. reclaim rm -rf per-version dir, kind "delete". lastUsed via mtime
     (label the source). reversible: regenerated on next device attach.

2. Xcode Archives — add to detectors/xcodeDerivedData.ts (or a small xcodeArchives.ts; your
   call, note which): ~/Library/Developer/Xcode/Archives. level: REVIEW — these are real
   .xcarchive builds you may need to re-export/re-sign; they are NOT a regenerable cache. Do
   NOT mark safe. No aggressive reclaim; inform. This is the deliberate opposite verdict to
   DerivedData sitting one directory over — call that out in whatItIs.

3. detectors/sparkleCaches.ts — id "sparkle-caches", cost "moderate".
   - Find Sparkle updater caches: per-app ~/Library/Caches/<bundleid>/…/Sparkle and
     ~/Library/Group Containers/<group>/…/Caches/…/Sparkle style subtrees. The finding's paths
     MUST be the Sparkle subtree ONLY — never the enclosing container. level: safe (updater
     leftovers, re-downloaded on next update check).
   - CRITICAL, from the audit: the same app can hold a disposable Sparkle cache AND an
     irreplaceable data store (WhatsApp: Sparkle 886 MB safe, but Group Containers/…/Message
     10 GB is chat media — opposite verdict). This detector must never widen to the container.
     Add a code comment and, if practical, a unit test asserting a Sparkle finding's paths do
     not include a sibling non-cache dir.

Verify on this machine. Paste findings. Confirm DeviceSupport=safe, Archives=review,
Sparkle=safe-and-narrow.

Run npm run typecheck and npm test, then npm run reclaimd. Flip RS8 to ✅ in docs/BUILD_PLAN.md
in the same change, then show me the diff and a single block with BOTH the git commit
("rs-step-8: xcode DeviceSupport + Archives(review) + sparkle caches (subtree-scoped)") AND
git push. Do not commit.
```

---

### RS9 — VM disk images + staging leftovers · Sonnet 5

**Verify:** `npm run typecheck` + `npm test` green; VM disk images (whichever of
Docker/Parallels/UTM/Claude exist on this Mac) surface as `review` with an
investigation-grade annotation — the Claude-VM case explicitly notes sessions/memories live on
the host in `~/.claude/`, not inside the image; `~/Library/Arduino15/staging` surfaces only
when a sibling `packages/` exists (the dependency it must not break), with that sibling listed
in `dependents`.
**Commit:** `rs-step-9: vm-images (review) + staging-leftovers (sibling-dependency aware)`

```text
Two detectors where the ANNOTATION is the whole value — deterministic to find, but the reasoning
is what makes them useful.

1. detectors/vmImages.ts — id "vm-images", cost "moderate".
   - Probe known VM image locations that exist on this machine:
     - Docker: ~/Library/Containers/com.docker.docker/Data/vms/*/data (Docker.raw) — note it's
       a sparse file (apparent >> on-disk; report both). reclaim is app-managed
       ("docker system prune" / Docker Desktop ▸ reset), NOT a raw rm of the image.
     - Parallels: ~/Parallels/*.pvm — review, real VM state.
     - UTM: ~/Library/Containers/com.utmapp.UTM/Data/Documents/*.utm — review.
     - Claude VM: the rootfs.img (~10 GB in the audit). whatItIs MUST record the investigated
       fact that Claude sessions/memories persist on the HOST in ~/.claude/, not in the image,
       so deleting/recreating the image doesn't lose them — but this took real checking, so
       phrase it as "verified: … " and set dependents accordingly. Default level review unless
       you can prove otherwise for a given image.
   - Almost everything here is review — a VM disk can hold real, unbacked-up state. Inform;
     only offer an app-managed reclaim (never a raw image rm) where the owning tool has one.

2. detectors/stagingLeftovers.ts — id "staging-leftovers", cost "moderate".
   - Generalize the Arduino case: an installer "staging" dir whose payload is already extracted
     into a sibling dir that must be kept. Concretely target ~/Library/Arduino15/staging and
     verify a sibling ~/Library/Arduino15/packages exists.
   - If the extracted sibling exists: level caution (safe-ish, but confirm), reclaim rm -rf of
     staging ONLY, kind "delete", and list the sibling packages/ dir in dependents as
     "must be kept". reversible: re-downloaded by the installer if needed. If the sibling does
     NOT exist, DON'T assume — drop to review or skip, because you can't prove the archives are
     redundant.

Verify on this machine (whichever VMs/Arduino exist). Paste findings; confirm the Claude-VM
annotation and the Arduino dependents.

Run npm run typecheck and npm test, then npm run reclaimd. Flip RS9 to ✅ in docs/BUILD_PLAN.md
in the same change, then show me the diff and a single block with BOTH the git commit
("rs-step-9: vm-images (review) + staging-leftovers (sibling-dependency aware)") AND git push.
Do not commit.
```

---

### RS10 — User-data detectors (review-only) · Sonnet 5

**Verify:** `npm run typecheck` + `npm test` green; `~/.Trash` and `~/Downloads` surface as
`review` (never `safe`), and iOS device backups under
`~/Library/Application Support/MobileSync/Backup` surface as `review` with a backup date; a test
asserts none of these can be emitted as `safe` (the never-safe guard bites). If a backup can't
be sized without Full Disk Access, the finding says "size unknown — needs Full Disk Access"
rather than 0.
**Commit:** `rs-step-10: user-data detectors — trash/downloads + mobilesync backups (review-only)`

```text
Detectors over genuine user data. The discipline here is that NONE of these is ever "safe" —
the tool informs, the human decides.

1. detectors/trashAndDownloads.ts — id "trash-and-downloads", cost "moderate".
   - ~/.Trash: level review. It's stuff the user chose to trash but hasn't emptied; reclaim is
     the "Empty Trash" equivalent but gated as review (show the command, clearly a user
     decision). Never safe.
   - ~/Downloads: level review — user-chosen files, some kept deliberately. Size it, maybe note
     the largest items, but do NOT classify or auto-recommend deletion. Never safe.

2. detectors/mobileSyncBackups.ts — id "mobilesync-backups", cost "moderate".
   - ~/Library/Application Support/MobileSync/Backup/<UDID> — iOS/iPadOS device backups, real
     user data. level review. Pull the backup date from the backup's Info.plist ("Last Backup
     Date") as tool-ish metadata where readable (label the source), else mtime. dependents:
     "your iPhone/iPad backup — deleting loses the ability to restore this device state".
   - Full Disk Access: MobileSync often needs it. On EPERM while sizing, surface the finding
     with size unknown + an explicit "needs Full Disk Access" note (per fs/size.ts's degraded
     path). Never report 0, never crash.

3. Confirm the never-safe guard (fs/paths.ts) covers all three roots; add a test that emitting
   a "safe" finding for any of them is downgraded to review.

Verify on this machine; paste findings. Confirm all review, and the FDA degradation if a backup
can't be read.

Run npm run typecheck and npm test, then npm run reclaimd. Flip RS10 to ✅ in docs/BUILD_PLAN.md
in the same change, then show me the diff and a single block with BOTH the git commit
("rs-step-10: user-data detectors — trash/downloads + mobilesync backups (review-only)") AND
git push. Do not commit.
```

---

### RS11 — Slow / opt-in detectors: Time Machine snapshots + orphaned node_modules · Sonnet 5

**Verify:** `npm run typecheck` + `npm test` green; both detectors are `cost: "slow"` and
`enabledByDefault: false`, so a default `npm run reclaimd` does NOT run them and
`npm run reclaimd -- --slow` (and the Raycast "Include slow detectors" toggle) does; APFS local
snapshots surface with an honest reclaimable-vs-apparent caveat; the `node_modules` scan is a
**bounded** walk (root allowlist + depth cap), never a full-disk walk, and flags only stale
project dirs as `caution` (never `safe`).
**Commit:** `rs-step-11: slow opt-in detectors — time-machine snapshots + orphaned node_modules`

```text
The two highest-cost, lowest-determinism detectors. Both are cost "slow", enabledByDefault
false — they only run when the user opts in (CLI --slow flag → scan includeSlow:true; the
Raycast toggle added in RS5).

1. Wire the CLI --slow flag to scan({ includeSlow: true }). Confirm the Raycast toggle already
   maps to it (RS5). Default runs must NOT execute slow detectors — assert this.

2. detectors/timeMachineSnapshots.ts — id "time-machine-snapshots", cost "slow".
   - `tmutil listlocalsnapshots /` (read-only; add to exec allowlist) to enumerate APFS local
     snapshots. level: caution — macOS auto-thins them under space pressure, so they're not
     "leaked" space, and deletion is via tmutil, not rm.
   - HONESTY REQUIREMENT (APFS): snapshots share blocks with the live filesystem; the space you
     actually reclaim is NOT the naive sum and tmutil doesn't hand you a clean per-snapshot
     reclaimable number. Set sizeBytes conservatively / mark it an estimate, use
     apparentSizeBytes if you compute one, and say in whatItIs that reclaimable space depends on
     block sharing. reclaim: tmutil deletelocalsnapshots <date> or thinlocalsnapshots, kind
     "delete"/"reset", DISPLAY ONLY (never run). requiresSudo as tmutil requires.

3. detectors/orphanedNodeModules.ts — id "orphaned-node-modules", cost "slow".
   - A BOUNDED walk (this is the one detector allowed to walk, per Ground Rule 10): a small
     allowlist of project roots (default ~/Storage, ~/Projects, ~/Developer, ~/code, ~/src —
     only those that exist; make it a preference later), a max depth (e.g. 4), and it must NOT
     recurse INTO a node_modules once found (no nested node_modules), and skip a dir with no
     sibling package.json.
   - "Stale" heuristic: parent project's most recent git activity / mtime older than a
     threshold (e.g. 6 months). Because "stale" is a judgment, level is caution, NEVER safe —
     you might still want the project. reclaim rm -rf the node_modules, kind "delete".
     reversible: possible true, how "npm/yarn/pnpm install", costBytes unknown (needs network).
   - Keep it responsive: it's slow by nature, but respect ctx.signal and stream findings as
     each stale project is found.

Verify on this machine: default run skips both; --slow runs them; snapshots carry the APFS
caveat; node_modules walk stays inside the roots. Paste both a default and a --slow run.

Run npm run typecheck and npm test, then npm run reclaimd (default) and npm run reclaimd --
--slow. Flip RS11 to ✅ in docs/BUILD_PLAN.md in the same change, then show me the diff and a
single block with BOTH the git commit
("rs-step-11: slow opt-in detectors — time-machine snapshots + orphaned node_modules") AND
git push. Do not commit.
```

---

### RS12 — Scan-result cache + `--json` (diff foundation) · Sonnet 5

**Verify:** `npm run typecheck` + `npm test` green; a completed scan is written to
`~/Library/Caches/reclaimd/last-scan.json` (dogfooding: reclaimd's own cache is a regenerable
cache); `npm run reclaimd -- --json` prints a valid `ScanResult` JSON to stdout; Raycast reads
the cached result on open for an instant first paint, then refreshes in the background. Diff
mode is **not** built — a test asserts the store's shape is stable enough for a future diff to
read.
**Commit:** `rs-step-12: persist scan results + --json output (foundation for diff mode)`

```text
Close out v1: make the UI responsive with a cached result, add machine-readable output, and lay
the store the deferred diff mode will read — WITHOUT building diff.

1. core/src/store.ts (or similar): write a completed ScanResult to
   ~/Library/Caches/reclaimd/last-scan.json (serialize Dates as ISO strings; version the file
   with a schema tag so a future diff can detect shape changes). Read it back typed. This is
   pure IO of our own data — no reclaim semantics, no exec.

2. CLI: add `--json` → print the ScanResult as JSON to stdout (no decorative rendering) and
   still write the cache. Keep the default human render as-is.

3. Raycast: on command open, load last-scan.json first for an instant list, THEN run scan() in
   the background and replace when it finishes (show a subtle "refreshing" state). If no cache
   exists yet, scan directly as today.

4. Do NOT build diff/history — just prove (in a test) that two ScanResults can be loaded and
   compared by finding id, so the Later diff mode has a stable contract to build on. Add a
   short "Diff mode (deferred)" note to CLAUDE.md's What's Not Built Yet pointing at this store.

Verify on this machine: run once (cache written), run --json (valid JSON), open Raycast (instant
paint from cache, then refresh).

Run npm run typecheck and npm test, then npm run reclaimd and npm run reclaimd -- --json. Flip
RS12 to ✅ in docs/BUILD_PLAN.md in the same change, then show me the diff and a single block
with BOTH the git commit ("rs-step-12: persist scan results + --json output (foundation for
diff mode)") AND git push. Do not commit.
```

---

## Deferred follow-ups (cross-step, live tracker)

> Aggregates flagged-but-not-fixed items that survive individual steps — stuff a step noticed
> but was out of its own scope. Kept here so it doesn't get buried in per-step notes. Cross off
> (strike through) when genuinely handled; don't silently delete lines.

- **Full Disk Access onboarding UX is not built.** v1 degrades to "size unknown — needs Full
  Disk Access" (RS10) but never guides the user to grant it. A Raycast/CLI affordance that
  detects the missing permission and links to System Settings is a real follow-up. Detector-
  agnostic; not blocking v1.
- **The Raycast-in-workspace bundling decision (RS5) — resolved for dev, may need revisiting for distribution.**
  RS5 finding: bundling `@reclaimd/core` into the extension **worked with zero friction** —
  `ray build -e dist` compiles and bundles the workspace dependency via its compiled `dist/`
  output (core's package.json `exports` `.` + `./detectors`). The ONLY monorepo friction was
  unrelated to core: the `ray` CLI hardcodes a check for `./node_modules/.bin/tsc` in the
  extension dir, but npm workspaces hoist that bin to the repo root. Solved by
  `scripts/prepare-raycast.mjs` (idempotent extension-local `tsc` symlink) wired into root
  scripts `raycast:prepare` / `raycast:dev` / `raycast:build`. **Run the extension via
  `npm run raycast:dev`, not a bare `ray develop`.** Second gotcha (also RS5): `ray develop`
  defaults to the `com.raycast.macos.development` build (a separate "Raycast (Development)"
  app most people don't have); the standard **release** Raycast is `com.raycast.macos`, so the
  scripts pass **`-t release`** to target it. The Raycast app must be running. `ray build -e
  dist` (a production-target build) also passes, so store/self-hosted distribution is likely
  fine, but confirm when the packaging step lands.
- *(Steps will add to this list as they surface out-of-scope friction — record it here, don't
  bury it in a step's notes.)*

---

## Landmines

Populated from the real hand-audit friction, not speculation:

- **SIP restricted blocks even `sudo rm`.** `/Library/Updates` (2.2 GB in the audit) is
  SIP-restricted — `sudo rm` fails. The manual session wasted a whole round-trip offering a
  command for it. That's exactly why `sipReporter` (RS6) reports these as `blocked` with **no
  command**, and why Ground Rule 6 requires a SIP probe before any command under a system root.
- **`atime` is unreliable on macOS.** It's frequently disabled (`noatime`-ish behavior) or
  updated lazily, so an atime-derived "last used" can be wildly wrong. Always prefer
  tool-reported metadata (simctl's real Last Used At), fall back to mtime, and **label the
  source** — never present an atime date with the confidence of tool metadata (Ground Rule 7).
- **Full Disk Access is required for some paths** (device backups under MobileSync, and others).
  Without it, sizing throws `EPERM`. The extension/CLI must **degrade gracefully** — surface
  the finding with "size unknown — needs Full Disk Access", never report `0` (which reads as
  "empty, safe to ignore") and never crash the whole scan.
- **`du` is slow over large trees.** A naive scan blocks the UI. Mitigations built into v1:
  detectors are targeted probes (not a full-disk walk), findings stream via `onFinding` for
  progressive rendering, slow detectors are `cost: "slow"` + opt-in, and RS12 caches the last
  result for an instant first paint.
- **APFS sparse files and clones make apparent size ≠ reclaimable size.** VM images
  (Docker.raw, rootfs.img) are sparse — their apparent size dwarfs on-disk blocks. APFS local
  snapshots *share* blocks with the live filesystem, so deleting a snapshot frees far less than
  its nominal size. `SizeResult` carries apparent vs on-disk; findings report the honest
  reclaimable estimate and say when it's an estimate (RS9, RS11). Never overpromise reclaimed
  space.
- **Cache and data live inside the same app container.** WhatsApp: the `…/Sparkle` updater
  cache is 886 MB and safe; the same app's `Group Containers/…/Message` is 10 GB of
  irreplaceable chat media — opposite verdicts, one app. Detectors target the specific cache
  subtree and never widen to the container (RS8, Ground Rule 8). If a subtree can't be proven a
  cache, it's `review`, not `safe`.
- **`simctl` JSON shape shifts across Xcode versions.** Parse defensively (RS4/RS6) — a missing
  field degrades a finding, it doesn't throw.
- **Tools may simply be absent.** `brew`, `go`, `yarn`, `pnpm`, Parallels, UTM won't exist on
  every machine. Every detector no-ops gracefully (returns `[]`) when its tool/path is missing —
  never an error, never an empty-but-present finding.
- **`tmutil` doesn't hand you clean per-snapshot reclaimable bytes.** Estimate conservatively
  and say so; don't invent a precise number (RS11).

---

## Later — designed, NOT built in v1

Everything below is intentionally out of v1 scope. Recorded so the boundary is explicit and so
nobody half-builds one of these while working through RS1–RS12. The architecture is chosen to
make each one additive, not a rewrite.

| Item | Design | What it needs |
|---|---|---|
| **Diff / history mode** ("what grew since last scan") | Reads the versioned `last-scan.json` store from RS12; keep N recent scans, join by `Finding.id`, render deltas (new / grown / gone). | A history store (extend RS12's single-file cache to a rolling set) + a delta renderer in each surface. No engine or detector change. |
| **Scheduled background scans** | A launchd agent (or Raycast background-refresh command) runs `engine.scan()` on a cadence and updates the store; the UI shows the last scan instantly. | launchd plist / Raycast `interval` command. Still no execution of reclaim commands — it only *scans*. |
| **Custom user-defined detectors** | The `Detector` interface + registry already support third-party detectors. Load a user detector directory at runtime and register whatever it exports. | A safe loader (user detectors also get the read-only `DetectorContext` — they inherit the no-execute guarantee) + a config for the directory. |
| **Export to Markdown** | `Finding[]` → a Markdown report grouped by level, commands in fenced blocks marked "run yourself". | A formatter alongside `cli/render.ts`; RS12's `--json` is the machine-readable precursor. |
| **Menu-bar app** | A third consumer of `packages/core`, same `engine.scan()`. Core is UI-agnostic precisely so this needs no core changes. | A menu-bar shell (SwiftUI or an Electron/Tauri-style host) that renders findings and offers Copy — never Execute. |
| **Full Disk Access onboarding** | Detect the missing permission, explain why a finding is "size unknown", deep-link to System Settings. | Permission detection + a guided affordance in CLI/Raycast. |

**When Later work starts:** diff mode is the cheapest and highest-value first add (RS12 already
lays its store), then scheduled scans, then the remaining surfaces in whatever order the
developer wants. None of them may introduce an execute path — the Cardinal Rule outlives v1.
