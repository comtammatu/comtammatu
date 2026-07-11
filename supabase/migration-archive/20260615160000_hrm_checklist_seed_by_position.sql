-- D026 §2: seed 7 per-position checklist templates. Depends on migration
-- 20260615130000 (scope column + English phase). Owner decisions applied:
-- drop 'Chấm công' items (clock-in is a system event), drop the weekly
-- revenue task, drop the inferred manager during-shift item; non-manager
-- stock-report items scoped to their own area. Idempotent: replaces items
-- of existing global templates (keeps template id → employee FKs stay).

BEGIN;

DO $$
DECLARE
  v_tenant bigint;
  v_tid bigint;
BEGIN
  FOR v_tenant IN SELECT id FROM public.tenants LOOP

    -- ===== Phục vụ (waiter) — 19 việc =====
    SELECT id INTO v_tid FROM public.shift_checklist_templates
      WHERE tenant_id = v_tenant AND branch_id IS NULL AND name = 'Phục vụ' LIMIT 1;
    IF v_tid IS NULL THEN
      INSERT INTO public.shift_checklist_templates (tenant_id, branch_id, role_code, name, is_active)
      VALUES (v_tenant, NULL, NULL, 'Phục vụ', true) RETURNING id INTO v_tid;
    ELSE
      UPDATE public.shift_checklist_templates SET is_active = true WHERE id = v_tid;
      DELETE FROM public.shift_checklist_template_items WHERE tenant_id = v_tenant AND template_id = v_tid;
    END IF;
    INSERT INTO public.shift_checklist_template_items
      (tenant_id, template_id, title, phase, done_definition, is_required, scope, sort_order, is_active)
    VALUES
      (v_tenant, v_tid, 'Lau muỗng nĩa', 'start_of_shift', 'Muỗng nĩa sạch, khô, không vết bẩn, xếp gọn sẵn sàng phục vụ.', true, 'every_shift', 1, true),
      (v_tenant, v_tid, 'Lau bàn ghế, menu', 'start_of_shift', 'Bàn ghế sạch không dầu mỡ; menu lau sạch và xếp ngay ngắn.', true, 'every_shift', 2, true),
      (v_tenant, v_tid, 'Vệ sinh khu vực phục vụ: quét rác', 'start_of_shift', 'Sàn khu phục vụ sạch, không rác, không vụn thức ăn.', true, 'every_shift', 3, true),
      (v_tenant, v_tid, 'Setup bàn: muỗng nĩa, tăm ăn, khăn giấy', 'start_of_shift', 'Mỗi bàn đủ muỗng nĩa, tăm, khăn giấy, đặt đúng vị trí.', true, 'every_shift', 4, true),
      (v_tenant, v_tid, 'Setup quầy buffet: nước mắm, ớt xay, ớt trái', 'start_of_shift', 'Nước mắm, ớt xay, ớt trái đầy đủ, sạch, đặt sẵn tại quầy buffet.', true, 'every_shift', 5, true),
      (v_tenant, v_tid, 'Setup quầy pha chế: đá, trà tắc, rau má, cam, nước đường', 'start_of_shift', 'Đá, trà tắc, rau má, cam, nước đường đủ và sẵn sàng tại quầy pha chế.', true, 'every_shift', 6, true),
      (v_tenant, v_tid, 'Kiểm tra tất cả đồ dùng, nguyên liệu', 'start_of_shift', 'Đã kiểm đủ đồ dùng và nguyên liệu cho ca; thiếu thì báo bổ sung ngay.', true, 'every_shift', 7, true),
      (v_tenant, v_tid, 'Setup sọt đựng rác', 'start_of_shift', 'Sọt rác có lót túi, đặt đúng vị trí, sẵn sàng sử dụng.', true, 'every_shift', 8, true),
      (v_tenant, v_tid, 'Mở màn hình phục vụ', 'start_of_shift', 'Màn hình phục vụ đã bật, hiển thị đúng, sẵn sàng nhận đơn.', true, 'opening', 9, true),
      (v_tenant, v_tid, 'Đếm tiền đầu ca, mở ca', 'start_of_shift', 'Tiền đầu ca đã đếm, đối chiếu khớp và ca được mở trên hệ thống.', true, 'opening', 10, true),
      (v_tenant, v_tid, 'Lau cửa kính', 'start_of_shift', 'Cửa kính sạch, không vết tay, không bụi mờ.', false, 'every_shift', 11, true),
      (v_tenant, v_tid, 'Vệ sinh khu phục vụ', 'end_of_shift', 'Khu phục vụ sạch, bàn ghế gọn, sàn không rác và dầu mỡ.', true, 'every_shift', 12, true),
      (v_tenant, v_tid, 'Vệ sinh toàn bộ vật dụng: khay, hũ đựng', 'end_of_shift', 'Khay, hũ đựng rửa sạch, để ráo, cất đúng vị trí.', true, 'every_shift', 13, true),
      (v_tenant, v_tid, 'Vệ sinh quầy buffet', 'end_of_shift', 'Quầy buffet lau sạch, không dầu mỡ, đồ gia vị cất gọn.', true, 'every_shift', 14, true),
      (v_tenant, v_tid, 'Vệ sinh quầy pha chế', 'end_of_shift', 'Quầy pha chế lau sạch, dụng cụ rửa sạch và cất gọn.', true, 'every_shift', 15, true),
      (v_tenant, v_tid, 'Xả nước thùng đựng đá', 'end_of_shift', 'Thùng đá đã xả hết nước, lau khô bên trong, để ráo.', true, 'every_shift', 16, true),
      (v_tenant, v_tid, 'Tắt màn hình phục vụ', 'end_of_shift', 'Màn hình phục vụ đã tắt đúng cách sau khi đóng ca.', true, 'closing', 17, true),
      (v_tenant, v_tid, 'Đếm tiền cuối ca, chốt ca', 'end_of_shift', 'Tiền cuối ca đã đếm, đối chiếu khớp và ca được chốt trên hệ thống.', true, 'closing', 18, true),
      (v_tenant, v_tid, 'Kiểm tra, báo cáo tồn kho', 'end_of_shift', 'Đã kiểm tồn kho cuối ngày và gửi báo cáo số lượng/hao hụt cho quản lý (phạm vi khu/phần phụ trách; quản lý chốt số tổng).', true, 'closing', 19, true);

    -- ===== Phụ bếp (kitchen_helper) — 19 việc =====
    SELECT id INTO v_tid FROM public.shift_checklist_templates
      WHERE tenant_id = v_tenant AND branch_id IS NULL AND name = 'Phụ bếp' LIMIT 1;
    IF v_tid IS NULL THEN
      INSERT INTO public.shift_checklist_templates (tenant_id, branch_id, role_code, name, is_active)
      VALUES (v_tenant, NULL, NULL, 'Phụ bếp', true) RETURNING id INTO v_tid;
    ELSE
      UPDATE public.shift_checklist_templates SET is_active = true WHERE id = v_tid;
      DELETE FROM public.shift_checklist_template_items WHERE tenant_id = v_tenant AND template_id = v_tid;
    END IF;
    INSERT INTO public.shift_checklist_template_items
      (tenant_id, template_id, title, phase, done_definition, is_required, scope, sort_order, is_active)
    VALUES
      (v_tenant, v_tid, 'Bật cầu dao, hệ thống điện', 'start_of_shift', 'Cầu dao đã bật, đèn và thiết bị điện khu bếp hoạt động bình thường.', true, 'opening', 1, true),
      (v_tenant, v_tid, 'Chỉnh trang đồng phục: đội nón, đeo tạp dề, đeo bảng tên', 'start_of_shift', 'Đã đội nón, mang tạp dề sạch và đeo bảng tên đúng vị trí.', true, 'every_shift', 2, true),
      (v_tenant, v_tid, 'Chuẩn bị 2 nồi nước sôi', 'start_of_shift', '2 nồi nước đã sôi, sẵn sàng dùng trước giờ bán.', true, 'every_shift', 3, true),
      (v_tenant, v_tid, 'Nấu cơm', 'start_of_shift', 'Cơm chín đều, dẻo, đủ lượng phục vụ đầu ca.', true, 'every_shift', 4, true),
      (v_tenant, v_tid, 'Nấu canh', 'start_of_shift', 'Canh đã chín, nêm vừa ăn, đủ lượng phục vụ đầu ca.', true, 'every_shift', 5, true),
      (v_tenant, v_tid, 'Trộn bì', 'start_of_shift', 'Bì đã trộn đều thính và gia vị, để khay sẵn phục vụ.', true, 'every_shift', 6, true),
      (v_tenant, v_tid, 'Làm mỡ hành', 'start_of_shift', 'Mỡ hành thơm, hành chín tới, đựng hũ sẵn để múc.', true, 'every_shift', 7, true),
      (v_tenant, v_tid, 'Cắt chả', 'start_of_shift', 'Chả cắt đều miếng, xếp khay sẵn để phục vụ.', true, 'every_shift', 8, true),
      (v_tenant, v_tid, 'Cắt cà chua, dưa leo', 'start_of_shift', 'Cà chua, dưa leo rửa sạch, cắt đều, để khay sẵn dùng.', true, 'every_shift', 9, true),
      (v_tenant, v_tid, 'Xay ớt', 'start_of_shift', 'Ớt đã xay nhuyễn, đựng hũ sẵn trên quầy.', true, 'every_shift', 10, true),
      (v_tenant, v_tid, 'Chiên trứng', 'start_of_shift', 'Trứng chiên chín đều, để khay sẵn phục vụ.', true, 'every_shift', 11, true),
      (v_tenant, v_tid, 'Kiểm tra rau củ và sơ chế', 'start_of_shift', 'Rau củ tươi, đã loại bỏ phần hư, rửa và sơ chế xong, không còn nguyên liệu kém chất lượng.', true, 'every_shift', 12, true),
      (v_tenant, v_tid, 'Cho cơm vào nồi hấp khi chín', 'during_shift', 'Cơm chín được chuyển vào nồi hấp giữ nóng, luôn có cơm nóng sẵn để bán.', true, 'every_shift', 13, true),
      (v_tenant, v_tid, 'Vệ sinh tủ cơm', 'end_of_shift', 'Tủ cơm sạch trong và ngoài, không còn cặn cơm hay mùi.', true, 'every_shift', 14, true),
      (v_tenant, v_tid, 'Vệ sinh nồi canh', 'end_of_shift', 'Nồi canh rửa sạch, không còn cặn thức ăn, úp ráo.', true, 'every_shift', 15, true),
      (v_tenant, v_tid, 'Vệ sinh bếp gas', 'end_of_shift', 'Bếp gas đã khóa van, mặt bếp sạch dầu mỡ, không còn lửa hay rò khí.', true, 'every_shift', 16, true),
      (v_tenant, v_tid, 'Vệ sinh dụng cụ, đồ dùng đã sử dụng', 'end_of_shift', 'Dao, thớt, khay, dụng cụ đã rửa sạch và xếp gọn đúng nơi.', true, 'every_shift', 17, true),
      (v_tenant, v_tid, 'Vệ sinh khu vực bếp', 'end_of_shift', 'Sàn, bàn bếp sạch dầu mỡ, rác đã đổ, khu bếp khô ráo gọn gàng.', true, 'every_shift', 18, true),
      (v_tenant, v_tid, 'Kiểm tra hao hụt, báo cáo tồn kho', 'end_of_shift', 'Đã đếm tồn kho cuối ngày, ghi nhận hao hụt và gửi báo cáo tồn kho (phạm vi khu/phần phụ trách; quản lý chốt số tổng).', true, 'closing', 19, true);

    -- ===== Quầy (cashier) — 12 việc =====
    SELECT id INTO v_tid FROM public.shift_checklist_templates
      WHERE tenant_id = v_tenant AND branch_id IS NULL AND name = 'Quầy' LIMIT 1;
    IF v_tid IS NULL THEN
      INSERT INTO public.shift_checklist_templates (tenant_id, branch_id, role_code, name, is_active)
      VALUES (v_tenant, NULL, NULL, 'Quầy', true) RETURNING id INTO v_tid;
    ELSE
      UPDATE public.shift_checklist_templates SET is_active = true WHERE id = v_tid;
      DELETE FROM public.shift_checklist_template_items WHERE tenant_id = v_tenant AND template_id = v_tid;
    END IF;
    INSERT INTO public.shift_checklist_template_items
      (tenant_id, template_id, title, phase, done_definition, is_required, scope, sort_order, is_active)
    VALUES
      (v_tenant, v_tid, 'Chỉnh trang đồng phục: đội nón, đeo tạp dề, đeo bảng tên', 'start_of_shift', 'Mặc đủ đồng phục, đội nón, đeo tạp dề và bảng tên gọn gàng, sạch sẽ.', true, 'every_shift', 1, true),
      (v_tenant, v_tid, 'Kiểm tra nồi hấp cơm', 'start_of_shift', 'Nồi hấp đủ nước, đã cắm điện và bật nóng, sạch và hoạt động bình thường, sẵn sàng hấp cơm.', true, 'every_shift', 2, true),
      (v_tenant, v_tid, 'Setup quầy bán: dụng cụ, nguyên liệu, đồ mang về', 'start_of_shift', 'Quầy đầy đủ dụng cụ, nguyên liệu và đồ mang về (hộp, túi), xếp đúng vị trí sẵn sàng bán.', true, 'every_shift', 3, true),
      (v_tenant, v_tid, 'Mở máy KDS', 'start_of_shift', 'Màn hình KDS đã bật, lên đúng giao diện nhận đơn.', true, 'opening', 4, true),
      (v_tenant, v_tid, 'Đóng gói đồ chua vào túi zip', 'during_shift', 'Luôn có đủ túi zip đồ chua đã chia sẵn ở khu phục vụ, không để hết hàng giữa ca.', true, 'every_shift', 5, true),
      (v_tenant, v_tid, 'Đóng gói canh mang về', 'during_shift', 'Luôn có đủ phần canh mang về đã đóng kín ở khu phục vụ, không để hết hàng giữa ca.', true, 'every_shift', 6, true),
      (v_tenant, v_tid, 'Gói nguyên liệu còn thừa, cho vào tủ lạnh', 'end_of_shift', 'Nguyên liệu thừa được bọc kín, ghi rõ và cất vào tủ lạnh đúng nhiệt độ.', true, 'every_shift', 7, true),
      (v_tenant, v_tid, 'Rửa sạch dụng cụ, đồ dùng đã sử dụng', 'end_of_shift', 'Dụng cụ, đồ dùng đã rửa sạch, không dầu mỡ, để ráo đúng nơi quy định.', true, 'every_shift', 8, true),
      (v_tenant, v_tid, 'Dọn dẹp, vệ sinh quầy', 'end_of_shift', 'Mặt quầy sạch, không dầu mỡ, rác đã đổ, dụng cụ sắp xếp gọn gàng.', true, 'every_shift', 9, true),
      (v_tenant, v_tid, 'Tắt máy KDS', 'end_of_shift', 'Màn hình KDS đã tắt nguồn an toàn cuối ngày.', true, 'closing', 10, true),
      (v_tenant, v_tid, 'Kiểm tra, báo cáo nguyên liệu dư', 'end_of_shift', 'Đã đếm nguyên liệu còn dư cuối ngày và ghi/báo cáo số liệu cho quản lý (phạm vi khu/phần phụ trách; quản lý chốt số tổng).', true, 'closing', 11, true),
      (v_tenant, v_tid, 'Kiểm tra hao hụt, báo cáo tồn kho', 'end_of_shift', 'Đã đối chiếu hao hụt và ghi nhận/báo cáo tồn kho cuối ngày cho quản lý (phạm vi khu/phần phụ trách; quản lý chốt số tổng).', true, 'closing', 12, true);

    -- ===== Nướng (chef) — 10 việc =====
    SELECT id INTO v_tid FROM public.shift_checklist_templates
      WHERE tenant_id = v_tenant AND branch_id IS NULL AND name = 'Nướng' LIMIT 1;
    IF v_tid IS NULL THEN
      INSERT INTO public.shift_checklist_templates (tenant_id, branch_id, role_code, name, is_active)
      VALUES (v_tenant, NULL, NULL, 'Nướng', true) RETURNING id INTO v_tid;
    ELSE
      UPDATE public.shift_checklist_templates SET is_active = true WHERE id = v_tid;
      DELETE FROM public.shift_checklist_template_items WHERE tenant_id = v_tenant AND template_id = v_tid;
    END IF;
    INSERT INTO public.shift_checklist_template_items
      (tenant_id, template_id, title, phase, done_definition, is_required, scope, sort_order, is_active)
    VALUES
      (v_tenant, v_tid, 'Chỉnh trang đồng phục: đội nón, đeo bảng tên', 'start_of_shift', 'Mặc đúng đồng phục, đội nón che tóc, đeo bảng tên gọn gàng trước khi vào bếp.', true, 'every_shift', 1, true),
      (v_tenant, v_tid, 'Nhóm than', 'start_of_shift', 'Than hồng đều, đủ nhiệt, sẵn sàng nướng trước giờ bán.', true, 'every_shift', 2, true),
      (v_tenant, v_tid, 'Nướng sườn cây', 'during_shift', 'Sườn cây chín đều, không cháy khét, ra món kịp theo đơn.', true, 'every_shift', 3, true),
      (v_tenant, v_tid, 'Nướng sườn cốt lết', 'during_shift', 'Sườn cốt lết chín đều, không cháy khét, ra món kịp theo đơn.', true, 'every_shift', 4, true),
      (v_tenant, v_tid, 'Thay vỉ khi vỉ bị đen', 'during_shift', 'Vỉ đang dùng sạch, không còn vỉ đen/đóng cặn trên lò.', false, 'every_shift', 5, true),
      (v_tenant, v_tid, 'Chà vỉ nướng', 'during_shift', 'Vỉ nướng được chà sạch cặn cháy trong lúc bán, không còn mảng đen bám thịt.', true, 'every_shift', 6, true),
      (v_tenant, v_tid, 'Rửa sạch dụng cụ, vỉ nướng đã sử dụng', 'end_of_shift', 'Dụng cụ và vỉ nướng đã rửa sạch dầu mỡ, để ráo đúng nơi quy định.', true, 'every_shift', 7, true),
      (v_tenant, v_tid, 'Vệ sinh lò nướng', 'end_of_shift', 'Lò nướng sạch tro than và dầu mỡ, không còn vụn thức ăn cháy.', true, 'every_shift', 8, true),
      (v_tenant, v_tid, 'Vệ sinh khu bếp', 'end_of_shift', 'Sàn, bàn và khu bếp sạch dầu mỡ, rác đã đổ, dụng cụ xếp gọn.', true, 'every_shift', 9, true),
      (v_tenant, v_tid, 'Kiểm tra hao hụt, báo cáo tồn kho', 'end_of_shift', 'Đã đếm tồn cuối ngày, ghi nhận hao hụt và gửi báo cáo tồn kho (phạm vi khu/phần phụ trách; quản lý chốt số tổng).', true, 'closing', 10, true);

    -- ===== Tạp vụ ((chưa có code)) — 12 việc =====
    SELECT id INTO v_tid FROM public.shift_checklist_templates
      WHERE tenant_id = v_tenant AND branch_id IS NULL AND name = 'Tạp vụ' LIMIT 1;
    IF v_tid IS NULL THEN
      INSERT INTO public.shift_checklist_templates (tenant_id, branch_id, role_code, name, is_active)
      VALUES (v_tenant, NULL, NULL, 'Tạp vụ', true) RETURNING id INTO v_tid;
    ELSE
      UPDATE public.shift_checklist_templates SET is_active = true WHERE id = v_tid;
      DELETE FROM public.shift_checklist_template_items WHERE tenant_id = v_tenant AND template_id = v_tid;
    END IF;
    INSERT INTO public.shift_checklist_template_items
      (tenant_id, template_id, title, phase, done_definition, is_required, scope, sort_order, is_active)
    VALUES
      (v_tenant, v_tid, 'Chỉnh trang đồng phục: đội nón, đeo bảng tên', 'start_of_shift', 'Mặc đồng phục gọn gàng, đội nón và đeo bảng tên đầy đủ trước khi vào việc.', true, 'every_shift', 1, true),
      (v_tenant, v_tid, 'Vệ sinh khu vực nhà vệ sinh', 'start_of_shift', 'Nhà vệ sinh sạch, không mùi hôi, sàn khô, đủ giấy và xà phòng.', true, 'every_shift', 2, true),
      (v_tenant, v_tid, 'Lau chùi bồn rửa tay, mặt gương', 'start_of_shift', 'Bồn rửa tay và mặt gương sạch bóng, không vết nước, không cặn bẩn.', true, 'every_shift', 3, true),
      (v_tenant, v_tid, 'Dọn đĩa chén khách ăn xong', 'during_shift', 'Bàn khách ăn xong được dọn sạch ngay, không tồn đĩa chén dơ trên bàn.', true, 'every_shift', 4, true),
      (v_tenant, v_tid, 'Rửa chén dĩa', 'during_shift', 'Chén dĩa rửa liên tục, không dồn ứ, luôn đủ chén dĩa sạch để phục vụ.', true, 'every_shift', 5, true),
      (v_tenant, v_tid, 'Quét dọn phòng lạnh, khu vực phục vụ khi dơ', 'during_shift', 'Khi phát hiện dơ, phòng lạnh và khu phục vụ được quét sạch, không rác, không thức ăn rơi vãi.', false, 'every_shift', 6, true),
      (v_tenant, v_tid, 'Lau sàn khu vực bếp khi dơ', 'during_shift', 'Khi phát hiện dơ, sàn bếp được lau khô ráo, không dầu mỡ, không trơn trượt.', false, 'every_shift', 7, true),
      (v_tenant, v_tid, 'Tưới cây', 'start_of_shift', 'Cây được tưới đủ ẩm, đất không úng nước, lá xanh tươi.', false, 'every_shift', 8, true),
      (v_tenant, v_tid, 'Dọn dẹp, vệ sinh sạch sẽ bàn ghế', 'end_of_shift', 'Bàn ghế sạch, không dầu mỡ, xếp ngay ngắn về vị trí cuối ca.', true, 'every_shift', 9, true),
      (v_tenant, v_tid, 'Dọn dẹp, vệ sinh sạch sẽ khu vực phục vụ', 'end_of_shift', 'Khu phục vụ sạch, sàn khô, không rác, gọn gàng cuối ca.', true, 'every_shift', 10, true),
      (v_tenant, v_tid, 'Rửa sạch chén, dĩa, muỗng nĩa', 'end_of_shift', 'Toàn bộ chén, dĩa, muỗng nĩa rửa sạch, để khô ráo và xếp đúng nơi quy định.', true, 'every_shift', 11, true),
      (v_tenant, v_tid, 'Dọn dẹp nhà vệ sinh sạch sẽ', 'end_of_shift', 'Nhà vệ sinh sạch, không mùi, sàn khô, thùng rác được đổ trước khi đóng ca.', true, 'every_shift', 12, true);

    -- ===== Cửa hàng trưởng (branch_manager) — 13 việc =====
    SELECT id INTO v_tid FROM public.shift_checklist_templates
      WHERE tenant_id = v_tenant AND branch_id IS NULL AND name = 'Cửa hàng trưởng' LIMIT 1;
    IF v_tid IS NULL THEN
      INSERT INTO public.shift_checklist_templates (tenant_id, branch_id, role_code, name, is_active)
      VALUES (v_tenant, NULL, NULL, 'Cửa hàng trưởng', true) RETURNING id INTO v_tid;
    ELSE
      UPDATE public.shift_checklist_templates SET is_active = true WHERE id = v_tid;
      DELETE FROM public.shift_checklist_template_items WHERE tenant_id = v_tenant AND template_id = v_tid;
    END IF;
    INSERT INTO public.shift_checklist_template_items
      (tenant_id, template_id, title, phase, done_definition, is_required, scope, sort_order, is_active)
    VALUES
      (v_tenant, v_tid, 'Chỉnh trang đồng phục, đeo bảng tên', 'start_of_shift', 'Đồng phục gọn gàng, đeo bảng tên đúng vị trí trước giờ vào ca.', true, 'every_shift', 1, true),
      (v_tenant, v_tid, 'Điểm danh nhân sự đầu ca', 'start_of_shift', 'Đã điểm danh đủ nhân sự ca, ghi nhận người vắng và đi trễ.', true, 'every_shift', 2, true),
      (v_tenant, v_tid, 'Kiểm tra đồng phục, tác phong nhân viên', 'start_of_shift', 'Nhân viên mặc đúng đồng phục, sạch sẽ, đeo bảng tên trước giờ bán.', true, 'every_shift', 3, true),
      (v_tenant, v_tid, 'Kiểm tra món: cơm, canh, bì, chả, trứng', 'start_of_shift', 'Các món đủ số lượng, đạt chất lượng và an toàn để bán trong ca.', true, 'every_shift', 4, true),
      (v_tenant, v_tid, 'Kiểm tra vệ sinh khu vực khách ngồi', 'start_of_shift', 'Bàn ghế và sàn khu khách sạch, không rác hay dầu mỡ trước giờ bán.', true, 'every_shift', 5, true),
      (v_tenant, v_tid, 'Kiểm tra vệ sinh quầy, khu vực nướng', 'start_of_shift', 'Quầy và khu nướng sạch, dụng cụ đúng vị trí, sẵn sàng vận hành.', true, 'every_shift', 6, true),
      (v_tenant, v_tid, 'Kiểm tra vệ sinh nhà vệ sinh', 'start_of_shift', 'Nhà vệ sinh sạch, đủ giấy và xà phòng, không mùi trước giờ bán.', true, 'every_shift', 7, true),
      (v_tenant, v_tid, 'Kiểm tra chứng từ xuất-nhập nguyên liệu', 'start_of_shift', 'Chứng từ xuất-nhập nguyên liệu khớp với thực nhận đầu ngày.', true, 'opening', 8, true),
      (v_tenant, v_tid, 'Kiểm kê tồn kho đầu ngày so với thực tế', 'start_of_shift', 'Tồn trên app khớp đếm thực tế, chênh lệch đầu ngày đã ghi nhận.', true, 'opening', 9, true),
      (v_tenant, v_tid, 'Thống kê hao hụt nguyên liệu trên app', 'end_of_shift', 'Đã nhập đủ số hao hụt nguyên liệu cuối ngày vào app.', true, 'closing', 10, true),
      (v_tenant, v_tid, 'Thống kê tồn kho cuối ngày trên app', 'end_of_shift', 'Đã cập nhật tồn kho cuối ngày trên app, có số liệu để đối chiếu.', true, 'closing', 11, true),
      (v_tenant, v_tid, 'Đối chiếu doanh thu cuối ngày', 'end_of_shift', 'Doanh thu trên app khớp tiền mặt và chuyển khoản, chênh lệch đã giải trình.', true, 'closing', 12, true),
      (v_tenant, v_tid, 'Lên đơn nhập hàng cho ngày hôm sau', 'end_of_shift', 'Đơn nhập hàng ngày mai đã lập đủ mặt hàng và số lượng cần đặt.', true, 'closing', 13, true);

    -- ===== Bếp trưởng (head_chef) — 10 việc =====
    SELECT id INTO v_tid FROM public.shift_checklist_templates
      WHERE tenant_id = v_tenant AND branch_id IS NULL AND name = 'Bếp trưởng' LIMIT 1;
    IF v_tid IS NULL THEN
      INSERT INTO public.shift_checklist_templates (tenant_id, branch_id, role_code, name, is_active)
      VALUES (v_tenant, NULL, NULL, 'Bếp trưởng', true) RETURNING id INTO v_tid;
    ELSE
      UPDATE public.shift_checklist_templates SET is_active = true WHERE id = v_tid;
      DELETE FROM public.shift_checklist_template_items WHERE tenant_id = v_tenant AND template_id = v_tid;
    END IF;
    INSERT INTO public.shift_checklist_template_items
      (tenant_id, template_id, title, phase, done_definition, is_required, scope, sort_order, is_active)
    VALUES
      (v_tenant, v_tid, 'Chỉnh trang đồng phục: đội nón, đeo bảng tên, mặc tạp dề', 'start_of_shift', 'Đội nón, đeo bảng tên, mặc tạp dề đầy đủ và gọn gàng trước giờ phục vụ', true, 'every_shift', 1, true),
      (v_tenant, v_tid, 'Kiểm tra nguyên liệu đầu ngày: thịt, rau, gia vị', 'start_of_shift', 'Thịt, rau, gia vị đủ số lượng, còn tươi, trong hạn dùng, không hư hỏng', true, 'opening', 2, true),
      (v_tenant, v_tid, 'Kiểm tra hàng nhận từ kho và nhà cung cấp', 'start_of_shift', 'Hàng nhận đúng số lượng, đạt chất lượng, đã đối chiếu khớp phiếu giao', true, 'opening', 3, true),
      (v_tenant, v_tid, 'Sản xuất món và tạo lệnh sản xuất', 'during_shift', 'Món được làm đủ theo nhu cầu bán, lệnh sản xuất được ghi nhận trên hệ thống', true, 'every_shift', 4, true),
      (v_tenant, v_tid, 'Báo cáo khối lượng sản phẩm đã sản xuất', 'end_of_shift', 'Số lượng từng món đã sản xuất trong ngày được ghi nhận và gửi báo cáo', true, 'closing', 5, true),
      (v_tenant, v_tid, 'Vệ sinh khu vực làm việc đầu ca', 'start_of_shift', 'Bàn bếp, dụng cụ và sàn khu vực làm việc sạch, khô, sẵn sàng phục vụ', true, 'every_shift', 6, true),
      (v_tenant, v_tid, 'Đảm bảo an toàn thực phẩm', 'during_shift', 'Thực phẩm bảo quản đúng nhiệt độ, không lẫn sống-chín, dụng cụ sạch suốt ca', true, 'every_shift', 7, true),
      (v_tenant, v_tid, 'Kiểm tra nguyên liệu tồn cuối ngày', 'end_of_shift', 'Số lượng nguyên liệu còn tồn cuối ngày đã được đếm và ghi nhận (phạm vi khu/phần phụ trách; quản lý chốt số tổng).', true, 'closing', 8, true),
      (v_tenant, v_tid, 'Lập đề xuất mua hàng cho ngày hôm sau', 'end_of_shift', 'Đề xuất mua hàng cho ngày mai đã lập đủ mặt hàng và gửi đi', true, 'closing', 9, true),
      (v_tenant, v_tid, 'Vệ sinh toàn bộ khu vực làm việc cuối ca', 'end_of_shift', 'Bếp, dụng cụ, tủ và sàn dọn sạch, không dầu mỡ, rác đã đổ trước khi đóng bếp', true, 'every_shift', 10, true);

  END LOOP;
END $$;

COMMIT;
