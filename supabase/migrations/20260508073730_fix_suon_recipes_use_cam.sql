-- =============================================================
-- Fix: BOM "Nước cam" thực ra là cam tươi vắt (sku DD-046, name 'Cam').
-- Swap ingredient_id 292 (Nước cam) → 225 (Cam) trong production_recipes,
-- rồi xoá ingredient 'Nước cam' đã tạo nhầm.
-- 1 Kg Cam = 1000 ml juice (purchase_to_measure_factor=1000) — recipe unit ml giữ nguyên.
-- =============================================================

WITH v_tenant AS (SELECT id FROM public.tenants WHERE slug='comtammatu' LIMIT 1),
v_ids AS (
  SELECT
    (SELECT id FROM public.ingredients WHERE tenant_id=(SELECT id FROM v_tenant) AND sku='DD-046' AND name='Cam' LIMIT 1) AS cam_id,
    (SELECT id FROM public.ingredients WHERE tenant_id=(SELECT id FROM v_tenant) AND name='Nước cam' LIMIT 1) AS nc_id,
    (SELECT id FROM v_tenant) AS tenant_id
)
UPDATE public.production_recipes pr
SET ingredient_id = v.cam_id, updated_at = now()
FROM v_ids v
WHERE pr.tenant_id = v.tenant_id
  AND pr.ingredient_id = v.nc_id
  AND v.cam_id IS NOT NULL
  AND v.nc_id IS NOT NULL;

-- Xoá ingredient 'Nước cam' (mình tạo nhầm). Idempotent — DELETE no-op nếu đã xoá.
DELETE FROM public.ingredients
WHERE tenant_id = (SELECT id FROM public.tenants WHERE slug='comtammatu' LIMIT 1)
  AND name = 'Nước cam';

-- Sanity check: 0 production_recipes còn refer Nước cam, 0 ingredient Nước cam
DO $$
DECLARE
  v_orphan INT;
  v_left   INT;
  v_cam_used INT;
BEGIN
  SELECT COUNT(*) INTO v_left FROM public.ingredients
   WHERE tenant_id=(SELECT id FROM public.tenants WHERE slug='comtammatu') AND name='Nước cam';
  SELECT COUNT(*) INTO v_cam_used FROM public.production_recipes pr
   JOIN public.ingredients i ON i.id = pr.ingredient_id
   JOIN public.ingredients fg ON fg.id = pr.finished_good_id
   WHERE fg.name IN ('Sườn cọng đã ướp','Sườn cốt lết đã ướp')
     AND i.sku='DD-046';

  IF v_left <> 0 THEN RAISE EXCEPTION 'Nước cam still exists: %', v_left; END IF;
  IF v_cam_used <> 2 THEN RAISE EXCEPTION 'Expected 2 Cam refs across 2 finished_goods, got %', v_cam_used; END IF;
END $$;
