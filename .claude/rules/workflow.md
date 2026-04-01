# Workflow & Quality Gates

## Anti-Patterns

1. Don't build without planning — complex task → plan first
2. Don't silently swallow contradictions → log in `tasks/friction.md`
3. Don't mark done without verifying → `pnpm typecheck && pnpm build` pass
4. Don't repeat past mistakes → check `tasks/regressions.md` before coding
5. Don't over-engineer — simplicity > cleverness
6. Don't patch the surface → find root cause
7. Don't ask user what you can self-fix → self-investigate → self-fix

## Domain Skills (Invoke before coding)

| Task involves         | Invoke first                                             |
| --------------------- | -------------------------------------------------------- |
| SQL / migration / RLS | `database-design:postgresql`                             |
| Next.js routes / RSC  | `frontend-mobile-development:nextjs-app-router-patterns` |
| Bug investigation     | `code-documentation:code-reviewer`                       |

## Meta-Learning Files

| File                   | Purpose                     | When to update                  |
| ---------------------- | --------------------------- | ------------------------------- |
| `tasks/regressions.md` | Named failure rules         | Every serious failure           |
| `tasks/lessons.md`     | Pattern → Rule → Prevention | Every correction from user      |
| `tasks/friction.md`    | Contradiction log           | New instruction contradicts old |
| `tasks/predictions.md` | Prediction → Actual → Delta | Before important decisions      |
| `tasks/todo.md`        | Current phase work items    | During work                     |

## Quality Gates (Before Delivery)

- [ ] `pnpm typecheck && pnpm build` pass
- [ ] As simple as possible? No unnecessary abstractions
- [ ] Violates any rule in `tasks/regressions.md`?
- [ ] New table? → GRANT + RLS + UNIQUE per tenant
- [ ] New Server Action? → Zod validation + safe error response
- [ ] New SQL function? → `pnpm db:types`
