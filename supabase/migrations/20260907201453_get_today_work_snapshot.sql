-- Migration: get_today_work_snapshot
-- One HTTP round-trip for today/yesterday work detail. Stale-open finder
-- stays a separate LIMIT 1 query; this RPC does not bound forgotten shifts.

CREATE INDEX IF NOT EXISTS idx_attendance_records_stale_open
  ON public.attendance_records (tenant_id, employee_id, date)
  WHERE check_out IS NULL AND check_in IS NOT NULL;

CREATE OR REPLACE FUNCTION public.get_today_work_snapshot(
  p_employee_id bigint,
  p_from_date date,
  p_to_date date,
  p_branch_id bigint DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_tenant bigint := public.auth_tenant_id();
  v_profile uuid;
BEGIN
  IF v_uid IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  IF p_employee_id IS NULL OR p_from_date IS NULL OR p_to_date IS NULL
     OR p_from_date > p_to_date THEN
    RAISE EXCEPTION 'invalid_input' USING ERRCODE = '22023';
  END IF;

  SELECT employee.profile_id
    INTO v_profile
    FROM public.employees AS employee
   WHERE employee.id = p_employee_id
     AND employee.tenant_id = v_tenant;

  IF v_profile IS NULL OR v_profile IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN jsonb_build_object(
    'shifts',
    COALESCE((
      SELECT jsonb_agg(to_jsonb(shift_row) ORDER BY shift_row.start_time)
      FROM (
        SELECT
          shift.id,
          shift.name,
          shift.start_time,
          shift.end_time,
          shift.is_split,
          shift.start_time_2,
          shift.end_time_2
        FROM public.shifts AS shift
        WHERE shift.tenant_id = v_tenant
          AND shift.is_active
          AND (shift.branch_id IS NULL OR shift.branch_id = COALESCE(p_branch_id, -1))
      ) AS shift_row
    ), '[]'::jsonb),
    'shift_assignments',
    COALESCE((
      SELECT jsonb_agg(to_jsonb(assignment_row))
      FROM (
        SELECT
          assignment.work_date,
          assignment.shift_id,
          shift.name AS shift_name,
          shift.start_time,
          shift.end_time,
          shift.is_active,
          shift.is_split,
          shift.start_time_2,
          shift.end_time_2
        FROM public.shift_assignments AS assignment
        JOIN public.shifts AS shift
          ON shift.id = assignment.shift_id
         AND shift.tenant_id = assignment.tenant_id
        WHERE assignment.tenant_id = v_tenant
          AND assignment.employee_id = p_employee_id
          AND assignment.work_date >= p_from_date
          AND assignment.work_date <= p_to_date
          AND (
            (p_branch_id IS NULL AND assignment.branch_id IS NULL)
            OR assignment.branch_id = p_branch_id
          )
      ) AS assignment_row
    ), '[]'::jsonb),
    'attendance',
    COALESCE((
      SELECT jsonb_agg(to_jsonb(attendance_row) ORDER BY attendance_row.check_in)
      FROM (
        SELECT
          record.id,
          record.date,
          record.shift_id,
          record.branch_id,
          record.check_in,
          record.check_out,
          record.checkout_requested_at,
          record.checkout_requested_by_role,
          record.checkout_approval_target_roles,
          record.checkout_approved_at,
          record.checkout_approved_by,
          record.checkout_approval_note,
          record.check_in_photo_path,
          record.window_1_out_at,
          record.check_in_2,
          record.check_in_photo_path_2,
          record.scheduled_start_at_2,
          record.scheduled_end_at_2,
          branch.name AS branch_name,
          shift.name AS shift_name,
          shift.start_time AS shift_start_time,
          shift.end_time AS shift_end_time,
          shift.is_split,
          shift.start_time_2,
          shift.end_time_2
        FROM public.attendance_records AS record
        LEFT JOIN public.branches AS branch
          ON branch.id = record.branch_id
         AND branch.tenant_id = record.tenant_id
        LEFT JOIN public.shifts AS shift
          ON shift.id = record.shift_id
         AND shift.tenant_id = record.tenant_id
        WHERE record.tenant_id = v_tenant
          AND record.employee_id = p_employee_id
          AND record.date >= p_from_date
          AND record.date <= p_to_date
      ) AS attendance_row
    ), '[]'::jsonb),
    'checklist',
    COALESCE((
      SELECT jsonb_agg(to_jsonb(item_row) ORDER BY item_row.sort_order)
      FROM (
        SELECT
          item.id,
          item.attendance_record_id,
          item.template_item_id,
          item.title,
          item.task_kind,
          item.phase,
          item.done_definition,
          item.is_required,
          item.allows_photo,
          item.photo_path,
          item.sort_order,
          item.is_done,
          item.completed_at
        FROM public.attendance_checklist_items AS item
        JOIN public.attendance_records AS record
          ON record.id = item.attendance_record_id
         AND record.tenant_id = item.tenant_id
        WHERE item.tenant_id = v_tenant
          AND record.employee_id = p_employee_id
          AND record.date >= p_from_date
          AND record.date <= p_to_date
      ) AS item_row
    ), '[]'::jsonb),
    'count_assignments',
    COALESCE((
      SELECT jsonb_agg(to_jsonb(assignment_row))
      FROM (
        SELECT
          assignment.location_id,
          assignment.ingredient_id,
          assignment.shift_id
        FROM public.inventory_count_assignments AS assignment
        WHERE assignment.tenant_id = v_tenant
          AND assignment.employee_id = p_employee_id
          AND assignment.is_active
          AND (p_branch_id IS NULL OR assignment.branch_id = p_branch_id)
      ) AS assignment_row
    ), '[]'::jsonb),
    'shift_count_assignments',
    COALESCE((
      SELECT jsonb_agg(to_jsonb(assignment_row))
      FROM (
        SELECT
          assignment.location_id,
          assignment.ingredient_id,
          assignment.shift_id
        FROM public.inventory_count_assignments AS assignment
        WHERE assignment.tenant_id = v_tenant
          AND assignment.is_active
          AND assignment.shift_id IS NOT NULL
          AND p_branch_id IS NOT NULL
          AND assignment.branch_id = p_branch_id
      ) AS assignment_row
    ), '[]'::jsonb),
    'count_slips',
    COALESCE((
      SELECT jsonb_agg(to_jsonb(slip_row))
      FROM (
        SELECT
          slip.location_id,
          slip.status,
          slip.count_date,
          slip.shift_id
        FROM public.inventory_count_slips AS slip
        WHERE slip.tenant_id = v_tenant
          AND slip.employee_id = p_employee_id
          AND slip.count_date >= p_from_date
          AND slip.count_date <= p_to_date
          AND (p_branch_id IS NULL OR slip.branch_id = p_branch_id)
      ) AS slip_row
    ), '[]'::jsonb)
  );
END;
$$;

COMMENT ON FUNCTION public.get_today_work_snapshot(bigint, date, date, bigint) IS
  'Today/yesterday work detail for the signed-in employee. Stale-open punches stay a separate LIMIT 1 read.';

REVOKE ALL ON FUNCTION public.get_today_work_snapshot(bigint, date, date, bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_today_work_snapshot(bigint, date, date, bigint) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_today_work_snapshot(bigint, date, date, bigint) TO authenticated;
