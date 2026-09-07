-- Owner inbox includes all tenant work; staff visibility follows assignment only.

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
          public.auth_is_owner(auth.uid())
          OR EXISTS (
            SELECT 1
            FROM public.work_tasks task
            WHERE task.department_id = department.id
              AND task.tenant_id = department.tenant_id
              AND (
                task.assignee_id = auth.uid()
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
          OR EXISTS (
            SELECT 1
            FROM public.work_tasks task
            WHERE task.project_id = project.id
              AND task.tenant_id = project.tenant_id
              AND (
                task.assignee_id = auth.uid()
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

CREATE OR REPLACE FUNCTION public.list_my_work_tasks(p_include_done boolean DEFAULT false) RETURNS SETOF public.work_tasks
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
  SELECT task.*
  FROM public.work_tasks task
  WHERE task.tenant_id = public.auth_tenant_id()
    AND public.can_read_work_task(task.id)
    AND (
      public.auth_is_owner(auth.uid())
      OR task.assignee_id = auth.uid()
      OR EXISTS (
        SELECT 1
        FROM public.work_task_participants participant
        WHERE participant.task_id = task.id
          AND participant.tenant_id = task.tenant_id
          AND participant.user_id = auth.uid()
      )
    )
    AND (
      p_include_done
      OR task.status <> ALL (ARRAY['done'::text, 'canceled'::text])
    )
  ORDER BY task.due_at NULLS LAST, task.created_at DESC;
$$;

CREATE OR REPLACE FUNCTION public.create_work_task(p_department_id bigint, p_project_id bigint, p_title text, p_description text, p_priority text, p_assignee_id uuid, p_due_at timestamp with time zone) RETURNS public.work_tasks
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $$
BEGIN
  -- Older clients add participants in a second call and must retain access.
  IF NOT public.can_create_work_task()
     OR (NOT public.auth_is_owner(auth.uid()) AND p_assignee_id IS DISTINCT FROM auth.uid()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  RETURN public.create_work_task(
    p_department_id, p_project_id, p_title, p_description, p_priority,
    p_assignee_id, p_due_at,
    CASE WHEN p_assignee_id IS NULL THEN ARRAY[]::uuid[] ELSE ARRAY[p_assignee_id] END,
    ARRAY[]::uuid[]
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.create_work_task(p_department_id bigint, p_project_id bigint, p_title text, p_description text, p_priority text, p_assignee_id uuid, p_due_at timestamp with time zone, p_assignee_ids uuid[], p_supporter_ids uuid[]) RETURNS public.work_tasks
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_tenant bigint := public.auth_tenant_id();
  v_task public.work_tasks%ROWTYPE;
  v_participant record;
  v_priority text := COALESCE(NULLIF(btrim(p_priority), ''), 'normal');
BEGIN
  IF v_actor IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;
  IF p_department_id IS NULL OR char_length(btrim(COALESCE(p_title, ''))) < 1 THEN
    RAISE EXCEPTION 'invalid_input' USING ERRCODE = '22023';
  END IF;
  IF NOT public.can_create_work_task()
     OR NOT public.can_read_work_department(p_department_id) THEN
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

  IF p_assignee_ids IS NULL OR p_supporter_ids IS NULL
     OR p_assignee_id IS DISTINCT FROM p_assignee_ids[1]
     OR p_assignee_ids && p_supporter_ids
     OR EXISTS (
       SELECT 1 FROM unnest(p_assignee_ids || p_supporter_ids) AS candidate(id)
       WHERE candidate.id IS NULL OR NOT EXISTS (
         SELECT 1 FROM public.profiles profile
         WHERE profile.id = candidate.id AND profile.tenant_id = v_tenant
           AND profile.is_active IS TRUE
       )
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

  FOR v_participant IN
    SELECT DISTINCT candidate.id, 'assignee'::text AS kind
    FROM unnest(p_assignee_ids) AS candidate(id)
    UNION
    SELECT DISTINCT candidate.id, 'collaborator'::text AS kind
    FROM unnest(p_supporter_ids) AS candidate(id)
  LOOP
    INSERT INTO public.work_task_participants (tenant_id, task_id, user_id, kind)
    VALUES (v_tenant, v_task.id, v_participant.id, v_participant.kind);
    PERFORM private.notify_work_task_participant(
      v_tenant, v_task.id, v_participant.id, v_task.title, v_participant.kind
    );
  END LOOP;

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

REVOKE ALL ON FUNCTION public.create_work_task(bigint,bigint,text,text,text,uuid,timestamp with time zone,uuid[],uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_work_task(bigint,bigint,text,text,text,uuid,timestamp with time zone,uuid[],uuid[]) TO authenticated, service_role;
