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
| `iexwsuaqqenyjiskawoj` | **PRODUCTION** — the only comtammatu database; `.env.local` points here       | SELECT-only. NEVER apply migrations or write unless the owner explicitly delegates it in the current session. |
| `dyksphedgzqsqjqgxzog` | `matu-platform` production — a separate codebase used as design reference only | Do not touch.                                                                                                  |

- There is currently NO dev/test Supabase project (the former dev ref
  `qsjjqjvtvuqveqmdiyxl` disappeared around 2026-06-10). Until the owner
  provides a new one, the dev-apply allowance below is unsatisfiable: every
  migration goes file → PR → owner applies.
- Historical notes may label `iexwsuaqqenyjiskawoj` as "dev"
  (e.g. `tasks/regressions.md` MCP-APPLY-VS-CLI-PUSH, written 2026-04-24 when it
  was). Those labels are stale history.
- The repo-scoped MCP server in `.mcp.json` points at production with
  `read_only=true`. Org-scoped MCP servers and the Supabase CLI are NOT
  read-only — re-check the ref before any write-capable call.
- Machine enforcement: `scripts/guard-prod-db.mjs` is the single PreToolUse
  guard (blocks write SQL / mutating CLI / write-capable MCP calls against the
  protected refs above). Per-runtime wiring runs that one script:
  `.claude/settings.json` (Claude Code, plus its permission deny list) and
  `.codex/hooks.json` (Codex; project-local hooks load only after the project
  is trusted in that Codex session). The hook's ref list and every adapter's
  matchers must stay in sync with this table; `pnpm lint:guard-sync` (part of
  `pnpm lint`) enforces all of them. A runtime without hook support still
  follows this table manually; it remains the single source of truth.

## Query Boundary

- MUST use `supabase-js` for all queries.
- NEVER use Prisma.
- Server Actions and RSC may import `@comtammatu/database`.
- Client components may import only `@comtammatu/database/supabase/client`.
- Proxy and Edge code must import `@comtammatu/database/supabase/middleware`.

## Server Actions

- MUST validate all Server Action inputs with Zod schemas.
- NEVER return raw Supabase/Postgres `error.message` to clients.
- Treat blocked writes carefully: RLS may return `{ data: null, error: null }`.
- For multi-item atomic writes, create and call a Postgres RPC function instead of issuing multiple independent client writes.

## Migration Policy

- Write the SQL migration file before applying it.
- Agents MAY apply migrations directly on approved dev/test Supabase servers for verification.
- Before applying to dev/test, verify the target ref against the Environment Registry above and confirm it is not production. As of 2026-06-11 no dev/test server exists, so there is nowhere an agent may apply.
- NEVER apply migrations directly to production.
- Production flow: open a PR, merge the PR, then the owner applies the migration manually.
- After the migration is applied to the schema used for generated types, run `pnpm db:types`.
- Clean up data that would violate a new CHECK constraint BEFORE adding it: `ALTER TABLE ADD CONSTRAINT` fails on dirty data and aborts every later statement in the same migration.

### Owner-Delegated Production Apply

This is the registry's "unless the owner explicitly delegates it in the current
session" exception. Use it ONLY when the owner authorizes a prod write this
session; never as a default. The mechanics that work in practice:

- Apply through the org-scoped Supabase MCP server's `apply_migration` with
  `project_id = iexwsuaqqenyjiskawoj`. The repo-scoped `mcp__supabase__*` server
  is read-only and deny-listed; the org-scoped server is gated ONLY by the
  `guard-prod-db.mjs` PreToolUse hook.
- Disabling the hook by editing `.claude/settings.json` is unreliable — a watcher
  restores it mid-session. The working path is a temporary early `process.exit(0)`
  at the top of `scripts/guard-prod-db.mjs` (the hook re-reads that file on every
  call). Restore it byte-for-byte immediately after and confirm `git diff` on both
  the script and settings is empty.
- `execute_sql` with SELECT is allowed on the protected ref. Run precondition
  checks first (object/column/constraint existence, function dependencies,
  dirty-data counts), apply files in timestamp order, then verify the ledger and
  row counts after each apply.
- Finish with `pnpm db:types`, run `get_advisors` (security) to confirm no new
  RLS/search_path findings, and commit the migration files plus regenerated types.
- DEPLOY COUPLING — sequence by migration type. A **destructive** migration
  (DROP COLUMN, narrowing a RETURNS, rename) breaks the *currently-deployed* app
  if its code still reads the old shape, so deploy the code that stops reading it
  FIRST, then apply. **Additive** migrations (new column/RPC, new RETURNS field)
  are safe to apply before the code that uses them deploys. The prod Vercel
  project `comtammatu-web` auto-deploys production from `main`, but the owner's
  primary usage is local dev pointed at prod DB and unpushed local commits are
  NOT deployed — so an applied destructive migration can leave the dormant Vercel
  deploy broken-in-waiting until the code is pushed to `main` (see
  decisions.md D031/D033, 2026-06-16).
- `apply_migration` stamps the ledger `version` with the apply time, not the file
  timestamp, so `schema_migrations.version` does not match the file name (464 ledger
  rows as of 2026-06-15; of the 33 timestamp-named rows, 13 are version-drifted, the
  rest are slug-named). The forward file chain stays the source of truth for
  provisioning a fresh environment; the prod ledger only records what ran, keyed by
  `name`. NEVER run file-based `supabase db push` / branch-replay against prod — it
  keys on `version`, will not find the file timestamp, and will try to re-apply. A
  full ledger re-baseline is owner-gated (see D020); until then apply via
  `apply_migration` only.

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
- Position codes are canonical English ONLY (10 codes) since
  `20260610230000_canonical_position_codes_lean`: owner,
  branch_manager, warehouse_manager, production_manager, head_chef,
  kitchen_helper, chef, cashier, waiter, office. NEVER add aliases or new codes
  without updating BOTH `POSITION_CODE_TO_STAFF_ROLE`
  (`packages/shared/src/auth/types.ts`) and its SQL twin
  `private.staff_role_from_position_code` in the same PR — the mapper is
  fail-closed (unknown code ⇒ NULL bucket ⇒ auth hook RAISEs ⇒ login blocked).
- `notifications.target_roles` carries access BUCKETS (RLS compares
  `auth_role()`), never position codes.

## Known Failure Patterns

- `"use client"` plus `@comtammatu/database` barrel import causes build failures.
- RLS can return no data and no error on blocked writes.
- TypeScript 6 packages using `process.env` need `"types": ["node"]` in tsconfig.
- Zod 4 uses `{ error: }`, not `{ message: }`; use `z.email()`, not `.email()`.
- PL/pgSQL `IF record IS NOT NULL` is true only when every column is non-null. Check a guaranteed non-null column or use `FOUND`.
- PostgREST resource embedding (`select=...,other(col)`) generates a join. If BOTH the base table and the embedded table have an RLS policy referencing a bare `branch_id` (e.g. `has_permission(branch_id, …)`), the generated query fails with `42702 column reference "branch_id" is ambiguous` and the whole SELECT errors. Qualifying the policy (`has_permission(tax_invoices.branch_id, …)`) does NOT fix it — Postgres canonicalizes the table-qualified ref back to bare `branch_id` when storing the policy. Fix at the query layer: drop the embed and fetch the related column in a second query (see `fetchTaxInvoicesPage`). Server Actions swallow the Supabase `error` into a generic message, so the only symptom is a silently empty list — surface `error` while debugging.

Also read `tasks/regressions.md` before database/auth work.
