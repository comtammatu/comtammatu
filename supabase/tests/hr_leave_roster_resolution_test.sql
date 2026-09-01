-- Leave approval and roster resolution must commit as one request-scoped unit.

\set ON_ERROR_STOP on
BEGIN;

DO $$
DECLARE
  v_tenant_id bigint;
  v_owner_id uuid;
  v_branch_id bigint;
  v_employee_id bigint;
  v_replacement_employee_id bigint;
  v_shift_id bigint;
  v_request_id bigint;
  v_invalid_request_id bigint;
  v_work_date date := current_date + 370;
  v_result jsonb;
  v_rejected boolean := false;
BEGIN
  SELECT profile.tenant_id, profile.id
  INTO v_tenant_id, v_owner_id
  FROM public.profiles profile
  JOIN public.positions position
    ON position.id = profile.position_id
   AND position.tenant_id = profile.tenant_id
  WHERE position.code = 'owner'
    AND profile.is_active
  ORDER BY profile.id
  LIMIT 1;

  SELECT candidate.branch_id
  INTO v_branch_id
  FROM (
    SELECT profile.branch_id
    FROM public.employees employee
    JOIN public.profiles profile
      ON profile.id = employee.profile_id
     AND profile.tenant_id = employee.tenant_id
    JOIN public.branches branch
      ON branch.id = profile.branch_id
     AND branch.tenant_id = profile.tenant_id
    WHERE employee.tenant_id = v_tenant_id
      AND employee.is_active
      AND profile.is_active
      AND profile.id IS DISTINCT FROM v_owner_id
      AND branch.branch_kind = 'branch'
      AND branch.is_active
    GROUP BY profile.branch_id
    HAVING count(*) >= 2
  ) candidate
  ORDER BY candidate.branch_id
  LIMIT 1;

  SELECT employee.id
  INTO v_employee_id
  FROM public.employees employee
  JOIN public.profiles profile
    ON profile.id = employee.profile_id
   AND profile.tenant_id = employee.tenant_id
  WHERE employee.tenant_id = v_tenant_id
    AND employee.is_active
    AND profile.is_active
    AND profile.branch_id = v_branch_id
    AND profile.id IS DISTINCT FROM v_owner_id
  ORDER BY employee.id
  LIMIT 1;

  SELECT employee.id
  INTO v_replacement_employee_id
  FROM public.employees employee
  JOIN public.profiles profile
    ON profile.id = employee.profile_id
   AND profile.tenant_id = employee.tenant_id
  WHERE employee.tenant_id = v_tenant_id
    AND employee.is_active
    AND profile.is_active
    AND profile.branch_id = v_branch_id
    AND profile.id IS DISTINCT FROM v_owner_id
    AND employee.id <> v_employee_id
  ORDER BY employee.id
  LIMIT 1;

  SELECT shift.id
  INTO v_shift_id
  FROM public.shifts shift
  WHERE shift.tenant_id = v_tenant_id
    AND shift.branch_id IS NULL
    AND shift.is_active
  ORDER BY shift.id
  LIMIT 1;

  IF v_owner_id IS NULL
     OR v_branch_id IS NULL
     OR v_employee_id IS NULL
     OR v_replacement_employee_id IS NULL
     OR v_shift_id IS NULL THEN
    RAISE EXCEPTION 'HR LEAVE ROSTER: seeded owner, branch, employees, and shift required';
  END IF;

  PERFORM pg_catalog.set_config('request.jwt.claim.sub', v_owner_id::text, true);
  PERFORM pg_catalog.set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM pg_catalog.set_config(
    'request.jwt.claims',
    pg_catalog.jsonb_build_object(
      'sub', v_owner_id::text,
      'role', 'authenticated',
      'app_metadata', pg_catalog.jsonb_build_object(
        'tenant_id', v_tenant_id,
        'user_role', 'owner'
      )
    )::text,
    true
  );

  INSERT INTO public.leave_requests (
    tenant_id, branch_id, employee_id, start_date, end_date,
    leave_type, status, reason
  ) VALUES (
    v_tenant_id, v_branch_id, v_employee_id, v_work_date, v_work_date,
    'annual', 'pending', 'HR leave roster resolution test'
  )
  RETURNING id INTO v_request_id;

  INSERT INTO public.shift_assignments (
    tenant_id, branch_id, employee_id, shift_id, work_date,
    assigned_by, source
  ) VALUES (
    v_tenant_id, v_branch_id, v_employee_id, v_shift_id, v_work_date,
    v_owner_id, 'manual'
  );

  v_result := public.approve_leave_request_with_roster(
    v_request_id,
    'substitute',
    v_replacement_employee_id
  );

  IF v_result ->> 'status' <> 'approved'
     OR v_result ->> 'shift_resolution' <> 'substitute'
     OR (v_result ->> 'assignments_changed')::integer <> 1 THEN
    RAISE EXCEPTION 'HR LEAVE ROSTER: unexpected approval payload %', v_result;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.shift_assignments assignment
    WHERE assignment.tenant_id = v_tenant_id
      AND assignment.employee_id = v_employee_id
      AND assignment.work_date = v_work_date
      AND assignment.shift_id = v_shift_id
  ) THEN
    RAISE EXCEPTION 'HR LEAVE ROSTER: original assignment was not removed';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.shift_assignments assignment
    WHERE assignment.tenant_id = v_tenant_id
      AND assignment.branch_id = v_branch_id
      AND assignment.employee_id = v_replacement_employee_id
      AND assignment.work_date = v_work_date
      AND assignment.shift_id = v_shift_id
      AND assignment.source = 'manual'
  ) THEN
    RAISE EXCEPTION 'HR LEAVE ROSTER: replacement assignment was not created';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.leave_requests request
    WHERE request.id = v_request_id
      AND request.status = 'approved'
      AND request.reviewed_by = v_owner_id
  ) THEN
    RAISE EXCEPTION 'HR LEAVE ROSTER: leave request was not approved';
  END IF;

  INSERT INTO public.leave_requests (
    tenant_id, branch_id, employee_id, start_date, end_date,
    leave_type, status, reason
  ) VALUES (
    v_tenant_id, v_branch_id, v_employee_id, v_work_date + 1, v_work_date + 1,
    'annual', 'pending', 'HR invalid replacement rollback test'
  )
  RETURNING id INTO v_invalid_request_id;

  INSERT INTO public.shift_assignments (
    tenant_id, branch_id, employee_id, shift_id, work_date,
    assigned_by, source
  ) VALUES (
    v_tenant_id, v_branch_id, v_employee_id, v_shift_id, v_work_date + 1,
    v_owner_id, 'manual'
  );

  BEGIN
    PERFORM public.approve_leave_request_with_roster(
      v_invalid_request_id,
      'substitute',
      v_employee_id
    );
  EXCEPTION
    WHEN SQLSTATE '22023' THEN
      v_rejected := true;
  END;

  IF NOT v_rejected THEN
    RAISE EXCEPTION 'HR LEAVE ROSTER: self-substitution was accepted';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.leave_requests request
    WHERE request.id = v_invalid_request_id
      AND request.status = 'pending'
  ) OR NOT EXISTS (
    SELECT 1 FROM public.shift_assignments assignment
    WHERE assignment.tenant_id = v_tenant_id
      AND assignment.employee_id = v_employee_id
      AND assignment.work_date = v_work_date + 1
      AND assignment.shift_id = v_shift_id
  ) THEN
    RAISE EXCEPTION 'HR LEAVE ROSTER: failed substitution did not roll back atomically';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_policy policy
    WHERE policy.polrelid = 'public.shift_assignments'::regclass
      AND policy.polcmd IN ('a', 'w', 'd', '*')
  ) THEN
    RAISE EXCEPTION 'HR LEAVE ROSTER: authenticated direct-write policy was added';
  END IF;
END;
$$;

ROLLBACK;
