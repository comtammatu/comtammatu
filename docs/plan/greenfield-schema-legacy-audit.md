# Greenfield Schema Legacy Audit

Date: 2026-05-27

Target: Supabase `staging` / `jmasiwuqiyedqvyfzhuq`

Status: read-only audit. No schema or data mutation was applied during this
check.

Post-audit hardening update: the non-role-bridge schema hardening and PBAC
cleanup slices are packaged as greenfield-only rehearsal SQL for `staging` /
`jmasiwuqiyedqvyfzhuq`, outside the production migration chain. Bundle path:

```text
supabase/greenfield/migrations/
```

Current bundle:

- `20260602000000_harden_supplier_invoice_source_rls.sql`
- `20260602000100_harden_procurement_source_rls.sql`
- `20260602000200_harden_supplier_return_source_rls.sql`
- `20260602000300_greenfield_schema_hardening.sql`
- `20260602000400_greenfield_internal_table_policy_and_function_path.sql`
- `20260602000500_canonical_position_codes.sql`
- `20260602000600_harden_procurement_catalog_scope.sql`
- `20260602000700_cut_position_role_bridge_runtime.sql`

These files must not be treated as `supabase/migrations/` production-forward
migrations. `pnpm lint:db-boundary` guards this separation.

Verified effects:

- all 6 materialized views are no longer selectable by `anon` or
  `authenticated`;
- all 3 public views have `security_invoker=true`, with `anon` SELECT revoked;
- `kitchen_daily_counters`, `printer_agent_presence_tokens`, and
  `tenant_po_counters` have no client grants and explicit restrictive deny
  policies for `anon`/`authenticated`;
- `inventory-attachments` and `menu-images` SELECT/listing policies are
  tenant-folder scoped for `authenticated`, not broad `public`;
- public schema function execution was reduced from broad defaults to one
  intentional `anon` RPC (`submit_feedback`), the authenticated app RPC
  allowlist, and service-role-only internal functions;
- `feedback_validate_categories(text[])` has `search_path=''`.

This moves the target from restore rehearsal to hardened baseline candidate for
the current runtime, but it is still not a strict no-legacy greenfield baseline
until the role bridge and remaining `auth_role()` dependencies are removed or
explicitly accepted as transitional architecture.

## Verdict

This restored target is a valid **same-stack restore rehearsal**, but it is
**NO-GO for a strict greenfield baseline with no legacy/dead-code carryover**.

The restored schema still contains live compatibility contracts from the current
runtime: `positions.legacy_role_code`, JWT `user_role`, `auth_role()`, role-based
route ACL, some `auth_role()` RLS policies, and old-client compatibility in POS
session close. These are not all dead code. They are active dependencies. That
is exactly why treating this restore as "greenfield done" would be misleading:
it would preserve the old authorization shape inside a new Supabase project.

The security posture also inherited production/live grant debt: broad
`SECURITY DEFINER` execute privileges, materialized views exposed through the
Data API, one security-definer view, broad public storage listing policies, and
RLS-enabled tables with no policies.

## Scope Checked

- Greenfield project health via Supabase project metadata.
- Applied public schema shape and managed surfaces in the greenfield target.
- Public schema marker scan for `legacy`, `deprecated`, `retired`,
  `back-compat`, `shim`, and `dead-code`.
- Function definitions, comments, policies, grants, views, materialized views,
  storage buckets, realtime publication, and cron jobs.
- Baseline dump artifact:
  `.baseline-artifacts/supabase-live-baseline-20260526T152439Z/public.schema.sql`.
- Generated DB types and active source references under `apps`, `packages`, and
  `scripts`.
- Supabase security/performance advisors.

## Schema Snapshot

| Surface                     | Count |
| --------------------------- | ----: |
| Public tables               |   116 |
| Public views                |     3 |
| Public materialized views   |     6 |
| Public functions            |   280 |
| Public RLS policies         |   263 |
| Storage buckets             |     5 |
| Storage policies            |    14 |
| Realtime publication tables |    11 |
| Cron jobs                   |    10 |

Realtime publication tables:
`branch_menu_item_daily_limits`, `kds_tickets`, `kitchen_send_batches`,
`notifications`, `order_status_history`, `orders`, `payments`, `pos_sessions`,
`print_jobs`, `printer_agents`, `tables`.

Cron jobs are active for finance view refresh, inventory stock refresh, GRN
baseline refresh, inventory alerts, payment cleanup, waste/weekly reports, ABC
classification, and fiscal auto-close.

