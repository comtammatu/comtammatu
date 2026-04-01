# Session Protocol

## Core Rules

- Task Contract required for 3+ step tasks. Under 3 steps: do directly
- Stay in scope. Discovered out-of-scope work → note it, don't do it
- Check `tasks/regressions.md` before writing any new code
- Check latest docs (`npm view`, WebFetch) before using framework APIs

## Session Workflow

### START

1. Read `docs/plan/roadmap.md` → find current phase
2. `git status` → clean working tree?
3. Write Task Contract (for 3+ step tasks)

### BUILD

4. Code according to scope
5. Error recovery: 2-3 attempts max per issue
6. Fail to fix? → revert → end session → new session

### VERIFY

7. `pnpm typecheck && pnpm build` — MUST pass
8. Quality Gates checklist (see `quality-gates.md`)

### CLOSE

9. `/review` — pre-commit code review
10. Update `docs/plan/roadmap.md` progress if milestones reached
11. Update `tasks/lessons.md` if user corrected approach

## Task Contract Template

```
===== TASK CONTRACT =====
TASK: [Specific description]
SCOPE:
  - Files: [list files to create/modify]
CONSTRAINTS:
  - [Constraint 1]
COMPLETION CRITERIA:
  - [ ] [Condition 1]
  - [ ] pnpm typecheck && pnpm build passes
  - [ ] /review passes
ESTIMATE: [X] exchanges
==========================
```

## Error Recovery

When stuck after 2-3 attempts:

```
STOP → revert to checkpoint → end session → open new session
```

Do not let context degrade. Fresh session > contaminated session.

---

## gstack Skills Usage Guide

### Every Session

| Skill     | When               | Purpose                                                         |
| --------- | ------------------ | --------------------------------------------------------------- |
| `/review` | Before commit      | Find bugs CI misses: SQL safety, import boundaries, error leaks |
| `/verify` | After code changes | `pnpm typecheck && pnpm build` pipeline                         |

### When Touching Sensitive Code

| Skill      | When                                    | Purpose                             |
| ---------- | --------------------------------------- | ----------------------------------- |
| `/cso`     | After auth/payment/RLS code             | OWASP + STRIDE security audit       |
| `/careful` | When writing DROP TABLE, rm, force-push | Prevent destructive accidents       |
| `/guard`   | During complex migration                | `/careful` + directory-scoped edits |

### Database Work

| Skill          | When                                | Purpose                                            |
| -------------- | ----------------------------------- | -------------------------------------------------- |
| `/db-migrate`  | Adding tables/columns/functions/RLS | Migration with full checklist (GRANT, RLS, UNIQUE) |
| `/investigate` | RLS silent failures, data bugs      | Root cause analysis before fixing                  |

### Feature Development

| Skill         | When                     | Purpose                                       |
| ------------- | ------------------------ | --------------------------------------------- |
| `/new-page`   | Adding admin/branch page | Scaffold page + ACL + proxy routing           |
| `/new-action` | Adding Server Action     | Zod 4 validation + auth context + safe errors |
| `/freeze`     | Focused debugging        | Restrict edits to one directory               |

### QA & Browser Testing

| Skill        | When                      | Purpose                          |
| ------------ | ------------------------- | -------------------------------- |
| `/qa`        | After feature complete    | Autonomous browser QA + auto-fix |
| `/browse`    | During UI development     | Visual verification, screenshots |
| `/benchmark` | Before/after perf changes | Core Web Vitals, load times      |

### Phase/Sprint Boundaries

| Skill               | When                        | Purpose                                        |
| ------------------- | --------------------------- | ---------------------------------------------- |
| `/plan-ceo-review`  | Phase kickoff               | Challenge scope, find 10-star product          |
| `/plan-eng-review`  | Phase kickoff + transitions | Lock architecture, edge cases, test plan       |
| `/retro`            | Phase completion            | Retrospective, velocity tracking               |
| `/ship`             | Ready to push               | Merge base, test, review diff, push, create PR |
| `/document-release` | Phase close                 | Sync docs with what shipped                    |
| `/canary`           | After deploy                | Post-deploy monitoring for errors              |

### Learning & Memory

| Skill         | When                            | Purpose                                  |
| ------------- | ------------------------------- | ---------------------------------------- |
| `/learn`      | After corrections, new patterns | Manage project learnings across sessions |
| `/checkpoint` | Before risky changes            | Save/resume working state                |

---

## Workflow Summary

```
PHASE KICKOFF
  → /plan-ceo-review → /plan-eng-review → update docs → commit
  │
  ├── SESSION 1: Task Contract → Build → /verify → /review → Commit
  ├── SESSION 2: Task Contract → Build → /verify → /review → Commit
  ├── ...
  ├── SESSION N (auth/payment): → Build → /verify → /review → /cso → Commit
  │
  ├── PHASE COMPLETE: /plan-eng-review (next phase) → /retro → commit
  │
  ├── SESSION N+1: ...
  ├── ...
  │
PHASE CLOSE
  → /verify → /qa → /retro → /document-release → /ship → /canary
```

## Skill Groups by Phase

| Phase                      | Primary Skills                                                   |
| -------------------------- | ---------------------------------------------------------------- |
| v0.2.0 Core Management     | `/new-page`, `/new-action`, `/db-migrate`, `/review`             |
| v0.3.0 Operations + HĐĐT   | `/db-migrate`, `/cso` (payments), `/qa`, `/browse`, `/benchmark` |
| v0.4.0 Supply Chain        | `/db-migrate`, `/new-action` (RPCs), `/investigate` (stock bugs) |
| v0.5.0 Intelligence + CTCP | `/cso` (finance), `/plan-eng-review`, `/qa`, `/benchmark`        |
| v1.0.0 Pilot Launch        | `/qa`, `/canary`, `/benchmark`, `/ship`, `/document-release`     |
