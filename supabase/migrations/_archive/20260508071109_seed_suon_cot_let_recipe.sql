-- =============================================================
-- Seed: BOM "Sườn Cốt Lết" (1 kg) — menu_item id=1 đã có sẵn (base_price=35000).
-- Idempotent: UPSERT recipe lines by (menu_item, ingredient).
--
-- Mapping tên BOM ↔ DB:
--   • Sườn (1 kg)            → ingredients.name = 'Sườn cốt lết'
--   • Đường cát vàng Mỹ tho  → 'Đường cát vàng Mỹ Tho' (chuẩn hoá hoa)
--   • Nước tương Lee Kum Kee → 'Nước tương Lee kum kee'
--   • Nước mắm Hạnh Phúc     → 'Nước mắm Hạnh Phúc 60'
--   • Tiêu xay               → 'Tiêu'
--
-- 'Đường cát vàng Mỹ Tho' gộp 20g (ướp) + 40g (nước kho) = 60g.
-- =============================================================

WITH v_tenant AS (
  SELECT id FROM public.tenants WHERE slug = 'comtammatu' LIMIT 1
),
v_menu AS (
  SELECT mi.id, mi.tenant_id
  FROM public.menu_items mi
  JOIN v_tenant ON mi.tenant_id = v_tenant.id
  WHERE mi.name = 'Sườn Cốt Lết'
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
    ('Dầu hào Lee Kum Kee'::text,    20::numeric,   'g'::text,   'BOM ghi g; ingredient base_unit=ml'::text),
    ('Nước mắm Hạnh Phúc 60'::text,  10::numeric,   'ml'::text,  NULL::text),
    ('Rượu Soju'::text,              12::numeric,   'ml'::text,  NULL::text),
    ('Coca cola'::text,              100::numeric,  'ml'::text,  NULL::text),
    ('Đường cát vàng Mỹ Tho'::text,  60::numeric,   'g'::text,   'Ướp 20g + nước kho 40g (gộp do UNIQUE)'::text),
    ('Hạt nêm Meizan'::text,         12.4::numeric, 'g'::text,   NULL::text),
    ('Bột ngọt Ajinomoto'::text,     10::numeric,   'g'::text,   NULL::text),
    ('Baking soda'::text,            2.5::numeric,  'g'::text,   NULL::text),
    ('Tiêu'::text,                   2.5::numeric,  'g'::text,   'BOM ghi "Tiêu xay"'::text),
    ('Bột năng'::text,               10::numeric,   'g'::text,   NULL::text),
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

-- Sanity check: phải seed đủ 21 dòng
DO $$
DECLARE
  v_count INT;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM public.recipes r
  JOIN public.menu_items mi ON mi.id = r.menu_item_id
  JOIN public.tenants t ON t.id = r.tenant_id AND t.slug = 'comtammatu'
  WHERE mi.name = 'Sườn Cốt Lết';

  IF v_count <> 21 THEN
    RAISE EXCEPTION 'Seed Sườn Cốt Lết kỳ vọng 21 recipe rows, got %', v_count;
  END IF;
END $$;
