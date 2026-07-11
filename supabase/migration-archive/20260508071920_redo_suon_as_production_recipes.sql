-- =============================================================
-- Redo: BOM Sườn cọng + Sườn Cốt Lết là PRODUCTION recipe (chi nhánh),
-- không phải menu recipe. Migration này:
--   1. Rollback dữ liệu sai trong public.recipes + menu_items 'Sườn cọng'
--   2. Tạo 2 finished_good ingredients ('Sườn cọng đã ướp', 'Sườn cốt lết đã ướp')
--   3. Insert production_recipes (output 1 kg → 21 raw lines mỗi món)
--
-- Owner sẽ tự config recipes (menu→finished_good) sau, ví dụ 1 đĩa = 0.1 kg.
-- =============================================================

-- ─── 1) Rollback recipes sai ───
WITH v_tenant AS (SELECT id FROM public.tenants WHERE slug = 'comtammatu' LIMIT 1)
DELETE FROM public.recipes r
USING public.menu_items mi, v_tenant t
WHERE r.menu_item_id = mi.id
  AND mi.tenant_id = t.id
  AND r.tenant_id  = t.id
  AND mi.name IN ('Sườn cọng', 'Sườn Cốt Lết');

-- ─── 1b) Rollback menu_item 'Sườn cọng' (mình tự tạo, không phải món bán) ───
WITH v_tenant AS (SELECT id FROM public.tenants WHERE slug = 'comtammatu' LIMIT 1)
DELETE FROM public.menu_items mi
USING v_tenant t
WHERE mi.tenant_id = t.id
  AND mi.name = 'Sườn cọng';

-- ─── 2) Tạo finished_good ingredients ───
WITH v_tenant AS (SELECT id FROM public.tenants WHERE slug = 'comtammatu' LIMIT 1)
INSERT INTO public.ingredients (
  tenant_id, name, unit, category, storage_type, is_active,
  purchase_unit, measure_unit, purchase_to_measure_factor, item_kind
)
SELECT t.id, fg.name, 'kg', 'chi nhánh', 'refrigerated', TRUE,
       'kg', 'kg', 1, 'finished_good'
FROM v_tenant t
CROSS JOIN (VALUES
  ('Sườn cọng đã ướp'::text),
  ('Sườn cốt lết đã ướp'::text)
) AS fg(name)
ON CONFLICT (name, tenant_id) DO UPDATE
SET item_kind   = 'finished_good',
    unit        = EXCLUDED.unit,
    category    = EXCLUDED.category,
    storage_type= EXCLUDED.storage_type,
    is_active   = TRUE,
    updated_at  = now();

-- ─── 3) production_recipes: Sườn cọng đã ướp (output 1 kg) ───
WITH v_tenant AS (SELECT id FROM public.tenants WHERE slug = 'comtammatu' LIMIT 1),
v_fg AS (
  SELECT i.id, i.tenant_id
  FROM public.ingredients i
  JOIN v_tenant t ON i.tenant_id = t.id
  WHERE i.name = 'Sườn cọng đã ướp' AND i.item_kind = 'finished_good'
  LIMIT 1
),
seed_lines AS (
  SELECT *
  FROM (VALUES
    ('Thịt sườn cọng'::text,         1::numeric,    'kg'::text,  NULL::text),
    ('Sữa đặc Tài Lộc'::text,        50::numeric,   'g'::text,   NULL::text),
    ('Mật ong Tây Bắc'::text,        50::numeric,   'g'::text,   NULL::text),
    ('Tương ớt Cholimex'::text,      25::numeric,   'g'::text,   NULL::text),
    ('Nước cam'::text,               25::numeric,   'ml'::text,  NULL::text),
    ('Nước tương Lee kum kee'::text, 37.5::numeric, 'ml'::text,  NULL::text),
    ('Dầu hào Lee Kum Kee'::text,    25::numeric,   'g'::text,   'BOM g; ingredient base ml'::text),
    ('Nước mắm Hạnh Phúc 60'::text,  12.5::numeric, 'ml'::text,  NULL::text),
    ('Rượu Soju'::text,              15::numeric,   'ml'::text,  NULL::text),
    ('Coca cola'::text,              125::numeric,  'ml'::text,  NULL::text),
    ('Đường cát vàng Mỹ Tho'::text,  65::numeric,   'g'::text,   'Ướp 25g + nước kho 40g'::text),
    ('Hạt nêm Meizan'::text,         15.5::numeric, 'g'::text,   NULL::text),
    ('Bột ngọt Ajinomoto'::text,     12.5::numeric, 'g'::text,   NULL::text),
    ('Baking soda'::text,            3::numeric,    'g'::text,   NULL::text),
    ('Tiêu'::text,                   3::numeric,    'g'::text,   'BOM "Tiêu xay"'::text),
    ('Bột năng'::text,               12.5::numeric, 'g'::text,   NULL::text),
    ('Hành tím'::text,               40::numeric,   'g'::text,   NULL::text),
    ('Sả'::text,                     15::numeric,   'g'::text,   NULL::text),
    ('Nước lọc'::text,               200::numeric,  'ml'::text,  NULL::text),
    ('Dầu ăn Tường An'::text,        10::numeric,   'ml'::text,  NULL::text),
    ('Dầu điều VN food'::text,       20::numeric,   'ml'::text,  NULL::text)
  ) AS t(ingredient_name, quantity, unit, note)
)
INSERT INTO public.production_recipes (
  tenant_id, finished_good_id, ingredient_id, quantity, unit, note, yield_factor
)
SELECT v_fg.tenant_id, v_fg.id, ing.id, sl.quantity, sl.unit, sl.note, 1.000
FROM v_fg
JOIN seed_lines sl ON TRUE
JOIN public.ingredients ing
  ON ing.tenant_id = v_fg.tenant_id
 AND ing.name = sl.ingredient_name
