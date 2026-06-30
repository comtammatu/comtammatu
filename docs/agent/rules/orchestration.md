# Orchestration Routing

How to route a task across execution lanes — inline, one sub-agent, a dynamic
multi-agent Workflow, or the standing team — and how to spend the main context
window without re-solving the same problem twice. This file owns the *when* of
delegation and context-budget discipline. It does not redefine roles and the
team loop ([team.md](team.md)), review tiers and verification gates
([workflow.md](workflow.md)), or skill and read-delegation routing
([skills.md](skills.md)) — load those for the *what* and *how*.

## Routing Matrix

| Work shape | Lane | Notes |
| --- | --- | --- |
| Single fact, one command, an edit you can place from context, a read of ≤3 files | Inline (main thread) | No delegation overhead. |
| Orientation read across >3 files you will NOT edit | One read-only Explore sub-agent | Context economy — owned by [skills.md](skills.md) "Subagents, Debate, And Read Delegation". Return conclusions, not file dumps. |
| One isolated, well-scoped implementation chunk | One `executor` sub-agent | Keeps the chunk's working context out of the main thread; model tier is chosen by [skills.md](skills.md) → Subagents, Debate, And Read Delegation. |
| Independent work that fans out — audit sweep, multi-file migration, multi-dimension review, N candidate designs | Dynamic multi-agent Workflow | A transient set of sub-agents spawned for one fan-out task, then torn down — not the standing team. Pipeline by default; barrier only when a stage needs all prior results. |
| Recurring standing mission, cross-runtime review, arbitration | Standing team + Codex pass | Defined in [team.md](team.md). |

Pick the lowest lane that holds. A Workflow for a one-agent job is the token
waste this file exists to prevent; grinding a fan-out inline is the opposite
waste. The sub-agent and Workflow lanes are advisory routing, not governance:
on a runtime without sub-agent spawning they degrade to inline-sequential work
(runtime-neutral mandate, [team.md](team.md)).

## Context-Window Budget

The main context window is the scarce resource — protect it.

- Delegate reads; receive conclusions. A sub-agent that returns a 3-line verdict costs you 3 lines, not the 2000 it read (read-delegation thresholds owned by [skills.md](skills.md)).
- Prefer `codegraph_explore` over a grep/read loop, or over a sub-agent that would repeat a search the index already answers.
- Sub-agent prompts and inter-agent text are English (see `AGENTS.md` → Communication Protocol) — denser, runtime-identical.
- Cap what returns: ask sub-agents for structured, terse output; no raw file dumps into the main thread.
- One thread, one job. When a thread is doing two unrelated things, branch or hand off rather than letting both contexts bloat each other.

## Anti-Repeat And Loop Engineering

Before solving, check whether it is already solved; after solving something that
will recur, capture it once so no future session re-derives it. This is the
self-improving spine — it reuses the existing promotion ladder, it does not add
a new store.

Before:

- Consult `tasks/regressions.md` (named failure rules) and `tasks/lessons.md` (staged insights) before risky or familiar-smelling work.
- Trust durable zones (`docs/agent/rules/`, `docs/ref/`, `docs/spec/`, `docs/modules/`) over dated snapshots ([references.md](references.md) → Transient Snapshot Docs).

After — promote to the cheapest durable home (an enforced rule costs zero
context; prose is re-read every session):

- Mechanical / checkable → a lint guard or `tasks/regressions.md`.
- Insight not yet enforceable → `tasks/lessons.md`.
- Stable architecture or contract → the owning rule / module / spec doc, then delete the staged copy.
- Reusable task recipe or prompt shape → a skill, or a row in the Routing Matrix above.

Optimize the next loop only from evidence:

- If a step wasted time, first try deletion, reuse, or a narrower lane before
  adding process.
- If a check catches a recurring class, prefer a guard/test/hook over prose.
- If a model or sub-agent tier was overkill, downgrade the next comparable
  task; if it missed a high-risk issue, route that lens to a stronger reviewer.
- For T2/T3 work, record one closing line in the PR/worklog: `Learning: none` or
  the promoted rule, plus `Next loop: <one concrete optimization>`.

The ladder and its cleanup policy are owned by `tasks/lessons.md`,
`tasks/regressions.md`, and [references.md](references.md) → Memory Maintenance
Rules — point there, do not restate.

## Anti-Patterns

- Spinning a multi-agent Workflow for work one agent finishes.
- Re-solving a problem `tasks/regressions.md` or `tasks/lessons.md` already names.
- Pulling raw file contents into the main thread when a sub-agent could return the conclusion.
- Parallel agents mutating the same files without git-worktree isolation.
- Approving your own work in the same lane — authoring and review are separate passes ([workflow.md](workflow.md), [team.md](team.md)).
