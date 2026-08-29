-- Standardize branch shifts catalog: 3 operations shifts + 2 guard shifts, retire split shifts.

-- 1. Ensure the 5 canonical shifts exist for all tenants.
INSERT INTO public.shifts (tenant_id, branch_id, name, start_time, end_time, is_active, is_opening, is_closing)
SELECT
  t.id,
  NULL,
  v.name,
  v.start_time::time,
  v.end_time::time,
  true,
  v.is_opening,
  v.is_closing
FROM public.tenants t
CROSS JOIN (
  VALUES
    ('Ca Sáng', '06:00:00', '14:00:00', true, false),
    ('Ca Chiều', '14:00:00', '22:00:00', false, false),
    ('Ca Tối', '22:00:00', '02:00:00', false, true),
    ('Ca Bảo vệ Ngày', '06:00:00', '18:00:00', true, false),
    ('Ca Bảo vệ Đêm', '18:00:00', '06:00:00', false, true)
) AS v(name, start_time, end_time, is_opening, is_closing)
ON CONFLICT (tenant_id, name) WHERE (branch_id IS NULL)
DO UPDATE SET
  start_time = EXCLUDED.start_time,
  end_time = EXCLUDED.end_time,
  is_active = true,
  is_opening = EXCLUDED.is_opening,
  is_closing = EXCLUDED.is_closing,
  updated_at = now();

-- 2. Clear any retired split shifts from weekly schedules before deactivating to satisfy trigger protection.
WITH retired_shifts AS (
  SELECT s.id
  FROM public.shifts s
  WHERE s.branch_id IS NULL
    AND (
      s.name ILIKE '%gãy%'
      OR s.name ILIKE '%ca gãy%'
      OR (s.name ILIKE '%bảo vệ%' AND s.name NOT IN ('Ca Bảo vệ Ngày', 'Ca Bảo vệ Đêm'))
    )
)
DELETE FROM public.employee_weekly_schedules sched
WHERE (sched.monday_shift_id IN (SELECT id FROM retired_shifts) OR sched.monday_shift_id IS NULL)
  AND (sched.tuesday_shift_id IN (SELECT id FROM retired_shifts) OR sched.tuesday_shift_id IS NULL)
  AND (sched.wednesday_shift_id IN (SELECT id FROM retired_shifts) OR sched.wednesday_shift_id IS NULL)
  AND (sched.thursday_shift_id IN (SELECT id FROM retired_shifts) OR sched.thursday_shift_id IS NULL)
  AND (sched.friday_shift_id IN (SELECT id FROM retired_shifts) OR sched.friday_shift_id IS NULL)
  AND (sched.saturday_shift_id IN (SELECT id FROM retired_shifts) OR sched.saturday_shift_id IS NULL)
  AND (sched.sunday_shift_id IN (SELECT id FROM retired_shifts) OR sched.sunday_shift_id IS NULL)
  AND (
    sched.monday_shift_id IN (SELECT id FROM retired_shifts)
    OR sched.tuesday_shift_id IN (SELECT id FROM retired_shifts)
    OR sched.wednesday_shift_id IN (SELECT id FROM retired_shifts)
    OR sched.thursday_shift_id IN (SELECT id FROM retired_shifts)
    OR sched.friday_shift_id IN (SELECT id FROM retired_shifts)
    OR sched.saturday_shift_id IN (SELECT id FROM retired_shifts)
    OR sched.sunday_shift_id IN (SELECT id FROM retired_shifts)
  );

WITH retired_shifts AS (
  SELECT s.id
  FROM public.shifts s
  WHERE s.branch_id IS NULL
    AND (
      s.name ILIKE '%gãy%'
      OR s.name ILIKE '%ca gãy%'
      OR (s.name ILIKE '%bảo vệ%' AND s.name NOT IN ('Ca Bảo vệ Ngày', 'Ca Bảo vệ Đêm'))
    )
)
UPDATE public.employee_weekly_schedules sched
SET
  monday_shift_id = CASE WHEN sched.monday_shift_id IN (SELECT id FROM retired_shifts) THEN NULL ELSE sched.monday_shift_id END,
  tuesday_shift_id = CASE WHEN sched.tuesday_shift_id IN (SELECT id FROM retired_shifts) THEN NULL ELSE sched.tuesday_shift_id END,
  wednesday_shift_id = CASE WHEN sched.wednesday_shift_id IN (SELECT id FROM retired_shifts) THEN NULL ELSE sched.wednesday_shift_id END,
  thursday_shift_id = CASE WHEN sched.thursday_shift_id IN (SELECT id FROM retired_shifts) THEN NULL ELSE sched.thursday_shift_id END,
  friday_shift_id = CASE WHEN sched.friday_shift_id IN (SELECT id FROM retired_shifts) THEN NULL ELSE sched.friday_shift_id END,
  saturday_shift_id = CASE WHEN sched.saturday_shift_id IN (SELECT id FROM retired_shifts) THEN NULL ELSE sched.saturday_shift_id END,
  sunday_shift_id = CASE WHEN sched.sunday_shift_id IN (SELECT id FROM retired_shifts) THEN NULL ELSE sched.sunday_shift_id END,
  updated_at = now()
WHERE sched.monday_shift_id IN (SELECT id FROM retired_shifts)
   OR sched.tuesday_shift_id IN (SELECT id FROM retired_shifts)
   OR sched.wednesday_shift_id IN (SELECT id FROM retired_shifts)
   OR sched.thursday_shift_id IN (SELECT id FROM retired_shifts)
   OR sched.friday_shift_id IN (SELECT id FROM retired_shifts)
   OR sched.saturday_shift_id IN (SELECT id FROM retired_shifts)
   OR sched.sunday_shift_id IN (SELECT id FROM retired_shifts);

-- 3. Deactivate retired split shifts and old non-canonical shifts.
UPDATE public.shifts
SET
  is_active = false,
  updated_at = now()
WHERE branch_id IS NULL
  AND name NOT IN ('Ca Sáng', 'Ca Chiều', 'Ca Tối', 'Ca Bảo vệ Ngày', 'Ca Bảo vệ Đêm')
  AND (
    name ILIKE '%gãy%'
    OR name ILIKE '%bảo vệ%'
  );
