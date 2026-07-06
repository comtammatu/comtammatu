-- Add default per-position shift tasks for Bếp (chef).
-- Targets the system position with code = 'chef' for all active tenants.

DO $$
DECLARE
  v_tenant_id bigint;
  v_position_id bigint;
BEGIN
  FOR v_tenant_id IN SELECT id FROM public.tenants LOOP
    -- Find the position ID for 'chef' (Bếp) in this tenant
    SELECT id INTO v_position_id
      FROM public.positions
     WHERE tenant_id = v_tenant_id AND code = 'chef' AND is_active = true
     LIMIT 1;

    IF v_position_id IS NULL THEN
      -- If 'chef' position doesn't exist, skip this tenant
      CONTINUE;
    END IF;

    -- Ensure we do not insert duplicate tasks if they already exist
    -- 1. Chỉnh trang đồng phục: Đội nón, đeo tạp dề, đeo bảng tên (every_shift, start_of_shift)
    IF NOT EXISTS (
      SELECT 1 FROM public.position_shift_tasks
       WHERE tenant_id = v_tenant_id AND position_id = v_position_id AND title = 'Chỉnh trang đồng phục: Đội nón, đeo tạp dề, đeo bảng tên'
    ) THEN
      INSERT INTO public.position_shift_tasks (tenant_id, position_id, title, kind, applicability, phase, is_required, done_definition, sort_order)
      VALUES (v_tenant_id, v_position_id, 'Chỉnh trang đồng phục: Đội nón, đeo tạp dề, đeo bảng tên', 'standard', 'every_shift', 'start_of_shift', true, 'Mặc đủ đồng phục, đội nón, đeo tạp dề và bảng tên gọn gàng, sạch sẽ.', 1);
    END IF;

    -- 2. Kiểm tra nồi hấp cơm (every_shift, start_of_shift)
    IF NOT EXISTS (
      SELECT 1 FROM public.position_shift_tasks
       WHERE tenant_id = v_tenant_id AND position_id = v_position_id AND title = 'Kiểm tra nồi hấp cơm'
    ) THEN
      INSERT INTO public.position_shift_tasks (tenant_id, position_id, title, kind, applicability, phase, is_required, done_definition, sort_order)
      VALUES (v_tenant_id, v_position_id, 'Kiểm tra nồi hấp cơm', 'standard', 'every_shift', 'start_of_shift', true, 'Nồi hấp đủ nước, đã cắm điện và bật nóng, sạch và hoạt động bình thường, sẵn sàng hấp cơm.', 2);
    END IF;

    -- 3. Setup quầy bán: dụng cụ, nguyên liệu, đồ mang về (every_shift, start_of_shift)
    IF NOT EXISTS (
      SELECT 1 FROM public.position_shift_tasks
       WHERE tenant_id = v_tenant_id AND position_id = v_position_id AND title = 'Setup quầy bán: dụng cụ, nguyên liệu, đồ mang về'
    ) THEN
      INSERT INTO public.position_shift_tasks (tenant_id, position_id, title, kind, applicability, phase, is_required, done_definition, sort_order)
      VALUES (v_tenant_id, v_position_id, 'Setup quầy bán: dụng cụ, nguyên liệu, đồ mang về', 'standard', 'every_shift', 'start_of_shift', true, 'Quầy đầy đủ dụng cụ, nguyên liệu và đồ mang về (hộp, túi), xếp đúng vị trí sẵn sàng bán.', 3);
    END IF;

    -- 4. Mở máy KDS (opening, start_of_shift)
    IF NOT EXISTS (
      SELECT 1 FROM public.position_shift_tasks
       WHERE tenant_id = v_tenant_id AND position_id = v_position_id AND title = 'Mở máy KDS'
    ) THEN
      INSERT INTO public.position_shift_tasks (tenant_id, position_id, title, kind, applicability, phase, is_required, done_definition, sort_order)
      VALUES (v_tenant_id, v_position_id, 'Mở máy KDS', 'standard', 'opening', 'start_of_shift', true, 'Màn hình KDS đã bật, lên đúng giao diện nhận đơn.', 4);
    END IF;

    -- 5. Đóng gói đồ chua vào túi zip (every_shift, start_of_shift)
    IF NOT EXISTS (
      SELECT 1 FROM public.position_shift_tasks
       WHERE tenant_id = v_tenant_id AND position_id = v_position_id AND title = 'Đóng gói đồ chua vào túi zip'
    ) THEN
      INSERT INTO public.position_shift_tasks (tenant_id, position_id, title, kind, applicability, phase, is_required, done_definition, sort_order)
      VALUES (v_tenant_id, v_position_id, 'Đóng gói đồ chua vào túi zip', 'standard', 'every_shift', 'start_of_shift', true, 'Luôn có đủ túi zip đồ chua đã chia sẵn ở khu phục vụ, không để hết hàng giữa ca.', 5);
    END IF;

    -- 6. Đóng gói canh mang về (every_shift, start_of_shift)
    IF NOT EXISTS (
      SELECT 1 FROM public.position_shift_tasks
       WHERE tenant_id = v_tenant_id AND position_id = v_position_id AND title = 'Đóng gói canh mang về'
    ) THEN
      INSERT INTO public.position_shift_tasks (tenant_id, position_id, title, kind, applicability, phase, is_required, done_definition, sort_order)
      VALUES (v_tenant_id, v_position_id, 'Đóng gói canh mang về', 'standard', 'every_shift', 'start_of_shift', true, 'Luôn có đủ phần canh mang về đã đóng kín ở khu phục vụ, không để hết hàng giữa ca.', 6);
    END IF;

    -- 7. Gói nguyên liệu còn thừa, cho vào tủ lạnh (every_shift, end_of_shift)
    IF NOT EXISTS (
      SELECT 1 FROM public.position_shift_tasks
       WHERE tenant_id = v_tenant_id AND position_id = v_position_id AND title = 'Gói nguyên liệu còn thừa, cho vào tủ lạnh'
    ) THEN
      INSERT INTO public.position_shift_tasks (tenant_id, position_id, title, kind, applicability, phase, is_required, done_definition, sort_order)
      VALUES (v_tenant_id, v_position_id, 'Gói nguyên liệu còn thừa, cho vào tủ lạnh', 'standard', 'every_shift', 'end_of_shift', true, 'Nguyên liệu thừa được bọc kín, ghi rõ và cất vào tủ lạnh đúng nhiệt độ.', 7);
    END IF;

    -- 8. Rửa sạch dụng cụ, đồ dùng đã sử dụng (every_shift, end_of_shift)
    IF NOT EXISTS (
      SELECT 1 FROM public.position_shift_tasks
       WHERE tenant_id = v_tenant_id AND position_id = v_position_id AND title = 'Rửa sạch dụng cụ, đồ dùng đã sử dụng'
    ) THEN
      INSERT INTO public.position_shift_tasks (tenant_id, position_id, title, kind, applicability, phase, is_required, done_definition, sort_order)
      VALUES (v_tenant_id, v_position_id, 'Rửa sạch dụng cụ, đồ dùng đã sử dụng', 'standard', 'every_shift', 'end_of_shift', true, 'Dụng cụ, đồ dùng đã rửa sạch, không dầu mỡ, để ráo đúng nơi quy định.', 8);
    END IF;

    -- 9. Dọn dẹp, vệ sinh quầy (every_shift, end_of_shift)
    IF NOT EXISTS (
      SELECT 1 FROM public.position_shift_tasks
       WHERE tenant_id = v_tenant_id AND position_id = v_position_id AND title = 'Dọn dẹp, vệ sinh quầy'
    ) THEN
      INSERT INTO public.position_shift_tasks (tenant_id, position_id, title, kind, applicability, phase, is_required, done_definition, sort_order)
      VALUES (v_tenant_id, v_position_id, 'Dọn dẹp, vệ sinh quầy', 'standard', 'every_shift', 'end_of_shift', true, 'Mặt quầy sạch, không dầu mỡ, rác đã đổ, dụng cụ sắp xếp gọn gàng.', 9);
    END IF;

    -- 10. Tắt máy KDS (closing, end_of_shift)
    IF NOT EXISTS (
      SELECT 1 FROM public.position_shift_tasks
       WHERE tenant_id = v_tenant_id AND position_id = v_position_id AND title = 'Tắt máy KDS'
    ) THEN
      INSERT INTO public.position_shift_tasks (tenant_id, position_id, title, kind, applicability, phase, is_required, done_definition, sort_order)
      VALUES (v_tenant_id, v_position_id, 'Tắt máy KDS', 'standard', 'closing', 'end_of_shift', true, 'Màn hình KDS đã tắt nguồn an toàn cuối ngày.', 10);
    END IF;

    -- 11. Kiểm tra, báo cáo nguyên liệu dư (closing, end_of_shift)
    IF NOT EXISTS (
      SELECT 1 FROM public.position_shift_tasks
       WHERE tenant_id = v_tenant_id AND position_id = v_position_id AND title = 'Kiểm tra, báo cáo nguyên liệu dư'
    ) THEN
      INSERT INTO public.position_shift_tasks (tenant_id, position_id, title, kind, applicability, phase, is_required, done_definition, sort_order)
      VALUES (v_tenant_id, v_position_id, 'Kiểm tra, báo cáo nguyên liệu dư', 'standard', 'closing', 'end_of_shift', true, 'Đã đếm nguyên liệu còn dư cuối ngày và ghi/báo cáo số liệu cho quản lý (phạm vi khu/phần phụ trách; quản lý chốt số tổng).', 11);
    END IF;

    -- 12. Kiểm tra hao hụt, báo cáo tồn kho (closing, end_of_shift)
    IF NOT EXISTS (
      SELECT 1 FROM public.position_shift_tasks
       WHERE tenant_id = v_tenant_id AND position_id = v_position_id AND title = 'Kiểm tra hao hụt, báo cáo tồn kho'
    ) THEN
      INSERT INTO public.position_shift_tasks (tenant_id, position_id, title, kind, applicability, phase, is_required, done_definition, sort_order)
      VALUES (v_tenant_id, v_position_id, 'Kiểm tra hao hụt, báo cáo tồn kho', 'standard', 'closing', 'end_of_shift', true, 'Đã đối chiếu hao hụt và ghi nhận/báo cáo tồn kho cuối ngày cho quản lý (phạm vi khu/phần phụ trách; quản lý chốt số tổng).', 12);
    END IF;

  END LOOP;
END $$;
