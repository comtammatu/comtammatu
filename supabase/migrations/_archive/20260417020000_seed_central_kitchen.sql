-- =============================================================
-- Seed: central kitchen site for comtammatu tenant
-- Ensures Inventory Production has a real central_kitchen branch
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
  is_headquarters,
  is_active
)
SELECT
  v_tenant.id,
  'Bếp trung tâm',
  'Ấp Phước Sơn, Xã Đất Đỏ, TP.HCM',
  'central_kitchen',
  FALSE,
  TRUE
FROM v_tenant
ON CONFLICT (tenant_id, name) DO UPDATE
SET
  address = EXCLUDED.address,
  branch_kind = 'central_kitchen',
  is_headquarters = FALSE,
  is_active = TRUE,
  updated_at = now();
