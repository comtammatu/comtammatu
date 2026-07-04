# T3 Debate — UI Trinity Program: Guidance · Enforcement · Usability (2026-07-03)

Reconciled-through 4be2bd3c

## Trigger & Tier

Owner directive (2026-07-03, two messages): (1) stop whack-a-mole UI fixing —
"rules don't scan, eyes don't see, so a lot slips through"; the UI workflow is
hard to use on BOTH the Office plane and the Branch Hub; wants brainstorm +
debate + a comprehensive plan, not more per-component patches. (2) Model the
project's design-system usage on Apple HIG: rules must tell any agent/dev
WHAT to use WHEN, so nobody is "mù đường" (lost), adding random components or
making chaotic edits.

Tier: **T3** by judgment (program-level IA/shell direction across every route
family; extends multiple D0xx; owner explicitly requested a full debate). The
deterministic floor does not fire on planning docs; "when in doubt, pick the
higher tier" applies.

Skill plan: repo rules = engineering + ui + workflow + team; external skills =
none (apple-hig skill is a catalogue stub; HIG used as structural benchmark
only — `docs/spec/design-system.md` remains the sole UI authority); runtime
tools = codegraph + read-only repo scan + prod SELECT-only (backlog triage);
skipped = frontend-design/taste skills (ui.md forbids inventing outside the
locked Custom Theme).

## Debate mechanics

Five parallel `t3-lens` subagents (PM, UX/IA [BA flex], Senior Dev/Platform,
QA/Enforcement, Design-Guidance/HIG [added mid-debate on the owner's second
message]). Full reports in session transcripts; condensed verdicts below.
Evidence base: same-day 10-lane backlog audit (all `tasks/todo.md` items,
remediation roadmap ~95 findings, plan docs, prod drift) — key inputs: QA-1
hub density + all 4 gap-audit tile quick-wins already shipped (`4758d566`);
i18n guard burned 341→~20 with a no-grow gate (the proven ratchet template);
CSP dev hardcode `apps/web/next.config.ts:11-14` blocks the e2e stack on
custom ports.

### PM lens (condensed)

Split into Program E (enforcement infra, converges then holds) and Program U
(usability slices, judged by owner). Key finding: the usability DIRECTION is
already locked — D063 W3/W4 (office desktop), D059 §4 extraction queue
(branch hub), D062 PWA — so U is execution + a missing measurable-acceptance
layer, not a new direction debate. MVP-E = CSP fix + revive existing visual
baseline + ratchet lints + role×route sweep. Sequencing: land the in-flight
17-file WIP before any baseline generation; do not start D059 slice 2
(count-assignments) until it lands (file collision). Exit metric: 4 weeks
post-landing, owner-found UI bugs a gate should have caught ≈ 0; every escape
becomes a guard row.

### UX/IA lens (condensed)

Office root cause: **module-siloed IA vs cross-module event-driven jobs** —
every module hop pays a landing-page toll; tier2 invisible until its tab is
active (`app-shell.tsx:214-219`); refund job ≈ 6–8 taps with a human-memory
handoff; GRN→invoice-match has no chaining; HR approvals buried below the
attendance table in the wrong tab (`hr-client.tsx:224-235`); icon-rail
collapse (D063 W1) removes tier2 entirely in dense mode; office mobile: dead
bottom-nav band on flat modules, `mobileTopBar` slot has zero consumers.
Hub root cause: **a namespace, not a shift** — 23 tiles for a branch manager,
stock group = 12-tile pile of five near-synonym logistics nouns (D056 already
recorded a real P1 from this confusion); no shift-phase sequencing; the day
KPI panel renders below all tiles; zero-pending approval queues leave zero
doors (`page.tsx:157-163`). Ranked proposals (all inside locked decisions):
1. Hub "Today spine" (state header → operational feed → shift-phase tile
   sections reusing D052 vocabulary) — M.
