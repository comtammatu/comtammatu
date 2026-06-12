# Supabase Advisor Hardening - 2026-06-13

Scope: production project `iexwsuaqqenyjiskawoj`, advisor/catalog audit plus
owner-delegated production apply for the first security hardening wave.

Skill plan: repo rules = engineering + skills + database + workflow +
`tasks/regressions.md`; external skills = supabase +
supabase-postgres-best-practices; runtime tools = Supabase MCP advisor/catalog
queries + owner-delegated production apply path + local source inspection;
skipped = no dev/test apply because no dev/test Supabase project exists.

## T3 Synthesis

PM:

- Goal is to reduce high-signal security advisor warnings without pretending the
  whole legacy advisor backlog is done.
- Acceptance for this slice is a small forward migration for public-schema
  grants/view/RLS posture and a separate owner-capable storage script for public
  bucket listing.
- Performance advisor noise (`unindexed_foreign_keys`, broad RLS policy
  duplication) stays in a later wave ordered by hot paths and lock risk.

BA:

- No product surface requires anonymous public RPC access. POS, Admin, Finance,
  Inventory, Employee, and print-agent flows are authenticated or service-role
  mediated.
- Public Storage object URLs for `menu-images` and `inventory-attachments` do
  not require a broad `storage.objects` SELECT policy; listing should stay
  closed.
- RLS-enabled system tables with no policies should be explicit deny-all for
  client roles, and direct grants on `kitchen_daily_counters` should be removed.

Senior Dev:

- `printer_agent_status` on production lacks `security_invoker=true` even
  though the current baseline already has it; use `ALTER VIEW`, not
  DROP/CREATE.
- Revoke anonymous EXECUTE from SECURITY DEFINER functions while preserving any
  pre-existing authenticated/service-role ability. Trigger helper functions
  should not be directly executable by authenticated clients.
- Storage policy changes belong outside the normal public-schema migration path
  because `storage.objects` may require a storage-owner apply route.

QA/QC:

- Verify with Supabase advisors after owner apply: security-definer view cleared,
  anonymous SECURITY DEFINER callable count cleared, public bucket listing
  cleared after the managed-surface script.
- Re-check POS order create/append, Finance reports, GRN amend, printer
  settings, and manual journal actions because they use SECURITY DEFINER RPCs
  that remain signed-in callable.
- Treat the remaining `authenticated_security_definer_function_executable`
  warnings as a per-RPC audit backlog, not an automatic revoke-all target.

## Read-Only Evidence

Checked against production via Supabase MCP read-only SQL.

| Finding | Production evidence |
| --- | --- |
| Project | `iexwsuaqqenyjiskawoj`, Postgres 17.6, healthy. |
| SECURITY DEFINER functions | 222 in `public`; 24 callable by `anon`; 199 callable by `authenticated`; 23 authenticated-callable trigger helpers. |
| Security-definer view | `public.printer_agent_status` has `reloptions = NULL`; `public.v_print_agent_fleet` already has `security_invoker=true`. |
| Public bucket listing | `inventory-attachments` has `inv_attach_read TO public USING bucket_id = ...`; `menu-images` has `menu_images_read TO public USING bucket_id = ...`. |
| RLS enabled no policy | `kitchen_daily_counters`, `notification_push_deliveries`, `printer_agent_presence_tokens`, `tenant_po_counters`; only `kitchen_daily_counters` still has broad client DML grants. |
| Multiple permissive policies | 54 role/action groups on production, including HR/payroll/profile/staff-permission self-vs-admin policies and legacy `stock_transfer_items` policies. |
| Unindexed FKs | 145 missing covering indexes; top affected tables include `journal_entries`, `print_jobs`, `goods_received_notes`, `staff_permissions`, and `stocktake_*`. |

## Deliverables

- `supabase/migrations/20260613093000_supabase_advisor_security_hardening.sql`
  for public-schema advisor security posture.
- `supabase/managed-surfaces.advisor-hardening.sql` for owner-capable
  `storage.objects` policy cleanup.
- `supabase/managed-surfaces.install.sql` updated so fresh managed-surface
  installs do not recreate broad public listing policies.

## Production Apply

Owner authorized production apply in-session.

Applied:

- Public-schema migration through Supabase MCP `apply_migration`.
  Production ledger entry appears as
  `20260612192344:20260613093000_supabase_advisor_security_hardening`.
- Storage companion through owner-capable SQL path:
  `DROP POLICY IF EXISTS "inv_attach_read"` and
  `DROP POLICY IF EXISTS "menu_images_read"` on `storage.objects`.

Verification:

- `anon` callable SECURITY DEFINER functions: `0`.
- Authenticated-callable SECURITY DEFINER trigger helpers: `0`.
- `public.printer_agent_status` reloptions:
  `["security_invoker=true"]`.
- `inventory-attachments` and `menu-images` have no `storage.objects` SELECT
  policy; public object URL access remains bucket-level public, listing stays
  closed.
- `kitchen_daily_counters`, `notification_push_deliveries`,
  `printer_agent_presence_tokens`, and `tenant_po_counters` all have deny-all
  client policies; none has anon/authenticated DML grants.
- Spot-checked app RPC grants: `amend_grn_line`, `append_order_items`,
  `append_order_items_with_daily_limit_hold`, `create_manual_journal_entry`,
  `create_order_with_daily_limit_hold`, `get_orders_for_day`,
  `set_pos_order_priority`, `set_pos_order_item_priority`,
  `transfer_order_table`, and `upsert_printer_with_routes` are no longer
  callable by `anon` and remain callable by `authenticated` and `service_role`.
- Supabase Security Advisor no longer reports the handled categories:
  `security_definer_view`, `public_bucket_allows_listing`,
  `anon_security_definer_function_executable`, or `rls_enabled_no_policy`.
  Remaining warnings are `authenticated_security_definer_function_executable`
  plus Auth configuration warnings.

## Deferred

- Merge/split the 54 multiple-permissive policy groups only after comparing
  effective predicates table by table. Some are true bugs, some are intended
  self-vs-admin access.
- Add FK indexes by hot-path waves. Do not create 145 indexes in one production
  migration.
- Review authenticated-callable SECURITY DEFINER RPCs by surface. Many are
  intentional app RPCs and must keep signed-in execute grants with SQL gates.
