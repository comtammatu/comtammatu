-- =============================================================
-- Seed: BOM "Sườn cọng" (1 kg) cho menu item Cơm chính.
-- Idempotent: safe khi chạy lại (UPSERT by name, không tạo trùng).
--
-- Mapping tên BOM ↔ DB hiện có:
--   • Sườn cọng              → ingredients.name = 'Thịt sườn cọng'
--   • Đường cát vàng Mỹ tho  → 'Đường cát vàng Mỹ Tho' (chuẩn hoá hoa)
--   • Nước tương Lee Kum Kee → 'Nước tương Lee kum kee'
--   • Nước mắm Hạnh Phúc     → 'Nước mắm Hạnh Phúc 60' (60°)
--   • Tiêu xay               → 'Tiêu'
--
-- Tạo mới: 'Nước cam', 'Nước lọc'.
-- Tạo mới menu_item 'Sườn cọng' (category 'Cơm', base_price=0 → owner cập nhật sau).
-- 'Đường cát vàng Mỹ Tho' gộp 25g (ướp) + 40g (nước kho) = 65g do UNIQUE(menu_item_id, ingredient_id, tenant_id).
-- =============================================================

-- ─── 1) Tạo ingredient mới (nếu chưa có) ───
-- purchase_unit / measure_unit / purchase_to_measure_factor NOT NULL → set 1:1 cho liquid base ml.
WITH v_tenant AS (
  SELECT id FROM public.tenants WHERE slug = 'comtammatu' LIMIT 1
)
INSERT INTO public.ingredients (
  tenant_id, name, unit, category, storage_type, is_active,
  purchase_unit, measure_unit, purchase_to_measure_factor, item_kind
)
SELECT
  v_tenant.id, ing.name, ing.unit, ing.category, ing.storage_type, TRUE,
  ing.unit, ing.unit, 1, 'raw_material'
FROM v_tenant
CROSS JOIN (VALUES
  ('Nước cam'::text, 'ml'::text, 'Gia vị'::text, 'ambient'::text),
  ('Nước lọc'::text, 'ml'::text, 'Gia vị'::text, 'ambient'::text)
) AS ing(name, unit, category, storage_type)
ON CONFLICT (name, tenant_id) DO NOTHING;

-- ─── 2) Tạo menu_item 'Sườn cọng' (nếu chưa có) ───
WITH v_tenant AS (
  SELECT id FROM public.tenants WHERE slug = 'comtammatu' LIMIT 1
),
v_cat AS (
  SELECT mc.id
  FROM public.menu_categories mc
  JOIN v_tenant ON mc.tenant_id = v_tenant.id
  WHERE mc.name = 'Cơm'
  LIMIT 1
)
INSERT INTO public.menu_items (
  tenant_id, category_id, name, base_price, is_active
)
SELECT v_tenant.id, v_cat.id, 'Sườn cọng', 0, TRUE
FROM v_tenant CROSS JOIN v_cat
ON CONFLICT (name, tenant_id) DO NOTHING;

-- ─── 3) Recipes — 21 dòng nguyên liệu cho 1kg sườn cọng ───
WITH v_tenant AS (
  SELECT id FROM public.tenants WHERE slug = 'comtammatu' LIMIT 1
),
v_menu AS (
  SELECT mi.id, mi.tenant_id
  FROM public.menu_items mi
  JOIN v_tenant ON mi.tenant_id = v_tenant.id
  WHERE mi.name = 'Sườn cọng'
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
    ('Dầu hào Lee Kum Kee'::text,    25::numeric,   'g'::text,   'BOM ghi g; ingredient base_unit=ml'::text),
    ('Nước mắm Hạnh Phúc 60'::text,  12.5::numeric, 'ml'::text,  NULL::text),
    ('Rượu Soju'::text,              15::numeric,   'ml'::text,  NULL::text),
    ('Coca cola'::text,              125::numeric,  'ml'::text,  NULL::text),
    ('Đường cát vàng Mỹ Tho'::text,  65::numeric,   'g'::text,   'Ướp 25g + nước kho 40g (gộp do UNIQUE)'::text),
    ('Hạt nêm Meizan'::text,         15.5::numeric, 'g'::text,   NULL::text),
    ('Bột ngọt Ajinomoto'::text,     12.5::numeric, 'g'::text,   NULL::text),
    ('Baking soda'::text,            3::numeric,    'g'::text,   NULL::text),
    ('Tiêu'::text,                   3::numeric,    'g'::text,   'BOM ghi "Tiêu xay"'::text),
    ('Bột năng'::text,               12.5::numeric, 'g'::text,   NULL::text),
    ('Hành tím'::text,               40::numeric,   'g'::text,   NULL::text),
    ('Sả'::text,                     15::numeric,   'g'::text,   NULL::text),
    ('Nước lọc'::text,               200::numeric,  'ml'::text,  NULL::text),
    ('Dầu ăn Tường An'::text,        10::numeric,   'ml'::text,  NULL::text),
    ('Dầu điều VN food'::text,       20::numeric,   'ml'::text,  NULL::text)
  ) AS t(ingredient_name, quantity, unit, note)
)
INSERT INTO public.recipes (
  tenant_id, menu_item_id, ingredient_id, quantity, unit, note, yield_factor
)
SELECT
  v_menu.tenant_id,
  v_menu.id,
  ing.id,
  sl.quantity,
  sl.unit,
  sl.note,
  1.000
FROM v_menu
JOIN seed_lines sl ON TRUE
JOIN public.ingredients ing
  ON ing.tenant_id = v_menu.tenant_id
 AND ing.name = sl.ingredient_name
ON CONFLICT (menu_item_id, ingredient_id, tenant_id) DO UPDATE
SET quantity     = EXCLUDED.quantity,
    unit         = EXCLUDED.unit,
    note         = EXCLUDED.note,
    yield_factor = EXCLUDED.yield_factor;

-- ─── 4) Sanity check: phải seed đủ 21 dòng ───
DO $$
DECLARE
  v_count INT;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM public.recipes r
  JOIN public.menu_items mi ON mi.id = r.menu_item_id
  JOIN public.tenants t ON t.id = r.tenant_id AND t.slug = 'comtammatu'
  WHERE mi.name = 'Sườn cọng';

  IF v_count <> 21 THEN
    RAISE EXCEPTION 'Seed Sườn cọng kỳ vọng 21 recipe rows, got %', v_count;
  END IF;
END $$;
