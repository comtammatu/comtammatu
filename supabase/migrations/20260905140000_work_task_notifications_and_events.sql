-- Migration: work_task_notifications_and_events
-- Enhance work task assignment notifications and record participants_updated events

-- Helper function to notify an individual participant (assignee or collaborator/supporter)
CREATE OR REPLACE FUNCTION private.notify_work_task_participant(
  p_tenant_id bigint,
  p_task_id bigint,
  p_user_id uuid,
  p_title text,
  p_kind text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'private'
AS $$
DECLARE
  v_role text;
  v_title text;
  v_body text;
  v_notif_kind text;
BEGIN
  IF p_user_id IS NULL OR p_task_id IS NULL OR p_tenant_id IS NULL THEN
    RETURN;
  END IF;
  IF p_user_id = auth.uid() THEN
    RETURN;
  END IF;

  SELECT COALESCE(
    private.staff_role_from_position_code(position.code),
    'self_service'
  )
  INTO v_role
  FROM public.profiles profile
  JOIN public.positions position
    ON position.id = profile.position_id
   AND position.tenant_id = profile.tenant_id
  WHERE profile.id = p_user_id
    AND profile.tenant_id = p_tenant_id
    AND profile.is_active IS TRUE;

  IF v_role IS NULL OR v_role = 'unassigned' THEN
    v_role := 'self_service';
  END IF;

  IF p_kind = 'collaborator' THEN
    v_title := 'Được thêm làm Người hỗ trợ';
    v_body := format('Bạn được thêm làm người hỗ trợ cho: %s', left(btrim(COALESCE(p_title, '')), 160));
    v_notif_kind := 'work.task_collaborator_added';
  ELSE
    v_title := 'Việc mới được giao';
    v_body := format('Bạn được phân công làm công việc: %s', left(btrim(COALESCE(p_title, '')), 160));
    v_notif_kind := 'work.task_assigned';
  END IF;

  INSERT INTO public.notifications (
    tenant_id,
    target_branch_id,
    target_roles,
    kind,
    severity,
    title,
    body,
    entity_type,
    entity_id,
    action_url,
    meta
  ) VALUES (
    p_tenant_id,
    NULL,
    ARRAY[v_role]::text[],
    v_notif_kind,
    'info',
    v_title,
    v_body,
    'work_task',
    p_task_id,
    format('/work?task=%s', p_task_id),
    jsonb_build_object('target_user_id', p_user_id, 'participant_kind', p_kind)
  );
END;
$$;

REVOKE ALL ON FUNCTION private.notify_work_task_participant(bigint, bigint, uuid, text, text) FROM PUBLIC;
GRANT ALL ON FUNCTION private.notify_work_task_participant(bigint, bigint, uuid, text, text) TO authenticated;
GRANT ALL ON FUNCTION private.notify_work_task_participant(bigint, bigint, uuid, text, text) TO service_role;

-- Update notify_work_task_assigned to delegate and use /work?task=%s
CREATE OR REPLACE FUNCTION private.notify_work_task_assigned(
  p_tenant_id bigint,
  p_task_id bigint,
  p_assignee_id uuid,
  p_title text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'private'
AS $$
BEGIN
  PERFORM private.notify_work_task_participant(
    p_tenant_id,
    p_task_id,
    p_assignee_id,
    p_title,
    'assignee'
  );
END;
$$;

REVOKE ALL ON FUNCTION private.notify_work_task_assigned(bigint, bigint, uuid, text) FROM PUBLIC;
GRANT ALL ON FUNCTION private.notify_work_task_assigned(bigint, bigint, uuid, text) TO authenticated;
GRANT ALL ON FUNCTION private.notify_work_task_assigned(bigint, bigint, uuid, text) TO service_role;

-- Update set_work_task_participants to notify new assignees and supporters, and log work_task_events
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

  IF NOT public.can_write_work_task(p_task_id) THEN
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

  -- Collect existing participants
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

  -- Delete existing assignees and collaborators for this task
  DELETE FROM public.work_task_participants participant
  WHERE participant.tenant_id = v_tenant
    AND participant.task_id = p_task_id
    AND participant.kind = ANY (ARRAY['assignee'::text, 'collaborator'::text]);

  -- Insert assignees
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

  -- Insert supporters (collaborators)
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

  -- Update work_tasks.assignee_id with the primary assignee to preserve single-assignee compatibility
  UPDATE public.work_tasks
  SET assignee_id = v_primary_assignee,
      updated_at = now()
  WHERE id = p_task_id
    AND tenant_id = v_tenant;

  -- Log task.participants_updated in work_task_events
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

  -- Send notification to newly added assignees
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

  -- Send notification to newly added supporters
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

REVOKE ALL ON FUNCTION public.set_work_task_participants(bigint, uuid[], uuid[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.set_work_task_participants(bigint, uuid[], uuid[]) TO authenticated;
GRANT ALL ON FUNCTION public.set_work_task_participants(bigint, uuid[], uuid[]) TO service_role;
