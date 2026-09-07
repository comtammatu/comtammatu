-- Migration: work_task_visibility_by_assignment
-- Work visibility follows assignment (and created_by), not department
-- membership. Create is grantable via work:create.

INSERT INTO public.permission_keys (key, module, description, scope, is_delegable_to_staff)
VALUES
  ('work:create', 'work', 'Tạo việc trong Workspace', 'tenant', true)
ON CONFLICT (key) DO UPDATE SET
  is_delegable_to_staff = true,
  description = EXCLUDED.description,
  module = EXCLUDED.module,
  scope = EXCLUDED.scope;

INSERT INTO public.auth_access_role_capabilities (role_code, permission_key)
VALUES ('tenant_owner', 'work:create')
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.can_create_work_task() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
  SELECT auth.uid() IS NOT NULL
    AND public.auth_tenant_id() IS NOT NULL
    AND (
      public.auth_is_owner(auth.uid())
      OR public.has_permission(NULL::bigint, 'work:manage'::text)
      OR public.has_permission(NULL::bigint, 'work:create'::text)
    );
$$;

CREATE OR REPLACE FUNCTION public.can_access_workspace() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
  SELECT auth.uid() IS NOT NULL
    AND public.auth_tenant_id() IS NOT NULL
    AND (
      public.can_create_work_task()
      OR EXISTS (
        SELECT 1
        FROM public.work_task_participants participant
        WHERE participant.tenant_id = public.auth_tenant_id()
          AND participant.user_id = auth.uid()
      )
      OR EXISTS (
        SELECT 1
        FROM public.work_tasks task
        WHERE task.tenant_id = public.auth_tenant_id()
          AND (
            task.assignee_id = auth.uid()
            OR task.created_by = auth.uid()
          )
      )
    );
$$;

CREATE OR REPLACE FUNCTION public.can_read_work_department(p_department_id bigint) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
  SELECT p_department_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.work_departments department
      WHERE department.id = p_department_id
        AND department.tenant_id = public.auth_tenant_id()
        AND (
          public.can_create_work_task()
          OR EXISTS (
            SELECT 1
            FROM public.work_tasks task
            WHERE task.department_id = department.id
              AND task.tenant_id = department.tenant_id
              AND (
                task.assignee_id = auth.uid()
                OR task.created_by = auth.uid()
                OR EXISTS (
                  SELECT 1
                  FROM public.work_task_participants participant
                  WHERE participant.task_id = task.id
                    AND participant.tenant_id = task.tenant_id
                    AND participant.user_id = auth.uid()
                )
              )
          )
        )
    );
$$;

CREATE OR REPLACE FUNCTION public.can_read_work_project(p_project_id bigint) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
  SELECT p_project_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.work_projects project
      WHERE project.id = p_project_id
        AND project.tenant_id = public.auth_tenant_id()
        AND (
          public.auth_is_owner(auth.uid())
          OR public.has_permission(NULL::bigint, 'work:manage'::text)
          OR EXISTS (
            SELECT 1
            FROM public.work_tasks task
            WHERE task.project_id = project.id
              AND task.tenant_id = project.tenant_id
              AND (
                task.assignee_id = auth.uid()
                OR task.created_by = auth.uid()
                OR EXISTS (
                  SELECT 1
                  FROM public.work_task_participants participant
                  WHERE participant.task_id = task.id
                    AND participant.tenant_id = task.tenant_id
                    AND participant.user_id = auth.uid()
                )
              )
          )
        )
    );
$$;

CREATE OR REPLACE FUNCTION public.can_read_work_task(p_task_id bigint) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
  SELECT p_task_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.work_tasks task
      WHERE task.id = p_task_id
        AND task.tenant_id = public.auth_tenant_id()
        AND (
          public.auth_is_owner(auth.uid())
          OR public.has_permission(NULL::bigint, 'work:manage'::text)
          OR task.created_by = auth.uid()
          OR task.assignee_id = auth.uid()
          OR EXISTS (
            SELECT 1
            FROM public.work_task_participants participant
            WHERE participant.task_id = task.id
              AND participant.tenant_id = task.tenant_id
              AND participant.user_id = auth.uid()
          )
        )
    );
