# Orchestration Routing

Use this file only when a task may need subagents, multiple runtimes, or explicit
context-budget control. Default to one agent working inline.

## Routing

| Work shape | Lane |
| --- | --- |
| One command, one fact, one small edit, or reading files you will edit | Inline |
| Broad read-only orientation over files you will not edit | CodeGraph first; otherwise one read-only helper |
| One isolated implementation slice | One executor/helper only if it reduces context load |
| Independent fan-out audit or review | Temporary helpers with clear inputs and terse outputs |
| T3 second-runtime review or arbitration | `team.md` |

Pick the smallest lane that holds. Do not spawn agents for deterministic shell,
git, build, lint, codegen, file moves, or confirmed deletions.

## Context Budget

- Prefer CodeGraph over grep/read loops for source orientation when available.
- Ask helpers for conclusions and evidence paths, not raw file dumps.
- Keep agent-to-agent prompts in English per `AGENTS.md`.
- Durable state belongs in the task tracker, PR body, or canonical docs, not in
  private runtime memory.

## Anti-Repeat

Before risky or familiar work, check `tasks/regressions.md` and
`tasks/lessons.md`. After the work, promote only durable lessons:

- recurring failure prevention -> `tasks/regressions.md` or a guard/test/hook
- durable explanation -> the owning rule/module/ref/spec doc
- transient notes -> delete or leave in PR/task history only

## Anti-Patterns

- Parallel agents mutating the same files without worktree isolation.
- A model call around deterministic work.
- Standing machinery with no current named need.
- A second reviewer with no concrete risk question.
