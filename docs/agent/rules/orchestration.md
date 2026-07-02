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
| Single fact, one command, an edit you can place from context, a read within the inline threshold | Inline (main thread) | No delegation overhead. Threshold owned by [skills.md](skills.md) → Subagents, Debate, And Read Delegation. |
| Orientation read beyond the inline threshold, over files you will NOT edit | One read-only Explore sub-agent | Context economy — owned by [skills.md](skills.md) "Subagents, Debate, And Read Delegation". Return conclusions, not file dumps. |
| One isolated, well-scoped implementation chunk | One `executor` sub-agent | Keeps the chunk's working context out of the main thread; model tier is chosen by [skills.md](skills.md) → Subagents, Debate, And Read Delegation. |
| Independent work that fans out — audit sweep, multi-file migration, multi-dimension review, N candidate designs | Dynamic multi-agent Workflow | A transient set of sub-agents spawned for one fan-out task, then torn down — not the standing team. Pipeline by default; barrier only when a stage needs all prior results. |
| Recurring standing mission, cross-runtime review, arbitration | Standing team + Codex pass | Defined in [team.md](team.md). |

Pick the lowest lane that holds. A Workflow for a one-agent job is the token
waste this file exists to prevent; grinding a fan-out inline is the opposite
waste. The sub-agent and Workflow lanes are advisory routing, not governance:
on a runtime without sub-agent spawning they degrade to inline-sequential work
(runtime-neutral mandate, [team.md](team.md)).

## Model-Tier Lanes (L0–L3)

The Routing Matrix picks *where* a task runs; this section picks *what it
costs*. Two orthogonal axes, never conflated: **lane (L0–L3)** — how much
machinery and model tier a task gets (this section) — and **review tier
(T1/T2/T3)** — review depth by blast radius, owned by
[workflow.md](workflow.md) and only referenced here.

The waste this section kills: sub-agent and Workflow-stage calls inherit the
main-loop model (the strongest tier) unless overridden, so an unpinned cheap
task silently bills the top model. Model names and effort enums are harness
vocabulary, not repo policy — when the harness renames them, the principle
(pin the tier per call; never inherit-default) survives.

- **L0 — no model.** Plain shell, `gh`, `git`, poll loops, in the main thread. Zero tokens. The default and majority lane.
- **L1 — light model, low effort.** Read-only sweeps, triage, evidence collection, mechanical patches, QA sidecars.
- **L2 — strong model, medium/high effort.** Implementation, refactor, structural review — bounded slices needing judgment.
- **L3 — strong model, high/max effort, plus the review-tier machinery [workflow.md](workflow.md) assigns** (for T3: four perspectives and the second-runtime pass, [team.md](team.md)).

| Task class | Lane | Model / effort | Why |
| --- | --- | --- | --- |
| PR merge (checks green) | L0 | none | `gh pr merge` is deterministic |
| Poll CI checks / Actions status | L0 | none | `gh pr checks --watch` / poll loop, pure wait |
| Rebase / fast-forward onto `main` | L0 | none | mechanical unless conflicts surface |
| Hard gate / `corepack pnpm verify` runs | L0 | none | binary pass/fail; commands owned by [workflow.md](workflow.md) → Verification |
| Codegen: `corepack pnpm db:types`, i18n baseline regen | L0 | none | regenerate, assert, commit output as-is |
| File move/rename; delete confirmed-dead-now code | L0 | none | `git mv` / `rm` — see the dead-code caveat |
| Dep bump (non-critical package, no API change) | L0 | none | T1-Skip per [workflow.md](workflow.md) — bump, gate, skip reason |
| CI/test-log triage (flaky vs infra vs real) | L1 | fast / low | read-only failure classification |
| Lint-error classification; audit sweep; evidence/caller collection | L1 | fast / low | `codegraph_explore` first; read-only, return conclusions |
| QA sidecar / route-smoke evidence | L1 | fast / low | capture state, no design decisions |
| Small mechanical patch (rename, import move) | L1 | fast / low | bounded edit, no design decision |
| Code review of a T2 diff | L2 | strong / medium | structural judgment, not a sweep |
| Feature/refactor slice; additive migration (no RLS/constraint) | L2 | strong / medium | non-trivial write; additive migration is a single authoring pass |
| Cross-boundary coherence review; release slice | L2 | strong / high | contract-drift and ship-readiness judgment |
| Migration touching RLS / constraints / `SECURITY DEFINER` | L3 | strong / high, author→verify split | review tier per [workflow.md](workflow.md); second-runtime pass per [team.md](team.md) |
| Auth / money / HĐĐT / payroll change | L3 | strong / max | four perspectives; law citations via [skills.md](skills.md) → HKD Domain; second runtime |
| Architecture fork (D0xx) | L3 | strong / max | cross-runtime consult ([team.md](team.md)) |
| Orchestration itself (tier-pick, fan-out, synthesis) | L3 (main thread) | inherited strong | routing stays on the strong model |

