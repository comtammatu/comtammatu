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

`scripts/check-review-tier.mjs` computes a PR-wide floor from the merge-base to
HEAD. CI runs it with `REVIEW_TIER_STRICT=1`; missing or under-floor T2/T3
declarations fail. It scans the PR commit range plus `REVIEW_TIER`; the highest
bare `T1`/`T2`/`T3` token wins. Local dirty-tree output can include unrelated
work and must not be presented as task attribution.

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

## Verification

Before marking implementation complete:

1. Run `corepack pnpm typecheck && corepack pnpm lint && corepack pnpm build`.
   For release-grade or broad slices, run `corepack pnpm verify`.
2. Run targeted tests for the changed behavior and inspect the task-scoped diff.
3. Re-index CodeGraph after source, SQL, or generated-type changes.
4. Run `corepack pnpm lint:review-tier` and record the declared tier with the
   actual verification in the commit/PR/task summary.
5. For T3, attest which acceptance/test items passed, which are intentionally
   out of scope, and where each material rule is implemented.
6. CI must be green before calling landed work complete. Keep `written`,
   `review-clean`, `merged`, `applied to production`, and `deployed` distinct.
7. Promote only durable outcomes: recurring deterministic failure → guard/test;
   incident lesson → targeted regression; stable contract → owning doc; transient
   debate/plan → PR or task history.
