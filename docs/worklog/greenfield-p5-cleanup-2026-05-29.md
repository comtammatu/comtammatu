# Greenfield P5 — dead-RPC + redundant-index cleanup (2026-05-29)

Static analysis on the greenfield target (matu-dev, restored from the live iexw
baseline + P3/P4 cuts). Read-only telemetry from prod iexw.

## ✅ Done — redundant indexes (telemetry-independent)
`supabase/greenfield/migrations/20260602001000_drop_redundant_indexes.sql` drops 2
public indexes that **exactly** duplicate a UNIQUE-constraint index (same columns,
order, opclass) — the constraint index remains, so no query loses an access path:
- `idx_kitchen_send_batches_order` == `kitchen_send_batches_tenant_id_order_id_send_seq_key` (tenant_id, order_id, send_seq)
- `idx_telegram_outbox_feedback` == `telegram_outbox_feedback_id_key` (feedback_id)

After apply: `public_exact_dup_groups = 0`. (The other 2 exact-dup groups are in the
managed `auth` / `storage` schemas — Supabase-owned, left untouched.)

## ⏸ Deferred — unused indexes (telemetry NOT representative)
Prod iexw: 526 public indexes, **403 (77%) `idx_scan=0`**, 231 of them droppable
(non-unique, non-constraint). BUT `pg_stat_database.stats_reset = NULL` (unknown
window) and 77% never-scanned is implausibly high → almost certainly a recent stats
reset/restart. **Do NOT drop on this data.** Re-assess only after a known ≥1 business
cycle (incl. month-end fiscal close: `auto_close_periods`, `weekly_*_report`,
`refresh_abc_classification`). Then drop only indexes with `idx_scan=0` over that
window that are not constraint-backing.

## ⚠ Needs owner sign-off (T3) — 13 dead-RPC candidates
Functions in `public` referenced by NO function body, RLS policy, trigger, cron job,
view, **and** no quoted occurrence in app/packages (multi-line `.rpc()` already
accounted for). NOT dropped here — most are DEFINER on the money/auth/order path, and
the monorepo grep cannot see the Flutter customer app / external clients.

| candidate | note / why verify before drop |
|---|---|
| `handle_new_user` | classic auth trigger fn — currently bound to NO trigger; verify it isn't meant to be (auth-critical) |
| `has_position` | authz helper — confirm not used dynamically |
| `post_payroll_journal` | payroll/finance (money) |
| `release_table` | POS table release |
| `resolve_po_price`, `resolve_po_prices_batch` | procurement pricing |
| `rotate_branch_override_code` | branch override-code rotation (admin) |
| `set_branch_kind` | auth-v3 batch rewrote it; confirm caller fully gone |
| `sync_missing_permissions_from_template` | ..700 rewrote it; confirm no remaining caller |
| `transition_order_status`, `transition_order_item_status` | order state machine — likely superseded by newer POS RPCs; **money/order path** |
| `try_auto_approve_grn` | GRN auto-approve |
| `update_my_profile` | self-service profile update — confirm employee portal doesn't call it (note: portal is in-flight/uncommitted) |

**Method (reproduce):** `pg_proc.prosrc ~ '\m<name>\s*\('` across public/private fn
bodies + `pg_policy` exprs + `cron.job.command` + `pg_get_viewdef` + `pg_trigger`,
anti-joined with repo `["'\`]<name>["'\`]` occurrences. Per Gate-5, each confirmed
drop is its own production-reviewed migration after owner sign-off.
