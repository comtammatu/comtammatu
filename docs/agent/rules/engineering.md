# Engineering Rules

`AGENTS.md` owns repository-wide hard constraints, startup, commands, and
communication. This file owns import/runtime boundaries and Git conventions;
do not copy the entrypoint policy here.

## Import Boundaries

- Server Actions and RSC:
  `@comtammatu/database/supabase/server`.
- Privileged server-only code that intentionally bypasses RLS:
  `@comtammatu/database/supabase/service`; follow `database.md`.
- Proxy: `@comtammatu/database/supabase/middleware`.
- Client runtime: `@comtammatu/database/supabase/client`.
- Database types: type-only imports from `@comtammatu/database` or
  `@comtammatu/database/types`.

Canonical route families live in `docs/spec/role-route-matrix.md`. Proxy auth,
surface, branch-scope, and network gates start at `apps/web/proxy.ts`; auth
claims and ACL rules are owned by `database.md` and `docs/modules/auth.md`.

## Git And Commit Conventions

- No AI attribution or generated-by trailers.
- Language separation: `docs/agent/rules/language.md` (English agent/technical
  surfaces; Vietnamese product UI and `docs/ref/**`). Enforce with
  `lint:language-policy` and `lint:copy`.
- Commit subjects are English, imperative, and use a conventional prefix when
  one fits.
- Agent-authored implementation commits include a `Verification:` line naming
  the gates actually run.
- Do not commit or push unless the owner requested it in the current task.
- In a dirty/shared tree, snapshot status, declare owned paths, preserve
  unrelated changes, and re-read a path before editing when writers may overlap.
- Parallel writers use isolated worktrees. Before staging, inspect the scoped
  diff, stage only owned files, commit immediately, and never leave a partial
  index.
