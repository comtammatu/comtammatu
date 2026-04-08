# Regressions — Named Failure Rules

> Loaded at the start of every session. Each line prevents a past mistake from recurring.
> Format: [DATE] [RULE NAME] — short description

- [2026-04-02] CONSTRAINT-BEFORE-CLEANUP — Never add CHECK constraints before cleaning up existing data that would violate them. ALTER TABLE ADD CONSTRAINT will fail on dirty data and block all subsequent statements in the migration.
- [2026-04-02] REVOKE-ALL-DML — When locking down a table to RPC-only, revoke INSERT + UPDATE + DELETE (not just UPDATE). Leftover INSERT/DELETE grants create bypass paths that orphan related rows (e.g. auth.users without profiles breaks JWT hook).
- [2026-04-02] ROLE-SCOPE-CONSISTENCY — When a role is defined as "HQ-wide" or "tenant-wide" in one place, ensure ALL references (RLS policies, docs, spec tables) agree. office was HQ-wide in role table but branch-scoped in SELECT policy.
- [2026-04-02] TYPE-STUB-BEFORE-CODE — When adding a new DB table, check `database.types.ts` first. If the table isn't in the generated types, add a type stub BEFORE writing any code that calls `.from("new_table")`. Otherwise typecheck passes locally but build fails.
- [2026-04-02] VERIFY-BEFORE-DONE — Never mark a task completed until `pnpm typecheck && pnpm lint && pnpm build` output is confirmed green. Generated types may have `| null` where manual stubs assumed non-null.
- [2026-04-02] LINT-BEFORE-COMMIT — Always run `pnpm lint` before committing. CI runs typecheck + lint + build; skipping lint locally causes CI failures on push. `/verify` must include all three.
- [2026-04-09] NO-ARBITRARY-DIMENSIONS — Never use arbitrary dimension values like `text-[10px]`, `w-[200px]`, `h-[3rem]` in Tailwind classes. ESLint rule `design-system/no-arbitrary-tailwind-value` enforces this at error level. Use standard Tailwind tokens or extend `@theme` in globals.css. For viewport-based values, add custom utilities instead.