ON CONFLICT (finished_good_id, ingredient_id, tenant_id) DO UPDATE
SET quantity     = EXCLUDED.quantity,
    unit         = EXCLUDED.unit,
    note         = EXCLUDED.note,
    yield_factor = EXCLUDED.yield_factor,
    updated_at   = now();

-- ─── 4) production_recipes: Sườn cốt lết đã ướp (output 1 kg) ───
WITH v_tenant AS (SELECT id FROM public.tenants WHERE slug = 'comtammatu' LIMIT 1),
v_fg AS (
  SELECT i.id, i.tenant_id
  FROM public.ingredients i
  JOIN v_tenant t ON i.tenant_id = t.id
  WHERE i.name = 'Sườn cốt lết đã ướp' AND i.item_kind = 'finished_good'
  LIMIT 1
),
seed_lines AS (
  SELECT *
  FROM (VALUES
    ('Sườn cốt lết'::text,           1::numeric,    'kg'::text,  NULL::text),
    ('Sữa đặc Tài Lộc'::text,        40::numeric,   'g'::text,   NULL::text),
    ('Mật ong Tây Bắc'::text,        40::numeric,   'g'::text,   NULL::text),
    ('Tương ớt Cholimex'::text,      20::numeric,   'g'::text,   NULL::text),
    ('Nước cam'::text,               20::numeric,   'ml'::text,  NULL::text),
    ('Nước tương Lee kum kee'::text, 30::numeric,   'ml'::text,  NULL::text),
    ('Dầu hào Lee Kum Kee'::text,    20::numeric,   'g'::text,   'BOM g; ingredient base ml'::text),
    ('Nước mắm Hạnh Phúc 60'::text,  10::numeric,   'ml'::text,  NULL::text),
    ('Rượu Soju'::text,              12::numeric,   'ml'::text,  NULL::text),
    ('Coca cola'::text,              100::numeric,  'ml'::text,  NULL::text),
    ('Đường cát vàng Mỹ Tho'::text,  60::numeric,   'g'::text,   'Ướp 20g + nước kho 40g'::text),
    ('Hạt nêm Meizan'::text,         12.4::numeric, 'g'::text,   NULL::text),
    ('Bột ngọt Ajinomoto'::text,     10::numeric,   'g'::text,   NULL::text),
    ('Baking soda'::text,            2.5::numeric,  'g'::text,   NULL::text),
    ('Tiêu'::text,                   2.5::numeric,  'g'::text,   'BOM "Tiêu xay"'::text),
    ('Bột năng'::text,               10::numeric,   'g'::text,   NULL::text),
    ('Hành tím'::text,               40::numeric,   'g'::text,   NULL::text),
    ('Sả'::text,                     15::numeric,   'g'::text,   NULL::text),
    ('Nước lọc'::text,               200::numeric,  'ml'::text,  NULL::text),
    ('Dầu ăn Tường An'::text,        10::numeric,   'ml'::text,  NULL::text),
    ('Dầu điều VN food'::text,       20::numeric,   'ml'::text,  NULL::text)
  ) AS t(ingredient_name, quantity, unit, note)
)
INSERT INTO public.production_recipes (
  tenant_id, finished_good_id, ingredient_id, quantity, unit, note, yield_factor
)
SELECT v_fg.tenant_id, v_fg.id, ing.id, sl.quantity, sl.unit, sl.note, 1.000
FROM v_fg
JOIN seed_lines sl ON TRUE
JOIN public.ingredients ing
  ON ing.tenant_id = v_fg.tenant_id
 AND ing.name = sl.ingredient_name
ON CONFLICT (finished_good_id, ingredient_id, tenant_id) DO UPDATE
SET quantity     = EXCLUDED.quantity,
    unit         = EXCLUDED.unit,
    note         = EXCLUDED.note,
    yield_factor = EXCLUDED.yield_factor,
    updated_at   = now();

-- ─── 5) Sanity checks ───
DO $$
DECLARE
  v_cong INT;
  v_cl   INT;
  v_recipes_left INT;
BEGIN
  SELECT COUNT(*) INTO v_cong
  FROM public.production_recipes pr
  JOIN public.ingredients i ON i.id = pr.finished_good_id
  WHERE i.name = 'Sườn cọng đã ướp';

  SELECT COUNT(*) INTO v_cl
  FROM public.production_recipes pr
  JOIN public.ingredients i ON i.id = pr.finished_good_id
  WHERE i.name = 'Sườn cốt lết đã ướp';

  SELECT COUNT(*) INTO v_recipes_left
  FROM public.recipes r
  JOIN public.menu_items mi ON mi.id = r.menu_item_id
  WHERE mi.name IN ('Sườn cọng', 'Sườn Cốt Lết');

  IF v_cong <> 21 THEN RAISE EXCEPTION 'Sườn cọng đã ướp expected 21 prod_recipe rows, got %', v_cong; END IF;
  IF v_cl   <> 21 THEN RAISE EXCEPTION 'Sườn cốt lết đã ướp expected 21 prod_recipe rows, got %', v_cl; END IF;
  IF v_recipes_left <> 0 THEN RAISE EXCEPTION 'Rollback failed: % stale recipes rows still present', v_recipes_left; END IF;
END $$;