$$;

CREATE OR REPLACE FUNCTION public.can_write_work_task(p_task_id bigint) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
  SELECT public.can_read_work_task(p_task_id)
    AND (
      public.auth_is_owner(auth.uid())
      OR public.has_permission(NULL::bigint, 'work:manage'::text)
      OR EXISTS (
        SELECT 1
        FROM public.work_tasks task
        WHERE task.id = p_task_id
          AND task.tenant_id = public.auth_tenant_id()
          AND (
            task.created_by = auth.uid()
            OR task.assignee_id = auth.uid()
            OR EXISTS (
              SELECT 1
              FROM public.work_task_participants participant
              WHERE participant.task_id = task.id
                AND participant.tenant_id = task.tenant_id
                AND participant.user_id = auth.uid()
            )
          )
      )
    );
$$;

CREATE OR REPLACE FUNCTION public.can_assign_work_task(p_task_id bigint) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
  SELECT public.can_read_work_task(p_task_id)
    AND (
      public.auth_is_owner(auth.uid())
      OR public.has_permission(NULL::bigint, 'work:manage'::text)
      OR EXISTS (
        SELECT 1
        FROM public.work_tasks task
        WHERE task.id = p_task_id
          AND task.tenant_id = public.auth_tenant_id()
          AND task.created_by = auth.uid()
      )
    );
$$;

CREATE OR REPLACE FUNCTION public.create_work_task(p_department_id bigint, p_project_id bigint, p_title text, p_description text, p_priority text, p_assignee_id uuid, p_due_at timestamp with time zone) RETURNS public.work_tasks
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_tenant bigint := public.auth_tenant_id();
  v_task public.work_tasks%ROWTYPE;
  v_priority text := COALESCE(NULLIF(btrim(p_priority), ''), 'normal');
BEGIN
  IF v_actor IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;
  IF p_department_id IS NULL OR char_length(btrim(COALESCE(p_title, ''))) < 1 THEN
    RAISE EXCEPTION 'invalid_input' USING ERRCODE = '22023';
  END IF;
  IF NOT public.can_create_work_task() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.work_departments department
    WHERE department.id = p_department_id
      AND department.tenant_id = v_tenant
      AND department.is_active IS TRUE
  ) THEN
    RAISE EXCEPTION 'department_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_priority <> ALL (ARRAY['low'::text, 'normal'::text, 'high'::text, 'urgent'::text]) THEN
    RAISE EXCEPTION 'invalid_priority' USING ERRCODE = '22023';
  END IF;
  IF p_project_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.work_projects project
    WHERE project.id = p_project_id
      AND project.tenant_id = v_tenant
      AND project.department_id = p_department_id
  ) THEN
    RAISE EXCEPTION 'project_not_in_department' USING ERRCODE = '22023';
  END IF;
  IF p_assignee_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.profiles profile
    WHERE profile.id = p_assignee_id
      AND profile.tenant_id = v_tenant
      AND profile.is_active IS TRUE
  ) THEN
    RAISE EXCEPTION 'assignee_not_found' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.work_tasks (
    tenant_id,
    department_id,
    project_id,
    title,
    description,
    priority,
    assignee_id,
    due_at,
    created_by
  ) VALUES (
    v_tenant,
    p_department_id,
    p_project_id,
    left(btrim(p_title), 200),
    NULLIF(btrim(COALESCE(p_description, '')), ''),
    v_priority,
    p_assignee_id,
    p_due_at,
    v_actor
  )
  RETURNING * INTO v_task;

  IF p_assignee_id IS NOT NULL THEN
    INSERT INTO public.work_task_participants (
      tenant_id,
      task_id,
      user_id,
      kind
    ) VALUES (
      v_tenant,
      v_task.id,
      p_assignee_id,
      'assignee'
    )
    ON CONFLICT (tenant_id, task_id, user_id, kind) DO NOTHING;

    PERFORM private.notify_work_task_assigned(
      v_tenant,
      v_task.id,
      p_assignee_id,
      v_task.title
    );
  END IF;

  INSERT INTO public.work_task_events (
    tenant_id,
    task_id,
    actor_id,
    event_kind,
    payload
  ) VALUES (
    v_tenant,
    v_task.id,
    v_actor,
    'task.created',
    jsonb_build_object(
      'department_id', p_department_id,
      'project_id', p_project_id,
      'assignee_id', p_assignee_id
    )
  );

  RETURN v_task;
