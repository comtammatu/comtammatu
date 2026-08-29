-- Migration: repair_guard_shift_assignments

-- The standardized guard catalog retired the legacy shift rows, but recurring
-- assignments that had already been materialized still referenced them. Keep
-- the repair tenant-scoped and resolve every identity from the catalog.
CREATE TEMP TABLE guard_shift_repair_map ON COMMIT DROP AS
SELECT
  legacy.tenant_id,
  legacy.id AS legacy_shift_id,
  canonical.id AS canonical_shift_id
FROM public.shifts legacy
JOIN public.shifts canonical
  ON canonical.tenant_id = legacy.tenant_id
 AND canonical.branch_id IS NULL
 AND canonical.name = CASE legacy.name
   WHEN 'Bảo vệ Ca sáng' THEN 'Ca Bảo vệ Ngày'
   WHEN 'Bảo vệ Ca chiều' THEN 'Ca Bảo vệ Đêm'
 END
 AND canonical.is_active
WHERE legacy.branch_id IS NULL
  AND legacy.name IN ('Bảo vệ Ca sáng', 'Bảo vệ Ca chiều');

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.shifts legacy
    WHERE legacy.branch_id IS NULL
      AND legacy.name IN ('Bảo vệ Ca sáng', 'Bảo vệ Ca chiều')
      AND NOT EXISTS (
        SELECT 1
        FROM pg_temp.guard_shift_repair_map mapping
        WHERE mapping.legacy_shift_id = legacy.id
      )
  ) THEN
    RAISE EXCEPTION 'guard_shift_repair_missing_canonical_mapping';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.shift_assignments legacy_assignment
    JOIN pg_temp.guard_shift_repair_map mapping
      ON mapping.tenant_id = legacy_assignment.tenant_id
     AND mapping.legacy_shift_id = legacy_assignment.shift_id
    JOIN public.shift_assignments canonical_assignment
      ON canonical_assignment.tenant_id = legacy_assignment.tenant_id
     AND canonical_assignment.employee_id = legacy_assignment.employee_id
     AND canonical_assignment.work_date = legacy_assignment.work_date
     AND canonical_assignment.shift_id = mapping.canonical_shift_id
    WHERE legacy_assignment.work_date >= (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
  ) THEN
    RAISE EXCEPTION 'guard_shift_repair_assignment_conflict';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.shift_assignments assignment
    JOIN pg_temp.guard_shift_repair_map mapping
      ON mapping.tenant_id = assignment.tenant_id
     AND mapping.legacy_shift_id = assignment.shift_id
    WHERE assignment.source = 'recurring'
      AND assignment.work_date >= (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
    GROUP BY
      assignment.tenant_id,
      assignment.employee_id,
      extract(isodow FROM assignment.work_date)
    HAVING count(DISTINCT mapping.canonical_shift_id) > 1
  ) THEN
    RAISE EXCEPTION 'guard_shift_repair_ambiguous_weekly_pattern';
  END IF;
END;
$$;

