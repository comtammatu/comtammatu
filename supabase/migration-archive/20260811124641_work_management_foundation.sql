-- Work management foundation (ADR 0033 / Control Surface /work).
-- Additive work_* tables, membership RLS helpers, and SECURITY DEFINER RPCs for
-- inbox read + task mutations. Direct authenticated writes on business tables
-- are revoked; append-only work_task_events is insert-only via RPCs.

-- ── Tables ──

CREATE TABLE public.work_departments (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id bigint NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT work_departments_id_tenant_key UNIQUE (id, tenant_id),
  CONSTRAINT work_departments_tenant_name_key UNIQUE (tenant_id, name),
  CONSTRAINT work_departments_name_len_check CHECK (
    char_length(btrim(name)) BETWEEN 1 AND 120
  )
);

CREATE TABLE public.work_department_members (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id bigint NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  department_id bigint NOT NULL,
  user_id uuid NOT NULL,
  role text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT work_department_members_department_fk
    FOREIGN KEY (department_id, tenant_id)
    REFERENCES public.work_departments (id, tenant_id)
    ON DELETE CASCADE,
  CONSTRAINT work_department_members_user_fk
    FOREIGN KEY (user_id, tenant_id)
    REFERENCES public.profiles (id, tenant_id)
    ON DELETE CASCADE,
  CONSTRAINT work_department_members_role_check
    CHECK (role = ANY (ARRAY['lead'::text, 'member'::text])),
  CONSTRAINT work_department_members_department_user_key
    UNIQUE (tenant_id, department_id, user_id)
);

CREATE UNIQUE INDEX work_department_members_one_active_per_user_idx
  ON public.work_department_members (tenant_id, user_id)
  WHERE is_active IS TRUE;

CREATE INDEX work_department_members_department_idx
  ON public.work_department_members (tenant_id, department_id)
  WHERE is_active IS TRUE;

CREATE TABLE public.work_projects (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id bigint NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  department_id bigint NOT NULL,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT work_projects_id_tenant_key UNIQUE (id, tenant_id),
  CONSTRAINT work_projects_department_fk
    FOREIGN KEY (department_id, tenant_id)
    REFERENCES public.work_departments (id, tenant_id)
    ON DELETE CASCADE,
  CONSTRAINT work_projects_created_by_fk
    FOREIGN KEY (created_by, tenant_id)
    REFERENCES public.profiles (id, tenant_id)
    ON DELETE RESTRICT,
  CONSTRAINT work_projects_name_len_check CHECK (
    char_length(btrim(name)) BETWEEN 1 AND 200
  )
);

CREATE TABLE public.work_project_members (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id bigint NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  project_id bigint NOT NULL,
  user_id uuid NOT NULL,
  role text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT work_project_members_project_fk
    FOREIGN KEY (project_id, tenant_id)
    REFERENCES public.work_projects (id, tenant_id)
    ON DELETE CASCADE,
  CONSTRAINT work_project_members_user_fk
    FOREIGN KEY (user_id, tenant_id)
    REFERENCES public.profiles (id, tenant_id)
    ON DELETE CASCADE,
  CONSTRAINT work_project_members_role_check
    CHECK (role = ANY (ARRAY['lead'::text, 'collaborator'::text, 'follower'::text])),
  CONSTRAINT work_project_members_project_user_key
    UNIQUE (tenant_id, project_id, user_id)
);

CREATE INDEX work_project_members_user_idx
  ON public.work_project_members (tenant_id, user_id);

CREATE TABLE public.work_tasks (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id bigint NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  department_id bigint NOT NULL,
  project_id bigint,
  title text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'todo',
  priority text NOT NULL DEFAULT 'normal',
  assignee_id uuid,
  due_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  revision integer NOT NULL DEFAULT 1,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT work_tasks_id_tenant_key UNIQUE (id, tenant_id),
  CONSTRAINT work_tasks_department_fk
    FOREIGN KEY (department_id, tenant_id)
    REFERENCES public.work_departments (id, tenant_id)
    ON DELETE RESTRICT,
  CONSTRAINT work_tasks_project_fk
    FOREIGN KEY (project_id, tenant_id)
    REFERENCES public.work_projects (id, tenant_id)
    ON DELETE SET NULL,
  CONSTRAINT work_tasks_assignee_fk
    FOREIGN KEY (assignee_id, tenant_id)
    REFERENCES public.profiles (id, tenant_id)
    ON DELETE SET NULL,
  CONSTRAINT work_tasks_created_by_fk
    FOREIGN KEY (created_by, tenant_id)
    REFERENCES public.profiles (id, tenant_id)
    ON DELETE RESTRICT,
  CONSTRAINT work_tasks_status_check
    CHECK (status = ANY (ARRAY[
      'backlog'::text,
      'todo'::text,
      'in_progress'::text,
      'review'::text,
      'done'::text,
      'canceled'::text
    ])),
  CONSTRAINT work_tasks_priority_check
    CHECK (priority = ANY (ARRAY[
      'low'::text,
      'normal'::text,
      'high'::text,
      'urgent'::text
    ])),
  CONSTRAINT work_tasks_title_len_check CHECK (
    char_length(btrim(title)) BETWEEN 1 AND 300
  ),
  CONSTRAINT work_tasks_revision_positive_check CHECK (revision >= 1)
);