END;
$$;

CREATE OR REPLACE FUNCTION public.ensure_pilot_work_department() RETURNS bigint
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_tenant bigint := public.auth_tenant_id();
  v_department_id bigint;
BEGIN
  IF v_actor IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;
  IF NOT (
    public.auth_is_owner(v_actor)
    OR public.has_permission(NULL::bigint, 'work:manage'::text)
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.work_departments (tenant_id, name)
  VALUES (v_tenant, 'Văn phòng')
  ON CONFLICT (tenant_id, name) DO UPDATE
  SET is_active = true
  RETURNING id INTO v_department_id;

  RETURN v_department_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_work_task(p_task_id bigint, p_expected_revision integer, p_title text DEFAULT NULL::text, p_description text DEFAULT NULL::text, p_priority text DEFAULT NULL::text, p_assignee_id uuid DEFAULT NULL::uuid, p_due_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_project_id bigint DEFAULT NULL::bigint, p_clear_due_at boolean DEFAULT false, p_clear_project_id boolean DEFAULT false, p_clear_assignee_id boolean DEFAULT false) RETURNS public.work_tasks
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_tenant bigint := public.auth_tenant_id();
  v_task public.work_tasks%ROWTYPE;
  v_old_assignee_id uuid;
  v_assignee_changed boolean := false;
BEGIN
  IF v_actor IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;
  IF p_task_id IS NULL OR p_expected_revision IS NULL THEN
    RAISE EXCEPTION 'invalid_input' USING ERRCODE = '22023';
  END IF;
  IF NOT public.can_assign_work_task(p_task_id) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT *
  INTO v_task
  FROM public.work_tasks task
  WHERE task.id = p_task_id
    AND task.tenant_id = v_tenant
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'task_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_task.revision <> p_expected_revision THEN
    RAISE EXCEPTION 'task_revision_conflict' USING ERRCODE = 'P0001';
  END IF;

  v_old_assignee_id := v_task.assignee_id;

  IF p_priority IS NOT NULL
     AND p_priority <> ALL (ARRAY['low'::text, 'normal'::text, 'high'::text, 'urgent'::text]) THEN
    RAISE EXCEPTION 'invalid_priority' USING ERRCODE = '22023';
  END IF;
  IF p_project_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.work_projects project
    WHERE project.id = p_project_id
      AND project.tenant_id = v_tenant
      AND project.department_id = v_task.department_id
  ) THEN
    RAISE EXCEPTION 'project_not_in_department' USING ERRCODE = '22023';
  END IF;
  IF p_assignee_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.profiles profile
    WHERE profile.id = p_assignee_id
      AND profile.tenant_id = v_tenant
      AND profile.is_active IS TRUE
  ) THEN
    RAISE EXCEPTION 'assignee_not_found' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.work_tasks task
  SET
    title = CASE
      WHEN p_title IS NULL THEN task.title
      ELSE left(btrim(p_title), 200)
    END,
    description = CASE
      WHEN p_description IS NULL THEN task.description
      ELSE NULLIF(btrim(p_description), '')
    END,
    priority = COALESCE(p_priority, task.priority),
    assignee_id = CASE
      WHEN p_clear_assignee_id THEN NULL
      WHEN p_assignee_id IS NULL THEN task.assignee_id
      ELSE p_assignee_id
    END,
    due_at = CASE
      WHEN p_clear_due_at THEN NULL
      WHEN p_due_at IS NULL THEN task.due_at
      ELSE p_due_at
    END,
    project_id = CASE
      WHEN p_clear_project_id THEN NULL
      WHEN p_project_id IS NULL THEN task.project_id
      ELSE p_project_id
    END,
    revision = task.revision + 1
  WHERE task.id = p_task_id
    AND task.tenant_id = v_tenant
  RETURNING * INTO v_task;

  v_assignee_changed := (
    p_clear_assignee_id
    OR (p_assignee_id IS NOT NULL AND p_assignee_id IS DISTINCT FROM v_old_assignee_id)
  );

  IF p_assignee_id IS NOT NULL OR p_clear_assignee_id THEN
    DELETE FROM public.work_task_participants participant
    WHERE participant.tenant_id = v_tenant
      AND participant.task_id = p_task_id
      AND participant.kind = 'assignee';

    IF v_task.assignee_id IS NOT NULL THEN
      INSERT INTO public.work_task_participants (
        tenant_id,
        task_id,
        user_id,
        kind
      ) VALUES (
        v_tenant,
        p_task_id,
        v_task.assignee_id,
        'assignee'
      )
      ON CONFLICT (tenant_id, task_id, user_id, kind) DO NOTHING;
    END IF;
  END IF;

  IF v_assignee_changed AND v_task.assignee_id IS NOT NULL THEN
    PERFORM private.notify_work_task_assigned(
      v_tenant,
      v_task.id,
      v_task.assignee_id,
      v_task.title
    );
  END IF;

  INSERT INTO public.work_task_events (
    tenant_id,
    task_id,
    actor_id,
    event_kind,
    payload
  ) VALUES (
    v_tenant,
    p_task_id,
    v_actor,
    'task.updated',
    jsonb_build_object(
      'revision', v_task.revision,
      'assignee_changed', v_assignee_changed
    )
  );

  RETURN v_task;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_work_task_participants(
  p_task_id bigint,
  p_assignee_ids uuid[] DEFAULT ARRAY[]::uuid[],
  p_supporter_ids uuid[] DEFAULT ARRAY[]::uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'private'
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_tenant bigint := public.auth_tenant_id();
  v_task public.work_tasks%ROWTYPE;
  v_primary_assignee uuid := NULL;
  v_assignee_id uuid;
  v_supporter_id uuid;
  v_old_assignees uuid[] := ARRAY[]::uuid[];
  v_old_supporters uuid[] := ARRAY[]::uuid[];
  v_new_assignee uuid;
  v_new_supporter uuid;
BEGIN
  IF v_actor IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;

  IF p_task_id IS NULL THEN
    RAISE EXCEPTION 'invalid_input' USING ERRCODE = '22023';
  END IF;

  IF NOT public.can_assign_work_task(p_task_id) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_task
  FROM public.work_tasks task
  WHERE task.id = p_task_id
    AND task.tenant_id = v_tenant
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'task_not_found' USING ERRCODE = 'P0002';
  END IF;

  SELECT COALESCE(array_agg(participant.user_id), ARRAY[]::uuid[])
  INTO v_old_assignees
  FROM public.work_task_participants participant
  WHERE participant.tenant_id = v_tenant
    AND participant.task_id = p_task_id
    AND participant.kind = 'assignee';

  SELECT COALESCE(array_agg(participant.user_id), ARRAY[]::uuid[])
  INTO v_old_supporters
  FROM public.work_task_participants participant
  WHERE participant.tenant_id = v_tenant
    AND participant.task_id = p_task_id
    AND participant.kind = 'collaborator';

  DELETE FROM public.work_task_participants participant
  WHERE participant.tenant_id = v_tenant
    AND participant.task_id = p_task_id
    AND participant.kind = ANY (ARRAY['assignee'::text, 'collaborator'::text]);

  IF p_assignee_ids IS NOT NULL AND array_length(p_assignee_ids, 1) > 0 THEN
    v_primary_assignee := p_assignee_ids[1];
    FOREACH v_assignee_id IN ARRAY p_assignee_ids LOOP
      IF v_assignee_id IS NOT NULL THEN
        INSERT INTO public.work_task_participants (
          tenant_id,
          task_id,
          user_id,
          kind
        ) VALUES (
          v_tenant,
          p_task_id,
          v_assignee_id,
          'assignee'
        )
        ON CONFLICT (tenant_id, task_id, user_id, kind) DO NOTHING;
      END IF;
    END LOOP;
  END IF;

  IF p_supporter_ids IS NOT NULL AND array_length(p_supporter_ids, 1) > 0 THEN
    FOREACH v_supporter_id IN ARRAY p_supporter_ids LOOP
      IF v_supporter_id IS NOT NULL THEN
        INSERT INTO public.work_task_participants (
          tenant_id,
          task_id,
          user_id,
          kind
        ) VALUES (
          v_tenant,
          p_task_id,
          v_supporter_id,
          'collaborator'
        )
        ON CONFLICT (tenant_id, task_id, user_id, kind) DO NOTHING;
      END IF;
    END LOOP;
  END IF;

  UPDATE public.work_tasks
  SET assignee_id = v_primary_assignee,
      updated_at = now()
  WHERE id = p_task_id
    AND tenant_id = v_tenant;

  INSERT INTO public.work_task_events (
    tenant_id,
    task_id,
    actor_id,
    event_kind,
    payload
  ) VALUES (
    v_tenant,
    p_task_id,
    v_actor,
    'task.participants_updated',
    jsonb_build_object(
      'assignee_ids', COALESCE(p_assignee_ids, ARRAY[]::uuid[]),
      'supporter_ids', COALESCE(p_supporter_ids, ARRAY[]::uuid[]),
      'primary_assignee', v_primary_assignee
    )
  );

  IF p_assignee_ids IS NOT NULL THEN
    FOR v_new_assignee IN
      SELECT unnest(p_assignee_ids)
      EXCEPT
      SELECT unnest(v_old_assignees)
    LOOP
      PERFORM private.notify_work_task_participant(
        v_tenant,
        p_task_id,
        v_new_assignee,
        v_task.title,
        'assignee'
      );
    END LOOP;
  END IF;

  IF p_supporter_ids IS NOT NULL THEN
    FOR v_new_supporter IN
      SELECT unnest(p_supporter_ids)
      EXCEPT
      SELECT unnest(v_old_supporters)
    LOOP
      PERFORM private.notify_work_task_participant(
        v_tenant,
        p_task_id,
        v_new_supporter,
        v_task.title,
        'collaborator'
      );
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'taskId', p_task_id,
    'assigneeCount', COALESCE(array_length(p_assignee_ids, 1), 0),
    'supporterCount', COALESCE(array_length(p_supporter_ids, 1), 0)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.list_work_actor_profiles()
RETURNS TABLE (
  id uuid,
  full_name text,
  branch_id bigint,
  branch_name text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $$
  WITH visible AS (
    SELECT DISTINCT actor_id
    FROM (
      SELECT task.assignee_id AS actor_id
      FROM public.work_tasks task
      WHERE task.tenant_id = public.auth_tenant_id()
        AND public.can_read_work_task(task.id)
        AND task.assignee_id IS NOT NULL
      UNION
      SELECT task.created_by
      FROM public.work_tasks task
      WHERE task.tenant_id = public.auth_tenant_id()
        AND public.can_read_work_task(task.id)
      UNION
      SELECT participant.user_id
      FROM public.work_task_participants participant
      JOIN public.work_tasks task
        ON task.id = participant.task_id
       AND task.tenant_id = participant.tenant_id
      WHERE participant.tenant_id = public.auth_tenant_id()
        AND public.can_read_work_task(task.id)
    ) actors
    WHERE actor_id IS NOT NULL
  )
  SELECT
    profile.id,
    profile.full_name,
    profile.branch_id,
    branch.name
  FROM public.profiles profile
  LEFT JOIN public.branches branch
    ON branch.id = profile.branch_id
   AND branch.tenant_id = profile.tenant_id
  WHERE profile.tenant_id = public.auth_tenant_id()
    AND profile.is_active IS TRUE
    AND (
      public.can_create_work_task()
      OR profile.id IN (SELECT visible.actor_id FROM visible)
    )
  ORDER BY profile.full_name;
$$;

CREATE OR REPLACE FUNCTION public.list_work_task_creators()
RETURNS TABLE (
  id uuid,
  full_name text,
  branch_id bigint,
  branch_name text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $$
BEGIN
  IF auth.uid() IS NULL OR public.auth_tenant_id() IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;
  IF NOT (
    public.auth_is_owner(auth.uid())
    OR public.has_permission(NULL::bigint, 'work:manage'::text)
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    profile.id,
    profile.full_name,
    profile.branch_id,
    branch.name
  FROM public.staff_permissions grant_row
  JOIN public.profiles profile
    ON profile.id = grant_row.user_id
   AND profile.tenant_id = grant_row.tenant_id
  LEFT JOIN public.branches branch
    ON branch.id = profile.branch_id
   AND branch.tenant_id = profile.tenant_id
  WHERE grant_row.tenant_id = public.auth_tenant_id()
    AND grant_row.permission_key = 'work:create'::text
    AND grant_row.branch_id IS NULL
    AND (grant_row.valid_until IS NULL OR grant_row.valid_until > now())
    AND profile.is_active IS TRUE
  ORDER BY profile.full_name;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_work_task_creator(
  p_user_id uuid,
  p_active boolean
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_tenant bigint := public.auth_tenant_id();
  v_target public.profiles%ROWTYPE;
BEGIN
  IF v_actor IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'invalid_input' USING ERRCODE = '22023';
  END IF;
  IF NOT (
    public.auth_is_owner(v_actor)
    OR public.has_permission(NULL::bigint, 'work:manage'::text)
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT *
  INTO v_target
  FROM public.profiles profile
  WHERE profile.id = p_user_id
    AND profile.tenant_id = v_tenant
    AND profile.is_active IS TRUE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'assignee_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF public.auth_is_owner(p_user_id) THEN
    RAISE EXCEPTION 'invalid_input' USING ERRCODE = '22023';
  END IF;

  IF COALESCE(p_active, false) THEN
    INSERT INTO public.staff_permissions (
      user_id,
      tenant_id,
      branch_id,
      permission_key,
      granted_by
    ) VALUES (
      p_user_id,
      v_tenant,
      NULL,
      'work:create',
      v_actor
    )
    ON CONFLICT (user_id, permission_key) WHERE (branch_id IS NULL)
    DO NOTHING;
  ELSE
    DELETE FROM public.staff_permissions grant_row
    WHERE grant_row.tenant_id = v_tenant
      AND grant_row.user_id = p_user_id
      AND grant_row.permission_key = 'work:create'::text
      AND grant_row.branch_id IS NULL;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'userId', p_user_id,
    'active', COALESCE(p_active, false)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.can_create_work_task() FROM PUBLIC;
GRANT ALL ON FUNCTION public.can_create_work_task() TO authenticated;
GRANT ALL ON FUNCTION public.can_create_work_task() TO service_role;

REVOKE ALL ON FUNCTION public.can_assign_work_task(bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION public.can_assign_work_task(bigint) TO authenticated;
GRANT ALL ON FUNCTION public.can_assign_work_task(bigint) TO service_role;

REVOKE ALL ON FUNCTION public.list_work_actor_profiles() FROM PUBLIC;
GRANT ALL ON FUNCTION public.list_work_actor_profiles() TO authenticated;
GRANT ALL ON FUNCTION public.list_work_actor_profiles() TO service_role;

REVOKE ALL ON FUNCTION public.list_work_task_creators() FROM PUBLIC;
GRANT ALL ON FUNCTION public.list_work_task_creators() TO authenticated;
GRANT ALL ON FUNCTION public.list_work_task_creators() TO service_role;

REVOKE ALL ON FUNCTION public.set_work_task_creator(uuid, boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.set_work_task_creator(uuid, boolean) TO authenticated;
GRANT ALL ON FUNCTION public.set_work_task_creator(uuid, boolean) TO service_role;

REVOKE ALL ON FUNCTION public.upsert_work_department_member(bigint, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.upsert_work_department_member(bigint, uuid, text) FROM authenticated;
GRANT ALL ON FUNCTION public.upsert_work_department_member(bigint, uuid, text) TO service_role;

REVOKE ALL ON FUNCTION public.set_work_department_member_role(bigint, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_work_department_member_role(bigint, uuid, text) FROM authenticated;
GRANT ALL ON FUNCTION public.set_work_department_member_role(bigint, uuid, text) TO service_role;

REVOKE ALL ON FUNCTION public.deactivate_work_department_member(bigint, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.deactivate_work_department_member(bigint, uuid) FROM authenticated;
GRANT ALL ON FUNCTION public.deactivate_work_department_member(bigint, uuid) TO service_role;
