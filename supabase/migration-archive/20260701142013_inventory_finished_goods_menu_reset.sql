BEGIN;

CREATE TEMP TABLE inv_target_finished_goods (
  target_key text PRIMARY KEY,
  target_name text NOT NULL,
  sku text NOT NULL,
  base_unit_code text NOT NULL,
  sale_unit_code text NOT NULL,
  sale_to_base_factor numeric(18,12) NOT NULL,
  old_names text[] NOT NULL,
  ingredient_id bigint
) ON COMMIT DROP;

CREATE TEMP TABLE inv_target_units (
  unit_code text PRIMARY KEY,
  unit_name text NOT NULL
) ON COMMIT DROP;

INSERT INTO inv_target_units (unit_code, unit_name)
VALUES
  ('kg', 'kg'),
  ('khay', 'khay'),
  ('ml', 'ml'),
  ('thung', 'thùng'),
  ('lon', 'lon'),
  ('chai', 'chai'),
  ('piece', 'phần'),
  ('ly', 'ly'),
  ('vi', 'vỉ'),
  ('bich', 'bịch');

INSERT INTO inv_target_finished_goods
  (
    target_key, target_name, sku,
    base_unit_code, sale_unit_code, sale_to_base_factor,
    old_names
  )
VALUES
  ('suon_cot_let', 'Sườn Cốt Lết - Thành Phẩm', 'TP-SUON-COT-LET', 'thung', 'piece', 1.0 / 43.5, ARRAY['Sườn Cốt Lết - Thành Phẩm', 'Sườn cốt lết - Thành Phẩm', 'Thịt cốt lết-thành phẩm']),
  ('suon_cong', 'Sườn Cọng - Thành Phẩm', 'TP-SUON-CONG', 'thung', 'piece', 1.0 / 40, ARRAY['Sườn Cọng - Thành Phẩm', 'Sườn cọng - Thành Phẩm', 'Sườn cọng-thành phẩm']),
  ('suon_mot_gang', 'Sườn Một Gang - Thành Phẩm', 'TP-SUON-MOT-GANG', 'thung', 'piece', 1.0 / 12.5, ARRAY['Sườn Một Gang - Thành Phẩm', 'Sườn một gang - Thành Phẩm', 'Sườn 1 gang-thành phẩm']),
  ('bi', 'Bì - Thành Phẩm', 'TP-BI', 'khay', 'piece', 1.0 / 27, ARRAY['Bì - Thành Phẩm', 'Bì-thành phẩm', 'Bì']),
  ('cha', 'Chả - Thành Phẩm', 'TP-CHA', 'khay', 'piece', 1.0 / 52, ARRAY['Chả - Thành Phẩm', 'Chả-thành phẩm']),
  ('trung', 'Trứng - Thành Phẩm', 'TP-TRUNG', 'vi', 'piece', 1.0 / 30, ARRAY['Trứng - Thành Phẩm', 'Trứng']),
  ('com_them', 'Cơm Thêm - Thành Phẩm', 'TP-COM-THEM', 'kg', 'piece', 1.0 / 10, ARRAY['Cơm Thêm - Thành Phẩm', 'Cơm thêm - Thành Phẩm', 'Cơm Trắng - Thành Phẩm', 'Cơm trắng - Thành Phẩm']),
  ('top_mo', 'Tóp Mỡ - Thành Phẩm', 'TP-TOP-MO', 'kg', 'piece', 1.0 / 10, ARRAY['Tóp Mỡ - Thành Phẩm', 'Tóp mỡ - Thành Phẩm', 'Tóp Mỡ', 'Tóp mỡ', 'Mỡ']),
  ('cam', 'Cam - Thành Phẩm', 'TP-CAM', 'kg', 'ly', 1.0 / 2, ARRAY['Cam - Thành Phẩm', 'Cam ép - Thành Phẩm']),
  ('tra_tac', 'Trà Tắc - Thành Phẩm', 'TP-TRA-TAC', 'ml', 'ly', 200, ARRAY['Trà Tắc - Thành Phẩm', 'Trà-Thành Phẩm']),
  ('rau_ma', 'Rau Má - Thành Phẩm', 'TP-RAU-MA', 'ml', 'ly', 200, ARRAY['Rau Má - Thành Phẩm', 'Nước Rau Má - Thành Phẩm']),
  ('nuoc_sam', 'Nước Sâm - Thành Phẩm', 'TP-NUOC-SAM', 'ml', 'ly', 200, ARRAY['Nước Sâm - Thành Phẩm', 'Nước sâm - Thành Phẩm']),
  ('fanta_cam', 'Fanta Cam - Thành Phẩm', 'TP-FANTA-CAM', 'thung', 'lon', 1.0 / 24, ARRAY['Fanta Cam - Thành Phẩm', 'Fanta cam']),
  ('fanta_xa_xi', 'Fanta Xá Xị - Thành Phẩm', 'TP-FANTA-XA-XI', 'thung', 'lon', 1.0 / 24, ARRAY['Fanta Xá Xị - Thành Phẩm', 'Fanta xá xị']),
  ('sprite', 'Sprite - Thành Phẩm', 'TP-SPRITE', 'thung', 'lon', 1.0 / 24, ARRAY['Sprite - Thành Phẩm', 'Sprite']),
  ('nuoc_suoi', 'Nước Suối - Thành Phẩm', 'TP-NUOC-SUOI', 'thung', 'chai', 1.0 / 24, ARRAY['Nước Suối - Thành Phẩm', 'Nước suối - Thành Phẩm']),
  ('tra_da', 'Trà Đá - Thành Phẩm', 'TP-TRA-DA', 'bich', 'ly', 1.0 / 500, ARRAY['Trà Đá - Thành Phẩm']),
  ('khan_lanh', 'Khăn Lạnh - Thành Phẩm', 'TP-KHAN-LANH', 'bich', 'piece', 1.0 / 100, ARRAY['Khăn Lạnh - Thành Phẩm', 'Khăn lạnh - Thành Phẩm', 'Khăn Lạnh', 'Khăn lạnh']);

