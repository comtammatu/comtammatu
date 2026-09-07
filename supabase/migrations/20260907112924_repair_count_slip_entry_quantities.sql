-- Owner-confirmed physical counts. Resolve every target by its document and
-- ingredient, and append deltas so all subsequent stock movements survive.
DO $$
DECLARE
  v_item record;
  v_target record;
  v_unit_id bigint;
  v_source_id bigint;
  v_count integer;
  v_tenant bigint;
  v_key uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.inventory_count_slips
      WHERE slip_number IN ('PD-06092026-0134','PD-06092026-0136')) THEN
    RETURN;
  END IF;

  FOR v_item IN SELECT * FROM (VALUES
    ('PD-06092026-0134','Khăn lạnh vải Alex','cái',4067::numeric,10167500::numeric),
    ('PD-06092026-0136','Trái cam','kg',3.542::numeric,3542000::numeric),
    ('PD-06092026-0136','Nước đường','l',2.520::numeric,2520000::numeric),
    ('PD-06092026-0136','Trái tắc','kg',1.050::numeric,1050::numeric)
  ) AS target(slip_number,ingredient_name,unit_code,quantity,expected_base_quantity)
  LOOP
    SELECT s.tenant_id,s.branch_id,s.location_id,s.status,l.id AS line_id,
      l.ingredient_id,l.system_quantity,t.owner_user_id
    INTO STRICT v_target
    FROM public.inventory_count_slips s
    JOIN public.inventory_count_slip_lines l ON l.slip_id=s.id AND l.tenant_id=s.tenant_id
    JOIN public.ingredients i ON i.id=l.ingredient_id AND i.tenant_id=l.tenant_id
    JOIN public.tenants t ON t.id=s.tenant_id
    WHERE s.slip_number=v_item.slip_number AND i.name=v_item.ingredient_name;
    IF v_tenant IS NOT NULL AND v_tenant <> v_target.tenant_id THEN
      RAISE EXCEPTION 'count_correction_tenant_ambiguous';
    END IF;
    v_tenant := v_target.tenant_id;

    SELECT iu.unit_id INTO STRICT v_unit_id
    FROM public.ingredient_units iu JOIN public.units u ON u.id=iu.unit_id AND u.tenant_id=iu.tenant_id
    WHERE iu.tenant_id=v_tenant AND iu.ingredient_id=v_target.ingredient_id
      AND iu.is_active AND u.is_active AND u.code=v_item.unit_code;
    SELECT m.id INTO STRICT v_source_id FROM public.stock_movements m
    WHERE m.tenant_id=v_tenant AND m.branch_id=v_target.branch_id
      AND m.location_id=v_target.location_id AND m.ingredient_id=v_target.ingredient_id
      AND m.type='count_adjustment'
      AND m.quantity_change=v_item.expected_base_quantity-v_target.system_quantity
      AND m.reason LIKE 'Điều chỉnh tồn dương phiếu đếm #' || v_item.slip_number || ' (%)';
    v_key := md5('count-entry-unit-correction:' || v_item.slip_number || ':' || v_item.ingredient_name)::uuid;
    PERFORM private.correct_posted_count_line(
      v_target.line_id,v_source_id,v_item.expected_base_quantity,v_item.quantity,v_unit_id,
      'Chủ sở hữu xác nhận số đếm đúng; sửa đơn vị, giữ nguyên nhập xuất và tiêu hao sau phiếu.',
      v_key,v_target.owner_user_id
    );
  END LOOP;
  SELECT count(*) INTO v_count FROM private.count_slip_corrections
    WHERE tenant_id=v_tenant AND idempotency_key IN (
      md5('count-entry-unit-correction:PD-06092026-0134:Khăn lạnh vải Alex')::uuid,
      md5('count-entry-unit-correction:PD-06092026-0136:Trái cam')::uuid,
      md5('count-entry-unit-correction:PD-06092026-0136:Nước đường')::uuid,
      md5('count-entry-unit-correction:PD-06092026-0136:Trái tắc')::uuid
    );
  IF v_count <> 4 THEN RAISE EXCEPTION 'count_correction_batch_incomplete'; END IF;
END;
$$;
