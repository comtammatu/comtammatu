# Supabase Authenticated Definer Audit - 2026-06-13

Scope: production project `iexwsuaqqenyjiskawoj`, read-only audit for
`authenticated_security_definer_function_executable` after the first Supabase
advisor hardening wave plus owner-delegated production apply for the first
grant-only cron/report revoke slice.

Skill plan: repo rules = engineering + skills + database + workflow +
`tasks/regressions.md`; external skills = supabase +
supabase-postgres-best-practices; runtime tools = Supabase MCP read-only
catalog queries + local source inspection; skipped = Supabase CLI migration
scaffold because `supabase` is not installed in PATH.

## T3 Synthesis

PM:

- Goal is to reduce the remaining Security Advisor warning without treating all
  signed-in SECURITY DEFINER RPCs as defects.
- Acceptance for this wave is a grant-only migration with a hard cap below the
  `RPC-DROP-MUST-SCAN-6-CHANNELS` blast-radius limit.
- App RPCs used by POS, KDS, Inventory, Finance, HR, Admin, print-agent, and
  permission checks stay callable by `authenticated`.

BA:

- Cron/report automation does not need to be callable from a signed-in browser
  session when `pg_cron` runs the jobs as `postgres`.
- Any function that affects money, invoices, refunds, journals, stock, POS
  order state, permission assignment, or RLS helper predicates stays out of this
  safe wave unless it has a separate business-owner review.
- Manual ad-hoc operations should use owner SQL/service-role routes, not a
  general authenticated RPC grant.

Senior Dev:

- This wave changes only `EXECUTE` grants. It does not drop functions, alter
  function bodies, change RLS predicates, or touch cron schedules.
- Keep `service_role` execution intact so server/cron automation still has an
  escalation route.
- `refresh_finance_views()` is cron-scheduled but also has an app `.rpc()` caller,
  so it is intentionally excluded.

QA/QC:

- Verify each target across six channels before revoke: JS `.rpc()` callers,
  internal SQL calls, trigger execution, RLS policy references, DEFAULT/CHECK
  references, and `pg_cron` schedules.
- Verify production catalog after apply: six target functions should be
  `authenticated=false`, `service_role=true`; `refresh_finance_views()` should
  remain `authenticated=true`.
- Run repo gates because a migration/worklog changed, even though no generated
  database types are needed for grant-only SQL.

## Read-Only Evidence

Checked against production via Supabase MCP read-only SQL and local `rg`.

| Check | Evidence |
| --- | --- |
| Project | `iexwsuaqqenyjiskawoj`, Postgres 17.6.1, healthy. |
| Remaining auth-callable public SECURITY DEFINER functions | 176 total. |
| App `.rpc()` caller split | 102 have app caller names; 74 do not have direct app caller names. |
| Trigger helper residue | 0 authenticated-callable trigger functions remain after wave 1. |
| `pg_stat_user_functions` | `track_functions = none`, so call counts are not reliable telemetry. |
| Cron runtime role | Target cron jobs are active and run with `username = postgres`. |

Six-channel scan for the migration targets:

| Function | JS caller | SQL internal call | Trigger | RLS policy | DEFAULT/CHECK | Cron |
| --- | --- | --- | --- | --- | --- | --- |
| `auto_close_periods()` | none | cron schedule only | none | none | none | `SELECT public.auto_close_periods();` |
| `cleanup_abandoned_payments(interval)` | none | cron schedule only | none | none | none | `SELECT public.cleanup_abandoned_payments()` |
| `compute_branch_daily_waste_caps()` | none | cron schedule plus historical immediate run | none | none | none | `SELECT public.compute_branch_daily_waste_caps();` |
| `refresh_abc_classification()` | none | cron schedule only | none | none | none | `SELECT public.refresh_abc_classification();` |
| `weekly_grn_override_report()` | none | cron schedule only | none | none | none | `SELECT public.weekly_grn_override_report();` |
| `weekly_waste_report()` | none | cron schedule only | none | none | none | `SELECT public.weekly_waste_report();` |

Excluded:

| Function | Reason |
| --- | --- |
| `refresh_finance_views()` | Has app caller in `apps/web/app/(protected)/finance/actions.ts`. |
| `scan_inventory_alerts()` | Already `authenticated=false`, `service_role=true`; no warning to clear. |
| POS/Inventory/Finance/HR/Admin RPCs | Intentional signed-in app RPC surfaces with SQL gates. |
| RLS/auth helpers | Revoking can break policy evaluation or permission checks even when there is no direct page caller. |

## Deliverable

- `supabase/migrations/20260613100000_authenticated_definer_cron_revoke.sql`
  revokes `EXECUTE` from `authenticated` for the six cron/report automation
  functions above and leaves `service_role` untouched.

## Production Apply

Owner authorized production apply in-session.

Applied:

- Migration through Supabase MCP `apply_migration`.
  Production ledger entry appears as
  `20260612193919:20260613100000_authenticated_definer_cron_revoke`.

Verification:

- Target functions now have `authenticated=false`, `service_role=true`:
  `auto_close_periods`, `cleanup_abandoned_payments`,
  `compute_branch_daily_waste_caps`, `refresh_abc_classification`,
  `weekly_grn_override_report`, and `weekly_waste_report`.
- `refresh_finance_views()` remains `authenticated=true`,
  `service_role=true` because Finance has an app `.rpc()` caller.
- Public SECURITY DEFINER callable count moved from `authenticated=176` to
  `authenticated=170`; `anon=0` remains unchanged.
- Security Advisor still reports
  `authenticated_security_definer_function_executable` for the remaining
  signed-in SECURITY DEFINER RPCs plus Auth configuration warnings. That is the
  expected backlog, not a failed wave.

## Future Apply Checklist

Before apply:

1. Confirm no new app caller was added for the six targets.
2. Confirm `cron.job.username = 'postgres'` for the six active jobs.
3. Confirm owner explicitly delegates production apply in-session.

After apply:

1. Query `has_function_privilege('authenticated', oid, 'EXECUTE')` and
   `has_function_privilege('service_role', oid, 'EXECUTE')` for all six targets.
2. Run Security Advisor and verify warning count decreases by six, with
   no new `anon_security_definer_function_executable` warning.
3. Keep `refresh_finance_views()` signed-in callable and smoke Finance refresh
   action if that surface is in use.

## Deferred

- Per-surface audit of the remaining 170 authenticated-callable SECURITY DEFINER
  functions.
- Separate T3 review for money/HĐĐT/refund/journal functions that are not direct
  app callers but mutate regulated financial state.
- A future default-privileges migration can make future function grants opt-in,
  but it should ship only after every new RPC migration pattern has explicit
  `GRANT EXECUTE` statements.