2. Persistent badged "Duyệt" doors (dead-ends 4→0) — S.
3. Workflow-chaining CTAs (GRN confirm → invoice match; stocktake → next) — S/flow.
4. Reaffirm GRN-create extraction first (D059 §4 order unchanged).
5. Curated office mobile bottom-nav + wire `mobileTopBar`, suppress empty bar — S–M.
6. Unbury HR approvals (badged oversight entry; canonical stays `/br/*`) — S.
7. ⌘K command palette (already approved D032-B(4)); also compensates icon-rail tier2 loss — M.
8. Cross-module deep links on money objects (finance row → `/orders?…`
   display-filter only) — S.

### Senior Dev lens (condensed)

The enforcement engine already exists — `scripts/check-ui-contract.mjs` is a
mature 5-family ratchet engine with a `--write` self-ratchet; ALL new static
rules belong there (count-per-file shape preferred over the i18n line-keyed
shape). Corrections to the brief: C1 bordered-panel and C3 STATUS/stat-card
are ALREADY enforced; only C2 (bare `Input` frozen-import gate, ~27-file
baseline) and the motion budget are new — both S. C1b (card-in-card) needs
AST, FP-prone → defer. Visual lane: extend the existing opt-in Playwright
`visual` project + `e2e/guides/_lib/capture.ts`; per-PR pixel gate REJECTED
on the 2-core runner (documented multi-spec wedge, todo.md:142); shape =
local pre-land `qa:visual` script + nightly report-only workflow + (only
PR-gate candidate) a deterministic DOM-assert archetype sweep. W3 width tier
is already mechanized (`surface.tsx:46-52` `xwide`); adoption is per-page,
NOT an archetype-gate field. W4: extract order-detail content from Sheet
chrome first (WS-3 split), then render inline at `xl:`. Hub feed needs NO
nav-config schema change (batch via one `fetchBranchQueueCounts`-style call);
optional `badgeKey` extension is +S. Blast radius: 17-file WIP overlaps 4+
gate baselines — no `--write` runs until it lands. Reject Chromatic/Percy/
Storybook/new deps.

### QA/Enforcement lens (condensed)

Ten drift classes; C1/C2 (token/copy) caught today; uncaught: C4 route
reachability (orphan routes / conditional-only doors), C5 layout-fit/density
(QA-1 class), C6 runtime render health (partially — branch-shell spec exists,
local-only), C7 visual (stale ungated baseline), C8 interaction usability,
C10 taste. Detector matrix: C4 → static vitest reachability test over
nav-config + href/redirect literals with a shrink-only `INTENTIONALLY_UNLINKED`
allowlist (would have caught 3 orphan routes + waste-approvals); C5 → runtime
col-count/width DOM asserts (static width-per-archetype too coarse); C6 →
generalize `branch-shell-routes.spec.ts` into role×viewport route-health
sweep (seeded QA accounts exist); C7 → nightly snapshots only, never per-PR;
C8/C10 → scheduled agent judge loop with rubric (the loop that actually found
QA-1) producing QA-n rows in tasks/todo.md — report-only by design. Honest
retro-test: D063-class "unusable" is only plausibly caught by the judge loop
(T-e), certainly by owner eye (T-f) — no static gate can assert "usable".
Zero-noise rule: a gate that cries wolf gets deleted; everything new lives in
check-ui-contract.mjs, the vitest suite, or one sweep spec — no new
standalone scripts.

### Design-Guidance / HIG lens (condensed)

Foundations layer is HIG-grade (token/typography/rhythm/motion contracts with
role tables); page-archetype layer ≈ HIG patterns and genuinely good. Real
gaps: (1) the interaction-pattern layer exists only as 4 unnamed "Decision"
stubs in `docs/modules/ui.md`; missing jobs: filtering/search construction,
review-and-approve, bulk actions, undo/recovery, row-action placement;
destructive-confirm guidance split across 3 locations. (2) Component registry
covers ~24 of 56 `packages/ui` components, has NO when-to-use / when-NOT /
alternatives / exemplar-route columns — the in-flight `context-menu.tsx` has
no registry row and no gate demands one (live rot proof). (3) design-system.md
is 903 lines with no TOC; normative rules interleaved with gate bookkeeping.
Agent-routing test: "add a filter" and "new approval surface" BREAK (invention
is the path of least resistance); "per-row destructive action" partial;
"add a KPI" resolves perfectly — job entry → contract → component → gate is
the template to replicate. Migration slices S1–S5 (index, registry upgrade,
named Interaction Patterns section, component-registry anti-rot gate,
cross-links). Language: extend each file in its grandfathered language.

