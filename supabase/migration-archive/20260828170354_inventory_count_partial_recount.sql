-- Migration: inventory_count_partial_recount
-- Keep one count-slip snapshot while managers request and employees resubmit
-- only the selected ingredient lines.

ALTER TABLE public.inventory_count_slips
  ADD COLUMN recount_round integer NOT NULL DEFAULT 0,
  ADD COLUMN last_resubmitted_round integer NOT NULL DEFAULT 0;

ALTER TABLE public.inventory_count_slip_lines
  ADD COLUMN recount_required boolean NOT NULL DEFAULT false,
  ADD COLUMN last_recount_round integer NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.inventory_count_slip_lines AS line
    GROUP BY line.tenant_id, line.slip_id, line.ingredient_id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'inventory_count_slip_line_duplicates'
      USING ERRCODE = '23505';
  END IF;
END;
$$;

ALTER TABLE public.inventory_count_slip_lines
  ADD CONSTRAINT inventory_count_slip_lines_tenant_slip_ingredient_key
  UNIQUE (tenant_id, slip_id, ingredient_id);

CREATE INDEX inventory_count_slip_lines_recount_required_idx
  ON public.inventory_count_slip_lines (tenant_id, slip_id, id)
  WHERE recount_required = true;

UPDATE public.inventory_count_slips
SET recount_round = 1,
    updated_at = now()
WHERE status = 'needs_changes'
  AND recount_round = 0;

UPDATE public.inventory_count_slip_lines AS line
SET recount_required = true
FROM public.inventory_count_slips AS slip
WHERE slip.id = line.slip_id
  AND slip.tenant_id = line.tenant_id
  AND slip.status = 'needs_changes';