CREATE INDEX work_tasks_tenant_assignee_status_idx
  ON public.work_tasks (tenant_id, assignee_id, status);

CREATE INDEX work_tasks_tenant_department_idx
  ON public.work_tasks (tenant_id, department_id);

CREATE INDEX work_tasks_tenant_project_idx
  ON public.work_tasks (tenant_id, project_id)
  WHERE project_id IS NOT NULL;

CREATE INDEX work_tasks_tenant_due_open_idx
  ON public.work_tasks (tenant_id, due_at)
  WHERE status <> ALL (ARRAY['done'::text, 'canceled'::text]);

CREATE TABLE public.work_task_participants (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id bigint NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  task_id bigint NOT NULL,
  user_id uuid NOT NULL,
  kind text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT work_task_participants_task_fk
    FOREIGN KEY (task_id, tenant_id)
    REFERENCES public.work_tasks (id, tenant_id)
    ON DELETE CASCADE,
  CONSTRAINT work_task_participants_user_fk
    FOREIGN KEY (user_id, tenant_id)
    REFERENCES public.profiles (id, tenant_id)
    ON DELETE CASCADE,
  CONSTRAINT work_task_participants_kind_check
    CHECK (kind = ANY (ARRAY['assignee'::text, 'collaborator'::text, 'follower'::text])),
  CONSTRAINT work_task_participants_task_user_kind_key
    UNIQUE (tenant_id, task_id, user_id, kind)
);

CREATE INDEX work_task_participants_user_idx
  ON public.work_task_participants (tenant_id, user_id);

CREATE TABLE public.work_task_checklist_items (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id bigint NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  task_id bigint NOT NULL,
  title text NOT NULL,
  is_done boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT work_task_checklist_items_task_fk
    FOREIGN KEY (task_id, tenant_id)
    REFERENCES public.work_tasks (id, tenant_id)
    ON DELETE CASCADE,
  CONSTRAINT work_task_checklist_items_title_len_check CHECK (
    char_length(btrim(title)) BETWEEN 1 AND 300
  )
);

CREATE INDEX work_task_checklist_items_task_sort_idx
  ON public.work_task_checklist_items (tenant_id, task_id, sort_order);

CREATE TABLE public.work_task_comments (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id bigint NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  task_id bigint NOT NULL,
  author_id uuid NOT NULL,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT work_task_comments_task_fk
    FOREIGN KEY (task_id, tenant_id)
    REFERENCES public.work_tasks (id, tenant_id)
    ON DELETE CASCADE,
  CONSTRAINT work_task_comments_author_fk
    FOREIGN KEY (author_id, tenant_id)
    REFERENCES public.profiles (id, tenant_id)
    ON DELETE RESTRICT,
  CONSTRAINT work_task_comments_body_len_check CHECK (
    char_length(btrim(body)) BETWEEN 1 AND 10000
  )
);

CREATE INDEX work_task_comments_task_created_idx
  ON public.work_task_comments (tenant_id, task_id, created_at);

CREATE TABLE public.work_task_attachments (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id bigint NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  task_id bigint NOT NULL,
  storage_path text NOT NULL,
  file_name text NOT NULL,
  content_type text,
  byte_size bigint,
  uploaded_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT work_task_attachments_task_fk
    FOREIGN KEY (task_id, tenant_id)
    REFERENCES public.work_tasks (id, tenant_id)
    ON DELETE CASCADE,
  CONSTRAINT work_task_attachments_uploaded_by_fk
    FOREIGN KEY (uploaded_by, tenant_id)
    REFERENCES public.profiles (id, tenant_id)
    ON DELETE RESTRICT,
  CONSTRAINT work_task_attachments_storage_path_len_check CHECK (
    char_length(btrim(storage_path)) BETWEEN 1 AND 1024
  ),
  CONSTRAINT work_task_attachments_file_name_len_check CHECK (
    char_length(btrim(file_name)) BETWEEN 1 AND 255
  ),
  CONSTRAINT work_task_attachments_byte_size_check CHECK (
    byte_size IS NULL OR byte_size >= 0
  )
);

