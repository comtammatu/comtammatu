# Database, Supabase, Auth, And ACL Rules

Use this file before changing Supabase queries, migrations, RLS, auth, ACL, Server Actions, RPC functions, or generated database types.

Also read `docs/agent/rules/skills.md` and route database/auth work through the
Supabase skill family when available.

## Environment Registry

Verify the project ref against this registry before EVERY Supabase MCP, CLI, or
SQL call. This registry wins over any older label found in regressions, worklogs,
or agent memory.

| Ref                    | What it is                                                                    | Agent rights                                                                                                  |
| ---------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `iexwsuaqqenyjiskawoj` | **PRODUCTION** — the only comtammatu database                                | SELECT-only. NEVER apply migrations or write unless the owner explicitly delegates it in the current session. |
| `dyksphedgzqsqjqgxzog` | `matu-platform` production — a separate codebase used as design reference only | Do not touch.                                                                                                  |

- There is currently NO persistent dev/test Supabase project. Non-prod
  verification uses an on-demand Preview Branch instead — see §Preview
  Branches (D047) below. Production migrations still go file → PR → owner
  applies, except under Owner-Delegated Production Apply.
- Historical notes may label `iexwsuaqqenyjiskawoj` as "dev"; those labels are
  stale history. This registry is the SSoT.
- The repo-scoped MCP server in `.mcp.json` points at production but is NOT
  read-only; it is gated by the deny-list plus the `guard-prod-db.mjs` hook.
  Only Codex's `.codex/config.toml` Supabase URL is pinned `read_only=true`.
  Org-scoped MCP servers and the Supabase CLI are also NOT read-only — re-check
  the ref before any write-capable call.
- Machine enforcement: `scripts/guard-prod-db.mjs` is the single PreToolUse
  guard (blocks write SQL / mutating CLI / write-capable MCP calls against the
  protected refs above). Per-runtime wiring runs that one script:
  `.claude/settings.json` (Claude Code, plus its permission deny list) and
  `.codex/hooks.json` (Codex; project-local hooks load only after the project
  is trusted in that Codex session). The hook's ref list and every adapter's
  matchers must stay in sync with this table; `corepack pnpm lint:guard-sync`
  (part of `corepack pnpm lint`) enforces all of them. A runtime without hook
  support still follows this table manually; it remains the single source of truth.

## Query Boundary

- The `supabase-js`/no-Prisma, Zod-validation, no-raw-`error.message`, and
  multi-item-atomic-write-via-RPC constraints are owned by
  `docs/agent/rules/engineering.md` → Core Constraints (`MIRROR:constraints`).
- Import boundaries (barrel / client / middleware) are owned by
  `docs/agent/rules/engineering.md` → Import Boundaries.

## Server Actions

- Treat blocked writes carefully: RLS may return `{ data: null, error: null }`.
- Build the multi-item atomic RPC rather than issuing multiple independent client writes.

## Migration Policy

- Write the SQL migration file before applying it.
- Agents MAY apply migrations directly on an approved dev/test Supabase server for verification. With no persistent dev/test project, spin up a Preview Branch (§Preview Branches (D047) below) for this.
- Before applying to any non-prod ref, verify the target against the Environment Registry above and confirm it is not production.
- NEVER apply migrations directly to production.
- Production flow is migration-type aware. For additive migrations that dependent
  app code will call or read (new RPC, column, or RETURNS field), get production
  applied before the dependent code is merged/deployed; split a DB-first PR when
  one PR would otherwise ship code before the owner can apply the migration.
- After the migration is applied to the schema used for generated types, run `corepack pnpm db:types`.
- After SQL migrations and generated types are final, refresh CodeGraph per
  `AGENTS.md` → CodeGraph before closing the DB task.
- Clean up data that would violate a new CHECK constraint BEFORE adding it: `ALTER TABLE ADD CONSTRAINT` fails on dirty data and aborts every later statement in the same migration.

### Owner-Delegated Production Apply

This is the registry's "unless the owner explicitly delegates it in the current
session" exception. Use it ONLY when the owner authorizes a prod write this
session; never as a default. The mechanics that work in practice:

- Apply through the org-scoped Supabase MCP server's `apply_migration` with
  `project_id = iexwsuaqqenyjiskawoj`. The repo-scoped `mcp__supabase__*` server
  has its migration/deploy tools (`apply_migration`, `deploy_edge_function`,
  pause/restore) deny-listed in `.claude/settings.json`, while `execute_sql`
  and branch operations are gated only by the `guard-prod-db.mjs` hook — the
  server itself is NOT read-only (see the Environment Registry); the org-scoped
  server is gated ONLY by the same hook.
- Disabling the hook by editing `.claude/settings.json` is unreliable — a watcher
  restores it mid-session. The working path is a temporary early `process.exit(0)`
  at the top of `scripts/guard-prod-db.mjs` (the hook re-reads that file on every
  call). Restore it byte-for-byte immediately after and confirm `git diff` on both
  the script and settings is empty.
- `execute_sql` with SELECT is allowed on the protected ref. Run precondition
  checks first (object/column/constraint existence, function dependencies,
  dirty-data counts), apply files in timestamp order, then verify the ledger and
  row counts after each apply.
- Finish with `corepack pnpm db:types`, run `get_advisors` (security) to confirm no new
  RLS/search_path findings, and commit the migration files plus regenerated types.
