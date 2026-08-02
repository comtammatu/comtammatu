# ADR 0021: Bounded Project Learning And Governance Cleanup

**Status:** Accepted

**Date:** 2026-08-02

## Context

The project had durable lessons, regressions, active tasks, decision records,
topic rules, and runtime adapters, but no reliable retirement path. Facts were
copied across layers, completed rollouts remained as planning authority, and
metadata/vocabulary gates accumulated without proving product behavior. The
result was slower startup, forgotten learning, contradictory instructions, and
documentation growth.

The problem is lifecycle ownership, not missing storage. Another memory system,
dashboard, task board, or standing agent program would add a competing source.

## Decision

### One owner per fact

| Fact type | Owner |
| --- | --- |
| Hard repository constraint and startup | `AGENTS.md` |
| Topic-specific agent policy | One file in `docs/agent/rules/` |
| Current technical contract | Owning `docs/spec/` or `docs/modules/` file |
| Durable business/domain rule | Owning `docs/ref/` file |
| Operational procedure | `docs/runbooks/` |
| Architecture decision or parked option | ADR |
| Current outcome | `tasks/todo.md` |
| Unencoded failure context | `tasks/regressions.md` |
| Prose-only learning | `tasks/lessons.md` |

`docs/plan/decisions.md` is a compatibility index for referenced `Dxxx`
labels, not a new-decision surface. Git and PR/task history are the archive.

### Close the learning loop by promotion and deletion

Every completed T2/T3 outcome considers whether it produced a reusable fact.
When it did, promote that fact to the owner above and delete its staging copy in
the same diff. When it did not, add nothing. No exact `Loop:` token, parser,
report, meeting, or permanent program is required.

### Keep gates that protect failures

A blocking gate must name a concrete runtime, security, data-integrity,
accessibility, migration, or repository-boundary failure. Vocabulary bans,
commit-token declarations, duplicated-rule synchronization, and incidental
implementation-shape budgets are not substitutes for behavioral evidence.
Removing a safety gate still requires equivalent failure proof.

### Keep active work finite

`tasks/todo.md` contains outcomes that have not passed Exit. Completed work is
deleted; external prerequisites use `blocked`; implementation awaiting proof
uses `verify`. Plans and audit transcripts do not stay beside active work after
their live actions and contracts are promoted.

### Make startup incremental

`agent:start` verifies the tracked skill bundle, reads CodeGraph status first,
and indexes only when the graph reports pending changes, mismatch, or an
extraction upgrade.

## Consequences

- Entry rules and active tasks become smaller without weakening Production,
  auth/RLS, money, migration, validation, or accessibility controls.
- Historical detail remains recoverable from Git instead of competing with
  current authority.
- Judgment is still required to prove that a canonical owner or guard fully
  covers a staged lesson/regression.
- Skill-bundle composition, Local database policy, UI debt ratchets, and active
  ADR 0022 are separate changes with separate failure boundaries.

## Verification And Rollback

Repository link/lifecycle checks, targeted guard self-tests, and
`typecheck/lint/build` prove the cleanup slice. Rollback is the task-owned Git
diff; this decision grants no database, Production, deployment, commit, or push
authority.
