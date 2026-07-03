# Agent Workflow And Verification

Use this file for task workflow, review depth, skip conditions, verification, and completion gates.

## Review Depth — Tier By Risk

Pick review depth by the task's blast radius, not by file count. Higher tiers ADD steps; they do not replace lower ones.

| Tier                           | Triggers                                                                                                                                                                                                                 | Required review                                                                                                                                                                           |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **T3 — Full debate**           | Auth/RLS, money (payments/refunds/invoices/journal), multi-row writes, new RPC with `SECURITY DEFINER`, schema migration touching constraints, production data backfill, anything that can silently corrupt or leak data | **All 4 perspectives below, written out** before implementation. Spawn 4 parallel subagents (one per role) via the Agent tool, OR write a debate transcript in the PR / worklog yourself. |
| **T2 — Self-review checklist** | New feature, non-trivial bug fix, refactor that changes a public boundary, UI surface change beyond a single component, route-resolution change                                                                          | **All 4 perspectives below, condensed**. Write 2–4 lines per role in the task notes or PR body before coding. Subagents optional.                                                         |
| **T1 — Skip**                  | Typo fixes under 3 changed lines, doc-only changes, dependency version bumps with no API change                                                                                                                          | Verify the diff and state why the debate was skipped in the commit/PR body.                                                                                                               |

When in doubt between tiers, pick the higher one.

A deterministic floor backs this up: `scripts/check-review-tier.mjs` (`corepack pnpm lint:review-tier`) independently classifies the diff by blast radius — migration paths, a `SECURITY DEFINER` token, auth/RLS files, money paths — and flags a declared tier below that floor. CI runs it fail-closed (`REVIEW_TIER_STRICT=1`); locally it is advisory unless the flag is set. It matches the declared tier as a bare `T1`/`T2`/`T3` token in any commit body between the merge-base and HEAD (plus a `REVIEW_TIER` env variable as an additional source — the highest tier found anywhere wins), so keep the tier token in the `Verification:` note that `engineering.md` requires. It never replaces judgment: it only catches under-classification (a money/RLS/migration diff self-assigned too low), the dominant tiering failure.

## Skill Plan Gate

T3 tasks MUST state a short skill plan before coding — it feeds the
four-perspective debate. T2 tasks SHOULD; T1 may skip with the skip reason
stated. The template, routing, and where the plan lives are owned by
`docs/agent/rules/skills.md` → Skill Plan Gate.

## The Four Perspectives

These are the four questions every change must answer. T3 spawns one agent per role; T2 answers them inline.

| Role           | Owns                                                         | Lead questions                                                                       |
| -------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| **PM**         | Scope, priority, acceptance criteria                         | Should we build this? What is the MVP? What does "done" mean?                        |
| **BA**         | Requirements, business rules, edge cases, data flow          | What are the rules? What can go wrong? What state transitions exist?                 |
| **Senior Dev** | Architecture, implementation plan, tech debt, affected files | How should we build this? Does it fit the existing system? What is the blast radius? |
| **QA/QC**      | Test strategy, regression risk, quality gates                | How do we know it works? What could break? Which existing flows must still pass?     |

The four lenses default to PM / BA / Senior Dev / QA, but their *identities* may flex to the blast radius that triggered T3: a migration/RLS change wants a Security and a Data lens, a deploy/ops change an Ops lens, a money change a Data and a Product lens. Keep the count and the fan-in synthesis; pick the lenses that match why T3 fired.

### Cross-Boundary Coherence (QA/QC)

The QA lens compares *both sides of a boundary the diff touches*, not each side in isolation — an existence check passes while the contract silently diverges. The recurring contract-mismatch classes in this repo:

| Boundary                                   | What drifts                                                                                       | Read both sides                                                  |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------- |
| Server Action / route return shape ↔ caller hook | A generic cast or `any` compiles clean while the runtime shape diverges                     | The action's returned object ↔ the consumer's expected type     |
| DB column ↔ API field ↔ TS type            | snake_case → camelCase → type drift (same class as the `packages/print-render` SQL↔TS↔EMV mirror) | Migration/column ↔ select/RPC mapping ↔ generated type          |
| Route file path ↔ navigation               | `href`/`router.push`/`redirect` to a path that stripped `(group)` segments                       | Page file path ↔ every link/redirect target                     |
| Status-transition map ↔ mutation sites     | A new status that no `.update({ status })` call site emits or accepts                             | The allowed-transition map ↔ every status write                 |