CREATE INDEX work_task_attachments_task_created_idx
  ON public.work_task_attachments (tenant_id, task_id, created_at);

CREATE TABLE public.work_task_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id bigint NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  task_id bigint NOT NULL,
  actor_id uuid NOT NULL,
  event_kind text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT work_task_events_task_fk
    FOREIGN KEY (task_id, tenant_id)
    REFERENCES public.work_tasks (id, tenant_id)
    ON DELETE CASCADE,
  CONSTRAINT work_task_events_actor_fk
    FOREIGN KEY (actor_id, tenant_id)
    REFERENCES public.profiles (id, tenant_id)
    ON DELETE RESTRICT,
  CONSTRAINT work_task_events_event_kind_len_check CHECK (
    char_length(btrim(event_kind)) BETWEEN 1 AND 80
  )
);

CREATE INDEX work_task_events_task_created_idx
  ON public.work_task_events (tenant_id, task_id, created_at);

CREATE TRIGGER trg_work_departments_updated_at
  BEFORE UPDATE ON public.work_departments
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER trg_work_department_members_updated_at
  BEFORE UPDATE ON public.work_department_members
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER trg_work_projects_updated_at
  BEFORE UPDATE ON public.work_projects
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER trg_work_tasks_updated_at
  BEFORE UPDATE ON public.work_tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

CREATE OR REPLACE FUNCTION public.work_task_events_deny_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO pg_catalog, public
AS $$
BEGIN
  RAISE EXCEPTION 'work_task_events_append_only' USING ERRCODE = '42501';
END;
$$;

CREATE TRIGGER work_task_events_deny_update
  BEFORE UPDATE ON public.work_task_events
  FOR EACH ROW
  EXECUTE FUNCTION public.work_task_events_deny_mutation();

CREATE TRIGGER work_task_events_deny_delete
  BEFORE DELETE ON public.work_task_events
  FOR EACH ROW
  EXECUTE FUNCTION public.work_task_events_deny_mutation();

-- ── Authorization helpers ──

CREATE OR REPLACE FUNCTION public.can_access_workspace()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO pg_catalog, public
AS $$
  SELECT auth.uid() IS NOT NULL
    AND public.auth_tenant_id() IS NOT NULL
    AND (
      public.auth_is_owner(auth.uid())
      OR public.has_permission(NULL::bigint, 'work:manage'::text)
      OR EXISTS (
        SELECT 1
        FROM public.work_department_members member
        WHERE member.tenant_id = public.auth_tenant_id()
          AND member.user_id = auth.uid()
          AND member.is_active IS TRUE
      )
      OR EXISTS (
        SELECT 1
        FROM public.work_project_members member
        WHERE member.tenant_id = public.auth_tenant_id()
          AND member.user_id = auth.uid()
      )
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
          AND task.assignee_id = auth.uid()
      )
    );
$$;

CREATE OR REPLACE FUNCTION public.can_read_work_department(p_department_id bigint)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO pg_catalog, public
AS $$
  SELECT p_department_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.work_departments department
      WHERE department.id = p_department_id
        AND department.tenant_id = public.auth_tenant_id()
        AND (
          public.auth_is_owner(auth.uid())
          OR public.has_permission(NULL::bigint, 'work:manage'::text)
          OR EXISTS (
            SELECT 1
            FROM public.work_department_members member
            WHERE member.tenant_id = department.tenant_id
              AND member.department_id = department.id
              AND member.user_id = auth.uid()
              AND member.is_active IS TRUE
          )
          OR EXISTS (
            SELECT 1
            FROM public.work_projects project
            JOIN public.work_project_members member
              ON member.project_id = project.id
             AND member.tenant_id = project.tenant_id
            WHERE project.department_id = department.id
              AND project.tenant_id = department.tenant_id
              AND member.user_id = auth.uid()
          )
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

CREATE OR REPLACE FUNCTION public.can_read_work_project(p_project_id bigint)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO pg_catalog, public
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
            FROM public.work_project_members member
            WHERE member.project_id = project.id
              AND member.tenant_id = project.tenant_id
              AND member.user_id = auth.uid()
          )
          OR EXISTS (
            SELECT 1
            FROM public.work_department_members member
            WHERE member.department_id = project.department_id
              AND member.tenant_id = project.tenant_id
              AND member.user_id = auth.uid()
              AND member.is_active IS TRUE
          )
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

