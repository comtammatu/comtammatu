-- =============================================================
-- Allow payments.amount = 0 (zero-total comp / staff meals)
--
-- Bug: `payments.amount NUMERIC CHECK (amount > 0)` from
-- 20260406300000_payments.sql contradicts the contract added by
-- 20260430000000_pos_discount.sql §9, which patched
-- `confirm_cash_payment` to allow `cash_received = 0` when
-- `total_amount = 0` (employee meal at 100% discount, đền khách).
--
-- The RPC body still INSERTs / UPDATEs payments with
-- `amount = v_order.total_amount` (= 0 in that case), which the
-- inline CHECK constraint rejects. Symptom: cashier presses
-- "Đã thanh toán" on a 0đ order, server returns generic
-- "Không thể xác nhận thanh toán." (no specific error mapping
-- for `payments_amount_check` in payment-actions.ts), and the
-- order stays unpaid.
--
-- Fix: relax CHECK to `amount >= 0`. Application layer keeps
-- `amount > 0` for VietQR / MoMo via Zod `.positive()` in
-- createPayment (payment-actions.ts:34); only cash comp meals
-- legitimately write amount = 0, in line with regression rule
-- POS-CASH-ZERO-TOTAL-OK (2026-04-26) and audit-row contract:
-- `method='cash', amount=0, status='completed'`.
-- =============================================================

ALTER TABLE public.payments
  DROP CONSTRAINT IF EXISTS payments_amount_check;

ALTER TABLE public.payments
  ADD CONSTRAINT payments_amount_check CHECK (amount >= 0);

COMMENT ON CONSTRAINT payments_amount_check ON public.payments IS
  'Allows amount = 0 for fully-discounted comp / staff meals '
  '(POS-CASH-ZERO-TOTAL-OK). VietQR / MoMo retain amount > 0 at '
  'application layer via Zod .positive() in createPayment.';
