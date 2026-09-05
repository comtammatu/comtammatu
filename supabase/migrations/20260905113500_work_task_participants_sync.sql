-- Migration: work_task_participants_sync
-- Synchronize work task participants (assignees and supporters/collaborators)

CREATE OR REPLACE FUNCTION public.set_work_task_participants(
  p_task_id bigint,
  p_assignee_ids uuid[] DEFAULT ARRAY[]::uuid[],
  p_supporter_ids uuid[] DEFAULT ARRAY[]::uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_tenant bigint := public.auth_tenant_id();
  v_task public.work_tasks%ROWTYPE;
  v_primary_assignee uuid := NULL;
  v_assignee_id uuid;
  v_supporter_id uuid;
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