CREATE OR REPLACE FUNCTION public.can_read_work_task(p_task_id bigint)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO pg_catalog, public
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
          OR task.assignee_id = auth.uid()
          OR EXISTS (
            SELECT 1
            FROM public.work_task_participants participant
            WHERE participant.task_id = task.id
              AND participant.tenant_id = task.tenant_id
              AND participant.user_id = auth.uid()
          )
          OR (
            task.project_id IS NOT NULL
            AND public.can_read_work_project(task.project_id)
          )
          OR public.can_read_work_department(task.department_id)
        )
    );
$$;

CREATE OR REPLACE FUNCTION public.can_write_work_task(p_task_id bigint)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO pg_catalog, public
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
            task.assignee_id = auth.uid()
            OR task.created_by = auth.uid()
            OR EXISTS (
              SELECT 1
              FROM public.work_department_members member
              WHERE member.department_id = task.department_id
                AND member.tenant_id = task.tenant_id
                AND member.user_id = auth.uid()
                AND member.is_active IS TRUE
            )
            OR (
              task.project_id IS NOT NULL
              AND EXISTS (
                SELECT 1
                FROM public.work_project_members member
                WHERE member.project_id = task.project_id
                  AND member.tenant_id = task.tenant_id
                  AND member.user_id = auth.uid()
                  AND member.role = ANY (ARRAY['lead'::text, 'collaborator'::text])
              )
            )
          )
      )
    );
$$;

-- ── RPCs ──

CREATE OR REPLACE FUNCTION public.list_my_work_tasks(p_include_done boolean DEFAULT false)
RETURNS SETOF public.work_tasks
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO pg_catalog, public
AS $$
  SELECT task.*
  FROM public.work_tasks task
  WHERE task.tenant_id = public.auth_tenant_id()
    AND public.can_read_work_task(task.id)
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
    AND (
      p_include_done
      OR task.status <> ALL (ARRAY['done'::text, 'canceled'::text])
    )
  ORDER BY task.due_at NULLS LAST, task.created_at DESC;
$$;

