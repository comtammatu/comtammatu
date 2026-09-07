\set ON_ERROR_STOP on
BEGIN;

-- Build isolated identities without onboarding side effects; restore triggers
-- before exercising the real permission, RLS, creation, and notification paths.
SET LOCAL session_replication_role = replica;
DO $$
DECLARE
  v_owner uuid := gen_random_uuid();
  v_staff uuid := gen_random_uuid();
  v_peer uuid := gen_random_uuid();
  v_support uuid := gen_random_uuid();
  v_tenant bigint;
  v_other_tenant bigint;
  v_owner_position bigint;
  v_staff_position bigint;
  v_department bigint;
  v_hidden_department bigint;
  v_other_department bigint;
  v_assigned bigint;
  v_hidden bigint;
  v_done bigint;
BEGIN
  INSERT INTO auth.users (id) VALUES (v_owner), (v_staff), (v_peer), (v_support);
  INSERT INTO public.tenants (name, slug, owner_user_id)
  VALUES ('Work scope fixture', 'work-scope-' || v_owner, v_owner) RETURNING id INTO v_tenant;
  INSERT INTO public.tenants (name, slug, owner_user_id)
  VALUES ('Other scope fixture', 'other-scope-' || v_owner, v_owner) RETURNING id INTO v_other_tenant;
  INSERT INTO public.positions (tenant_id, code, label_vi)
  VALUES (v_tenant, 'owner', 'Chủ sở hữu') RETURNING id INTO v_owner_position;
  INSERT INTO public.positions (tenant_id, code, label_vi)
  VALUES (v_tenant, 'waiter', 'Phục vụ') RETURNING id INTO v_staff_position;
  INSERT INTO public.profiles (id, tenant_id, position_id, full_name) VALUES
    (v_owner, v_tenant, v_owner_position, 'Fixture Owner'),
    (v_staff, v_tenant, v_staff_position, 'Fixture Creator'),
    (v_peer, v_tenant, v_staff_position, 'Fixture Peer'),
    (v_support, v_tenant, v_staff_position, 'Fixture Supporter');
  INSERT INTO public.work_departments (tenant_id, name)
  VALUES (v_tenant, 'Assigned department') RETURNING id INTO v_department;
  INSERT INTO public.work_departments (tenant_id, name)
  VALUES (v_tenant, 'Hidden department') RETURNING id INTO v_hidden_department;
  INSERT INTO public.work_departments (tenant_id, name)
  VALUES (v_other_tenant, 'Other tenant department') RETURNING id INTO v_other_department;
  INSERT INTO public.work_tasks (tenant_id, department_id, title, created_by, assignee_id)
  VALUES (v_tenant, v_department, 'Assigned task', v_owner, v_staff) RETURNING id INTO v_assigned;
  INSERT INTO public.work_tasks (tenant_id, department_id, title, created_by, assignee_id)
  VALUES (v_tenant, v_hidden_department, 'Peer task', v_owner, v_peer) RETURNING id INTO v_hidden;
  INSERT INTO public.work_tasks (tenant_id, department_id, title, created_by, status)
  VALUES (v_tenant, v_department, 'Completed task', v_owner, 'done') RETURNING id INTO v_done;
  PERFORM set_config('test.work_scope', jsonb_build_object(
    'owner', v_owner, 'staff', v_staff, 'peer', v_peer, 'support', v_support,
    'tenant', v_tenant, 'department', v_department, 'hidden_department', v_hidden_department,
    'other_department', v_other_department, 'assigned', v_assigned, 'hidden', v_hidden, 'done', v_done
  )::text, true);
END;
$$;
SET LOCAL session_replication_role = origin;
SET LOCAL ROLE authenticated;