## Synthesis

### Agreements

1. Three pillars, one program: **G (Guidance/prevention, HIG-style)** —
   agents stop inventing because the docs decide for them; **E (Enforcement/
   detection)** — drift that still happens is machine- or loop-caught;
   **U (Usability execution)** — the locked D059/D062/D063 backlog plus the
   UX lens's additive slices. Whack-a-mole = G-failure first, E-failure
   second; U is where the owner feels it.
2. Usability direction is NOT re-debated — D058–D063 stand; all UX proposals
   are additive inside locked principles.
3. Extend existing machinery only: check-ui-contract.mjs, Playwright visual
   project, i18n ratchet pattern, ui.md as the how-to layer. No new deps, no
   new standalone scripts, no SaaS.
4. Per-PR pixel/visual gate rejected on current CI (2-core wedge evidence);
   cadence = per-PR deterministic static → pre-land local sweep → nightly
   report-only → scheduled agent judge loop (the owner-eye replacement).
5. CSP derive-from-env fix is the universal prerequisite for every runtime
   detector (and was already blocking the POS/KDS browser smoke).
6. The 17-file WIP lands before any baseline generation or `--write` run;
   D059 slice 2 (count-assignments) blocked on it.
7. C1/C3 already enforced (Dev correction adopted); new static work = C2 +
   motion budget only; C1b deferred.
8. C4 reachability static test adopted (QA shape) — it retroactively catches
   the orphan-route + zero-pending-door classes the gap audit found by hand.

### Conflicts → resolutions

1. **PM "execute locked backlog only" vs UX 8 new proposals** — resolved: not
   a direction change; proposals enter Program U as slices. Only vocabulary
   (Đầu ca/Cuối ca), feed-signal ranking, bottom-nav slots, palette scope,
   and the finance→orders deep link need owner ratification (decision points
   below).
2. **QA static width-per-archetype gate vs Dev "gate stays mapping-presence-
   only"** — resolved in Dev's favor: width adoption is per-page via
   `surface.tsx` `xwide` + a G-layer decision tree; QA's density check moves
   to the runtime sweep as DOM asserts (col-count ≥3 at 1280 on tile boards,
   no horizontal overflow), where it is precise instead of coarse.
3. **Route-health sweep in the PR gate?** — resolved: nightly first,
   promotion to PR gate is a separate later decision contingent on
   root-causing the CI multi-spec hang / a bigger runner (owner decision
   point 1).
4. **Where interaction patterns live** — resolved per HIG lens: `docs/modules/
   ui.md` (already the declared how-to layer); design-system.md keeps
   contracts + gets a pointer; the Overlay duplicate gets merged with a
   marked mirror or pointer.
5. **Judge-loop cadence** — resolved: nightly deterministic sweep + agent
   judge loop scheduled (weekly to start, monthly once stable); findings
   append QA-n rows to tasks/todo.md; report-only, never a gate.

### Unified contract

**Scope.** One program, three pillars, PR-ordered slices. Out of scope /
rejected: native rewrite (D062), new design system or token overhaul, second
shell/SidebarProvider (D045/D063), single responsive shell (D058 §1),
archetype-taxonomy revision, per-PR pixel gate on current runner, new UI/
visual deps, PWA-3/4 before PWA-1, inventory-model work (D060).

