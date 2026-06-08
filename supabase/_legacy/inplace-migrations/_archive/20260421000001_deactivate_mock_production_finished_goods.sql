-- =============================================================
-- Soft-deactivate the 3 mock finished goods seeded by
-- 20260414105052_seed_production_finished_goods.sql.
--
-- Hard-delete was blocked by production_order_items FK
-- (ON DELETE RESTRICT) — these 3 finished goods are referenced
-- by real production orders. Instead flip is_active=false so the
-- UI dropdown hides them, while keeping referential integrity.
-- =============================================================

DO $$
DECLARE
  v_tenant BIGINT;
  v_names  TEXT[] := ARRAY[
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
    RAISE NOTICE 'Tenant comtammatu not found — skipping deactivation.';
    RETURN;
  END IF;

  UPDATE public.ingredients
  SET is_active = FALSE,
      updated_at = now()
  WHERE tenant_id = v_tenant
    AND name = ANY(v_names)
    AND item_kind = 'finished_good'
    AND is_active = TRUE;
END;
$$;
