# Session Protocol

## Core Rules

- **One task = one session.** Context degrades over time.
- **Task Contract required** for 3+ step tasks. Under 3 steps: do directly.
- **Checkpoint commit** before and after every session.
- Stay in scope. Discovered out-of-scope work → note it, don't do it.
- Check `tasks/regressions.md` before writing any new code.
- Check latest docs (`npm view`, WebFetch) before using framework APIs.

---

## 1. Sprint Kickoff (once per Sprint)

Run before the first session of a new Sprint.

1. **Review previous Sprint DoD**
   - All checkboxes done? Pending items carried over?
   - Tag remaining items as `[CARRIED]` in roadmap

2. **`/plan-ceo-review`** — Challenge scope
   - Is this the right priority?
   - What can we cut without losing value?
   - What's the simplest version that ships?

3. **`/plan-eng-review`** — Lock architecture
   - Data flow diagrams, edge cases, test matrices
   - Identify risky sessions, flag dependencies

4. **Update `docs/plan/roadmap.md`**
   - Finalize session roadmap
   - Estimate sessions + dependencies
   - Set Definition of Done checkboxes

5. **Checkpoint commit**
   - `chore(plan): sprint N kickoff`

---

## 2. Session Workflow (every coding session)

### START

1. Read current sprint plan (`docs/plan/roadmap.md`) → find next session
2. Read `CLAUDE.md` + `tasks/regressions.md`
3. `git status` → clean working tree?
4. Checkpoint commit (if uncommitted work exists)
   - `chore: checkpoint before S[N]`
5. Write **Task Contract** (for 3+ step tasks)

### BUILD

6. Code according to Task Contract
   - Stay in scope — out-of-scope discovery → note in roadmap, don't do
   - Error recovery: 2-3 attempts max per issue
   - Fail to fix? → `revert to checkpoint → end session → new session`

### VERIFY

7. `/verify` — `pnpm typecheck && pnpm lint && pnpm build` — MUST pass
8. Quality Gates checklist (see `quality-gates.md`)
9. `/review` — code review for bugs CI won't catch
   - Fix issues found before committing
10. `/cso` — **only when touching auth/payment/RLS code**

### CLOSE

11. Checkpoint commit (follow conventional commits)
12. Update `docs/plan/roadmap.md` — mark session DONE
13. Update `tasks/lessons.md` if user corrected approach
14. **END SESSION**

---

## 3. Phase Completion (after last session of a phase)

1. **Verify all phase sessions DONE** in roadmap
2. **`/plan-eng-review`** for the next phase
   - Re-evaluate: did building this phase change assumptions?
3. **`/retro`** — phase retrospective
4. **Commit**: `chore(plan): phase complete`

---

## 4. Sprint Close (once per Sprint)

1. **Verify Definition of Done** — all checkboxes in roadmap
2. **Live verification** — run the system, confirm behavior
3. **`/retro`** — full sprint retrospective
4. **`/cso`** — sprint-level security review (if auth/payment code was added)
5. **`/document-release`** — sync all docs with reality
6. **`/ship`** — merge → test → review → push → PR
7. **`/canary`** — post-deploy monitoring
8. **Tag release**: `git tag vX.Y.Z`

---

## Task Contract Template

```
===== TASK CONTRACT =====
SESSION: #[number]
TASK: [Specific description]
SCOPE:
  - Files: [list files to create/modify]
CONSTRAINTS:
  - [Constraint 1]
COMPLETION CRITERIA:
  - [ ] [Condition 1]
  - [ ] /verify passes
  - [ ] /review passes
ESTIMATE: [X] exchanges
==========================
```

---

## Error Recovery

When stuck after 2-3 attempts:

```
STOP → revert to checkpoint → end session → open new session
```

Do not let context degrade. Fresh session > contaminated session.

---

## gstack Skills Map

### Every Session (mandatory)

| Skill     | When               | Purpose                                                         |
| --------- | ------------------ | --------------------------------------------------------------- |
| `/verify` | After code changes | `pnpm typecheck && pnpm lint && pnpm build` pipeline            |
| `/review` | Before commit      | Find bugs CI misses: SQL safety, import boundaries, error leaks |

### Sprint Kickoff (once per sprint)

| Skill              | When           | Purpose                                  |
| ------------------ | -------------- | ---------------------------------------- |
| `/plan-ceo-review` | Đầu sprint     | Challenge scope, cắt gì không mất value? |
| `/plan-eng-review` | Sau CEO review | Lock architecture, edge cases, test plan |

### Sensitive Code (when touching auth/payment/RLS)

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

### QA & Browser Testing (from M2+ when UI is complete)

| Skill        | When                      | Purpose                          |
| ------------ | ------------------------- | -------------------------------- |
| `/qa`        | After feature complete    | Autonomous browser QA + auto-fix |
| `/browse`    | During UI development     | Visual verification, screenshots |
| `/benchmark` | Before/after perf changes | Core Web Vitals, load times      |

### Phase/Sprint Close

| Skill               | When              | Purpose                                |
| ------------------- | ----------------- | -------------------------------------- |
| `/retro`            | Cuối phase/sprint | Retrospective, velocity tracking       |
| `/plan-eng-review`  | Chuyển phase      | Re-evaluate assumptions cho phase tiếp |
| `/document-release` | Cuối sprint       | Sync docs with what shipped            |
| `/ship`             | Ready to push     | Merge → test → review → push → PR      |
| `/canary`           | After deploy      | Post-deploy monitoring for errors      |

### Learning & Memory

| Skill         | When                            | Purpose                                  |
| ------------- | ------------------------------- | ---------------------------------------- |
| `/learn`      | After corrections, new patterns | Manage project learnings across sessions |
| `/checkpoint` | Before risky changes            | Save/resume working state                |

---

## Skills by Module

| Module                            | Primary Skills                                                  |
| --------------------------------- | --------------------------------------------------------------- |
| M0+M1: Admin Shell + Menu ✅      | `/new-page`, `/new-action`, `/db-migrate`, `/verify`, `/review` |
| M2+M3: POS + KDS                  | `/db-migrate`, `/new-page`, `/new-action`                       |
| M4: Payment                       | `/db-migrate`, `/cso` (payments), `/new-action`                 |
| M5: Stock                         | `/db-migrate`, `/qa`, `/browse`                                 |
| M6: Finance (HĐĐT + Dashboard)    | `/cso` (finance+HĐĐT), `/db-migrate`, `/investigate`            |
| v1.0.0 Pilot Launch            | `/qa`, `/canary`, `/benchmark`, `/ship`, `/document-release`    |
| M7 + Post-v1.0                    | `/cso` (finance), `/plan-eng-review`, `/qa`, `/benchmark`       |

---

## Workflow Summary

```
SPRINT KICKOFF
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
SPRINT CLOSE
  → /verify → /qa → /retro → /cso → /document-release → /ship → /canary
```
