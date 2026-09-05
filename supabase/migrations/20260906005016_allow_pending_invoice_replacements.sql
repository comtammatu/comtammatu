-- Migration: allow_pending_invoice_replacements
DROP INDEX IF EXISTS public.uq_tax_invoices_active_per_order;

CREATE UNIQUE INDEX uq_tax_invoices_active_per_order
  ON public.tax_invoices (order_id)
  WHERE replaced_for IS NULL
    AND status NOT IN ('cancelled', 'replaced', 'not_required');
