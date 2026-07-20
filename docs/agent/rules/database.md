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

`Do not touch` prohibits both reads and writes through CLI, SQL, HTTP, and
project-scoped MCP tools; it is not the guarded-read policy used for comtammatu
Production.

- **No persistent non-production Cloud target is registered.** Do not infer a
  replacement from a deleted ref, a local env file, or a Preview branch.
  `corepack pnpm db:types` fails closed until the owner records a literal DEV
  ref here and the guard fixtures are updated in the same change. Supabase CLI,
  direct `psql`, and project-scoped MCP calls against non-production are blocked
  until then.
- An on-demand Preview Branch is not a substitute for a registered persistent
  DEV target. A workstation must not substitute Supabase Local Docker for either
  Cloud target. The CI-only E2E harness is the sole isolated Docker exception
  and may write only its ignored `apps/web/.env.test.local` plus the GitHub
  runner's `GITHUB_ENV`; it never writes repository `.env.local` files.
  Preview creation still requires the literal parent binding
  `--project-ref iexwsuaqqenyjiskawoj`, but no Preview ref is trusted for agent
  mutation while no DEV is registered. Stop and report the blocker instead of
  weakening the guard or substituting Local Docker.
- Org-scoped MCP servers and the Supabase CLI are write-capable. This repo has
  no tracked `.mcp.json`; never infer a project binding from one. Codex's direct
  repo MCP URL in `.codex/config.toml` is pinned to comtammatu Production with
  `read_only=true`; the runtime guard and `lint:guard-sync` both verify that
  exact binding before a project-less direct MCP read is accepted. Claude and
  connector-wrapped MCP tools must carry an explicit registered project ref.
- `scripts/guard-prod-db.mjs` enforces this registry through registered adapters
  in `.claude/settings.json` and `.codex/hooks.json`.
  `corepack pnpm lint:guard-sync` verifies the registry, guard, adapters, and
  behavior fixtures. Every Supabase MCP action is routed through the guard;
  unknown future actions fail closed. Unregistered runtimes remain read-only
  around production.
- Guarded Supabase CLI, SQL, and HTTP reads require one literal registered ref;
  stored-link state, env-indirected URLs/refs, unregistered refs, and ambiguous
  target selectors fail closed. Project-scoped CLI reads use a literal
  `--project-ref` or direct registered `--db-url` as supported by that command.
  Production CLI and MCP reads are limited to schema/catalog surfaces; project
  metadata, logs, advisors, API keys, and secrets remain blocked. A future
  registered DEV may use the broader project-read actions required for
  non-production QA.
- Protected HTTP reads must also disable hidden request input: use `curl -q`,
  `wget --no-config`, or HTTPie/xh `--ignore-stdin`. Explicit client config,
  stdin/request bodies, mutating methods, and unresolved Supabase URLs remain
  blocked.
- Guarded `psql` calls must use a direct registered database URL plus `-X` or
  `--no-psqlrc`; startup files, inherited libpq target selectors, host/service
  overrides, env-indirected connections, shell-expanded SQL, and psql variables
  are outside the verified target/query and therefore fail closed.

## Query And Authorization Boundary

- RLS may block a write with `{ data: null, error: null }`; verify the expected
  row/state transition, not only the error field.
- Service-role code intentionally bypasses RLS and must derive tenant, branch,
  role, and target audience from trusted server context, never client input.
- Authorization belongs in RLS or the atomic RPC, not only in UI visibility.

## Migration Policy

- Every migration is T3. Write the migration file before applying it.
- Verify the target ref before every apply. Preview Branch creation is allowed
  only when `supabase/migration-lineage.json` is `aligned` and explicitly enables
  native branching. When lineage or the Cloud target cannot be verified, stop
  and report the blocker; never fall back to Supabase Local Docker on a
  workstation. Preview deletion is allowed only when the hook can prove the
  comtammatu parent; org-scoped branch-id-only tools fail closed. Merge,
  reset, and rebase into production remain production writes.
- Production defaults to file → PR → merge → owner applies. Agent apply requires
  explicit delegation for the exact operation in the current session.
- Delegation never authorizes changing or disabling repo guards. If the guarded
  runtime still blocks the operation, the owner applies outside it or provides a
  scoped approval path.
- Production reads through `execute_sql` are limited to tables, views, catalogs,
  and the guard's small read-only built-in allowlist. Production CLI/MCP reads
  stay within schema/catalog actions. Never invoke an RPC or user-defined
  function through `SELECT`; PostgreSQL functions may be volatile.
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
  hook output must remain aligned. Authorization claims are exactly `tenant_id`,
  `branch_id`, `user_role`, and `position_code`.
- ACL single source: `packages/shared/src/auth/module-acl.ts`. Do not create a
  second authorization layer in UI helpers.
- Position codes are canonical English `lower_snake_case`. Update
  `POSITION_CODE_TO_STAFF_ROLE` and `private.staff_role_from_position_code`
  together; unknown codes fail closed. `waiter` is legacy-only.
- `notifications.target_roles` contains canonical application roles, never HR
  position codes.

Read targeted rows from `tasks/regressions.md` before database/auth work.
