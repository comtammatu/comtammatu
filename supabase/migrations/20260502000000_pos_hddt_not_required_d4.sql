-- =============================================================
-- POS HĐĐT: D4 conditional on MST
--
-- Owner decision 2026-04-26 (`tasks/owner-decisions-pos-pass-1.md` § D4):
--   HĐĐT chỉ gửi MISA khi khách nhập MST trong invoice form.
--   Không nhập MST → skip MISA call + flag `tax_invoices.status='not_required'`.
--   Áp dụng cho mọi total bao gồm total=0 (comp meal).
--   Logic chính ở action layer (`createTaxInvoice` orchestrator); migration
--   này chỉ mở schema để chứa trạng thái `not_required`.
--
-- Behavior of `not_required`:
--   - Terminal status. Không có transition vào/ra qua
--     `transition_tax_invoice_state` RPC (matrix không liệt kê → mọi attempt
--     raise `illegal_transition`).
--   - Không tham gia unique-active check → khách comp meal sau này quay lại
--     yêu cầu HĐĐT vẫn issue được hoá đơn mới (row mới status='draft' →
--     'issued'); row 'not_required' đứng riêng làm audit trail.
--   - Không chạy provider call → không tốn MISA quota / không phát sinh
--     `tax_invoice_events` transition (insert thẳng).
-- =============================================================

ALTER TABLE public.tax_invoices DROP CONSTRAINT IF EXISTS tax_invoices_status_check;

ALTER TABLE public.tax_invoices
  ADD CONSTRAINT tax_invoices_status_check
  CHECK (status IN (
    'draft', 'signing', 'submitted', 'issued',
    'cancelled', 'replaced',
    'not_required'
  ));

-- Recreate unique active index to also exclude `not_required` from the
-- "active" set — a not_required row should NEVER block a future real
-- invoice issuance for the same order.
DROP INDEX IF EXISTS public.uq_tax_invoices_active_per_order;
CREATE UNIQUE INDEX uq_tax_invoices_active_per_order
  ON public.tax_invoices (order_id)
  WHERE status NOT IN ('cancelled', 'replaced', 'not_required');

COMMENT ON COLUMN public.tax_invoices.status IS
  'draft | signing | submitted | issued = active lifecycle. '
  'cancelled | replaced = terminal void. '
  'not_required = terminal opt-out (cashier confirmed payment without buyer MST '
  'per owner D4 2026-04-26). Terminal: no transitions in/out.';
