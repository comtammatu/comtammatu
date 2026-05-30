-- =============================================================
-- Seed: finished goods + production recipes for central kitchen
-- Opens up Inventory Production UI with realistic sample data
-- for comtammatu tenant without inventing unsupported schema.
-- =============================================================

WITH v_tenant AS (
  SELECT id
  FROM public.tenants
  WHERE slug = 'comtammatu'
  LIMIT 1
),
seed_finished_goods AS (
  SELECT *
  FROM (
    VALUES
      ('Nước mắm pha sẵn', 'Chai', 'Bếp trung tâm', 'ambient', 89000::numeric, 3::numeric, 2::numeric),
      ('Sốt mật ong', 'Chai', 'Bếp trung tâm', 'ambient', 129000::numeric, 2::numeric, 1::numeric),
      ('Trà lài nấu sẵn', 'Lít', 'Bếp trung tâm', 'ambient', 59000::numeric, 5::numeric, 2::numeric)
  ) AS t(name, unit, category, storage_type, unit_cost, min_stock_level, reorder_point)
)
INSERT INTO public.ingredients (
  tenant_id,
  name,
  unit,
  category,
  item_kind,
  storage_type,
  unit_cost,
  min_stock_level,
  reorder_point,
  is_active
)
SELECT
  v_tenant.id,
  fg.name,
  fg.unit,
  fg.category,
  'finished_good',
  fg.storage_type,
  fg.unit_cost,
  fg.min_stock_level,
  fg.reorder_point,
  TRUE
FROM v_tenant
CROSS JOIN seed_finished_goods fg
ON CONFLICT (tenant_id, name) DO UPDATE
SET
  unit = EXCLUDED.unit,
  category = EXCLUDED.category,
  item_kind = 'finished_good',
  storage_type = EXCLUDED.storage_type,
  unit_cost = EXCLUDED.unit_cost,
  min_stock_level = EXCLUDED.min_stock_level,
  reorder_point = EXCLUDED.reorder_point,
  is_active = TRUE,
  updated_at = now();

WITH v_tenant AS (
  SELECT id
  FROM public.tenants
  WHERE slug = 'comtammatu'
  LIMIT 1
),
seed_recipes AS (
  SELECT *
  FROM (
    VALUES
      ('Nước mắm pha sẵn', 'Nước mắm Hạnh Phúc 60', 1.000::numeric, 'Chai', 1.000::numeric, 'Mẻ nước mắm pha sẵn cơ bản cho chi nhánh'),
      ('Nước mắm pha sẵn', 'Đường cát trắng', 0.250::numeric, 'kg', 1.000::numeric, 'Cân bằng vị'),
      ('Nước mắm pha sẵn', 'Nước tương Lee Kum Kee', 0.150::numeric, 'Chai', 1.000::numeric, 'Tăng vị đậm'),
      ('Sốt mật ong', 'Mật ong Tây Bắc', 0.600::numeric, 'Chai', 1.000::numeric, 'Nền sốt ngọt cho bếp trung tâm'),
      ('Sốt mật ong', 'Dầu hào Lee Kum Kee', 0.400::numeric, 'Chai', 1.000::numeric, 'Tạo độ dày cho sốt'),
      ('Sốt mật ong', 'Nước tương Lee Kum Kee', 0.250::numeric, 'Chai', 1.000::numeric, 'Cân bằng vị mặn'),
      ('Trà lài nấu sẵn', 'Trà Lài', 1.000::numeric, 'Bịch', 1.000::numeric, 'Cốt trà lài cho chi nhánh'),
      ('Trà lài nấu sẵn', 'Đường cát trắng', 0.400::numeric, 'kg', 1.000::numeric, 'Cân bằng vị'),
      ('Trà lài nấu sẵn', 'Cam', 0.200::numeric, 'kg', 1.000::numeric, 'Tạo vị hương nhẹ')
  ) AS t(finished_good_name, ingredient_name, quantity, unit, yield_factor, note)
),
finished_goods AS (
  SELECT i.id, i.name, i.tenant_id
  FROM public.ingredients i
  JOIN v_tenant ON v_tenant.id = i.tenant_id
  WHERE i.name IN ('Nước mắm pha sẵn', 'Sốt mật ong', 'Trà lài nấu sẵn')
),
raw_ingredients AS (
  SELECT i.id, i.name, i.tenant_id
  FROM public.ingredients i
  JOIN v_tenant ON v_tenant.id = i.tenant_id
  WHERE i.name IN (
    'Nước mắm Hạnh Phúc 60',
    'Đường cát trắng',
    'Nước tương Lee Kum Kee',
    'Mật ong Tây Bắc',
    'Dầu hào Lee Kum Kee',
    'Trà Lài',
    'Cam'
  )
)
INSERT INTO public.production_recipes (
  tenant_id,
  finished_good_id,
  ingredient_id,
  quantity,
  unit,
  yield_factor,
  note
)
SELECT
  v_tenant.id,
  fg.id,
  ri.id,
  sr.quantity,
  sr.unit,
  sr.yield_factor,
  sr.note
FROM v_tenant
JOIN seed_recipes sr ON TRUE
JOIN finished_goods fg ON fg.name = sr.finished_good_name
JOIN raw_ingredients ri ON ri.name = sr.ingredient_name
ON CONFLICT (finished_good_id, ingredient_id, tenant_id) DO UPDATE
SET
  quantity = EXCLUDED.quantity,
  unit = EXCLUDED.unit,
  yield_factor = EXCLUDED.yield_factor,
  note = EXCLUDED.note,
  updated_at = now();
