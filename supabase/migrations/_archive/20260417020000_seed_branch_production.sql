-- =============================================================
-- Seed: branch site for comtammatu tenant
-- Ensures Inventory Production has a real branch branch
-- in dev/staging and keeps the migration idempotent.
-- =============================================================

WITH v_tenant AS (
  SELECT id
  FROM public.tenants
  WHERE slug = 'comtammatu'
  LIMIT 1
)
INSERT INTO public.branches (
  tenant_id,
  name,
  address,
  branch_kind,
  is_tenant,
  is_active
)
SELECT
  v_tenant.id,
  'chi nhánh',
  'Ấp Phước Sơn, Xã Đất Đỏ, TP.HCM',
  'branch',
  FALSE,
  TRUE
FROM v_tenant
ON CONFLICT (tenant_id, name) DO UPDATE
SET
  address = EXCLUDED.address,
  branch_kind = 'branch',
  is_tenant = FALSE,
  is_active = TRUE,
  updated_at = now();