CREATE TEMP TABLE inv_target_menu_recipes (
  menu_name text PRIMARY KEY,
  target_key text NOT NULL REFERENCES inv_target_finished_goods(target_key)
) ON COMMIT DROP;

INSERT INTO inv_target_menu_recipes (menu_name, target_key)
VALUES
  ('Sườn Cốt Lết', 'suon_cot_let'),
  ('Sườn Cây', 'suon_cong'),
  ('Sườn Một Gang', 'suon_mot_gang'),
  ('Bì', 'bi'),
  ('Cơm Tấm Bì', 'bi'),
  ('Chả', 'cha'),
  ('Cơm Tấm Chả', 'cha'),
  ('Trứng', 'trung'),
  ('Cơm Tấm Trứng', 'trung'),
  ('Cơm Thêm', 'com_them'),
  ('Tóp mỡ', 'top_mo'),
  ('Cam ép', 'cam'),
  ('Trà Tắc', 'tra_tac'),
  ('Rau Má', 'rau_ma'),
  ('Nước sâm', 'nuoc_sam'),
  ('Fanta cam', 'fanta_cam'),
  ('Fanta xá xị', 'fanta_xa_xi'),
  ('Sprite', 'sprite'),
  ('Nước suối', 'nuoc_suoi'),
  ('Trà Đá', 'tra_da'),
  ('Khăn lạnh', 'khan_lanh');

CREATE TEMP TABLE inv_initial_stock (
  target_key text PRIMARY KEY REFERENCES inv_target_finished_goods(target_key),
  branch_code text NOT NULL,
  location_code text NOT NULL,
  quantity numeric(15,3) NOT NULL
) ON COMMIT DROP;

INSERT INTO inv_initial_stock (target_key, branch_code, location_code, quantity)
VALUES
  ('suon_cot_let', 'PH', 'main_warehouse', 7),
  ('suon_cong', 'PH', 'main_warehouse', 3.6),
  ('suon_mot_gang', 'PH', 'main_warehouse', 1.92),
  ('bi', 'PH', 'main_warehouse', 1),
  ('cha', 'PH', 'main_warehouse', 1.5),
  ('trung', 'PH', 'main_warehouse', 0.1),
  ('com_them', 'PH', 'main_warehouse', 200),
  ('top_mo', 'PH', 'main_warehouse', 0.6),
  ('cam', 'PH', 'main_warehouse', 5.5),
  ('tra_tac', 'PH', 'main_warehouse', 8600),
  ('rau_ma', 'PH', 'main_warehouse', 10050),
  ('nuoc_sam', 'PH', 'main_warehouse', 6100),
  ('fanta_cam', 'PH', 'main_warehouse', 2),
  ('fanta_xa_xi', 'PH', 'main_warehouse', 2.375),
  ('sprite', 'PH', 'main_warehouse', 1.75),
  ('nuoc_suoi', 'PH', 'main_warehouse', 2.417),
  ('khan_lanh', 'PH', 'main_warehouse', 10);

