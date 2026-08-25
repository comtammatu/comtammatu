# Agent Workflow And Verification

Use this file for risk review, task lifecycle, verification, and learning
closeout. Review depth is evidence-driven; commit tokens and document wording
are not proof.

## Review Depth

| Tier | Use when | Minimum review |
| --- | --- | --- |
| T3 | Auth/RLS, money, multi-row correctness, migration, Production mutation, `SECURITY DEFINER`, governance guard, or silent corruption/leak risk | Answer the four lenses before implementation; synthesize scope, conflicts, proof, and rollback. |
| T2 | Feature, non-trivial fix, public-boundary refactor, route resolution, or multi-surface UI | Condensed self-review of the same lenses. |
| T1 | Editorial-only change with no policy, authority, behavior, or source-routing effect | Inspect the diff and state why deeper review is unnecessary. |

The lenses are:

- Product: should this exist, and what is the smallest accepted outcome?
- Business/data: which states, invariants, permissions, and edge cases must hold?
- Engineering: where is the root boundary and smallest coherent diff?
- QA/ops: what proves the outcome, what can regress, and how is it recovered?

Use independent reviewers only when they add evidence. Fan-out and arbitration
live in `orchestration.md`.

## Boundary Review

Compare both sides of every changed seam: caller/result type, DB field/mapping/
generated type, route/link/redirect, and state contract/mutation site. Scope the
review to the changed boundary. When the same deterministic failure recurs,
prefer one test or guard at the shared boundary over more prose.

## Automation And AI Autonomy Cap

Operational actions can affect money, tax, labor, inventory, or customer
records; model confidence is not evidence that an action is correct,
authorized, or reversible.

1. Business facts, thresholds, routing, deduplication, and state transitions
   are computed by deterministic application and database code.
2. An LLM may summarize or explain computed facts. It does not calculate the
   authoritative number and does not receive unrestricted database or RPC
   access.
3. Money, tax, and labor automation is capped at informing an authorized
   operator. It never auto-acts. Confidence scores cannot promote autonomy.
4. Any bounded automatic action must be allowlisted, idempotent, reversible,
   permission-checked, and reviewed as T3.
5. Agent actions reuse an existing authorized RPC boundary. A new generic
   agent action API is not permitted.
6. Notifications use `docs/spec/toast-notification-system.md`; channels without
   an owned runtime and delivery contract do not belong in the roadmap.

Product workflows remain usable without an LLM. A new automation proposal must
identify its deterministic source, authority, rollback, deduplication, and
verification before implementation.

## Current Task Lifecycle

`tasks/todo.md` holds active outcomes only. Each H2 requires exactly one
`State`, `Exit`, and `Evidence`, plus at least one unchecked action.
`Kind`, `Tier`, and `Lane` are optional routing hints.

Allowed states:

- `triage`: reproduce and bound the finding.
- `ready`: outcome and proof are actionable.
- `doing`: implementation is active.
- `verify`: implementation exists but named proof is incomplete.
- `blocked`: an external dependency prevents the Exit; include one `Blocker`.

Delete the H2 after Exit passes; Git is shipped-work history. Do not persist
checked actions, review transcripts, snapshots, or a `done` state.

## Verification

1. Run targeted checks for the changed behavior and inspect the scoped diff.
2. Before implementation completion, or before any owner-requested commit or
   push of code outside CI `paths-ignore`, run `corepack pnpm verify` — the same
   gate as the CI `gates` job. Docs-only diffs may skip verify locally; the
   tracked `pre-push` hook applies the same skip on push.
3. Read each command's output. A background completion notice or cached Turbo
   replay is not fresh proof. After deletions or cross-package source reads in
   tests, run `corepack pnpm exec turbo run test --force` when verify is green
   but confidence is low.
4. Keep written, review-clean, merged, applied to Production, and deployed as
   separate claims. CI must be green before calling landed work complete.

## Learning Closeout

At T2/T3 closeout, decide whether the work produced a reusable fact:

- No durable signal: create no artifact.
- Stable contract: update its owning spec/ref/module/rule.
- Deterministic recurring failure: encode it in one test/guard and retain only
  incident context that the check cannot express.
- Prose-only insight: stage it in `tasks/lessons.md`.

Promotion and deletion are one diff: remove the staging lesson, regression, task
note, or plan once the final owner carries the fact. Never create another memory
store, standing review program, or mandatory closeout token.
