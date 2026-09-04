# Agent Workflow And Verification

Use this file for risk review, task lifecycle, verification, and learning
closeout. Review depth is evidence-driven; commit tokens and document wording
are not proof. Do not copy ADR or runtime-module contracts here — cite the
owner (`docs/modules/auth.md`, `docs/agent/rules/database.md`,
`docs/modules/finance.md`, `docs/spec/architecture.md`).

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

Identity provenance: `AGENTS.md`. Exercise a non-default ID and prove that
missing or ambiguous scope fails closed.

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
6. Notifications: `docs/spec/toast-notification-system.md`.

Product workflows remain usable without an LLM. A new automation proposal must
identify its deterministic source, authority, rollback, deduplication, and
verification before implementation.

## Reproduction-First Contract

For any bug fix, regression repair, or behavior adjustment:

1. **Reproduce before editing**: Capture verifiable proof of the failure first
   (failing test, reproduction SQL, or runtime/UI evidence).
2. **Never guess**: If a report is vague, triage and build a minimal
   reproduction before modifying implementation files.
3. **Prove the resolution**: The same harness must go RED → GREEN.

## Current Task Lifecycle

`tasks/todo.md` holds active outcomes only. Each H2 requires exactly one
`State`, `Exit`, and `Evidence`, plus at least one unchecked action.
`Kind`, `Tier`, and `Lane` are optional routing hints.
Keep the tracker at or below 840 lines. Keep each outcome at or below 15
nonblank lines, or 21 when it includes the required `UI Advisor Gate`. Promote
stable detail to its owning contract or deterministic guard instead of copying
tables, snapshots, or implementation inventories into the tracker.

Allowed states: `triage`, `ready`, `doing`, `verify`, `blocked` (include one
`Blocker`). Delete the H2 after Exit passes; Git is shipped-work history. Do
not persist checked actions, review transcripts, snapshots, or a `done` state.

## Four-Tier Verification Harness

Never declare a task complete based on code generation alone. Commands live in
`AGENTS.md` (`corepack pnpm verify` matches CI `gates`). This file owns what
each tier means:

1. **Deterministic static gates** — typecheck, lint (including UI contract,
   copy, boundaries), and the other `verify` static legs.
2. **Automated tests** — targeted subsystem tests, then the full suite.
   Operational tooling is part of the root suite (`test:operational-tools`).
3. **Runtime and visual inspection** (UI/workflow) — Loading / Empty /
   Populated / Error; overlay lifecycle; touch ≥44px; theme; browser/network
   proof when the surface changed.
4. **Domain invariant rubric** — prove the owning contract still holds:
   money (`docs/modules/finance.md`), Auth/RLS (`docs/modules/auth.md`,
   `database.md`), identity (`AGENTS.md`, `lint:runtime-identities`), copy
   (`language.md`, `lint:copy`).

Read command outputs. Turbo cache replay is not fresh proof after deletions or
cross-package test reads. Keep written, review-clean, merged, applied to
Production, and deployed as separate claims.

## Learning Closeout

At T2/T3 closeout, decide whether the work produced a reusable fact (ADR 0021):

- No durable signal: create no artifact.
- Stable contract: update its owning spec/ref/module/rule.
- Deterministic recurring failure: encode it in one test/guard.
- Prose-only insight: stage it in `tasks/lessons.md`.

Promotion and deletion are one diff. Never create another memory store,
standing review program, or mandatory closeout token.
