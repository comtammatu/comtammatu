-- Column-level SELECT lockdown (inventory_monetary_column_hardening) listed
-- supplier_invoices identity/status columns but omitted monetary/VAT fields.
-- Finance cockpit and invoice surfaces select total_amount / paid_amount /
-- credit_applied_amount (and related VAT columns), which then fail with
-- permission denied (42501) for authenticated clients.

GRANT SELECT (
  total_amount,
  paid_amount,
  credit_applied_amount,
  subtotal,
  vat_amount,
  vat_rate,
  vat_breakdown,
  vat_invoice_attachment_path
) ON public.supplier_invoices TO authenticated;
