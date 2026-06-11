# Employee PWA Shell - 2026-06-11

Skill plan: repo rules = engineering + ui + workflow + references; external skills = shadcn + playwright; runtime tools = local source grep, shadcn project info/docs, focused static tests, typecheck/lint/build, browser smoke when auth/env allows.

PM: Scope is the staff-facing PWA shell, not a new HR portal. Acceptance means an employee opens `/employee`, understands it is the staff app, sees how to install it, and still lands on the next safe work action.

BA: Installation help must be short, action-oriented, and safe across Android/Chrome and iOS Home Screen flows. Offline state must be visible because clock, task, and notification writes need the network to persist.

Senior Dev: Reuse the existing Employee shell and shadcn primitives. Keep the root manifest scoped to `/employee`, add Employee-specific install chrome, and do not store scope or workflow state in browser storage.

QA/QC: Add static coverage for the Employee PWA shell, root manifest identity, install affordance, and offline warning. Run focused tests plus `pnpm typecheck && pnpm lint && pnpm build`; browser smoke depends on auth/env availability.
