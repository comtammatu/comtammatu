-- Refine floor position_shift_tasks to separate physical floor duties from web app system actions.
-- System actions (clock-in, clock-out, POS cash session close, KDS, inventory count) are handled natively by app routes.

-- 1. Free unique (position_id, sort_order) before inserting the refined compact set.
UPDATE public.position_shift_tasks AS task
SET is_active = false,
    sort_order = task.sort_order + 20000
FROM public.positions AS position
WHERE position.id = task.position_id
  AND position.tenant_id = task.tenant_id
  AND position.code IN (
    'branch_manager',
    'cashier',
    'chef',
    'cleaner',
    'grill_counter',
    'guard',
    'kitchen_counter',
    'kitchen_helper',
    'waiter'
  );

-- 2. Insert the refined compact tasks set.
WITH seed(
  code, phase, title, done_definition, sort_order, allows_photo
) AS (
  VALUES
    -- Phục vụ (waiter)
    ('waiter', 'start_of_shift', 'Setup sảnh (bàn ghế, muỗng nĩa, tăm, giấy, buffet)', '', 1, false),
    ('waiter', 'start_of_shift', 'Lau sàn sảnh & cửa kính chống bụi, ruồi', '', 2, false),
    ('waiter', 'end_of_shift', 'Dọn sảnh, quầy buffet, menu', '', 3, false),
    ('waiter', 'end_of_shift', 'Dọn khu phụ trách', 'Chụp ảnh khu vực phụ trách đã dọn.', 4, true),

    -- Thu ngân (cashier)
    ('cashier', 'start_of_shift', 'Setup & vệ sinh quầy thu ngân, quầy pha chế', '', 1, false),
    ('cashier', 'start_of_shift', 'Hỗ trợ sảnh đón khách đầu ca', '', 2, false),
    ('cashier', 'end_of_shift', 'Vệ sinh quầy thu ngân, quầy pha chế, xả thùng đá', '', 3, false),
    ('cashier', 'end_of_shift', 'Dọn khu phụ trách', 'Chụp ảnh khu vực phụ trách đã dọn.', 4, true),

    -- Quầy lên món (kitchen_counter & chef)
    ('kitchen_counter', 'start_of_shift', 'Kiểm tra nồi hấp cơm & tủ giữ ấm', '', 1, false),
    ('kitchen_counter', 'start_of_shift', 'Setup quầy ra món (dụng cụ, topping, đồ mang về)', '', 2, false),
    ('kitchen_counter', 'end_of_shift', 'Cất nguyên liệu thừa vào tủ lạnh', '', 3, false),
    ('kitchen_counter', 'end_of_shift', 'Vệ sinh quầy ra món, nồi hấp cơm', '', 4, false),
    ('kitchen_counter', 'end_of_shift', 'Dọn khu phụ trách', 'Chụp ảnh khu vực phụ trách đã dọn.', 5, true),
    ('chef', 'start_of_shift', 'Kiểm tra nồi hấp cơm & tủ giữ ấm', '', 1, false),
    ('chef', 'start_of_shift', 'Setup quầy ra món (dụng cụ, topping, đồ mang về)', '', 2, false),
    ('chef', 'end_of_shift', 'Cất nguyên liệu thừa vào tủ lạnh', '', 3, false),
    ('chef', 'end_of_shift', 'Vệ sinh quầy ra món, nồi hấp cơm', '', 4, false),
    ('chef', 'end_of_shift', 'Dọn khu phụ trách', 'Chụp ảnh khu vực phụ trách đã dọn.', 5, true),

    -- Quầy nướng (grill_counter)
    ('grill_counter', 'start_of_shift', 'Nhóm than, kiểm tra lò, chuẩn bị vỉ sạch', '', 1, false),
    ('grill_counter', 'start_of_shift', 'Nướng sườn cây & sườn cốt lết theo định mức', '', 2, false),
    ('grill_counter', 'end_of_shift', 'Rửa sạch vỉ nướng, kẹp gắp', '', 3, false),
    ('grill_counter', 'end_of_shift', 'Vệ sinh lò nướng, khu nướng', '', 4, false),
    ('grill_counter', 'end_of_shift', 'Dọn khu phụ trách', 'Chụp ảnh khu vực phụ trách đã dọn.', 5, true),

    -- Phụ bếp (kitchen_helper)
    ('kitchen_helper', 'start_of_shift', 'Nấu cơm tấm & nước canh theo định lượng', '', 1, false),
    ('kitchen_helper', 'start_of_shift', 'Sơ chế topping (bì, chả, trứng, mỡ hành, đồ chua, rau củ)', '', 2, false),
    ('kitchen_helper', 'end_of_shift', 'Vệ sinh tủ cơm, nồi canh, bếp chiên/gas', '', 3, false),
    ('kitchen_helper', 'end_of_shift', 'Rửa dụng cụ bếp & vệ sinh sàn bếp', '', 4, false),
    ('kitchen_helper', 'end_of_shift', 'Dọn khu phụ trách', 'Chụp ảnh khu vực phụ trách đã dọn.', 5, true),

    -- Tạp vụ (cleaner)
    ('cleaner', 'start_of_shift', 'Vệ sinh & khử mùi WC', '', 1, false),
    ('cleaner', 'start_of_shift', 'Chuẩn bị khu vực bồn rửa chén, phân loại dĩa dơ', '', 2, false),
    ('cleaner', 'end_of_shift', 'Rửa sạch toàn bộ chén dĩa, muỗng nĩa', '', 3, false),
    ('cleaner', 'end_of_shift', 'Dọn dẹp WC, đổ rác, lau sàn khu rửa', '', 4, false),
    ('cleaner', 'end_of_shift', 'Dọn khu phụ trách', 'Chụp ảnh khu vực phụ trách đã dọn.', 5, true),

    -- Bảo vệ (guard)
    ('guard', 'start_of_shift', 'Quét sân trước, tưới cây, sắp xếp xe', '', 1, false),
    ('guard', 'start_of_shift', 'Hỗ trợ dắt xe & hướng dẫn khách', '', 2, false),
    ('guard', 'end_of_shift', 'Kéo bạt chiều, dọn dẹp trước quán', '', 3, false),
    ('guard', 'end_of_shift', 'Dọn khu phụ trách', 'Chụp ảnh khu vực phụ trách đã dọn.', 4, true),

    -- Quản lý chi nhánh (branch_manager)
    ('branch_manager', 'start_of_shift', 'Điểm danh ca làm việc', '', 1, false),
    ('branch_manager', 'start_of_shift', 'Kiểm tra sẵn sàng bán (món, thiết bị, vệ sinh)', '', 2, false),
    ('branch_manager', 'end_of_shift', 'Đối chiếu doanh thu & kiểm tra chốt ca POS', '', 3, false),
    ('branch_manager', 'end_of_shift', 'Duyệt kiểm kê tồn & duyệt đặt hàng ngày mai', '', 4, false),
    ('branch_manager', 'end_of_shift', 'Dọn khu phụ trách', 'Chụp ảnh khu vực phụ trách đã dọn.', 5, true)
)
INSERT INTO public.position_shift_tasks (
  tenant_id, position_id, title, kind, applicability, phase,
  is_required, allows_photo, done_definition, sort_order, is_active
)
SELECT
  position.tenant_id,
  position.id,
  seed.title,
  'standard',
  'every_shift',
  seed.phase,
  true,
  seed.allows_photo,
  seed.done_definition,
  seed.sort_order,
  true