**Pinning rule:** an L0 row is never wrapped in a sub-agent; every L1+
sub-agent or Workflow-stage call carries an explicit model + effort. An
unpinned call is a latent top-tier bill.

Caveats:

- The dep-bump L0 row covers a non-critical package with no API change. A bump touching auth, crypto, or DB-driver packages routes through the normal blast-radius check per [workflow.md](workflow.md).
- L0 deletion holds only for code confirmed dead **right now** — a fresh caller check (`codegraph_callers` / references shows zero live uses, no barrel or `"use server"` re-export depends on it). A dead-code verdict from a stale review is not sufficient: an L1 sweep confirms zero references, then L0 removes.

### Never-agent list (L0)

Wrapping any of these in a sub-agent is the Workflow-for-one-agent
anti-pattern paid in tokens:

- Git plumbing: branch create/switch, `status`/`diff`/`log`, rebase, tag, cherry-pick.
- PR lifecycle: `gh pr create/merge/view`, polling checks.
- Gates and guards: the [workflow.md](workflow.md) → Verification commands, `lint:rules-mirror`, `lint:i18n:baseline`, `lint:review-tier`.
- Codegen: `corepack pnpm db:types`, i18n baseline regen.
- File moves/renames; deletion of confirmed-dead-now code (caveat above).
- Single-fact reads within the inline threshold ([skills.md](skills.md)).

Not on this list: **applying a migration**. Prod apply is owner-only
([database.md](database.md)); `apply_migration` never appears in an agent
script. Agent scope for DB work ends at authoring the file plus PR
scaffolding, and — after the owner applies — `corepack pnpm db:types`.

### Lane discipline in practice

Merge a PR once CI is green — the green path spawns no agent:

```sh
# L0 — main thread, zero tokens
gh pr checks $PR --watch --fail-fast
gh pr merge $PR --squash --delete-branch
```

Only a failure is admissible judgment, and it gets a light tier: one L1
sub-agent (fast model, low effort) reads `gh run view --log-failed` and
classifies each failure as flaky | infra | real-code without editing code —
the main thread then decides rerun (L0) versus hand-off to an L2 fix.

Inside a multi-stage Workflow the same discipline applies: deterministic
transforms stay in plain script code between stages; a sub-agent call wraps
only judgment and always pins its tier; fan-out only over genuinely
independent items; a barrier only when a stage consumes all prior results.

Escalate machinery in order and stop at the first lane that holds: one pinned
sub-agent (nearly all judgment work stops here) → Dynamic Workflow only when
the work is already independent or genuinely staged (author→verify) →
standing team only for a recurring cross-runtime mission ([team.md](team.md)).

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
- An unpinned sub-agent or Workflow-stage call — it inherits the strongest model for work a light tier or plain shell covers (Model-Tier Lanes above).
- Standing machinery (team, cron, scheduled agents) provisioned with no named recurring need.
- Reflexive cross-runtime consult on every diff — mandatory only where [workflow.md](workflow.md) requires it (T3).
- `apply_migration` inside an agent script — prod apply is owner-only ([database.md](database.md)).