-- Capture the recurring pattern before replacing the legacy shift IDs. This
-- restores schedules deleted by the catalog standardization and lets the
-- nightly materializer continue after the already-generated 120-day horizon.
CREATE TEMP TABLE guard_weekly_repair_candidates ON COMMIT DROP AS
SELECT
  assignment.tenant_id,
  assignment.employee_id,
  (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS effective_from,
  max(mapping.canonical_shift_id) FILTER (
    WHERE extract(isodow FROM assignment.work_date) = 1
  ) AS monday_shift_id,
  max(mapping.canonical_shift_id) FILTER (
    WHERE extract(isodow FROM assignment.work_date) = 2
  ) AS tuesday_shift_id,
  max(mapping.canonical_shift_id) FILTER (
    WHERE extract(isodow FROM assignment.work_date) = 3
  ) AS wednesday_shift_id,
  max(mapping.canonical_shift_id) FILTER (
    WHERE extract(isodow FROM assignment.work_date) = 4
  ) AS thursday_shift_id,
  max(mapping.canonical_shift_id) FILTER (
    WHERE extract(isodow FROM assignment.work_date) = 5
  ) AS friday_shift_id,
  max(mapping.canonical_shift_id) FILTER (
    WHERE extract(isodow FROM assignment.work_date) = 6
  ) AS saturday_shift_id,
  max(mapping.canonical_shift_id) FILTER (
    WHERE extract(isodow FROM assignment.work_date) = 7
  ) AS sunday_shift_id
FROM public.shift_assignments assignment
JOIN pg_temp.guard_shift_repair_map mapping
  ON mapping.tenant_id = assignment.tenant_id
 AND mapping.legacy_shift_id = assignment.shift_id
JOIN public.employees employee
  ON employee.id = assignment.employee_id
 AND employee.tenant_id = assignment.tenant_id
 AND employee.is_active
JOIN public.profiles profile
  ON profile.id = employee.profile_id
 AND profile.tenant_id = employee.tenant_id
 AND profile.is_active
JOIN public.positions position
  ON position.id = profile.position_id
 AND position.tenant_id = profile.tenant_id
 AND position.code = 'guard'
 AND position.is_active
WHERE assignment.source = 'recurring'
  AND assignment.work_date >= (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
GROUP BY assignment.tenant_id, assignment.employee_id;

UPDATE public.employee_weekly_schedules schedule
SET
  monday_shift_id = COALESCE((
    SELECT mapping.canonical_shift_id
    FROM pg_temp.guard_shift_repair_map mapping
    WHERE mapping.tenant_id = schedule.tenant_id
      AND mapping.legacy_shift_id = schedule.monday_shift_id
  ), schedule.monday_shift_id),
  tuesday_shift_id = COALESCE((
    SELECT mapping.canonical_shift_id
    FROM pg_temp.guard_shift_repair_map mapping
    WHERE mapping.tenant_id = schedule.tenant_id
      AND mapping.legacy_shift_id = schedule.tuesday_shift_id
  ), schedule.tuesday_shift_id),
  wednesday_shift_id = COALESCE((
    SELECT mapping.canonical_shift_id
    FROM pg_temp.guard_shift_repair_map mapping
    WHERE mapping.tenant_id = schedule.tenant_id
      AND mapping.legacy_shift_id = schedule.wednesday_shift_id
  ), schedule.wednesday_shift_id),
  thursday_shift_id = COALESCE((
    SELECT mapping.canonical_shift_id
    FROM pg_temp.guard_shift_repair_map mapping
    WHERE mapping.tenant_id = schedule.tenant_id
      AND mapping.legacy_shift_id = schedule.thursday_shift_id
  ), schedule.thursday_shift_id),
  friday_shift_id = COALESCE((
    SELECT mapping.canonical_shift_id
    FROM pg_temp.guard_shift_repair_map mapping
    WHERE mapping.tenant_id = schedule.tenant_id
      AND mapping.legacy_shift_id = schedule.friday_shift_id
  ), schedule.friday_shift_id),
  saturday_shift_id = COALESCE((
    SELECT mapping.canonical_shift_id
    FROM pg_temp.guard_shift_repair_map mapping
    WHERE mapping.tenant_id = schedule.tenant_id
      AND mapping.legacy_shift_id = schedule.saturday_shift_id
  ), schedule.saturday_shift_id),
  sunday_shift_id = COALESCE((
    SELECT mapping.canonical_shift_id
    FROM pg_temp.guard_shift_repair_map mapping
    WHERE mapping.tenant_id = schedule.tenant_id
      AND mapping.legacy_shift_id = schedule.sunday_shift_id
  ), schedule.sunday_shift_id),
  updated_at = now()
WHERE EXISTS (
  SELECT 1
  FROM pg_temp.guard_shift_repair_map mapping
  WHERE mapping.tenant_id = schedule.tenant_id
    AND mapping.legacy_shift_id IN (
      schedule.monday_shift_id,
      schedule.tuesday_shift_id,
      schedule.wednesday_shift_id,
      schedule.thursday_shift_id,
      schedule.friday_shift_id,
      schedule.saturday_shift_id,
      schedule.sunday_shift_id
    )
);

INSERT INTO public.employee_weekly_schedules (
  tenant_id,
  employee_id,
  effective_from,
  monday_shift_id,
  tuesday_shift_id,
  wednesday_shift_id,
  thursday_shift_id,
  friday_shift_id,
  saturday_shift_id,
  sunday_shift_id,
  updated_by
)
SELECT
  candidate.tenant_id,
  candidate.employee_id,
  candidate.effective_from,
  candidate.monday_shift_id,
  candidate.tuesday_shift_id,
  candidate.wednesday_shift_id,
  candidate.thursday_shift_id,
  candidate.friday_shift_id,
  candidate.saturday_shift_id,
  candidate.sunday_shift_id,
  NULL
FROM pg_temp.guard_weekly_repair_candidates candidate
ON CONFLICT (tenant_id, employee_id)
DO UPDATE SET
  monday_shift_id = COALESCE(employee_weekly_schedules.monday_shift_id, EXCLUDED.monday_shift_id),
  tuesday_shift_id = COALESCE(employee_weekly_schedules.tuesday_shift_id, EXCLUDED.tuesday_shift_id),
  wednesday_shift_id = COALESCE(employee_weekly_schedules.wednesday_shift_id, EXCLUDED.wednesday_shift_id),
  thursday_shift_id = COALESCE(employee_weekly_schedules.thursday_shift_id, EXCLUDED.thursday_shift_id),
  friday_shift_id = COALESCE(employee_weekly_schedules.friday_shift_id, EXCLUDED.friday_shift_id),
  saturday_shift_id = COALESCE(employee_weekly_schedules.saturday_shift_id, EXCLUDED.saturday_shift_id),
  sunday_shift_id = COALESCE(employee_weekly_schedules.sunday_shift_id, EXCLUDED.sunday_shift_id),
  updated_at = now();

UPDATE public.shift_assignments assignment
SET
  shift_id = mapping.canonical_shift_id,
  updated_at = now()
FROM pg_temp.guard_shift_repair_map mapping
WHERE mapping.tenant_id = assignment.tenant_id
  AND mapping.legacy_shift_id = assignment.shift_id
  AND assignment.work_date >= (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date;

UPDATE public.attendance_records attendance
SET
  shift_id = mapping.canonical_shift_id,
  updated_at = now()
FROM pg_temp.guard_shift_repair_map mapping
WHERE mapping.tenant_id = attendance.tenant_id
  AND mapping.legacy_shift_id = attendance.shift_id
  AND attendance.date >= (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.shift_assignments assignment
    JOIN pg_temp.guard_shift_repair_map mapping
      ON mapping.tenant_id = assignment.tenant_id
     AND mapping.legacy_shift_id = assignment.shift_id
    WHERE assignment.work_date >= (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
  ) THEN
    RAISE EXCEPTION 'guard_shift_repair_incomplete';
  END IF;
END;
$$;
