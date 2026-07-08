# T3 Review And Cross-Runtime Review

Use this file only for T3 work that needs a second runtime, arbitration, or an
explicit handoff between Claude and Codex. It is not a standing team charter and
does not create recurring missions.

Owned elsewhere:

| Topic | Owner |
| --- | --- |
| Review tiers, four perspectives, verification | `workflow.md` |
| Skill/tool routing | `skills.md` |
| Core constraints and git rules | `engineering.md` |
| DB/prod/migration rights | `database.md` |
| Source-of-truth and memory hygiene | `references.md` |

## Runtime Model

- The current agent is the orchestrator for the task.
- A second runtime is optional evidence, not authority. Use it when independent
  review materially reduces risk.
- If no second runtime or subagent is available, write the T3 perspectives
  inline. The artifact is the contract; live chat channels are not.

## When To Use A Second Runtime

Use a Claude/Codex second pass for:

- T3 changes on auth/RLS, money, migrations, `SECURITY DEFINER`, production
  backfill, or other silent data-corruption/leak surfaces.
- Large ambiguous diffs where the author needs an independent challenge.
- Architecture forks that would otherwise become a durable decision.

Do not invoke a second runtime for T1 work or routine T2 work unless the owner
asks.

## Handoff Format

Write handoffs in English for agent-to-agent context:

```text
Mode: review | challenge | consult
Task:
Diff/files:
Risk surface:
Repo rules loaded:
Question/pass criteria:
Evidence needed:
```

For money/tax/HĐĐT/payroll, cite the relevant `docs/ref/` source instead of
copying numbers from memory.

## Arbitration

When runtimes disagree:

1. Reproduce the claim with a file/line, command output, screenshot, row, or
   failing check.
2. Re-debate only the contested point through the relevant `workflow.md` lens.
3. If evidence still does not settle a T3 decision, ask the owner with both
   positions stated plainly.
4. Record the final call in the PR body, task note, or owner-facing summary.
   Promote only durable rules to canonical docs.

## Anti-Patterns

- No standing mission table.
- No governance that depends on Agent Teams, one runtime, or one plugin.
- No parallel task board, memory store, or agent-only doc tree.
- No second-runtime pass without a concrete risk question.
