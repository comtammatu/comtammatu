# Regressions — Named Failure Rules

> Loaded at the start of every session. Each line prevents a past mistake from recurring.
> Format: [DATE] [RULE NAME] — short description

- [2026-04-02] CONSTRAINT-BEFORE-CLEANUP — Never add CHECK constraints before cleaning up existing data that would violate them. ALTER TABLE ADD CONSTRAINT will fail on dirty data and block all subsequent statements in the migration.
- [2026-04-02] REVOKE-ALL-DML — When locking down a table to RPC-only, revoke INSERT + UPDATE + DELETE (not just UPDATE). Leftover INSERT/DELETE grants create bypass paths that orphan related rows (e.g. auth.users without profiles breaks JWT hook).
- [2026-04-02] ROLE-SCOPE-CONSISTENCY — When a role is defined as "HQ-wide" or "tenant-wide" in one place, ensure ALL references (RLS policies, docs, spec tables) agree. office was HQ-wide in role table but branch-scoped in SELECT policy.