**Business rules.** One door per job holds; deep links are display filters,
never second write doors. Clock-in gating, `branch_kind × role` tile
resolution, per-row ACL gating, and PWA offline degradation must survive every
U slice. Guidance extends files in their grandfathered language. Every new
`packages/ui` component ships its registry row in the same PR (gate-backed).
Every ban names its replacement; every pattern names a live exemplar route.
Ratchet baselines only shrink; `--write` runs are serialized (shared tree).

**Implementation plan (PR-ordered; effort; owner-gated marked).**

- PR-0 *(in flight, other lane)*: land 17-file WIP; fresh full gate.
- PR-1 (S): E0 CSP derive-from-env in `next.config.ts` (dev branch only,
  prod string byte-identical).
- PR-2 (S): E1 ratchets — `input` frozen-import gate (C2) + motion
  perFileCountBudget; record C1/C3 as already-enforced in the tracker.
- PR-3 (S): G-S1 TOC + decision index in design-system.md (no contract change).
- PR-4 (M): G-S2 registry upgrade — when-to-use/when-NOT/alternatives +
  exemplar-route columns; backfill all 56 components (context-menu.tsx first).
- PR-5 (M): G-S3 named `## Interaction Patterns` section in ui.md (7 jobs:
  entering data · modality · destructive+confirm · feedback · filtering/search
  · empty/loading/error/blocked · review-and-approve); merge the Overlay
  duplicate; G-S5 cross-links from archetype recipes.
- PR-6 (S): G-S4 anti-rot gate in check-ui-contract.mjs — component↔registry
  coverage + exemplar-route existence.
- PR-7 (M): E2 reachability vitest test (nav-config + href/redirect literals;
  shrink-only INTENTIONALLY_UNLINKED allowlist).
- PR-8 (M): E3 visual lane — `warehouse_manager`/`branch_manager` storageState
  setup projects, per-archetype representative route list, `qa:visual` local
  pre-land script + stamped manifest, nightly report-only workflow
  (workers:1, static routes, masks on volatile cells).
- PR-9 (M): E4 route-health DOM sweep (role×viewport: console/500/overflow/
  tap-target/col-count asserts) — nightly; PR-gate candidacy deferred.
- PR-10 (S): E5 agent judge loop — rubric (space utilization, tap depth to
  top-3 jobs per role, dead ends, empty states) over nightly screenshots →
  QA-n rows in tasks/todo.md. Advisory forever.
- U-lane (parallel with PR-3+, page families disjoint from E/G files):
  - U1 (S×n): D063 W3 `xwide` adoption per family (orders → finance → hr →
    inventory lists).
  - U2 (M): orders detail-content extraction (WS-3 split) → W4 master-detail
    inline at `xl:`.
  - U3 (M+S+S): Hub Today-spine re-composition + persistent badged "Duyệt"
    doors + chaining CTAs (GRN→invoice-match, stocktake→next action).
  - U4 (M, locked order): D059 §4 extraction — GRN create first; slice 2+
    after PR-0.
  - U5 (S–M): office mobile — curated bottom-nav slots per module, suppress
    empty bar, wire `mobileTopBar`; unbury HR approvals (badged entry).
  - U6 (M, after U1–U3): ⌘K palette (D032-B(4)).
  - U7 (M, after first U4 slice): PWA-1 installable Hub.

**Test/verification plan.** Every U slice: 3-viewport screenshot set in PR
body (from `qa:visual` manifest) + declared tap budget met + full gate + the
always-pass set (payment-cash e2e, lint:ui-contract, archetype gate, i18n
no-grow, route-matrix). Hub/board slices add col-count + overflow DOM asserts.
Extraction slices add: EMBED-WRAPPER signature gate, reachability graph entry,
role×viewport render, module-coverage + branch-scope static tests. E slices:
each new gate lands with a seeded-violation fixture proving it fails, then
the fix. G slices: routing test re-run — the 4 build moments (filter, approval
surface, row destructive action, KPI) must all resolve doc-only, no source
archaeology.