DO $$
DECLARE
  f jsonb := current_setting('test.work_scope')::jsonb;
  v_owner uuid := (f->>'owner')::uuid;
  v_staff uuid := (f->>'staff')::uuid;
  v_peer uuid := (f->>'peer')::uuid;
  v_support uuid := (f->>'support')::uuid;
  v_department bigint := (f->>'department')::bigint;
  v_task public.work_tasks;
  v_rejected boolean := false;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', v_owner::text, true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  IF (SELECT count(*) FROM public.list_my_work_tasks(false)) <> 2
     OR (SELECT count(*) FROM public.list_my_work_tasks(true)) <> 3 THEN
    RAISE EXCEPTION 'Owner inbox must include unassigned work and honor include_done';
  END IF;
  IF public.can_read_work_department((f->>'other_department')::bigint) THEN
    RAISE EXCEPTION 'Owner must remain tenant-scoped';
  END IF;
  PERFORM public.set_work_task_creator(v_staff, true);

  PERFORM set_config('request.jwt.claim.sub', v_staff::text, true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_staff, 'role', 'authenticated')::text, true);
  IF NOT public.can_create_work_task()
     OR (SELECT count(*) FROM public.work_departments) <> 1
     OR (SELECT count(*) FROM public.work_tasks) <> 1
     OR (SELECT count(*) FROM public.list_my_work_tasks(true)) <> 1
     OR public.can_read_work_task((f->>'hidden')::bigint) THEN
    RAISE EXCEPTION 'Creator grant must not expose peer tasks or departments';
  END IF;

  SELECT * INTO v_task FROM public.create_work_task(
    v_department, NULL::bigint, 'Atomic assigned task', NULL::text, 'normal',
    v_peer, NULL::timestamptz, ARRAY[v_peer], ARRAY[v_support]
  );
  IF public.can_read_work_task(v_task.id)
     OR public.can_write_work_task(v_task.id)
     OR public.can_assign_work_task(v_task.id)
     OR EXISTS (SELECT 1 FROM public.work_tasks WHERE id = v_task.id) THEN
    RAISE EXCEPTION 'Authorship must not grant subsequent read or write access';
  END IF;

  BEGIN
    PERFORM public.create_work_task(
      v_department, NULL::bigint, 'Rejected participant fixture', NULL::text, 'normal',
      v_peer, NULL::timestamptz, ARRAY[v_peer], ARRAY[gen_random_uuid()]
    );
  EXCEPTION WHEN SQLSTATE 'P0002' THEN
    v_rejected := true;
  END;
  IF NOT v_rejected THEN RAISE EXCEPTION 'Unknown participant must reject creation'; END IF;

  v_rejected := false;
  BEGIN
    PERFORM public.create_work_task(
      (f->>'hidden_department')::bigint, NULL::bigint, 'Hidden department fixture', NULL::text, 'normal',
      v_peer, NULL::timestamptz, ARRAY[v_peer], ARRAY[]::uuid[]
    );
  EXCEPTION WHEN insufficient_privilege THEN
    v_rejected := true;
  END;
  IF NOT v_rejected THEN RAISE EXCEPTION 'Hidden department creation must fail closed'; END IF;

  PERFORM set_config('request.jwt.claim.sub', v_support::text, true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_support, 'role', 'authenticated')::text, true);
  IF NOT public.can_read_work_task(v_task.id)
     OR NOT public.can_read_work_department(v_department)
     OR (SELECT count(*) FROM public.list_my_work_tasks(false)) <> 1
     OR (SELECT count(*) FROM public.work_task_participants WHERE task_id = v_task.id) <> 2 THEN
    RAISE EXCEPTION 'Supporter must receive access with both participants persisted';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', v_owner::text, true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  IF EXISTS (SELECT 1 FROM public.work_tasks WHERE title IN ('Rejected participant fixture', 'Hidden department fixture')) THEN
    RAISE EXCEPTION 'Rejected creation must not persist a partial task';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('request.jwt.claims', '{}'::text, true);
  IF public.can_access_workspace() OR public.can_read_work_task(v_task.id)
     OR EXISTS (SELECT 1 FROM public.list_my_work_tasks(true)) THEN
    RAISE EXCEPTION 'Missing identity must fail closed';
  END IF;
END;
$$;
ROLLBACK;
