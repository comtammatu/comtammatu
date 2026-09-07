# Engineering Rules

`AGENTS.md` owns repository-wide hard constraints, startup, commands, and
communication. This file owns import/runtime boundaries and Git conventions.
Do not copy ADR, spec, or module contracts here — cite the owner.

## Import Boundaries

- Server Actions and RSC:
  `@comtammatu/database/supabase/server`.
- Privileged server-only code that intentionally bypasses RLS:
  `@comtammatu/database/supabase/service`; follow `database.md`.
- Proxy: `@comtammatu/database/supabase/middleware`.
- Client runtime: `@comtammatu/database/supabase/client`.
- Database types: type-only imports from `@comtammatu/database` or
  `@comtammatu/database/types`.

Canonical route families: `docs/spec/role-route-matrix.md`. Proxy gates start
at `apps/web/proxy.ts`. Auth/ACL: `docs/modules/auth.md` and `database.md`.

## Git And Commit Conventions

- No AI attribution or generated-by trailers.
- Language separation: `docs/agent/rules/language.md`. Enforce with
  `lint:language-policy` and `lint:copy`.
- Commit subjects are English, imperative, and use a conventional prefix when
  one fits.
- Agent-authored implementation commits include a `Verification:` line naming
  the gates actually run. For any code change outside CI `paths-ignore`, that
  line MUST include `corepack pnpm verify` with a green exit code immediately
  before commit.
- Do not commit or push unless the owner requested it in the current task.
- Before push, `git-hooks/pre-push` runs `corepack pnpm verify` when the push
  would change files outside CI `paths-ignore`. Install with
  `corepack pnpm git:hooks:install` or `corepack pnpm agent:start`.
- In a dirty/shared tree, snapshot status, declare owned paths, preserve
  unrelated changes, and re-read a path before editing when writers may overlap.
- Parallel writers use isolated worktrees. Before staging, inspect the scoped
  diff, stage only owned files, commit immediately, and never leave a partial
  index.

## Documentation gates

Caps live in `scripts/check-docs-budget.mjs` and apply only to files the
agent loads as a whole: `docs/agent/rules/*` (400; `AGENTS.md` reads one
topic rule), ADRs (150), and the worklog ban. Spec/module/ref are on-demand
`Read`/`rg` via `references.md`; CodeGraph indexes supported source, not
markdown. Do not add spec/module/ref line caps — shape budget is not
behavioral evidence (ADR 0021). `tasks/todo.md` finiteness is
`check-doc-staleness.mjs`.