Scope this to the boundaries the diff actually touches, and to the classes the deterministic `scripts/check-*.mjs` guards do not yet cover. When a class recurs, promote it to a guard per the learning loop below.

## Running A T3 Full Debate

Write subagent prompts and the debate transcript in English; deliver the owner-facing synthesis in Vietnamese (see `AGENTS.md` → Communication Protocol).

Use the Agent tool (or Codex CLI / Claude SDK subagents) to spawn the four roles **in parallel** with the task description plus this context:

- Current task description
- Relevant files from the codebase
- `AGENTS.md` constraints
- Skill plan from `docs/agent/rules/skills.md`
- `tasks/regressions.md` rules (relevant rows only — full file is large)
- Any related docs from `docs/`

Each agent returns a focused report:

- **PM:** scope decision, acceptance criteria, priority
- **BA:** business rules, edge cases, data-flow analysis, requirement gaps
- **Senior Dev:** architecture fit, implementation approach, risk assessment, affected files
- **QA/QC:** test plan, regression risks, quality gates, verification steps

After all four return, synthesize:

1. List agreements.
2. List conflicts and resolve each explicitly.
3. Produce a unified task contract (scope + business rules + implementation plan + test plan).

For T3 changes, attach the synthesized contract to the PR description or to a worklog note under `docs/worklog/`.

## Running A T2 Self-Review

Before coding, write a short block in the task notes / PR body — the skill-plan
line (template owned by `docs/agent/rules/skills.md` → Skill Plan Gate) above the
four perspectives:

```
Skill plan: <per skills.md → Skill Plan Gate>
PM:   scope = …, acceptance = …, priority = …
BA:   rules = …, edge cases = …, data flow = …
Dev:  approach = …, files = …, risk = …
QA:   tests = …, regressions to recheck = …
```

This is for the next reader (future you, the owner, a reviewer) — make it stand on its own.

## Verification

Before marking implementation work complete:

1. **Hard gate.** `corepack pnpm typecheck && corepack pnpm lint && corepack pnpm build` MUST pass. For release-grade slices, prefer `corepack pnpm verify` (adds deps audit, baseline hygiene, and tests). This and green CI (step 6) are the only machine-enforced gates here.
2. **CodeGraph freshness.** Re-index per `AGENTS.md` → CodeGraph after the final source/SQL/generated-type changes and before closeout (for database changes, after `corepack pnpm db:types`). N/A for doc-only changes.
3. **Cross-boundary coherence.** When the change spans more than one module/shell or crosses an API ↔ hook ↔ nav boundary (e.g. the finance/hr/inventory/menu/orders shells), cross-compare response shape ↔ consumer type and route ↔ link at each pair's completion rather than batching the whole slice — generic casts and `any` compile clean. N/A for T1 or single-component changes.
4. **Self-attestation (advisory, not CI-gated).** Contract-vs-diff is irreducibly semantic; a reviewer subagent judging "are the business rules implemented?" is itself a non-deterministic call, not a gate. The four-perspective debate is a thinking tool — its only enforcement is that the artifact below is present for owner review:
   - T3: paste a 3-line attestation into the PR / worklog contract — test-plan items covered vs deferred-with-reason; each BA rule mapped to the implementing file/line; known out-of-scope gaps.
   - T2: a 1-line attestation that the diff matches the self-review block.
   - T1: state why the debate was skipped in the commit body.
5. **Tier floor.** Run `corepack pnpm lint:review-tier`; semantics owned by Review Depth above.
6. CI (`.github/workflows/ci.yml`) runs typecheck, lint, test, and build on every PR and on push to `main` — a push to a working branch alone triggers nothing. Landed work is complete only with green CI.
7. Learning-loop hygiene (T2/T3) — one pass before closing, so the loop stays bounded:
   - A recurring failure surfaced → add a `tasks/regressions.md` rule. If its detection is a deterministic code pattern, add a guard row to `scripts/check-regression-guards.mjs` instead of relying on prose — an enforced rule costs zero context.
   - The task's worklog has landed → promote any durable rule to its canonical doc (`docs/agent/rules/`, a module/ref doc) and delete the worklog; git history is the archive.
   - State the learning (or "none") in the commit/PR body.