## Findings

### 1. Auth still depends on a legacy role bridge

`positions.legacy_role_code` exists, is `NOT NULL`, has an index
`idx_positions_legacy_role_code`, and its column comment explicitly says it is a
bridge to the old role enum and JWT `user_role` claim.

Confirmed greenfield DB markers:

- `public.positions.legacy_role_code`
- `public.idx_positions_legacy_role_code`
- `public.auth_role()`
- `public.custom_access_token_hook(event jsonb)`
- `public._auth_v2_role_to_position(p_role text)`
- `public._auth_v2_position_id_from_role(p_role text, p_tenant bigint)`

Function-body marker scan found:

| Marker             | Security           | Count |
| ------------------ | ------------------ | ----: |
| `legacy_role_code` | `SECURITY DEFINER` |    21 |
| `legacy_role_code` | invoker            |     2 |
| `auth_role()`      | `SECURITY DEFINER` |    13 |
| `auth_role()`      | invoker            |     1 |

PBAC cleanup removed active app/E2E direct reads of
`positions.legacy_role_code`; staff admin now reads `positions.code` /
`positions.label_vi` and resolves the current authorization role through the
shared position-code mapper.

The remaining role bridge is now concentrated in DB/JWT/RLS/route ACL, not
spread through staff UI data loading.

More importantly, app authorization still uses JWT `user_role` broadly:
`apps/web/proxy.ts` calls `canAccess(claims.user_role, moduleKey)`, and
`packages/shared/src/auth/module-acl.ts` remains the route ACL source.

Impact: this is a live compatibility bridge, not dead code. If the baseline
definition is "no legacy", the next migration must move route ACL/JWT/RLS away
from `legacy_role_code` and `auth_role()` before this project can be accepted as
greenfield.

### 2. `auth_role()` remains in RLS and RPC semantics

Greenfield policies using `auth_role()`:

- 13 total policies
- 7 mutating or `ALL` policies

Examples:

- `branch_menu_item_daily_limits.bmidl_write[ALL]`
- `print_template_versions_{insert,update,delete}`
- `printers_{insert,update,delete}`
- `branch_trusted_egress_ips.btei_select`
- `print_jobs.print_jobs_select`
- `printer_agents.printer_agents_select`

Some of these are documented as intentional current-runtime exceptions, but
they are still role-claim based and inherit the JWT stale-revoke window.

Impact: this is incompatible with a strict greenfield target that wants one
authorization model. Accept it only if the baseline is explicitly "current app
runtime preserved, hardening later."

### 3. POS close-session keeps an old-client compatibility path

`public.close_pos_session(bigint, numeric, text, text)` contains a retained
`p_variance_note` path and the D8 retired-approval note. The active app still
calls this RPC, but the variance approval flow is no longer product behavior.

Impact: this is not dead runtime code, but it is compatibility debt. For a strict
greenfield baseline, either drop the compatibility parameter/columns and update
print/report paths, or explicitly record it as an accepted transition.

### 4. Materialized views are exposed through the Data API

Supabase advisors report all 6 materialized views as selectable by `anon` or
`authenticated`:

- `mv_daily_revenue`
- `mv_food_cost`
- `mv_grn_price_baseline`
- `mv_inventory_stock_current`
- `mv_inventory_value_ranking`
- `mv_top_items`

This conflicts with the schema comment on `mv_inventory_stock_current`, which
says direct access is revoked and wrappers should be used. The greenfield
database says otherwise.

Impact: blocker before cutover. RLS does not apply to materialized views. Revoke
direct API grants and expose only audited wrapper RPCs or security-invoker views
with explicit tenant/branch checks.

### 5. `printer_agent_status` is still a security-definer view

Current public views:

| View                          | `security_invoker` | Data API grants                    |
| ----------------------------- | ------------------ | ---------------------------------- |
| `feedbacks_with_masked_phone` | true               | `anon`, `authenticated` selectable |
| `printer_agent_status`        | false              | `anon`, `authenticated` selectable |
| `v_print_agent_fleet`         | true               | `anon`, `authenticated` selectable |

Supabase advisor flags `public.printer_agent_status` as `security_definer_view`
ERROR.

Impact: blocker before baseline acceptance. Convert to `security_invoker = true`
or replace it with a gated RPC/view contract.

### 6. Broad `SECURITY DEFINER` execute grants were inherited

Public function privilege check:

