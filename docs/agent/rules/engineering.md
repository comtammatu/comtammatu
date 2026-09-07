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

`scripts/check-docs-budget.mjs` reports reading-review thresholds for topic
rules (400 lines), ADRs (150), and `tasks/todo.md` (840). These are advisory
navigation signals, not content limits, model context limits, or permission to
delete information. They never block lint/verify, including legacy `--strict`
invocations. Spec/module/ref have no line thresholds. The retired worklog
boundary remains blocking; `check-doc-staleness.mjs` checks task lifecycle and
source ownership, not document length. Behavioral debt and runtime resource
budgets are separate contracts and are not relaxed by this policy (ADR 0021).

Never delete, abbreviate, join lines, or weaken required content to meet a
size target. Preserve constraints, rationale, exceptions, unresolved questions,
blockers, pending actions, exact evidence, and verification/rollout status.
Prefer headings and scoped reads; the reading protocol is in `references.md`.
When moving detail to its existing canonical owner, preserve its meaning and
qualifiers, add a direct path and section link at the source, verify the target
exists, and compare the before/after content before removing the duplicate.
If equivalent coverage cannot be established, keep the original. A shorter
summary and a Git history reference are not substitutes for live requirements.
