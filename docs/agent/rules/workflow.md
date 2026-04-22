# Agent Workflow And Verification

Use this file for task workflow, debate protocol, skip conditions, verification, and completion gates.

## Team Workflow — 4-Agent Debate Protocol

Every feature, bug fix, and refactor MUST go through all 4 agents before implementation. No exceptions except the skip conditions below.

## Team Roles

| Role | Agent Type | Responsibility |
| --- | --- | --- |
| PM | `oh-my-Codex:planner` | Scope, priority, acceptance criteria, timeline. Asks "should we build this?" and "what's the MVP?" |
| BA | `oh-my-Codex:analyst` | Requirements analysis, business logic validation, edge cases, data flow. Asks "what are the rules?" and "what can go wrong?" |
| Senior Dev | `oh-my-Codex:architect` | Architecture, code design, implementation plan, tech debt assessment. Asks "how should we build this?" and "does it fit the system?" |
| QA/QC | `oh-my-Codex:critic` | Test strategy, acceptance verification, regression check, quality gates. Asks "how do we know it works?" and "what could break?" |

## Phase 1: Debate

Spawn all 4 agents in parallel with the task description. Each agent reviews from their perspective and returns:

- PM: scope decision, acceptance criteria, priority assessment.
- BA: business rules, edge cases, data flow analysis, requirement gaps.
- Senior Dev: architecture fit, implementation approach, risk assessment, affected files.
- QA/QC: test plan, regression risks, quality gates, verification steps.

Include this context in agent prompts:

- Current task description.
- Relevant files from the codebase.
- `AGENTS.md` constraints.
- `tasks/regressions.md` rules.
- Any related docs from `docs/`.

## Phase 2: Synthesis

After all 4 agents respond:

1. List all agreements.
2. List all conflicts and resolve each explicitly.
3. Produce a unified task contract with scope, business rules, implementation plan, and test plan.

## Phase 3: Implementation

Execute the unified plan. Senior Dev implements, following the agreed architecture.

## Phase 4: Verification

Before marking implementation work complete:

1. `pnpm typecheck && pnpm lint && pnpm build` MUST pass.
2. QA/QC agent reviews the diff for correctness.
3. BA agent verifies business rules are met.
4. PM agent confirms acceptance criteria are satisfied.

## Skip Conditions

The ONLY time to skip the 4-agent debate:

- Typo fixes under 3 changed lines.
- Documentation-only changes.
- Dependency version bumps.

For skipped tasks, still verify the changed files and explain why the debate was skipped.

