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

## The Four Perspectives

These are the four questions every change must answer. T3 spawns one agent per role; T2 answers them inline.

| Role           | Owns                                                         | Lead questions                                                                       |
| -------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| **PM**         | Scope, priority, acceptance criteria                         | Should we build this? What is the MVP? What does "done" mean?                        |
| **BA**         | Requirements, business rules, edge cases, data flow          | What are the rules? What can go wrong? What state transitions exist?                 |
| **Senior Dev** | Architecture, implementation plan, tech debt, affected files | How should we build this? Does it fit the existing system? What is the blast radius? |
| **QA/QC**      | Test strategy, regression risk, quality gates                | How do we know it works? What could break? Which existing flows must still pass?     |

## Running A T3 Full Debate

Use the Agent tool (or Codex CLI / Claude SDK subagents) to spawn the four roles **in parallel** with the task description plus this context:

- Current task description
- Relevant files from the codebase
- `AGENTS.md` constraints
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

Before coding, write a short block in the task notes / PR body:

```
PM:   scope = …, acceptance = …, priority = …
BA:   rules = …, edge cases = …, data flow = …
Dev:  approach = …, files = …, risk = …
QA:   tests = …, regressions to recheck = …
```

This is for the next reader (future you, the owner, a reviewer) — make it stand on its own.

## Verification

Before marking implementation work complete:

1. `pnpm typecheck && pnpm lint && pnpm build` MUST pass.
2. For T3, re-check the QA/QC and BA reports against the diff: did the test plan get covered? Are the business rules implemented?
3. For T2, re-read your own self-review block and confirm the diff matches it.
4. For T1, state why the debate was skipped in the commit body.

## Skip Conditions (T1 only)

The ONLY time to skip both T3 and T2:

- Typo fixes under 3 changed lines
- Documentation-only changes
- Dependency version bumps (with no API change in the bumped package)

For any skipped task, still verify the changed files and state the skip reason in the commit body.

## Historical Note

Earlier versions of this file referenced an external `oh-my-Codex` agent role suffix (e.g. `oh-my-Codex:planner`). That tool was never wired into this repo's runtime — the roles above are the canonical names. Existing references in `tasks/regressions.md`, ADRs, and worklog entries describe past debates and remain valid as history.