CREATE OR REPLACE FUNCTION public.request_inventory_count_line_recount(
  p_slip_id bigint,
  p_note text,
  p_line_ids bigint[]
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_tenant bigint := public.auth_tenant_id();
  v_uid uuid := auth.uid();
  v_slip public.inventory_count_slips%ROWTYPE;
  v_note text := nullif(pg_catalog.btrim(coalesce(p_note, '')), '');
  v_round integer;
  v_selected_count integer;
  v_employee_bucket text;
  v_old_lines jsonb;
BEGIN
  IF v_uid IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  IF v_note IS NULL OR pg_catalog.char_length(v_note) < 3 THEN
    RAISE EXCEPTION 'recount_note_too_short' USING ERRCODE = '22023';
  END IF;
  IF pg_catalog.char_length(v_note) > 1000 THEN
    RAISE EXCEPTION 'recount_note_too_long' USING ERRCODE = '22001';
  END IF;
  IF p_line_ids IS NULL OR pg_catalog.cardinality(p_line_ids) = 0
     OR pg_catalog.array_position(p_line_ids, NULL) IS NOT NULL THEN
    RAISE EXCEPTION 'recount_lines_required' USING ERRCODE = '22023';
  END IF;

  SELECT count(DISTINCT selected.id)::integer
  INTO v_selected_count
  FROM pg_catalog.unnest(p_line_ids) AS selected(id);

  IF v_selected_count <> pg_catalog.cardinality(p_line_ids) THEN
    RAISE EXCEPTION 'recount_line_ids_duplicate' USING ERRCODE = '22023';
  END IF;

  SELECT *
  INTO v_slip
  FROM public.inventory_count_slips AS slip
  WHERE slip.id = p_slip_id
    AND slip.tenant_id = v_tenant
  FOR UPDATE;

  IF v_slip.id IS NULL THEN
    RAISE EXCEPTION 'slip_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.has_permission(
    v_slip.branch_id,
    'inventory:count_approve'
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF v_slip.status <> 'submitted' THEN
    RAISE EXCEPTION 'slip_not_submitted' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.employees AS employee
    WHERE employee.id = v_slip.employee_id
      AND employee.tenant_id = v_tenant
      AND employee.profile_id = v_uid
  ) THEN
    RAISE EXCEPTION 'cannot_review_own_slip' USING ERRCODE = '42501';
  END IF;
  IF (
    SELECT count(*)
    FROM public.inventory_count_slip_lines AS line
    WHERE line.tenant_id = v_tenant
      AND line.slip_id = p_slip_id
      AND line.id = ANY (p_line_ids)
  ) <> v_selected_count THEN
    RAISE EXCEPTION 'recount_line_scope_mismatch' USING ERRCODE = '42501';
  END IF;

  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'line_id', line.id,
        'ingredient_id', line.ingredient_id,
        'counted_quantity', line.counted_quantity,
        'entry_unit_id', line.entry_unit_id,
        'entry_to_base_factor', line.entry_to_base_factor,
        'counted_base_quantity', line.counted_base_quantity,
        'note', line.note,
        'last_recount_round', line.last_recount_round
      ) ORDER BY line.id
    ),
    '[]'::jsonb
  )
  INTO v_old_lines
  FROM public.inventory_count_slip_lines AS line
  WHERE line.tenant_id = v_tenant
    AND line.slip_id = p_slip_id
    AND line.id = ANY (p_line_ids);

  v_round := v_slip.recount_round + 1;

  UPDATE public.inventory_count_slip_lines
  SET recount_required = (id = ANY (p_line_ids))
  WHERE tenant_id = v_tenant
    AND slip_id = p_slip_id;

  UPDATE public.inventory_count_slips
  SET status = 'needs_changes',
      recount_round = v_round,
      review_note = v_note,
      reviewed_by = v_uid,
      reviewed_at = now(),
      updated_at = now()
  WHERE id = p_slip_id
    AND tenant_id = v_tenant;

  PERFORM public.log_audit(
    'request_recount',
    'inventory_count_slip',
    p_slip_id,
    jsonb_build_object(
      'status', 'submitted',
      'round', v_slip.recount_round,
      'lines', v_old_lines
    ),
    jsonb_build_object(
      'status', 'needs_changes',
      'round', v_round,
      'reason', v_note,
      'line_ids', to_jsonb(p_line_ids)
    )
  );

  SELECT private.staff_role_from_position_code(position.code)
  INTO v_employee_bucket
  FROM public.employees AS employee
  JOIN public.profiles AS profile
    ON profile.id = employee.profile_id
   AND profile.tenant_id = employee.tenant_id
  LEFT JOIN public.positions AS position
    ON position.id = profile.position_id
   AND position.tenant_id = profile.tenant_id
  WHERE employee.id = v_slip.employee_id
    AND employee.tenant_id = v_tenant;

  IF v_employee_bucket IS NOT NULL THEN
    INSERT INTO public.notifications (
      tenant_id, target_branch_id, target_roles, kind, severity, title, body,
      entity_type, entity_id, action_url, meta, dedup_key
    )
    VALUES (
      v_tenant,
      v_slip.branch_id,
      ARRAY[v_employee_bucket]::text[],
      'inventory.count_slip_recount',
      'warning',
      'Phiếu đếm tồn cần đếm lại',
      format(
        'Quản lý yêu cầu đếm lại %s nguyên liệu (lần %s): %s',
        v_selected_count,
        v_round,
        v_note
      ),
      'inventory_count_slip',
      p_slip_id,
      format('/br/%s/stock/count?slip=%s', v_slip.branch_id, p_slip_id),
      jsonb_build_object(
        'slip_id', p_slip_id,
        'employee_id', v_slip.employee_id,
        'branch_id', v_slip.branch_id,
        'result', 'needs_changes',
        'round', v_round,
        'line_count', v_selected_count
      ),
      format('inventory.count_slip:%s:recount:%s', p_slip_id, v_round)
    )
    ON CONFLICT (tenant_id, dedup_key) WHERE dedup_key IS NOT NULL
    DO UPDATE
    SET created_at = EXCLUDED.created_at,
        expires_at = NULL,
        body = EXCLUDED.body,
        action_url = EXCLUDED.action_url,
        meta = EXCLUDED.meta;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'slip_id', p_slip_id,
    'recount_round', v_round,
    'line_count', v_selected_count
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_my_count_slip_recount(
  p_slip_id bigint
) RETURNS TABLE(
  line_id bigint,
  ingredient_id bigint,
  ingredient_name text,
  counted_quantity numeric,
  entry_unit_id bigint,
  note text,
  recount_required boolean,
  last_recount_round integer,
  recount_round integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_tenant bigint := public.auth_tenant_id();
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  RETURN QUERY
  SELECT
    line.id,
    line.ingredient_id,
    ingredient.name,
    line.counted_quantity,
    line.entry_unit_id,
    line.note,
    line.recount_required,
    line.last_recount_round,
    slip.recount_round
  FROM public.inventory_count_slip_lines AS line
  JOIN public.inventory_count_slips AS slip
    ON slip.id = line.slip_id
   AND slip.tenant_id = line.tenant_id
  JOIN public.employees AS employee
    ON employee.id = slip.employee_id
   AND employee.tenant_id = slip.tenant_id
  JOIN public.ingredients AS ingredient
    ON ingredient.id = line.ingredient_id
   AND ingredient.tenant_id = line.tenant_id
  WHERE slip.id = p_slip_id
    AND slip.tenant_id = v_tenant
    AND slip.status = 'needs_changes'
    AND employee.profile_id = v_uid
    AND employee.is_active IS TRUE
  ORDER BY line.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.resubmit_inventory_count_slip_lines(
  p_slip_id bigint,
  p_recount_round integer,
  p_lines jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_tenant bigint := public.auth_tenant_id();
  v_uid uuid := auth.uid();
  v_slip public.inventory_count_slips%ROWTYPE;
  v_payload_line jsonb;
  v_line_id bigint;
  v_counted numeric;
  v_unit_id bigint;
  v_payload_ids bigint[];
  v_required_ids bigint[];
  v_old_lines jsonb;
  v_new_lines jsonb;
  v_employee_name text;
  v_line_count integer;
BEGIN
  IF v_uid IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  IF p_recount_round IS NULL OR p_recount_round <= 0 THEN
    RAISE EXCEPTION 'recount_round_invalid' USING ERRCODE = '22023';
  END IF;
  IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array'
     OR jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION 'recount_lines_required' USING ERRCODE = '22023';
  END IF;

  SELECT slip.*
  INTO v_slip
  FROM public.inventory_count_slips AS slip
  JOIN public.employees AS employee
    ON employee.id = slip.employee_id
   AND employee.tenant_id = slip.tenant_id
  WHERE slip.id = p_slip_id
    AND slip.tenant_id = v_tenant
    AND employee.profile_id = v_uid
    AND employee.is_active IS TRUE
  FOR UPDATE OF slip;

  IF v_slip.id IS NULL THEN
    RAISE EXCEPTION 'slip_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_slip.status = 'submitted'
     AND v_slip.last_resubmitted_round = p_recount_round THEN
    RETURN jsonb_build_object(
      'success', true,
      'slip_id', p_slip_id,
      'recount_round', p_recount_round,
      'already_resubmitted', true
    );
  END IF;
  IF v_slip.status <> 'needs_changes'
     OR v_slip.recount_round <> p_recount_round THEN
    RAISE EXCEPTION 'recount_round_stale' USING ERRCODE = '22023';
  END IF;

  FOR v_payload_line IN
    SELECT element.value
    FROM jsonb_array_elements(p_lines) AS element(value)
  LOOP
    IF jsonb_typeof(v_payload_line) <> 'object'
       OR NOT (v_payload_line ? 'line_id')
       OR NOT (v_payload_line ? 'counted_quantity')
       OR NOT (v_payload_line ? 'entry_unit_id') THEN
      RAISE EXCEPTION 'recount_line_invalid' USING ERRCODE = '22023';
    END IF;

    v_line_id := nullif(v_payload_line ->> 'line_id', '')::bigint;
    v_counted := nullif(v_payload_line ->> 'counted_quantity', '')::numeric;
    v_unit_id := nullif(v_payload_line ->> 'entry_unit_id', '')::bigint;

    IF v_line_id IS NULL OR v_counted IS NULL OR v_unit_id IS NULL
       OR v_counted < 0
       OR v_counted = 'NaN'::numeric
       OR v_counted = 'Infinity'::numeric
       OR v_counted = '-Infinity'::numeric
       OR pg_catalog.char_length(coalesce(v_payload_line ->> 'note', '')) > 500 THEN
      RAISE EXCEPTION 'recount_line_invalid' USING ERRCODE = '22023';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM public.inventory_count_slip_lines AS line
      JOIN public.ingredient_units AS ingredient_unit
        ON ingredient_unit.tenant_id = line.tenant_id
       AND ingredient_unit.ingredient_id = line.ingredient_id
       AND ingredient_unit.unit_id = v_unit_id
       AND ingredient_unit.is_active IS TRUE
      WHERE line.id = v_line_id
        AND line.tenant_id = v_tenant
        AND line.slip_id = p_slip_id
        AND line.recount_required IS TRUE
    ) THEN
      RAISE EXCEPTION 'recount_line_unit_invalid' USING ERRCODE = '23503';
    END IF;
  END LOOP;

  SELECT coalesce(array_agg(payload.id ORDER BY payload.id), '{}'::bigint[])
  INTO v_payload_ids
  FROM (
    SELECT (element.value ->> 'line_id')::bigint AS id
    FROM jsonb_array_elements(p_lines) AS element(value)
  ) AS payload;

  IF pg_catalog.cardinality(v_payload_ids) <>
     (
       SELECT count(DISTINCT payload.id)
       FROM pg_catalog.unnest(v_payload_ids) AS payload(id)
     ) THEN
    RAISE EXCEPTION 'recount_payload_duplicate' USING ERRCODE = '22023';
  END IF;

  SELECT coalesce(array_agg(line.id ORDER BY line.id), '{}'::bigint[])
  INTO v_required_ids
  FROM public.inventory_count_slip_lines AS line
  WHERE line.tenant_id = v_tenant
    AND line.slip_id = p_slip_id
    AND line.recount_required IS TRUE;

  IF v_payload_ids IS DISTINCT FROM v_required_ids THEN
    RAISE EXCEPTION 'recount_payload_set_mismatch' USING ERRCODE = '22023';
  END IF;

  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'line_id', line.id,
        'ingredient_id', line.ingredient_id,
        'counted_quantity', line.counted_quantity,
        'entry_unit_id', line.entry_unit_id,
        'entry_to_base_factor', line.entry_to_base_factor,
        'counted_base_quantity', line.counted_base_quantity,
        'note', line.note
      ) ORDER BY line.id
    ),
    '[]'::jsonb
  )
  INTO v_old_lines
  FROM public.inventory_count_slip_lines AS line
  WHERE line.tenant_id = v_tenant
    AND line.slip_id = p_slip_id
    AND line.recount_required IS TRUE;

  WITH payload AS (
    SELECT
      (element.value ->> 'line_id')::bigint AS line_id,
      (element.value ->> 'counted_quantity')::numeric AS counted_quantity,
      (element.value ->> 'entry_unit_id')::bigint AS entry_unit_id,
      nullif(pg_catalog.btrim(element.value ->> 'note'), '') AS note
    FROM jsonb_array_elements(p_lines) AS element(value)
  ), normalized AS (
    SELECT
      payload.*,
      ingredient_unit.to_base_factor::numeric(15,6) AS factor
    FROM payload
    JOIN public.inventory_count_slip_lines AS line
      ON line.id = payload.line_id
     AND line.tenant_id = v_tenant
     AND line.slip_id = p_slip_id
     AND line.recount_required IS TRUE
    JOIN public.ingredient_units AS ingredient_unit
      ON ingredient_unit.tenant_id = line.tenant_id
     AND ingredient_unit.ingredient_id = line.ingredient_id
     AND ingredient_unit.unit_id = payload.entry_unit_id
     AND ingredient_unit.is_active IS TRUE
  )
  UPDATE public.inventory_count_slip_lines AS line
  SET counted_quantity = normalized.counted_quantity,
      entry_unit_id = normalized.entry_unit_id,
      entry_to_base_factor = normalized.factor,
      counted_base_quantity = pg_catalog.round(
        normalized.counted_quantity * normalized.factor,
        3
      )::numeric(15,3),
      note = normalized.note,
      recount_required = false,
      last_recount_round = p_recount_round
  FROM normalized
  WHERE line.id = normalized.line_id
    AND line.tenant_id = v_tenant
    AND line.slip_id = p_slip_id;

  GET DIAGNOSTICS v_line_count = ROW_COUNT;
  IF v_line_count <> pg_catalog.cardinality(v_required_ids) THEN
    RAISE EXCEPTION 'recount_update_incomplete' USING ERRCODE = '22023';
  END IF;

  UPDATE public.inventory_count_slips
  SET status = 'submitted',
      last_resubmitted_round = p_recount_round,
      submitted_by = v_uid,
      submitted_at = now(),
      reviewed_by = NULL,
      reviewed_at = NULL,
      review_note = NULL,
      updated_at = now()
  WHERE id = p_slip_id
    AND tenant_id = v_tenant;

  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'line_id', line.id,
        'ingredient_id', line.ingredient_id,
        'counted_quantity', line.counted_quantity,
        'entry_unit_id', line.entry_unit_id,
        'entry_to_base_factor', line.entry_to_base_factor,
        'counted_base_quantity', line.counted_base_quantity,
        'note', line.note
      ) ORDER BY line.id
    ),
    '[]'::jsonb
  )
  INTO v_new_lines
  FROM public.inventory_count_slip_lines AS line
  WHERE line.tenant_id = v_tenant
    AND line.slip_id = p_slip_id
    AND line.id = ANY (v_required_ids);

  PERFORM public.log_audit(
    'resubmit_recount',
    'inventory_count_slip',
    p_slip_id,
    jsonb_build_object(
      'status', 'needs_changes',
      'round', p_recount_round,
      'lines', v_old_lines
    ),
    jsonb_build_object(
      'status', 'submitted',
      'round', p_recount_round,
      'lines', v_new_lines
    )
  );

  SELECT profile.full_name
  INTO v_employee_name
  FROM public.employees AS employee
  JOIN public.profiles AS profile
    ON profile.id = employee.profile_id
   AND profile.tenant_id = employee.tenant_id
  WHERE employee.id = v_slip.employee_id
    AND employee.tenant_id = v_tenant;

  INSERT INTO public.notifications (
    tenant_id, target_branch_id, target_roles, kind, severity, title, body,
    entity_type, entity_id, action_url, meta, dedup_key
  )
  VALUES (
    v_tenant,
    v_slip.branch_id,
    ARRAY['branch_manager', 'owner']::text[],
    'inventory.count_slip_submitted',
    'info',
    'Phiếu đếm lại đã gửi',
    format(
      '%s đã gửi lại %s nguyên liệu (lần %s) chờ duyệt.',
      coalesce(v_employee_name, 'Nhân viên'),
      v_line_count,
      p_recount_round
    ),
    'inventory_count_slip',
    p_slip_id,
    format('/br/%s/stock/count-slips?slip=%s', v_slip.branch_id, p_slip_id),
    jsonb_build_object(
      'slip_id', p_slip_id,
      'employee_id', v_slip.employee_id,
      'branch_id', v_slip.branch_id,
      'location_id', v_slip.location_id,
      'shift_id', v_slip.shift_id,
      'round', p_recount_round,
      'line_count', v_line_count
    ),
    format(
      'inventory.count_slip:%s:resubmitted:%s',
      p_slip_id,
      p_recount_round
    )
  )
  ON CONFLICT (tenant_id, dedup_key) WHERE dedup_key IS NOT NULL
  DO UPDATE
  SET created_at = EXCLUDED.created_at,
      expires_at = NULL,
      body = EXCLUDED.body,
      action_url = EXCLUDED.action_url,
      meta = EXCLUDED.meta;

  RETURN jsonb_build_object(
    'success', true,
    'slip_id', p_slip_id,
    'recount_round', p_recount_round,
    'resubmitted_lines', v_line_count,
    'already_resubmitted', false
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.request_inventory_count_recount(
  p_slip_id bigint,
  p_note text DEFAULT NULL::text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_tenant bigint := public.auth_tenant_id();
  v_line_ids bigint[];
BEGIN
  SELECT array_agg(line.id ORDER BY line.id)
  INTO v_line_ids
  FROM public.inventory_count_slip_lines AS line
  WHERE line.tenant_id = v_tenant
    AND line.slip_id = p_slip_id;

  PERFORM public.request_inventory_count_line_recount(
    p_slip_id,
    coalesce(p_note, 'Yêu cầu đếm lại toàn bộ phiếu'),
    v_line_ids
  );
END;
$$;

CREATE OR REPLACE FUNCTION private.execute_approve_inventory_count_slip(
  p_slip_id bigint
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_tenant bigint := public.auth_tenant_id();
  v_uid uuid := auth.uid();
  v_slip public.inventory_count_slips%ROWTYPE;
  v_employee_bucket text;
BEGIN
  IF v_uid IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT *
  INTO v_slip
  FROM public.inventory_count_slips
  WHERE id = p_slip_id
    AND tenant_id = v_tenant
  FOR UPDATE;

  IF v_slip.id IS NULL THEN
    RAISE EXCEPTION 'slip_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.has_permission(
    v_slip.branch_id,
    'inventory:count_approve'
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF v_slip.status = 'approved' THEN
    RETURN jsonb_build_object(
      'success', true,
      'slip_id', p_slip_id,
      'already_approved', true
    );
  END IF;
  IF v_slip.status <> 'submitted' THEN
    RAISE EXCEPTION 'slip_not_submitted' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.inventory_count_slip_lines AS line
    WHERE line.tenant_id = v_tenant
      AND line.slip_id = p_slip_id
      AND line.recount_required IS TRUE
  ) THEN
    RAISE EXCEPTION 'recount_lines_outstanding' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.employees AS employee
    WHERE employee.id = v_slip.employee_id
      AND employee.tenant_id = v_tenant
      AND employee.profile_id = v_uid
  ) THEN
    RAISE EXCEPTION 'cannot_review_own_slip' USING ERRCODE = '42501';
  END IF;

  UPDATE public.inventory_count_slips
  SET status = 'approved',
      reviewed_by = v_uid,
      reviewed_at = now(),
      updated_at = now()
  WHERE id = p_slip_id
    AND tenant_id = v_tenant;

  PERFORM public.log_audit(
    'approve',
    'inventory_count_slip',
    p_slip_id,
    jsonb_build_object('status', 'submitted'),
    jsonb_build_object('status', 'approved')
  );

  SELECT private.staff_role_from_position_code(position.code)
  INTO v_employee_bucket
  FROM public.employees AS employee
  JOIN public.profiles AS profile
    ON profile.id = employee.profile_id
   AND profile.tenant_id = employee.tenant_id
  LEFT JOIN public.positions AS position
    ON position.id = profile.position_id
   AND position.tenant_id = profile.tenant_id
  WHERE employee.id = v_slip.employee_id
    AND employee.tenant_id = v_tenant;

  IF v_employee_bucket IS NOT NULL THEN
    INSERT INTO public.notifications (
      tenant_id, target_branch_id, target_roles, kind, severity, title, body,
      entity_type, entity_id, action_url, meta, dedup_key
    )
    VALUES (
      v_tenant,
      v_slip.branch_id,
      ARRAY[v_employee_bucket]::text[],
      'inventory.count_slip_approved',
      'info',
      'Phiếu đếm ca đã được xác nhận',
      'Phiếu đếm bàn giao ca của bạn đã được Quản lý xác nhận.',
      'inventory_count_slip',
      p_slip_id,
      format('/br/%s/stock/count', v_slip.branch_id),
      jsonb_build_object(
        'slip_id', p_slip_id,
        'employee_id', v_slip.employee_id,
        'branch_id', v_slip.branch_id,
        'result', 'approved'
      ),
      format('inventory.count_slip:%s:approved', p_slip_id)
    )
    ON CONFLICT (tenant_id, dedup_key) WHERE dedup_key IS NOT NULL
    DO UPDATE
    SET created_at = EXCLUDED.created_at,
        expires_at = NULL,
        meta = EXCLUDED.meta;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'slip_id', p_slip_id,
    'already_approved', false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.request_inventory_count_line_recount(
  bigint,
  text,
  bigint[]
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_inventory_count_line_recount(
  bigint,
  text,
  bigint[]
) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_my_count_slip_recount(bigint)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_count_slip_recount(bigint)
  TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.resubmit_inventory_count_slip_lines(
  bigint,
  integer,
  jsonb
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resubmit_inventory_count_slip_lines(
  bigint,
  integer,
  jsonb
) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.request_inventory_count_recount(bigint, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_inventory_count_recount(bigint, text)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.get_my_count_slip_recount(bigint) IS
  'Blind employee read for one partial recount round. Returns entered values and recount state only.';
