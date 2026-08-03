-- D088 Wave 2: accountant Finance + PO delegable keys and template grants.
-- Narrow allowlist — fail-closed elsewhere. Temporary until ADR 0015.

UPDATE public.permission_keys
SET is_delegable_to_staff = true
WHERE key = ANY (ARRAY[
  'finance:view',
  'finance:expense_create',
  'finance:expense_approve',
  'finance:ap_pay',
  'procurement:po_create',
  'procurement:po_approve',
  'procurement:invoice_create',
  'procurement:invoice_match'
]::text[]);

UPDATE public.role_templates
SET permission_keys = ARRAY[
  'finance:view',
  'finance:expense_create',
  'finance:expense_approve',
  'finance:ap_pay',
  'procurement:read',
  'procurement:po_create',
  'procurement:po_approve',
  'procurement:invoice_create',
  'procurement:invoice_match'
]::text[],
    updated_at = now()
WHERE position_code = 'accountant';

COMMENT ON COLUMN public.permission_keys.is_delegable_to_staff IS
  'Fail-closed PBAC boundary. False means Owner-only even if a staff grant row exists. D088 narrows finance/PO invoice keys for accountant templates (temporary until ADR 0015).';