**Program exit criteria.** (a) 4 weeks after E-pillar lands: owner-reported
UI bugs a gate should have caught ≈ 0; each escape → guard row same week.
(b) Branch-role bridge-tile count monotonically → 0 (D059). (c) The 4
routing-test moments resolve from docs alone. (d) Nightly sweep red rate
< 10% flake; otherwise the offending check is demoted/deleted (zero-noise).

## Owner decision points (defaults proposed)

1. CI runner upgrade for PR-blocking visual checks? **Default: no for now —
   nightly report-only; revisit after E-pillar stabilizes.**
2. Does "hard to use" reduce to the locked backlog + the 8 UX slices, or are
   there unlisted painful jobs? **Default: assumed complete; owner names any
   missing job → it gets a slice.**
3. Hub section vocabulary "Đầu ca / Cuối ca" (D052 reuse) + feed-signal
   ranking. **Default: ratify; ranking = approvals → unfinished slips → low
   stock → expiry → day-close.**
4. Curated office mobile bottom-nav slots per module. **Default: proposed per
   slice PR (e.g. Kho: Hôm nay · GRN · PO · Đối soát), owner tweaks there.**
5. Palette scope. **Default: nav targets + order-code lookup.**
6. finance→orders deep link as display filter (refund initiation stays in
   /orders). **Default: yes.**
7. Guidance tier language + decision-tree authority. **Default: ui.md stays
   Vietnamese (grandfather); trees are advisory-but-review-anchored —
   deviating PRs must state why, gates stay deterministic-only.**
8. Per-slice sign-off. **Default: Playwright evidence suffices; 5-minute owner
   phone walkthrough only for slices touching daily floor jobs (GRN create,
   Hub spine).**

## Stage-6 cross-runtime handoff (prepared)

Mode: `codex` **consult** on this contract (direction sanity + missed-risk
pass), then `codex` **review** per implementation PR on its diff. Context to
hand over: this worklog; docs/plan/ui-trinity-program-2026-07-03.md;
docs/plan/decisions.md D058–D063; docs/spec/design-system.md;
docs/spec/page-archetypes.md; docs/agent/rules/ui.md; scripts/check-ui-contract.mjs;
tasks/todo.md UI sections. Ask (consult): "Identify (a) any slice that
contradicts a locked D0xx, (b) any detector with a cry-wolf risk underrated
here, (c) any cheaper mechanism for the same drift class." Pass/fail (review,
per PR): gate-green + no new enforcement surface outside the three named
homes + baselines shrink-only. Fallback note: if the second runtime is
unavailable at landing time, the orchestrator writes the second opinion
inline and states the limitation (team.md → Fallback).

## Contract amendment 1 — owner feedback (2026-07-03, post-debate)

Owner named the sharpest Office pain, answering decision point 2: (1)
breadcrumb + header duplication — same label rendered 3–4× before content;
(2) per-screen layout composed with no declared goal ("fill the space"),
staff-flow optimization unusable. Code verification: shell header renders
Breadcrumb (`app-shell.tsx:310-348`) AND a path-derived title + shell-level
description (`app-shell.tsx:142-148`), while pages render their own
`AppPageHeader` h1 + description (`surface.tsx:170`); sidebar tier2 + tabs
repeat the same label; `suppressTitleHeading` opt-out flag proves the
duplication is known and being patched per-page instead of at the contract.

