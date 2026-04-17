-- =============================================================
-- Remove mock finished goods + production recipes seeded by
-- 20260414105052_seed_production_finished_goods.sql
--
-- These 3 finished goods (Nước mắm pha sẵn, Sốt mật ong,
-- Trà lài nấu sẵn) were demo data — not real production BOMs.
-- Skip deletion of any finished good that has production_order_items
-- referencing it (FK ON DELETE RESTRICT would fail otherwise).
-- =============================================================

DO $$
DECLARE
  v_tenant  BIGINT;
  v_names   TEXT[] := ARRAY[
    'Nước mắm pha sẵn',
    'Sốt mật ong',
    'Trà lài nấu sẵn'
  ];
BEGIN
  SELECT id INTO v_tenant
  FROM public.tenants
  WHERE slug = 'comtammatu'
  LIMIT 1;

  IF v_tenant IS NULL THEN
    RAISE NOTICE 'Tenant comtammatu not found — skipping cleanup.';
    RETURN;
  END IF;

  -- 1. Delete production recipes tied to the 3 mock finished goods
  DELETE FROM public.production_recipes pr
  USING public.ingredients i
  WHERE pr.tenant_id = v_tenant
    AND pr.finished_good_id = i.id
    AND i.tenant_id = v_tenant
    AND i.name = ANY(v_names)
    AND i.item_kind = 'finished_good';

  -- 2. Delete mock finished goods that are NOT referenced by any
  --    production order item (ON DELETE RESTRICT guard).
  DELETE FROM public.ingredients i
  WHERE i.tenant_id = v_tenant
    AND i.name = ANY(v_names)
    AND i.item_kind = 'finished_good'
    AND NOT EXISTS (
      SELECT 1 FROM public.production_order_items poi
      WHERE poi.finished_good_id = i.id
    );
END;
$$;
