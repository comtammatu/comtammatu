-- Compact floor position_shift_tasks and require photo evidence to mark done.
-- Photo tasks cannot be completed without photo_path (CHECK + existing RPC).

-- Historical rows were marked done while photo was still optional.
UPDATE public.attendance_checklist_items AS item
SET allows_photo = false
FROM public.attendance_records AS attendance
WHERE attendance.id = item.attendance_record_id
  AND attendance.tenant_id = item.tenant_id
  AND attendance.check_out IS NOT NULL
  AND item.is_done
  AND item.allows_photo
  AND btrim(COALESCE(item.photo_path, '')) = '';

-- Open shifts must attach a photo before the item can stay done.
UPDATE public.attendance_checklist_items AS item
SET is_done = false,
    completed_at = NULL
FROM public.attendance_records AS attendance
WHERE attendance.id = item.attendance_record_id
  AND attendance.tenant_id = item.tenant_id
  AND attendance.check_out IS NULL
  AND item.is_done
  AND item.allows_photo
  AND btrim(COALESCE(item.photo_path, '')) = '';

ALTER TABLE public.attendance_checklist_items
  DROP CONSTRAINT IF EXISTS attendance_checklist_items_photo_required_when_done;

ALTER TABLE public.attendance_checklist_items
  ADD CONSTRAINT attendance_checklist_items_photo_required_when_done
  CHECK (
    (NOT is_done)
    OR (NOT allows_photo)
    OR (btrim(COALESCE(photo_path, '')) <> '')
  );

COMMENT ON CONSTRAINT attendance_checklist_items_photo_required_when_done
  ON public.attendance_checklist_items IS
  'allows_photo items cannot be is_done without photo_path.';

-- Free unique (position_id, sort_order) before inserting the compact set.
UPDATE public.position_shift_tasks AS task
SET is_active = false,
    sort_order = task.sort_order + 10000
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

