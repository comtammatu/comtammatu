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
  `.codex/hooks.json` (Codex). The hook's ref list and every adapter's
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

## Auth And ACL

- Auth hook MUST be `SECURITY DEFINER`, or JWT custom claims may silently fail.
- JWT claims are expected to include:

```ts
{
  tenant_id: number,
  branch_id: number | null,
  user_role: AccessBucket, // compatibility claim derived from positions.code
  access_bucket: AccessBucket,
  position: string        // canonical — positions.code, "unassigned" if no row
}
```

- ACL single source: `packages/shared/src/auth/module-acl.ts`.
- Do not create a second auth policy layer in UI helpers.
- Position codes are canonical English ONLY (11 codes) since
  `20260610230000_canonical_position_codes_lean`: owner, super_manager,
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

Also read `tasks/regressions.md` before database/auth work.