Adopted slices (U-lane, Office priority #1):
- **U0a shell chrome diet (S):** "one label, one place" contract — shell
  header keeps breadcrumb only (depth ≥2; mobile collapses to parent link);
  shell-derived title/description removed; the page's `AppPageHeader` is the
  single h1 owner; delete `suppressTitleHeading` once callers are gone.
  Sequenced AFTER PR-0 (`app-shell.tsx` is in the uncommitted WIP).
- **U0b job-first composition (M/family):** merged with U1 width adoption —
  one pass per family applies width `xwide` + chrome de-dup + block reorder
  by declared primary job + deletion of filler blocks; PR body states the
  job per page (makes the existing D058 §12/page-archetypes requirement
  operative).
- **G-pillar additions:** rules "one label, one place" and "every block
  serves the declared job — no filler"; E5 judge-loop rubric adds
  chrome-to-content ratio + block-purpose checks.

## Contract amendment 2 — owner feedback (2026-07-03, perceived performance)

Owner: no UX animation/effect feedback — every click feels laggy; many pages
still full-reload. Evidence (verified): `loading.tsx` on only 15/145 pages
(App Router nav freezes the old page until the server render lands — the
dominant "lag" source); 0 `useFormStatus` / 0 `useOptimistic` and only 74
files with `useTransition` (mutating buttons without pending visuals); press
feedback `active:scale` exists only on touch/lg/icon button sizes
(`packages/ui/src/components/button.tsx:28-37`) — office default/sm sizes are
dead on press; 4 genuine full-reload/assign sites:
`menu/import-export-menu.tsx:160`, `finance/invoice-list.tsx:469`,
`team-board-client.tsx:224`, `use-order-sync.ts:111` (legit allowlist:
pwa-toolbar SW update, /offline, dev-SW reset). The Motion Contract (§ G)
already permits functional feedback — this is missing execution, not a
contract change (except a small § G amendment for default/sm press feedback).

Adopted: U-lane slice U0c (sub-slices U0c-1..6: kill full-reloads →
archetype skeletons via loading.tsx → pending-state contract with
form-helper + useFormStatus wiring → default/sm press feedback primitive →
optimistic UI on floor hot paths (with realtime bus reconcile) → View
Transitions experiment behind a flag). E-pillar detectors added: ratchet
banning `window.location.reload|assign` outside allowlist, loading.tsx
route-family coverage check, judge-loop rubric "does every mutating control
show pending feedback". G-pillar: skeleton recipe per archetype + the
Feedback interaction pattern gains the pending-state contract.

## Stage-6 result — fallback second opinion (self-written)

Codex CLI unavailable at review time (`codex exec` fails ENOENT on the
darwin-arm64 vendor binary — install broken after a node upgrade; reinstall
is a user-machine action). Per team.md → Fallback, the orchestrator wrote the
adversarial pass itself; weaker than an independent runtime — weigh
accordingly. Findings, adopted as contract amendments:

1. **(b) cry-wolf risk** — E4's tap-target/col-count asserts across the full
   route matrix would fight intentional per-surface variance. AMENDED: E4
   starts on the per-archetype representative route list (same list as E3),
   expands only after 2 clean weeks.
2. **(d) sequencing** — PR numbering implies G (PR-3..6) precedes E2/E3
   (PR-7..9); no real dependency exists. AMENDED: G and E slices interleave/
   parallel freely; only PR-0 → PR-1/PR-2 ordering is hard (WIP-land before
   baselines; CSP before runtime detectors).
3. **(c) cheaper mechanism check** — considered reusing `lint:route-matrix`
   generator data for E2 reachability; rejected: it maps role×route ACL, not
   inbound links. New href/redirect scan stands.
4. **(a) D0xx contradiction scan** — none found: U3 respects D050 §6/D059;
   U5 stays inside the D019 shell (no shell-registry change); persistent
   "Duyệt" doors fix (not hide) the `employee_checkout_approvals` key reuse
   the UX lens flagged. G-S2 registry bloat risk accepted — one-line rows for
   pure primitives are valid.

A real `codex review` pass remains REQUIRED per implementation PR once the
CLI is reinstalled (`npm i -g @openai/codex`).

## Attestation

- Test-plan items covered vs deferred: per-slice plans stated above; C1b AST
  rule and PR-gate promotion of the route-health sweep explicitly deferred
  with reasons (FP risk; CI runner).
- BA/UX rules mapped: each U slice cites its D0xx anchor and its evidence
  (file:line) in the lens reports above.
- Known out-of-scope gaps: REFACTOR-FIRST parity items beyond D059 §4 order;
  "usable" as a property remains judge-loop/owner-eye territory — stated
  honestly in the QA retro-test.
