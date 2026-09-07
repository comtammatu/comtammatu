-- Caller must be the employee; other users and out-of-range dates stay closed.
\set ON_ERROR_STOP on
BEGIN;

SET LOCAL session_replication_role = replica;
DO $$
DECLARE
  v_user uuid := gen_random_uuid();
  v_other uuid := gen_random_uuid();
  v_tenant bigint;
  v_branch bigint;
  v_position bigint;
  v_employee bigint;
  v_other_employee bigint;
  v_shift bigint;
BEGIN
  INSERT INTO auth.users (id) VALUES (v_user), (v_other);
  INSERT INTO public.tenants (name, slug, owner_user_id)
  VALUES ('Today work fixture', 'today-work-' || v_user, v_user)
  RETURNING id INTO v_tenant;
  INSERT INTO public.positions (tenant_id, code, label_vi)
  VALUES (v_tenant, 'branch_staff', 'Nhân viên')
  RETURNING id INTO v_position;
  INSERT INTO public.branches (tenant_id, name, slug, branch_kind)
  VALUES (v_tenant, 'Today work branch', 'today-work-branch-' || v_user, 'branch')
  RETURNING id INTO v_branch;
  INSERT INTO public.profiles (id, tenant_id, position_id, branch_id, full_name, is_active)
  VALUES
    (v_user, v_tenant, v_position, v_branch, 'Today Work Staff', true),
    (v_other, v_tenant, v_position, v_branch, 'Today Work Other', true);
  INSERT INTO public.employees (tenant_id, profile_id, is_active)
  VALUES (v_tenant, v_user, true)
  RETURNING id INTO v_employee;
  INSERT INTO public.employees (tenant_id, profile_id, is_active)
  VALUES (v_tenant, v_other, true)
  RETURNING id INTO v_other_employee;
  INSERT INTO public.shifts (tenant_id, branch_id, name, start_time, end_time, is_active)
  VALUES (v_tenant, v_branch, 'Ca sáng', '06:00', '14:00', true)
  RETURNING id INTO v_shift;
  INSERT INTO public.attendance_records (
    tenant_id, employee_id, branch_id, shift_id, date, check_in, check_out, status
  )
  VALUES
    (
      v_tenant, v_employee, v_branch, v_shift, current_date,
      now() - interval '2 hours', NULL, 'working'
    ),
    (
      v_tenant, v_employee, v_branch, v_shift, current_date - 3,
      now() - interval '3 days', now() - interval '3 days' + interval '8 hours',
      'done'
    );

  PERFORM set_config('test.today_work', jsonb_build_object(
    'user', v_user,
    'other', v_other,
    'tenant', v_tenant,
    'branch', v_branch,
    'employee', v_employee,
    'other_employee', v_other_employee
  )::text, true);
END;
$$;
SET LOCAL session_replication_role = origin;
SET LOCAL ROLE authenticated;

DO $$
DECLARE
  f jsonb := current_setting('test.today_work')::jsonb;
  v_user uuid := (f->>'user')::uuid;
  v_other uuid := (f->>'other')::uuid;
  v_branch bigint := (f->>'branch')::bigint;
  v_employee bigint := (f->>'employee')::bigint;
  v_other_employee bigint := (f->>'other_employee')::bigint;
  v_payload jsonb;
  v_attendance_count integer;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', v_user::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', v_user, 'role', 'authenticated')::text,
    true
  );

  v_payload := public.get_today_work_snapshot(
    v_employee,
    current_date - 1,
    current_date,
    v_branch
  );
  IF v_payload IS NULL
     OR jsonb_typeof(v_payload->'attendance') IS DISTINCT FROM 'array'
     OR jsonb_typeof(v_payload->'count_assignments') IS DISTINCT FROM 'array'
  THEN
    RAISE EXCEPTION 'TEST snapshot missing required keys';
  END IF;

  SELECT count(*) INTO v_attendance_count
  FROM jsonb_array_elements(v_payload->'attendance') AS row;
  IF v_attendance_count <> 1 THEN
    RAISE EXCEPTION 'TEST snapshot leaked out-of-range attendance: %', v_attendance_count;
  END IF;

  BEGIN
    PERFORM public.get_today_work_snapshot(
      v_other_employee,
      current_date - 1,
      current_date,
      v_branch
    );
    RAISE EXCEPTION 'TEST other employee snapshot accepted';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;

  PERFORM set_config('request.jwt.claim.sub', v_other::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', v_other, 'role', 'authenticated')::text,
    true
  );
  BEGIN
    PERFORM public.get_today_work_snapshot(
      v_employee,
      current_date - 1,
      current_date,
      v_branch
    );
    RAISE EXCEPTION 'TEST peer snapshot of another employee accepted';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;
END;
$$;

ROLLBACK;