| Function class               | Total | Executable by `anon` | Executable by `authenticated` |
| ---------------------------- | ----: | -------------------: | ----------------------------: |
| Invoker functions            |    63 |                   63 |                            63 |
| `SECURITY DEFINER` functions |   217 |                  216 |                           216 |

Supabase advisors also flag public and signed-in execution of many
`SECURITY DEFINER` functions, including trigger functions and internal helpers.

Impact: blocker before cutover. The baseline needs an RPC allowlist:

- revoke default `EXECUTE` from `PUBLIC`, `anon`, and `authenticated`;
- grant only app-called RPCs to `authenticated`;
- keep trigger/internal/auth-hook helpers non-callable through PostgREST;
- explicitly document any intentional `anon` RPC.

### 7. RLS-enabled tables with no policies remain

Advisor and direct query agree these tables have RLS enabled with no policies:

- `kitchen_daily_counters`
- `printer_agent_presence_tokens`
- `tenant_po_counters`

All three still have broad table privileges at the grant layer. RLS blocks
normal client row access because no policy exists, but the intent is ambiguous.

Impact: make the posture explicit. If they are service/RPC-only tables, revoke
client grants and document them as internal. If clients need access, add narrow
policies.

### 8. Public storage buckets allow listing

Buckets:

| Bucket                  | Public | Policies |
| ----------------------- | ------ | -------- |
| `feedback-photos`       | false  | 2        |
| `grn-evidence`          | false  | 3        |
| `hddt-archive`          | false  | 1        |
| `inventory-attachments` | true   | 4        |
| `menu-images`           | true   | 4        |

Advisor flags broad SELECT/listing policies on:

- `inventory-attachments` via `inv_attach_read`
- `menu-images` via `menu_images_read`

Impact: object URL access does not require bucket-wide listing. Tighten listing
before accepting the baseline.

### 9. Performance/clarity debt also carried over

The greenfield target still reports many unindexed foreign keys and multiple
permissive policies. Direct policy scan found duplicate permissive policy groups
on tables such as `payroll_entries`, `attendance_records`, `employees`,
`profiles`, `staff_permissions`, and `stock_transfer_items`.

Impact: not always a functional blocker, but a greenfield project is the right
time to reduce inherited policy/index clutter instead of preserving it by
default.

## False Positives / Accepted Context

Not every marker is removable immediately:

- Supabase-managed `storage.owner` comments mention deprecated fields. This is
  managed platform metadata, not repo-owned legacy design.
- `stock_issues.issue_type` comment mentions retired `kitchen_use`, but the
  current CHECK constraint only allows `consumption`, `writeoff`, and `other`.
  The retired value is not active.
- `v_print_agent_fleet` classifies print agents with version `< 0.3.0` as
  `legacy`. That is operational compatibility, not a dead schema object.
- `close_pos_session` compatibility is active because current print/report
  paths still read variance fields.

These should still be cleaned or reworded if the owner wants a zero-marker
baseline, but they are not safe blind drops.

## Acceptance Boundary

Acceptable as of this audit:

- Restore rehearsal for current app runtime.
- Type generation proof against the restored schema.
- Managed-surface install proof for storage policies, realtime, cron, and auth
  hook grants.

Not acceptable yet:

- Calling this a no-legacy greenfield baseline.
- Any data cutover.
- Production migration.
- Owner-facing "greenfield complete" claim.

## Required Cleanup Before Strict Greenfield Acceptance

1. Decide whether `legacy_role_code`/JWT `user_role` is allowed as an explicit
   transition. If not, refactor route ACL and RLS/RPC callers to position or
   permission keys, then drop the bridge.
2. Migrate remaining `auth_role()` RLS and RPC usages or document each as an
   accepted temporary exception with an owner-approved removal ticket.
3. Apply an RPC grant hardening migration: revoke broad `EXECUTE`, then grant a
   small allowlist.
4. Fix `printer_agent_status` to security-invoker or replace it with a gated
   RPC.
5. Revoke direct API access to materialized views; expose wrappers only.
6. Revoke client grants from service-only no-policy tables or add narrow RLS.
7. Tighten public storage listing policies.
8. Add targeted FK indexes and consolidate duplicate permissive policies where
   advisors identify real hot paths.

## Next Step

Create a `greenfield_schema_hardening` migration bundle on the greenfield target
only, replay it locally and on `staging`, regenerate DB types, then run:

```bash
pnpm db:types
pnpm lint:baseline
pnpm typecheck
pnpm lint
pnpm build
```

Only after that should the project move from restore rehearsal to baseline
candidate.
