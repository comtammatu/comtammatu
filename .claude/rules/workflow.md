# Workflow & Quality Gates

## Anti-Patterns

1. Don't build without planning — complex task → plan first
2. Don't silently swallow contradictions → log in `tasks/friction.md`
3. Don't mark done without verifying → `/verify` must pass
4. Don't repeat past mistakes → check `tasks/regressions.md` before coding
5. Don't over-engineer — simplicity > cleverness
6. Don't patch the surface → find root cause
7. Don't ask user what you can self-fix → self-investigate → self-fix
8. Don't skip skills → invoke the right skill for the task type

## Domain Skills (Invoke before coding)

| Task involves              | Invoke first                                             |
| -------------------------- | -------------------------------------------------------- |
| SQL / migration / RLS      | `/db-migrate` + `database-design:postgresql`             |
| Next.js routes / RSC       | `/new-page` + `nextjs-app-router-patterns`               |
| Server Action              | `/new-action`                                            |
| Bug investigation          | `/investigate` + `code-documentation:code-reviewer`      |
| Auth / payment / RLS audit | `/cso`                                                   |
| Destructive commands       | `/careful`                                               |
| Complex migration          | `/guard`                                                 |
| Focused debugging          | `/freeze`                                                |

## Meta-Learning Files

| File                   | Purpose                     | When to update                  |
| ---------------------- | --------------------------- | ------------------------------- |
| `tasks/regressions.md` | Named failure rules         | Every serious failure           |
| `tasks/lessons.md`     | Pattern → Rule → Prevention | Every correction from user      |
| `tasks/friction.md`    | Contradiction log           | New instruction contradicts old |
| `tasks/predictions.md` | Prediction → Actual → Delta | Before important decisions      |
| `tasks/todo.md`        | Current phase work items    | During work                     |

## Quality Gates (Before Delivery)

- [ ] `/verify` passes (`pnpm typecheck && pnpm build`)
- [ ] `/review` passes (no bugs CI misses)
- [ ] As simple as possible? No unnecessary abstractions
- [ ] Violates any rule in `tasks/regressions.md`?
- [ ] New table? → `/db-migrate` + GRANT + RLS + UNIQUE per tenant
- [ ] New Server Action? → `/new-action` + Zod validation + safe error response
- [ ] New SQL function? → `pnpm db:types`
- [ ] Touched auth/payment/RLS? → `/cso`