WITH seed(
  code, phase, title, done_definition, sort_order, allows_photo
) AS (
  VALUES
    -- Thu ngân (kiêm phục vụ)
    ('cashier', 'start_of_shift', 'Đếm quỹ lẻ, mở ca POS', '', 1, false),
    ('cashier', 'start_of_shift', 'Setup sảnh (bàn, muỗng, buffet, nước)', '', 2, false),
    ('cashier', 'start_of_shift', 'Lau sàn chống ruồi', '', 3, false),
    ('cashier', 'end_of_shift', 'Đếm tiền, chốt ca POS', '', 4, false),
    ('cashier', 'end_of_shift', 'Dọn khu phụ trách', 'Chụp ảnh khu vực phụ trách đã dọn.', 5, true),

    -- Phục vụ — no cash count / POS close
    ('waiter', 'start_of_shift', 'Setup sảnh (bàn, muỗng, buffet, nước)', '', 1, false),
    ('waiter', 'start_of_shift', 'Lau sàn chống ruồi', '', 2, false),
    ('waiter', 'end_of_shift', 'Dọn sảnh, quầy nước', '', 3, false),
    ('waiter', 'end_of_shift', 'Dọn khu phụ trách', 'Chụp ảnh khu vực phụ trách đã dọn.', 4, true),

    -- Quầy lên món + leftover Bếp position
    ('kitchen_counter', 'start_of_shift', 'Bật KDS', '', 1, false),
    ('kitchen_counter', 'start_of_shift', 'Setup quầy (dụng cụ, topping, đồ mang về)', '', 2, false),
    ('kitchen_counter', 'end_of_shift', 'Cất thừa vào tủ', '', 3, false),
    ('kitchen_counter', 'end_of_shift', 'Tắt KDS, dọn quầy', '', 4, false),
    ('kitchen_counter', 'end_of_shift', 'Dọn khu phụ trách', 'Chụp ảnh khu vực phụ trách đã dọn.', 5, true),
    ('chef', 'start_of_shift', 'Bật KDS', '', 1, false),
    ('chef', 'start_of_shift', 'Setup quầy (dụng cụ, topping, đồ mang về)', '', 2, false),
    ('chef', 'end_of_shift', 'Cất thừa vào tủ', '', 3, false),
    ('chef', 'end_of_shift', 'Tắt KDS, dọn quầy', '', 4, false),
    ('chef', 'end_of_shift', 'Dọn khu phụ trách', 'Chụp ảnh khu vực phụ trách đã dọn.', 5, true),

    -- Quầy nướng
    ('grill_counter', 'start_of_shift', 'Nhóm than, lấy sườn', '', 1, false),
    ('grill_counter', 'end_of_shift', 'Rửa vỉ, vệ sinh lò', '', 2, false),
    ('grill_counter', 'end_of_shift', 'Dọn khu phụ trách', 'Chụp ảnh khu vực phụ trách đã dọn.', 3, true),

    -- Phụ bếp
    ('kitchen_helper', 'start_of_shift', 'Bật điện bếp', '', 1, false),
    ('kitchen_helper', 'start_of_shift', 'Nấu cơm, canh', '', 2, false),
    ('kitchen_helper', 'start_of_shift', 'Sơ chế topping (bì, chả, trứng, rau, ớt, mỡ hành)', '', 3, false),
    ('kitchen_helper', 'end_of_shift', 'Vệ sinh nồi, tủ, bếp', '', 4, false),
    ('kitchen_helper', 'end_of_shift', 'Dọn khu phụ trách', 'Chụp ảnh khu vực phụ trách đã dọn.', 5, true),

    -- Tạp vụ
    ('cleaner', 'start_of_shift', 'Vệ sinh WC', '', 1, false),
    ('cleaner', 'start_of_shift', 'Chuẩn bị khu rửa', '', 2, false),
    ('cleaner', 'end_of_shift', 'Rửa hết chén dĩa', '', 3, false),
    ('cleaner', 'end_of_shift', 'Đổ rác, lau sàn', '', 4, false),
    ('cleaner', 'end_of_shift', 'Dọn khu phụ trách', 'Chụp ảnh khu vực phụ trách đã dọn.', 5, true),

    -- Bảo vệ
    ('guard', 'start_of_shift', 'Quét sân trước', '', 1, false),
    ('guard', 'start_of_shift', 'Trông xe', '', 2, false),
    ('guard', 'end_of_shift', 'Kéo bạt, dọn khu phụ trách', 'Chụp ảnh khu vực phụ trách đã dọn.', 3, true),

    -- Quản lý chi nhánh
    ('branch_manager', 'start_of_shift', 'Điểm danh ca', '', 1, false),
    ('branch_manager', 'start_of_shift', 'Kiểm tra sẵn sàng bán (món + vệ sinh)', '', 2, false),
    ('branch_manager', 'end_of_shift', 'Đối chiếu doanh thu', '', 3, false),
    ('branch_manager', 'end_of_shift', 'Duyệt kiểm kê / đặt hàng ngày mai', '', 4, false),
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

-- Employee-specific templates would keep the long lists at clock-in.
UPDATE public.employees AS employee
SET default_checklist_template_id = NULL,
    updated_at = now()
FROM public.shift_checklist_templates AS template
WHERE template.id = employee.default_checklist_template_id
  AND template.tenant_id = employee.tenant_id
  AND template.employee_id = employee.id
  AND template.is_active;

UPDATE public.shift_checklist_templates
SET is_active = false,
    updated_at = now()
WHERE employee_id IS NOT NULL
  AND is_active;

-- Open shifts (not yet requested checkout) take the compact snapshot now.
DELETE FROM public.attendance_checklist_items AS item
USING public.attendance_records AS attendance
WHERE item.attendance_record_id = attendance.id
  AND item.tenant_id = attendance.tenant_id
  AND attendance.check_out IS NULL
  AND attendance.checkout_requested_at IS NULL
  AND item.task_kind <> 'inventory_count';

UPDATE public.attendance_checklist_items AS item
SET sort_order = 100
FROM public.attendance_records AS attendance
WHERE item.attendance_record_id = attendance.id
  AND item.tenant_id = attendance.tenant_id
  AND attendance.check_out IS NULL
  AND attendance.checkout_requested_at IS NULL
  AND item.task_kind = 'inventory_count';

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
