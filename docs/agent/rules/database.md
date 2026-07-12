# Database, Supabase, Auth, And ACL Rules

Use this file before Supabase queries, migrations, RLS, auth, ACL, Server
Actions, RPCs, or generated database types. `engineering.md` owns query/import
constraints; `docs/modules/database.md` and `docs/modules/auth.md` own architecture.

## Environment Registry

Verify the ref before every Supabase MCP, CLI, or SQL call. This registry wins
over older task notes, regressions, and memory.

| Ref                    | What it is                                     | Agent rights                                                                                               |
| ---------------------- | ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `iexwsuaqqenyjiskawoj` | **PRODUCTION** — the only comtammatu database  | Table/view/catalog reads only by default. Writes require explicit owner delegation in the current session. |
| `dyksphedgzqsqjqgxzog` | `matu-platform` production — separate codebase | Do not touch.                                                                                              |

- No persistent dev/test Supabase project exists. Use an on-demand Preview
  Branch for non-production verification.
- Agent-driven migration, schema, RLS, RPC, and write-smoke verification MUST
  target an on-demand Supabase Preview Branch directly. Do not start, reuse, or
  treat Docker-based Supabase Local as the project verification environment.
- `.mcp.json`, org-scoped MCP servers, and the Supabase CLI are write-capable.
  Codex's repo MCP URL is separately pinned `read_only=true`.
- `scripts/guard-prod-db.mjs` enforces this registry through registered adapters
  in `.claude/settings.json` and `.codex/hooks.json`.
  `corepack pnpm lint:guard-sync` verifies the registry, guard, adapters, and
  behavior fixtures. Unregistered runtimes remain read-only around production.

## Query And Authorization Boundary

- RLS may block a write with `{ data: null, error: null }`; verify the expected
  row/state transition, not only the error field.
- Service-role code intentionally bypasses RLS and must derive tenant, branch,
  role, and target audience from trusted server context, never client input.
- Authorization belongs in RLS or the atomic RPC, not only in UI visibility.

## Migration Policy

- Every migration is T3. Write the migration file before applying it.
- Verify the target ref before every apply. Agents may create, use, and delete a
  Preview Branch; merge/reset/rebase into production remain production writes.
- Production defaults to file → PR → merge → owner applies. Agent apply requires
  explicit delegation for the exact operation in the current session.
- Delegation never authorizes changing or disabling repo guards. If the guarded
  runtime still blocks the operation, the owner applies outside it or provides a
  scoped approval path.
- Production reads through `execute_sql` are limited to tables, views, catalogs,
  and the guard's small read-only built-in allowlist. Never invoke an RPC or
  user-defined function through `SELECT`; PostgreSQL functions may be volatile.
- Additive schema must land before dependent runtime code. For destructive
  changes, deploy code that stops reading the old shape before applying the
  migration. Split DB-first/code-first PRs when one deploy cannot preserve both.
- Clean dirty data before adding a constraint that existing rows could violate.
- Never use file-based `supabase db push` or branch replay against production.
  Production migration ledger versions may differ from file timestamps; use the
  owner-approved migration apply path.
- After applying to the type-source schema, run `corepack pnpm db:types`, then
  security advisors and the required verification gates. Refresh CodeGraph after
  final SQL/generated-type changes.

Preview Branch setup: `docs/runbooks/db/preview-branch-setup.md`.

## RLS, Grants, And Tenant Scope

- New tables need explicit grants for intended roles.
- New tenant-owned business keys include tenant scope by default. Exceptions
  such as auth-linked UUIDs, global credential/idempotency hashes, composite
  natural keys, or child keys whose parent fixes tenant scope require an explicit
  reason in the migration review.
- Permissive RLS policies combine with OR. Self-scope plus admin-scope policies
  must gate the admin path with the correct permission.
- RPC-only tables revoke `INSERT`, `UPDATE`, and `DELETE`, not only one verb.
- Tenant-wide versus branch-scoped meaning must agree across role definitions,
  RLS policies, ACL docs, and route behavior.
- `SECURITY DEFINER` functions set a safe `search_path`, authorize explicitly,
  and expose only the required grants.

## Auth And ACL

- The auth hook must be `SECURITY DEFINER` or custom claims may fail silently.
- JWT claim shape is owned by `packages/shared/src/auth/types.ts`; runtime and SQL
  hook output must remain aligned. Current claims include `tenant_id`,
  `branch_id`, `user_role`, `access_bucket`, `position`, and `position_code`.
- ACL single source: `packages/shared/src/auth/module-acl.ts`. Do not create a
  second authorization layer in UI helpers.
- Position codes are canonical English `lower_snake_case`. Update
  `POSITION_CODE_TO_STAFF_ROLE` and `private.staff_role_from_position_code`
  together; unknown codes fail closed. `waiter` is legacy-only.
- `notifications.target_roles` contains access buckets, never position codes.

Read targeted rows from `tasks/regressions.md` before database/auth work.
