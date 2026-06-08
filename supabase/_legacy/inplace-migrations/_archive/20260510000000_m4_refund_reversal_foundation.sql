-- =============================================================
-- M4 P0-1 / P0-5 foundation — refund reversal storage + permission key
--
-- This migration is ADDITIVE only — no RPC body rewrites yet. Subsequent
-- migrations in this series will add the `reverse_payment_and_post` and
-- `restore_stock_for_order` RPCs on top of the storage primitives added
-- here. Sized for one focused review.
--
-- What lands here:
--   1. `refunds.approved_at TIMESTAMPTZ` — populated by the upcoming
--      reversal RPC; nullable until that lands.
--   2. `payments.stock_consumed_status TEXT` — replaces the boolean
--      return-only signal with a queryable column. Nullable until the
--      payment-recompute migration (next slot) backfills + adds the CHECK.
--   3. `permission_keys` row `orders:refund_approve` — a NEW key distinct
--      from the existing `orders:refund` (which gates *creation* of refund
--      requests). Approval requires escalation; manager+ only.
--   4. Seed `orders:refund_approve` into the `owner` and `super_manager`
--      role templates. Idempotent via DISTINCT unnest.
--
-- Refs: tasks/regressions.md REFUND-MUST-* and STOCK-CONSUME-MUST-CHECK-RESULT.
-- =============================================================

-- ─── 1. refunds.approved_at column ────────────────────────────────────────

ALTER TABLE public.refunds
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;

COMMENT ON COLUMN public.refunds.approved_at IS
  'M4 P0-1: timestamp set by reverse_payment_and_post RPC when the refund is approved. NULL while pending or rejected. Distinct from updated_at so the approval moment is auditable independent of later edits.';


-- ─── 2. payments.stock_consumed_status column ────────────────────────────
-- Nullable for now. The payment-recompute migration will backfill historical
-- rows (default 'ok' for completed payments) and add a CHECK constraint
-- enforcing the enum. Adding the column here lets the upcoming RPC writes
-- target a column that already exists, so the rewrite migration is purely
-- behavioral.

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS stock_consumed_status TEXT;

COMMENT ON COLUMN public.payments.stock_consumed_status IS
  'M4 P0-3: replaces the boolean stock_consumed return value with a queryable status enum. Values: ok | out_of_stock | recipe_missing | internal_error. Backfill + CHECK constraint added by the upcoming payment_recompute_total migration. NULL means historical row written before the column existed.';


-- ─── 3. New permission key: orders:refund_approve ────────────────────────

INSERT INTO public.permission_keys (key, module, description, scope) VALUES
  ('orders:refund_approve', 'orders', 'Phê duyệt yêu cầu hoàn tiền (giải phóng GL + tồn kho)', 'branch')
ON CONFLICT (key) DO NOTHING;


-- ─── 4. Seed into owner + super_manager role templates ───────────────────
-- Idempotent: re-running the migration leaves arrays untouched because of
-- the DISTINCT unnest pattern (same idiom used by D000 backfill scripts).

UPDATE public.role_templates
   SET permission_keys = ARRAY(
     SELECT DISTINCT k
     FROM unnest(permission_keys || ARRAY['orders:refund_approve']::TEXT[]) AS k
   ),
       updated_at = now()
 WHERE name IN ('owner', 'super_manager');