CREATE OR REPLACE FUNCTION public.get_work_task(p_task_id bigint)
RETURNS public.work_tasks
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO pg_catalog, public
AS $$
DECLARE
  v_task public.work_tasks%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR public.auth_tenant_id() IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;
  IF p_task_id IS NULL THEN
    RAISE EXCEPTION 'invalid_input' USING ERRCODE = '22023';
  END IF;
  IF NOT public.can_read_work_task(p_task_id) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT *
  INTO v_task
  FROM public.work_tasks task
  WHERE task.id = p_task_id
    AND task.tenant_id = public.auth_tenant_id();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'task_not_found' USING ERRCODE = 'P0002';
  END IF;

  RETURN v_task;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_work_task(
  p_department_id bigint,
  p_project_id bigint,
  p_title text,
  p_description text,
  p_priority text,
  p_assignee_id uuid,
  p_due_at timestamptz
)
RETURNS public.work_tasks
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO pg_catalog, public
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
  IF NOT (
    public.auth_is_owner(v_actor)
    OR public.has_permission(NULL::bigint, 'work:manage'::text)
    OR EXISTS (
      SELECT 1
      FROM public.work_department_members member
      WHERE member.tenant_id = v_tenant
        AND member.department_id = p_department_id
        AND member.user_id = v_actor
        AND member.is_active IS TRUE
    )
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
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
  IF v_priority <> ALL (ARRAY['low'::text, 'normal'::text, 'high'::text, 'urgent'::text]) THEN
    RAISE EXCEPTION 'invalid_priority' USING ERRCODE = '22023';
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
    btrim(p_title),
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

CREATE OR REPLACE FUNCTION public.update_work_task(
  p_task_id bigint,
  p_expected_revision integer,
  p_title text DEFAULT NULL,
  p_description text DEFAULT NULL,
  p_priority text DEFAULT NULL,
  p_assignee_id uuid DEFAULT NULL,
  p_due_at timestamptz DEFAULT NULL,
  p_project_id bigint DEFAULT NULL,
  p_clear_due_at boolean DEFAULT false,
  p_clear_project_id boolean DEFAULT false,
  p_clear_assignee_id boolean DEFAULT false
)
RETURNS public.work_tasks
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO pg_catalog, public
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
  IF NOT public.can_write_work_task(p_task_id) THEN
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
      ELSE btrim(p_title)
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

CREATE OR REPLACE FUNCTION public.set_work_task_status(
  p_task_id bigint,
  p_expected_revision integer,
  p_status text
)
RETURNS public.work_tasks
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO pg_catalog, public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_tenant bigint := public.auth_tenant_id();
  v_task public.work_tasks%ROWTYPE;
  v_now timestamptz := now();
BEGIN
  IF v_actor IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;
  IF p_task_id IS NULL OR p_expected_revision IS NULL OR p_status IS NULL THEN
    RAISE EXCEPTION 'invalid_input' USING ERRCODE = '22023';
  END IF;
  IF p_status <> ALL (ARRAY[
    'backlog'::text,
    'todo'::text,
    'in_progress'::text,
    'review'::text,
    'done'::text,
    'canceled'::text
  ]) THEN
    RAISE EXCEPTION 'invalid_status' USING ERRCODE = '22023';
  END IF;
  IF NOT public.can_write_work_task(p_task_id) THEN
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

  UPDATE public.work_tasks task
  SET
    status = p_status,
    started_at = CASE
      WHEN p_status = 'in_progress' AND task.started_at IS NULL THEN v_now
      ELSE task.started_at
    END,
    completed_at = CASE
      WHEN p_status = 'done' THEN v_now
      WHEN p_status = 'canceled' THEN NULL
      WHEN p_status IN ('backlog', 'todo', 'in_progress', 'review') THEN NULL
      ELSE task.completed_at
    END,
    revision = task.revision + 1
  WHERE task.id = p_task_id
    AND task.tenant_id = v_tenant
  RETURNING * INTO v_task;

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
    'task.status_changed',
    jsonb_build_object(
      'status', p_status,
      'revision', v_task.revision
    )
  );

  RETURN v_task;
END;
$$;

CREATE OR REPLACE FUNCTION public.count_my_work_tasks_due(p_before timestamptz)
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO pg_catalog, public
AS $$
  SELECT count(*)::bigint
  FROM public.work_tasks task
  WHERE task.tenant_id = public.auth_tenant_id()
    AND (
      task.assignee_id = auth.uid()
      OR EXISTS (
        SELECT 1
        FROM public.work_task_participants participant
        WHERE participant.task_id = task.id
          AND participant.tenant_id = task.tenant_id
          AND participant.user_id = auth.uid()
          AND participant.kind = 'assignee'
      )
    )
    AND task.due_at IS NOT NULL
    AND (p_before IS NULL OR task.due_at <= p_before)
    AND task.status <> ALL (ARRAY['done'::text, 'canceled'::text]);
$$;

CREATE OR REPLACE FUNCTION public.ensure_pilot_work_department()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO pg_catalog, public
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

  UPDATE public.work_department_members member
  SET is_active = false
  WHERE member.tenant_id = v_tenant
    AND member.user_id = v_actor
    AND member.is_active IS TRUE
    AND member.department_id <> v_department_id;

  INSERT INTO public.work_department_members (
    tenant_id,
    department_id,
    user_id,
    role,
    is_active
  ) VALUES (
    v_tenant,
    v_department_id,
    v_actor,
    'lead',
    true
  )
  ON CONFLICT (tenant_id, department_id, user_id) DO UPDATE
  SET role = EXCLUDED.role,
      is_active = EXCLUDED.is_active;

  RETURN v_department_id;
END;
$$;

-- ── Permission catalog ──

INSERT INTO public.permission_keys (
  key,
  module,
  description,
  scope,
  is_delegable_to_staff
)
VALUES (
  'work:manage',
  'work',
  'Manage Work departments, memberships, and tenant-wide Work administration',
  'tenant',
  false
)
ON CONFLICT (key) DO UPDATE
SET
  module = EXCLUDED.module,
  description = EXCLUDED.description,
  scope = EXCLUDED.scope,
  is_delegable_to_staff = EXCLUDED.is_delegable_to_staff;

-- ── RLS ──

ALTER TABLE public.work_departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_department_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_project_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_task_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_task_checklist_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_task_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_task_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_task_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY work_departments_select ON public.work_departments
  FOR SELECT TO authenticated
  USING (public.can_read_work_department(id));

