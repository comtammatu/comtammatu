-- 20260629121000_upsert_position_shift_tasks.sql
-- Writer RPC for per-position shift tasks: full delete-and-reinsert of a
-- position's tasks. SECURITY DEFINER; derives tenant via auth_tenant_id();
-- requires staff:manage.

CREATE OR REPLACE FUNCTION public.upsert_position_shift_tasks(p_position_id bigint, p_tasks jsonb)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $$
DECLARE
  v_tenant_id bigint := public.auth_tenant_id();
  v_tasks jsonb := COALESCE(p_tasks, '[]'::jsonb);
  v_item jsonb; v_title text; v_kind text; v_appl text; v_phase text;
  v_done text; v_req boolean; v_sort integer := 0;
BEGIN
  IF NOT (SELECT public.has_permission_any('staff:manage')) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.positions WHERE id = p_position_id AND tenant_id = v_tenant_id) THEN
    RAISE EXCEPTION 'position_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF jsonb_typeof(v_tasks) <> 'array' THEN RAISE EXCEPTION 'tasks_invalid' USING ERRCODE='23514'; END IF;
  IF jsonb_array_length(v_tasks) > 40 THEN RAISE EXCEPTION 'too_many_tasks' USING ERRCODE='23514'; END IF;

  DELETE FROM public.position_shift_tasks WHERE tenant_id = v_tenant_id AND position_id = p_position_id;

  FOR v_item IN SELECT value FROM jsonb_array_elements(v_tasks) LOOP
    v_title := btrim(COALESCE(v_item->>'title',''));
    v_kind  := COALESCE(NULLIF(v_item->>'kind',''),'standard');
    v_appl  := COALESCE(NULLIF(v_item->>'applicability',''),'every_shift');
    v_phase := COALESCE(NULLIF(v_item->>'phase',''),'start_of_shift');
    v_done  := btrim(COALESCE(v_item->>'doneDefinition',''));
    v_req   := COALESCE(NULLIF(v_item->>'isRequired','')::boolean, true);
    IF v_title = '' THEN CONTINUE; END IF;
    IF char_length(v_title) > 120 THEN RAISE EXCEPTION 'task_title_too_long' USING ERRCODE='23514'; END IF;
    IF v_kind  <> ALL (ARRAY['standard','consumption_report']::text[]) THEN RAISE EXCEPTION 'task_kind_invalid' USING ERRCODE='23514'; END IF;
    IF v_appl  <> ALL (ARRAY['every_shift','opening','closing']::text[]) THEN RAISE EXCEPTION 'task_applicability_invalid' USING ERRCODE='23514'; END IF;
    IF v_phase <> ALL (ARRAY['start_of_shift','end_of_shift']::text[]) THEN RAISE EXCEPTION 'task_phase_invalid' USING ERRCODE='23514'; END IF;
    IF char_length(v_done) > 240 THEN RAISE EXCEPTION 'done_definition_too_long' USING ERRCODE='23514'; END IF;
    v_sort := v_sort + 1;
    INSERT INTO public.position_shift_tasks
      (tenant_id, position_id, title, kind, applicability, phase, is_required, done_definition, sort_order)
    VALUES (v_tenant_id, p_position_id, v_title, v_kind, v_appl, v_phase, v_req, v_done, v_sort);
  END LOOP;

  RETURN p_position_id;
END; $$;
REVOKE ALL ON FUNCTION public.upsert_position_shift_tasks(bigint, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_position_shift_tasks(bigint, jsonb) TO authenticated;
