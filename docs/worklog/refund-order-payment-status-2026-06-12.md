# Refund RPC vs orders payment_status CHECK - 2026-06-12

Scope: fix the latent CHECK violation in `reverse_payment_and_post`. Deliverables:
forward migration `20260612120000_refund_keep_order_payment_status.sql` + SQL test
`supabase/tests/refund_reverse_payment_flow_test.sql`. Migration travels
file → PR → owner applies manually (no dev/test DB exists; nothing applied by the
agent).

Skill plan: repo rules = engineering + database + workflow + skills +
`tasks/regressions.md` (refund/revenue rows); external skills = supabase +
supabase-postgres-best-practices (schema/RPC guidance); runtime tools = local
source inspection only; skipped = Supabase MCP writes (Environment Registry:
prod is SELECT-only, no dev target exists).

## Bug

`reverse_payment_and_post` (refund approval, SECURITY DEFINER) executes
`UPDATE public.orders SET payment_status = 'refunded'`, but
`orders_payment_status_check` allows only `unpaid/pending/paid`. `refunds` on
prod has 0 rows, so the first real refund approval would raise a CHECK
violation and roll back the whole approval (GL reversal + payments flip +
refund approval + audit). `payments_status_check` already includes
`'refunded'`.

## T3 Synthesis

PM:

- Ship option (b1): remove the orders UPDATE; do not widen the CHECK; no new
  column. Order-level refund visibility (badge/column) is out of MVP — the
  refunds admin surface already lists refunds; build a badge only when the
  owner asks, derived from a refunds join, not a flat column.
- Done = migration redefines only this RPC, CHECK untouched, SQL test covers
  the flow end-to-end, no TS/UI diff, gates green.

BA:

- Partial + multiple refunds per payment are supported (`create_refund` caps
  SUM(pending+approved) ≤ payment.amount), so an order-level `'refunded'`
  label has no honest value for partial refunds.
- Canonical revenue filter (regression REVENUE-BUCKET-BY-PAID-AT-LOCAL-TZ)
  already excludes refunded money via `p.status = 'completed'` and counts it
  separately as the voided KPI via `p.status = 'refunded'`. Option (a) would
  additionally drop the order from ~25 orders-only readers (session report,
  expected_cash, HĐĐT eligibility, POS guards) — retroactive report mutation
  and a guard regression (edit/discount unlock on refunded orders).
- POS lists: archived = `payment_status='paid' OR status='cancelled'`; under
  option (a) a refunded order vanishes from both archived and active lists.
- End state after approval (both full and partial): orders stay
  `paid/completed`; payments → `refunded`; refunds → `approved`; GL holds the
  reversal.

Senior Dev:

- Prod's `pg_proc` holds the `20260611001000` text, so the fix is a full
  `CREATE OR REPLACE` of that body minus the orders UPDATE. The orders
  `SELECT ... FOR UPDATE` lock is kept for serialization against concurrent
  payment/cancel flows.
- Return JSON drops `order_new_status` (the TS caller
  `apps/web/app/(protected)/orders/refund-actions.ts` reads only
  `status`/`refund_id`). Generated types unaffected (`payment_status` is plain
  `string`). Vietnamese inline comments in the copied body replaced with
  English per repo comment rules.
- Blast radius verified clean: the two SET lines (baseline + 20260611001000)
  are the only writers of `'refunded'` into orders; no code reads
  `orders.payment_status = 'refunded'`.

QA:

- Data-driven testing under psql is feasible:
  `set_config('request.jwt.claims', '{"sub":..., "app_metadata":{"tenant_id":...}}')`
  satisfies `auth.uid()`/`auth_tenant_id()`/`log_audit`; a tenant-wide
  `staff_permissions` row satisfies `has_permission(branch,
  'orders:refund_approve')`; `chart_of_accounts` 5111/1111/1121 seeded
  in-transaction if missing.
- Test cases: T1 full refund end-to-end (approved, payments flipped, order
  stays paid, balanced 2-line posted journal, audit row, zero stock restore
  for NULL `stock_consumed_status`); T2 partial refund (reversal = refund
  amount only); T3 negative (CHECK still rejects `'refunded'`, SQLSTATE
  23514); T4 idempotent re-approval (no duplicate journal); T5 contract
  (functiondef has no orders UPDATE, keeps payments flip + strict stock
  guard; constraint def has no `refunded`).

Conflicts resolved:

- Return JSON `order_new_status`: keep-as-`'paid'` (QA) vs drop (Dev/BA) →
  dropped; the only caller ignores it and the RPC no longer changes order
  state.
- Test style: structural-only (Dev) vs data-driven end-to-end (QA) → both;
  the task requires end-to-end coverage and QA proved the auth gates are
  satisfiable in-transaction.

## Out of scope (recorded debt)

- Partial-refund quirk: approving a partial refund flips the whole
  `payments.status` to `'refunded'`, which blocks a second refund on the
  remainder (`create_refund` requires `completed`) and makes
  `get_revenue_kpis.voided_amount` (SUM of `p.amount`) overstate partial
  refunds. Pre-existing; needs its own T3 slice.
- Dead branch `order_payment_status === "refunded"` in
  `apps/web/app/(protected)/finance/reconciliation/reconciliation-client.tsx`
  (value was never producible; permanently dead after this fix).

## Verification

- `pnpm typecheck && pnpm lint && pnpm build` (SQL-only change; run for CI
  parity).
- 2026-06-13: owner delegated the prod apply in-session. Migration applied to
  `iexwsuaqqenyjiskawoj` atomically with its ledger row (ledger tip =
  `20260612120000:refund_keep_order_payment_status`). The prod-DB guard was
  disabled for the apply window and restored byte-identical afterwards
  (`pnpm lint:guard-sync` green).
- Full test file executed on prod inside BEGIN…ROLLBACK: all 5 cases passed
  (full refund end-to-end, partial refund, CHECK negative, idempotent
  re-approval, function/constraint contract). Post-checks: function no longer
  writes orders and drops `order_new_status`; `refunds` still 0 rows; zero
  test residue.
- `pnpm db:types` rerun: no diff (function signature unchanged).