CREATE POLICY work_department_members_select ON public.work_department_members
  FOR SELECT TO authenticated
  USING (public.can_read_work_department(department_id));

CREATE POLICY work_projects_select ON public.work_projects
  FOR SELECT TO authenticated
  USING (public.can_read_work_project(id));

CREATE POLICY work_project_members_select ON public.work_project_members
  FOR SELECT TO authenticated
  USING (public.can_read_work_project(project_id));

CREATE POLICY work_tasks_select ON public.work_tasks
  FOR SELECT TO authenticated
  USING (public.can_read_work_task(id));

CREATE POLICY work_task_participants_select ON public.work_task_participants
  FOR SELECT TO authenticated
  USING (public.can_read_work_task(task_id));

CREATE POLICY work_task_checklist_items_select ON public.work_task_checklist_items
  FOR SELECT TO authenticated
  USING (public.can_read_work_task(task_id));

CREATE POLICY work_task_comments_select ON public.work_task_comments
  FOR SELECT TO authenticated
  USING (public.can_read_work_task(task_id));

CREATE POLICY work_task_attachments_select ON public.work_task_attachments
  FOR SELECT TO authenticated
  USING (public.can_read_work_task(task_id));

CREATE POLICY work_task_events_select ON public.work_task_events
  FOR SELECT TO authenticated
  USING (public.can_read_work_task(task_id));

-- ── Grants ──

REVOKE ALL ON TABLE public.work_departments FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.work_department_members FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.work_projects FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.work_project_members FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.work_tasks FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.work_task_participants FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.work_task_checklist_items FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.work_task_comments FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.work_task_attachments FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.work_task_events FROM PUBLIC, anon;

GRANT SELECT ON TABLE public.work_departments TO authenticated;
GRANT SELECT ON TABLE public.work_department_members TO authenticated;
GRANT SELECT ON TABLE public.work_projects TO authenticated;
GRANT SELECT ON TABLE public.work_project_members TO authenticated;
GRANT SELECT ON TABLE public.work_tasks TO authenticated;
GRANT SELECT ON TABLE public.work_task_participants TO authenticated;
GRANT SELECT ON TABLE public.work_task_checklist_items TO authenticated;
GRANT SELECT ON TABLE public.work_task_comments TO authenticated;
GRANT SELECT ON TABLE public.work_task_attachments TO authenticated;
GRANT SELECT ON TABLE public.work_task_events TO authenticated;

GRANT ALL ON TABLE public.work_departments TO service_role;
GRANT ALL ON TABLE public.work_department_members TO service_role;
GRANT ALL ON TABLE public.work_projects TO service_role;
GRANT ALL ON TABLE public.work_project_members TO service_role;
GRANT ALL ON TABLE public.work_tasks TO service_role;
GRANT ALL ON TABLE public.work_task_participants TO service_role;
GRANT ALL ON TABLE public.work_task_checklist_items TO service_role;
GRANT ALL ON TABLE public.work_task_comments TO service_role;
GRANT ALL ON TABLE public.work_task_attachments TO service_role;
GRANT ALL ON TABLE public.work_task_events TO service_role;

REVOKE ALL ON FUNCTION public.work_task_events_deny_mutation() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.work_task_events_deny_mutation() TO service_role;

REVOKE ALL ON FUNCTION public.can_access_workspace() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_access_workspace() TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.can_read_work_department(bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_read_work_department(bigint) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.can_read_work_project(bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_read_work_project(bigint) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.can_read_work_task(bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_read_work_task(bigint) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.can_write_work_task(bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_write_work_task(bigint) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.list_my_work_tasks(boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_my_work_tasks(boolean) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_work_task(bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_work_task(bigint) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.create_work_task(
  bigint, bigint, text, text, text, uuid, timestamptz
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_work_task(
  bigint, bigint, text, text, text, uuid, timestamptz
) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.update_work_task(
  bigint,
  integer,
  text,
  text,
  text,
  uuid,
  timestamptz,
  bigint,
  boolean,
  boolean,
  boolean
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_work_task(
  bigint,
  integer,
  text,
  text,
  text,
  uuid,
  timestamptz,
  bigint,
  boolean,
  boolean,
  boolean
) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.set_work_task_status(bigint, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_work_task_status(bigint, integer, text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.count_my_work_tasks_due(timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.count_my_work_tasks_due(timestamptz) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.ensure_pilot_work_department() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ensure_pilot_work_department() TO authenticated, service_role;
