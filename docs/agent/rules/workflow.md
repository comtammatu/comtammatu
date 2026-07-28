# Agent Workflow And Verification

Use this file for review depth, debate artifacts, verification, and completion.

## Review Depth — Tier By Risk

| Tier                 | Triggers                                                                                                                                                                                                     | Required review                                                                                                                                                  |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **T3 — Full debate** | Auth/RLS, money, multi-row correctness, every schema migration, production authorization/backfill, `SECURITY DEFINER`, critical constraints, guard/review-governance changes, or silent corruption/leak risk | Write all four lenses before implementation and synthesize agreements, conflicts, scope, implementation, and tests. Independent reviewers are optional evidence. |
| **T2 — Self-review** | New feature, non-trivial fix, public-boundary refactor, route-resolution change, multi-surface UI change, notification contract, or ordinary `docs/agent/rules/*` policy changes                             | Write a condensed four-lens review before coding.                                                                                                                |
| **T1 — Skip**        | Editorial/typo-only change under three lines, or lockfile-only dependency refresh with no API or policy effect                                                                                               | Verify the diff and state the skip reason.                                                                                                                       |

T1 never applies when a change alters policy, authority, behavior, production
rights, security, or source-of-truth routing. When uncertain, choose higher.

`scripts/check-review-tier.mjs` computes the floor from the GitHub event payload:
PR base/head SHAs for `pull_request`, and exact before/after SHAs for `push`.
CI runs it with `REVIEW_TIER_STRICT=1`; missing or malformed event data, refs,
diffs, logs, or under-floor declarations fail closed. It scans that event's
commit range plus `REVIEW_TIER`; the highest bare `T1`/`T2`/`T3` token wins.
Local runs use the `origin/main`/`main` merge-base plus tracked and untracked
working-tree changes, remain advisory, and must not be presented as task
attribution. T1 automation accepts only modified lockfile-only diffs or modified
non-governance Markdown diffs totaling at most two added/deleted lines; new,
deleted, renamed, binary, mixed, or larger doc changes floor at T2.

## Skill Plan

T3 tasks must state the short skill plan from `skills.md` before coding. T2
should state it when routing is not obvious. T1 states only the skip reason.

## Four Lenses

| Lens           | Questions                                                                        |
| -------------- | -------------------------------------------------------------------------------- |
| **PM**         | Should this exist? What is the smallest accepted outcome?                        |
| **BA**         | What rules, states, boundaries, and edge cases must hold?                        |
| **Senior Dev** | Where is the root boundary? What is the smallest coherent diff and blast radius? |
| **QA/QC**      | What proves it works, what regresses, and what recovery path remains?            |

Lenses may become Security, Data, or Ops when that better matches the T3 risk,
but keep four perspectives and one synthesis. Agent-to-agent text is English;
owner-facing synthesis is Vietnamese.

When using reviewers, give each a bounded question, relevant files, applicable
rules, and requested evidence. A second runtime is optional evidence, never
authority. Handoff and arbitration live in `orchestration.md`.

## Cross-Boundary Coherence

For every boundary touched, compare both sides:

- Server Action/route result ↔ caller/hook type.
- DB column/RPC field ↔ mapping ↔ generated type.
- Route file ↔ every link, redirect, and navigation target.
- Status transition contract ↔ every mutation site.

Scope this to the changed boundary. When the same deterministic failure recurs,
add or extend one guard instead of adding more prose.

## Current Task Lifecycle

`tasks/todo.md` contains active outcomes only. Each H2 has exactly one `State`,
`Kind`, `Tier`, `Lane`, `Exit`, and `Evidence`, followed by at least one unchecked
action. Allowed states are `triage`, `ready`, `doing`, `verify`, and `blocked`:

- `triage`: reproduce and bound a finding before implementation.
- `ready`: the outcome, risk tier, and proof are actionable.
- `doing`: one agent or delivery lane actively owns the outcome.
- `verify`: implementation exists, but the stated evidence is incomplete.
- `blocked`: an external dependency prevents the Exit; add one `Blocker` line
  naming the dependency and its recheck trigger.

There is no persisted `done`, `closed`, or `superseded` state and no checked
checkbox. Delete the H2 after its Exit passes; git is the shipped-work history.
Split unrelated outcomes instead of nesting a mini-roadmap. Route stable
contracts to owning docs, deterministic failures to a guard/test plus
`tasks/regressions.md` when durable, and incident learning to `tasks/lessons.md`.
Review plans, attestations, snapshots, and debate transcripts stay in the task
or PR conversation, not this tracker. `scripts/check-doc-staleness.mjs` enforces
the mechanical shape.

## Verification

Before marking implementation complete:

1. Run `corepack pnpm typecheck && corepack pnpm lint && corepack pnpm build`.
   For release-grade or broad slices, run `corepack pnpm verify`.
2. Run targeted tests for the changed behavior and inspect the task-scoped diff.
   Treat a background-shell completion notification as "finished", not
   "succeeded" — read the command output file for `Failed:` / non-zero exits
   before trusting a green notification.
3. Re-index CodeGraph after source, SQL, or generated-type changes.
4. Give the checker a machine-readable declaration: set `REVIEW_TIER=Tn` for a
   local run, and include a bare `T1`/`T2`/`T3` token in a commit message inside
   the CI event range before pushing. Run `corepack pnpm lint:review-tier` and
   mirror the declared tier plus actual verification in the PR/task summary;
   those summaries are evidence surfaces but are not checker inputs.
5. For T3, attest which acceptance/test items passed, which are intentionally
   out of scope, and where each material rule is implemented.
6. CI must be green before calling landed work complete. Keep `written`,
   `review-clean`, `merged`, `applied to production`, and `deployed` distinct.
7. Promote only durable outcomes: recurring deterministic failure → guard/test;
   incident lesson → targeted regression; stable contract → owning doc; transient
   debate/plan → PR or task history.
