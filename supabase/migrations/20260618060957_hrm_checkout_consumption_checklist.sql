BEGIN;

DO $$
DECLARE
  v_tenant bigint;
  v_template_id bigint;
  v_next_sort integer;
  v_item record;
BEGIN
  FOR v_tenant IN SELECT id FROM public.tenants LOOP
    FOR v_item IN
      SELECT *
      FROM (
        VALUES
          (
            'Phục vụ',
            'Tiêu hao bếp trong ngày',
            'Nếu được giao, ghi số lượng nước mắm, ớt, đá, nước bán và vật tư phục vụ đã dùng hoặc hao hụt để quản lý đối chiếu tiêu hao trong ngày.'
          ),
          (
            'Phụ bếp',
            'Tiêu hao bếp trong ngày',
            'Nếu được giao, ghi lượng cơm, canh, bì, chả, trứng, rau củ và vật tư bếp đã dùng hoặc hao hụt để quản lý đối chiếu tiêu hao trong ngày.'
          ),
          (
            'Quầy',
            'Tiêu hao bếp trong ngày',
            'Nếu được giao, ghi lượng hộp, túi, đồ chua, canh mang về, nguyên liệu quầy đã dùng hoặc hao hụt để quản lý đối chiếu tiêu hao trong ngày.'
          ),
          (
            'Nướng',
            'Tiêu hao bếp trong ngày',
            'Nếu được giao, ghi lượng than, sườn cây, sườn cốt lết, phần ướp và vật tư nướng đã dùng hoặc hao hụt để quản lý đối chiếu tiêu hao trong ngày.'
          ),
          (
            'Tạp vụ',
            'Tiêu hao bếp trong ngày',
            'Nếu được giao, ghi lượng chén dĩa hư, khăn giấy, xà phòng, túi rác và vật tư vệ sinh đã dùng để quản lý đối chiếu tiêu hao trong ngày.'
          ),
          (
            'Cửa hàng trưởng',
            'Tiêu hao bếp trong ngày',
            'Nếu được giao, đối chiếu tiêu hao từng vị trí với tồn trên app; ghi chênh lệch, hao hụt và hàng cần đặt để nhìn doanh thu ròng trong ngày.'
          ),
          (
            'Bếp trưởng',
            'Tiêu hao bếp trong ngày',
            'Nếu được giao, ghi lượng thịt, rau, gia vị, bán thành phẩm và thành phẩm đã dùng hoặc hao hụt để quản lý đối chiếu doanh thu ròng trong ngày.'
          )
      ) AS desired(template_name, title, done_definition)
    LOOP
      SELECT id
      INTO v_template_id
      FROM public.shift_checklist_templates
      WHERE tenant_id = v_tenant
        AND branch_id IS NULL
        AND name = v_item.template_name
        AND is_active = true
      ORDER BY is_active DESC, id
      LIMIT 1;

      IF v_template_id IS NULL THEN
        CONTINUE;
      END IF;

      IF EXISTS (
        SELECT 1
        FROM public.shift_checklist_template_items i
        WHERE i.tenant_id = v_tenant
          AND i.template_id = v_template_id
          AND i.title IN (
            v_item.title,
            'Kiểm kê Inventory',
            'Kiểm kê trước khi chấm công ra'
          )
      ) THEN
        UPDATE public.shift_checklist_template_items
        SET title = v_item.title,
            phase = 'end_of_shift',
            done_definition = v_item.done_definition,
            is_required = false,
            scope = 'closing',
            is_active = true,
            updated_at = now()
        WHERE tenant_id = v_tenant
          AND template_id = v_template_id
          AND title IN (
            v_item.title,
            'Kiểm kê Inventory',
            'Kiểm kê trước khi chấm công ra'
          );
      ELSE
        SELECT COALESCE(MAX(sort_order), 0) + 1
        INTO v_next_sort
        FROM public.shift_checklist_template_items
        WHERE tenant_id = v_tenant
          AND template_id = v_template_id;

        INSERT INTO public.shift_checklist_template_items (
          tenant_id,
          template_id,
          title,
          phase,
          done_definition,
          is_required,
          scope,
          sort_order,
          is_active
        )
        VALUES (
          v_tenant,
          v_template_id,
          v_item.title,
          'end_of_shift',
          v_item.done_definition,
          false,
          'closing',
          v_next_sort,
          true
        );
      END IF;
    END LOOP;
  END LOOP;
END $$;

COMMIT;