DO $$
DECLARE
  v_tenant_id bigint;
  v_tenant_count integer;
  v_finished_category_id bigint;
  v_target record;
  v_existing_id bigint;
  v_base_unit_id bigint;
  v_sale_unit_id bigint;
  v_missing_menu_count integer;
  v_missing_stock_count integer;
BEGIN
  SELECT count(*), min(id) INTO v_tenant_count, v_tenant_id
  FROM public.tenants;

  IF v_tenant_count <> 1 THEN
    RAISE EXCEPTION 'inventory_finished_goods_reset_requires_single_tenant';
  END IF;

  DELETE FROM public.branch_menu_item_daily_holds WHERE tenant_id = v_tenant_id;
  DELETE FROM public.branch_menu_item_daily_limits WHERE tenant_id = v_tenant_id;
  DELETE FROM public.attendance_consumption_report_lines WHERE tenant_id = v_tenant_id;
  DELETE FROM public.attendance_consumption_reports WHERE tenant_id = v_tenant_id;
  DELETE FROM public.inventory_count_slip_lines WHERE tenant_id = v_tenant_id;
  DELETE FROM public.inventory_count_slips WHERE tenant_id = v_tenant_id;
  DELETE FROM public.inventory_count_assignments WHERE tenant_id = v_tenant_id;
  DELETE FROM public.stocktake_zone_locks WHERE tenant_id = v_tenant_id;
  DELETE FROM public.stocktake_drafts
  WHERE session_id IN (
    SELECT id
    FROM public.stocktake_sessions
    WHERE tenant_id = v_tenant_id
  );
  DELETE FROM public.stocktake_conflicts WHERE tenant_id = v_tenant_id;
  DELETE FROM public.stocktake_lines WHERE tenant_id = v_tenant_id;
  DELETE FROM public.stocktake_sessions WHERE tenant_id = v_tenant_id;
  DELETE FROM public.stock_movements WHERE tenant_id = v_tenant_id;
  DELETE FROM public.supplier_payments WHERE tenant_id = v_tenant_id;
  DELETE FROM public.supplier_credit_notes WHERE tenant_id = v_tenant_id;
  DELETE FROM public.supplier_return_items WHERE tenant_id = v_tenant_id;
  DELETE FROM public.supplier_returns WHERE tenant_id = v_tenant_id;
  DELETE FROM public.supplier_invoices WHERE tenant_id = v_tenant_id;
  DELETE FROM public.grn_hardblock_overrides WHERE tenant_id = v_tenant_id;
  DELETE FROM public.grn_express_extend_audit WHERE tenant_id = v_tenant_id;
  DELETE FROM public.grn_baseline_pause WHERE tenant_id = v_tenant_id;
  DELETE FROM public.grn_items WHERE tenant_id = v_tenant_id;
  DELETE FROM public.goods_received_notes WHERE tenant_id = v_tenant_id;
  DELETE FROM public.purchase_order_items WHERE tenant_id = v_tenant_id;
  DELETE FROM public.purchase_orders WHERE tenant_id = v_tenant_id;
  DELETE FROM public.production_order_items WHERE tenant_id = v_tenant_id;
  DELETE FROM public.production_orders WHERE tenant_id = v_tenant_id;
  DELETE FROM public.production_recipes WHERE tenant_id = v_tenant_id;
  DELETE FROM public.recipes WHERE tenant_id = v_tenant_id;
  DELETE FROM public.stock_transfer_items WHERE tenant_id = v_tenant_id;
  DELETE FROM public.stock_transfers WHERE tenant_id = v_tenant_id;
  DELETE FROM public.stock_issue_items WHERE tenant_id = v_tenant_id;
  DELETE FROM public.stock_issues WHERE tenant_id = v_tenant_id;
  DELETE FROM public.stock_levels WHERE tenant_id = v_tenant_id;
  DELETE FROM public.branch_daily_waste_cap
  WHERE branch_id IN (SELECT id FROM public.branches WHERE tenant_id = v_tenant_id);

  INSERT INTO public.units (tenant_id, code, name)
  SELECT v_tenant_id, unit_code, unit_name
  FROM inv_target_units
  ON CONFLICT (code, tenant_id) DO UPDATE
  SET name = EXCLUDED.name,
      is_active = true,
      updated_at = now();

  INSERT INTO public.ingredient_categories (tenant_id, name, sort_order)
  VALUES (v_tenant_id, 'Thành Phẩm', 10)
  ON CONFLICT (name, tenant_id) DO UPDATE
  SET is_active = true,
      sort_order = EXCLUDED.sort_order,
      updated_at = now();

  SELECT id INTO v_finished_category_id
  FROM public.ingredient_categories
  WHERE tenant_id = v_tenant_id
    AND name = 'Thành Phẩm';

  FOR v_target IN SELECT * FROM inv_target_finished_goods ORDER BY target_key LOOP
    SELECT id INTO v_base_unit_id
    FROM public.units
    WHERE tenant_id = v_tenant_id
      AND code = v_target.base_unit_code
      AND is_active;

    SELECT id INTO v_sale_unit_id
    FROM public.units
    WHERE tenant_id = v_tenant_id
      AND code = v_target.sale_unit_code
      AND is_active;

    IF v_base_unit_id IS NULL OR v_sale_unit_id IS NULL THEN
      RAISE EXCEPTION 'inventory_finished_goods_reset_unit_missing';
    END IF;

    SELECT i.id INTO v_existing_id
    FROM public.ingredients i
    WHERE i.tenant_id = v_tenant_id
      AND lower(i.name) IN (
        SELECT lower(old_name)
        FROM unnest(v_target.old_names) AS old_name
      )
    ORDER BY CASE
        WHEN i.sku = v_target.sku THEN 0
        WHEN i.name = v_target.target_name THEN 1
        WHEN i.name = ANY(v_target.old_names) THEN 2
        ELSE 3
      END,
      i.id
    LIMIT 1;

    IF v_existing_id IS NULL THEN
      INSERT INTO public.ingredients (
        tenant_id, name, sku, category_id, category, unit,
        purchase_unit, measure_unit, purchase_to_measure_factor,
        item_kind, storage_type, min_stock_level, is_active
      )
      VALUES (
        v_tenant_id, v_target.target_name, v_target.sku,
        v_finished_category_id, 'Thành Phẩm', v_target.sale_unit_code,
        v_target.base_unit_code, v_target.sale_unit_code,
        ROUND(1 / v_target.sale_to_base_factor, 6),
        'finished_good', 'ambient', 0, true
      )
      RETURNING id INTO v_existing_id;
    ELSE
      UPDATE public.ingredients
      SET name = v_target.target_name,
          sku = v_target.sku,
          category_id = v_finished_category_id,
          category = 'Thành Phẩm',
          unit = v_target.sale_unit_code,
          purchase_unit = v_target.base_unit_code,
          measure_unit = v_target.sale_unit_code,
          purchase_to_measure_factor = ROUND(1 / v_target.sale_to_base_factor, 6),
          item_kind = 'finished_good',
          min_stock_level = 0,
          is_active = true,
          updated_at = now()
      WHERE id = v_existing_id
        AND tenant_id = v_tenant_id;
    END IF;

    UPDATE inv_target_finished_goods
    SET ingredient_id = v_existing_id
    WHERE target_key = v_target.target_key;

    DELETE FROM public.ingredient_units
    WHERE tenant_id = v_tenant_id
      AND ingredient_id = v_existing_id;

    INSERT INTO public.ingredient_units (
      tenant_id, ingredient_id, unit_id, to_base_factor, is_base,
      allow_purchase, allow_issue, allow_production, sort_order
    )
    VALUES (
      v_tenant_id, v_existing_id, v_base_unit_id, 1, true,
      true, true, true, 0
    );

    IF v_sale_unit_id <> v_base_unit_id THEN
      INSERT INTO public.ingredient_units (
        tenant_id, ingredient_id, unit_id, to_base_factor, is_base,
        allow_purchase, allow_issue, allow_production, sort_order
      )
      VALUES (
        v_tenant_id, v_existing_id, v_sale_unit_id,
        v_target.sale_to_base_factor, false,
        false, true, true, 1
      );
    END IF;
  END LOOP;

  IF EXISTS (SELECT 1 FROM inv_target_finished_goods WHERE ingredient_id IS NULL) THEN
    RAISE EXCEPTION 'inventory_finished_goods_reset_target_missing';
  END IF;

  DELETE FROM public.ingredient_units iu
  WHERE iu.tenant_id = v_tenant_id
    AND NOT EXISTS (
      SELECT 1
      FROM inv_target_finished_goods t
      WHERE t.ingredient_id = iu.ingredient_id
    );

  UPDATE public.ingredients i
  SET is_active = false,
      updated_at = now()
  WHERE i.tenant_id = v_tenant_id
    AND NOT EXISTS (
      SELECT 1
      FROM inv_target_finished_goods t
      WHERE t.ingredient_id = i.id
    );

  DELETE FROM public.units u
  WHERE u.tenant_id = v_tenant_id
    AND NOT EXISTS (
      SELECT 1
      FROM inv_target_units tu
      WHERE tu.unit_code = u.code
    );

  WITH normalized AS (
    SELECT
      id,
      tenant_id,
      initcap(regexp_replace(trim(name), '[[:space:]]+', ' ', 'g')) AS normalized_name
    FROM public.ingredients
    WHERE tenant_id = v_tenant_id
      AND coalesce(trim(name), '') <> ''
  ),
  safe_normalized AS (
    SELECT n.id, n.normalized_name
    FROM normalized n
    WHERE n.normalized_name <> ''
      AND NOT EXISTS (
        SELECT 1
        FROM normalized other
        WHERE other.id <> n.id
          AND other.tenant_id = n.tenant_id
          AND other.normalized_name = n.normalized_name
      )
  )
  UPDATE public.ingredients i
  SET name = s.normalized_name,
      updated_at = now()
  FROM safe_normalized s
  WHERE i.id = s.id
    AND i.tenant_id = v_tenant_id
    AND i.name <> s.normalized_name;

  SELECT count(*) INTO v_missing_menu_count
  FROM inv_target_menu_recipes m
  LEFT JOIN public.menu_items mi
    ON mi.tenant_id = v_tenant_id
   AND mi.name = m.menu_name
   AND mi.is_active
  WHERE mi.id IS NULL;

  IF v_missing_menu_count > 0 THEN
    RAISE EXCEPTION 'inventory_finished_goods_reset_menu_missing';
  END IF;

  INSERT INTO public.recipes (
    tenant_id, menu_item_id, ingredient_id, quantity, unit, entry_unit_id, yield_factor
  )
  SELECT
    v_tenant_id,
    mi.id,
    t.ingredient_id,
    1,
    t.sale_unit_code,
    u.id,
    1
  FROM inv_target_menu_recipes m
  JOIN public.menu_items mi
    ON mi.tenant_id = v_tenant_id
   AND mi.name = m.menu_name
   AND mi.is_active
  JOIN inv_target_finished_goods t
    ON t.target_key = m.target_key
  JOIN public.units u
    ON u.tenant_id = v_tenant_id
   AND u.code = t.sale_unit_code
  ON CONFLICT (menu_item_id, ingredient_id, tenant_id) DO UPDATE
  SET quantity = EXCLUDED.quantity,
      unit = EXCLUDED.unit,
      entry_unit_id = EXCLUDED.entry_unit_id,
      yield_factor = EXCLUDED.yield_factor,
      note = NULL;

  SELECT count(*) INTO v_missing_stock_count
  FROM inv_initial_stock s
  LEFT JOIN inv_target_finished_goods t
    ON t.target_key = s.target_key
  LEFT JOIN public.branches b
    ON b.tenant_id = v_tenant_id
   AND b.code = s.branch_code
   AND b.is_active
  LEFT JOIN public.inventory_locations il
    ON il.tenant_id = v_tenant_id
   AND il.branch_id = b.id
   AND il.code = s.location_code
   AND il.is_active
  WHERE t.ingredient_id IS NULL
     OR b.id IS NULL
     OR il.id IS NULL;

  IF v_missing_stock_count > 0 THEN
    RAISE EXCEPTION 'inventory_finished_goods_reset_initial_stock_missing';
  END IF;

  INSERT INTO public.stock_levels (
    tenant_id, branch_id, ingredient_id, current_quantity,
    last_counted_at, updated_at, location_id
  )
  SELECT
    v_tenant_id,
    b.id,
    t.ingredient_id,
    s.quantity,
    now(),
    now(),
    il.id
  FROM inv_initial_stock s
  JOIN inv_target_finished_goods t
    ON t.target_key = s.target_key
  JOIN public.branches b
    ON b.tenant_id = v_tenant_id
   AND b.code = s.branch_code
   AND b.is_active
  JOIN public.inventory_locations il
    ON il.tenant_id = v_tenant_id
   AND il.branch_id = b.id
   AND il.code = s.location_code
   AND il.is_active
  ON CONFLICT (ingredient_id, branch_id, location_id, tenant_id) DO UPDATE
  SET current_quantity = EXCLUDED.current_quantity,
      last_counted_at = EXCLUDED.last_counted_at,
      updated_at = EXCLUDED.updated_at;
END $$;

COMMIT;