FROM seed
JOIN public.positions AS position
  ON position.code = seed.code
 AND position.is_active;

-- 3. Update open attendance records (not yet checked out or requested checkout) to snapshot the refined tasks.
DELETE FROM public.attendance_checklist_items AS item
USING public.attendance_records AS attendance
WHERE item.attendance_record_id = attendance.id
  AND item.tenant_id = attendance.tenant_id
  AND attendance.check_out IS NULL
  AND attendance.checkout_requested_at IS NULL
  AND item.task_kind <> 'inventory_count';

INSERT INTO public.attendance_checklist_items (
  tenant_id, attendance_record_id, template_item_id, title, phase,
  done_definition, is_required, allows_photo, scope, task_kind, sort_order
)
SELECT
  attendance.tenant_id,
  attendance.id,
  NULL,
  task.title,
  task.phase,
  task.done_definition,
  task.is_required,
  task.allows_photo,
  task.applicability,
  task.kind,
  row_number() OVER (
    PARTITION BY attendance.id
    ORDER BY task.sort_order, task.id
  )::integer
FROM public.attendance_records AS attendance
JOIN public.employees AS employee
  ON employee.id = attendance.employee_id
 AND employee.tenant_id = attendance.tenant_id
JOIN public.profiles AS profile
  ON profile.id = employee.profile_id
 AND profile.tenant_id = attendance.tenant_id
JOIN public.position_shift_tasks AS task
  ON task.position_id = profile.position_id
 AND task.tenant_id = attendance.tenant_id
 AND task.is_active
WHERE attendance.check_out IS NULL
  AND attendance.checkout_requested_at IS NULL;