- DEPLOY COUPLING — sequence by migration type. A **destructive** migration
  (DROP COLUMN, narrowing a RETURNS, rename) breaks the *currently-deployed* app
  if its code still reads the old shape, so deploy the code that stops reading it
  FIRST, then apply. **Additive** migrations (new column/RPC, new RETURNS field)
  must be applied before code that uses them reaches production; if SQL and code
  sit in one PR, hold deployment until the owner confirms the prod apply or split
  a DB-first PR. The prod Vercel project `comtammatu-web` auto-deploys production
  from `main`, but the owner's primary usage is local dev pointed at prod DB and
  unpushed local commits are NOT deployed — so an applied destructive migration
  can leave the dormant Vercel deploy broken-in-waiting until the code is pushed
  to `main` (see
  decisions.md D031/D033, 2026-06-16).
- `apply_migration` stamps the ledger `version` with the apply time, not the file
  timestamp, so `schema_migrations.version` does not match the file name. The
  baseline (`00000000000000_baseline.sql`) plus the active forward chain is the
  source of truth for provisioning a fresh environment (see
  `supabase/migrations/README.md`); the prod ledger only records what ran,
  keyed by `name`. NEVER run file-based `supabase db push` / branch-replay
  against prod — it keys on `version`, will not find the file timestamp, and
  will try to re-apply. A full ledger re-baseline is owner-gated (ADR 0006);
  apply via `apply_migration` only.

### Preview Branches (D047)

`create_branch` and `delete_branch` (org-scoped Supabase MCP) are ALLOWED by the
`guard-prod-db.mjs` hook — preview/dev branches are children of prod and do not
mutate it. The agent may spawn a branch (cost ~$0.0134/branch/hour), apply
migrations to the branch's own `project_ref` (non-protected → guard-allowed),
validate, then delete it. `merge_branch`/`reset_branch`/`rebase_branch` stay
blocked (merging a branch into prod is a prod write). See
`docs/runbooks/db/preview-branch-setup.md`.

## DB Type Boundaries

- Money: `NUMERIC(15,2)`
- Time: `TIMESTAMPTZ`
- Primary keys: `BIGINT GENERATED ALWAYS AS IDENTITY`
- Text: `TEXT`, not `VARCHAR`

## RLS And Grants

- New tables need explicit `GRANT ... TO authenticated`.
- UNIQUE constraints must include tenant scope: `UNIQUE(field, tenant_id)`, not `UNIQUE(field)`.
- RLS permissive policies combine with OR. Avoid accidentally widening access with separate permissive policies.
- When writing self-scope plus admin-scope policies, gate admin-scope policies behind the correct permission check.
- When locking a table to RPC-only, `REVOKE INSERT, UPDATE, DELETE` — all three, not just UPDATE. Leftover INSERT/DELETE grants are bypass paths that orphan related rows (e.g. `auth.users` without `profiles` breaks the JWT hook).
- A role's scope (tenant-wide vs branch-scoped) must agree across the role table, its RLS policies, and docs/spec. A mismatch (e.g. `office` tenant-wide in the role table but branch-scoped in a SELECT policy) silently narrows or widens access.

## Auth And ACL

- Auth hook MUST be `SECURITY DEFINER`, or JWT custom claims may silently fail.
- JWT claims are expected to include:

```ts
{
  tenant_id: number,
  branch_id: number | null,
  user_role: AccessBucket, // compatibility claim derived from positions.code
  access_bucket: AccessBucket,
  position?: string       // canonical — positions.code; claim ABSENT when the user has no profile/active position row (bucket mappers fall back to "unassigned")
}
```

- ACL single source: `packages/shared/src/auth/module-acl.ts`.
- Do not create a second auth policy layer in UI helpers.
- Position codes are canonical English `lower_snake_case` only. NEVER add
  aliases or new codes without updating BOTH `POSITION_CODE_TO_STAFF_ROLE`
  (`packages/shared/src/auth/types.ts`) and its SQL twin
  `private.staff_role_from_position_code` in the same PR — the mapper is
  fail-closed (unknown code ⇒ NULL bucket ⇒ auth hook RAISEs ⇒ login blocked).
  `waiter` is legacy-only and maps to `cashier`; do not add it to active UI,
  route ACL, templates, or new seed data.
- `notifications.target_roles` carries access BUCKETS (RLS compares
  `auth_role()`), never position codes.

## Known Failure Patterns

- RLS can return no data and no error on blocked writes.
- Zod 4 uses `{ error: }`, not `{ message: }`; use `z.email()`, not `.email()`.
- PL/pgSQL `IF record IS NOT NULL` is true only when every column is non-null. Check a guaranteed non-null column or use `FOUND`.
- PostgREST resource embedding (`select=...,other(col)`) generates a join. If BOTH the base table and the embedded table have an RLS policy referencing a bare `branch_id` (e.g. `has_permission(branch_id, …)`), the generated query fails with `42702 column reference "branch_id" is ambiguous` and the whole SELECT errors. Qualifying the policy (`has_permission(tax_invoices.branch_id, …)`) does NOT fix it — Postgres canonicalizes the table-qualified ref back to bare `branch_id` when storing the policy. Fix at the query layer: drop the embed and fetch the related column in a second query (see `fetchTaxInvoicesPage`). Server Actions swallow the Supabase `error` into a generic message, so the only symptom is a silently empty list — surface `error` while debugging.

Also read `tasks/regressions.md` before database/auth work.
