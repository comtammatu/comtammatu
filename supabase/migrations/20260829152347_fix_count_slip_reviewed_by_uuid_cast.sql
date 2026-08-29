-- Migration: fix_count_slip_reviewed_by_uuid_cast
-- Fix datatype mismatch: reviewed_by is uuid but was assigned v_uid::text.
-- Remove the erroneous ::text cast in execute_approve_inventory_count_slip.

CREATE OR REPLACE FUNCTION private.execute_approve_inventory_count_slip(
  p_slip_id bigint,
  p_allow_self_review boolean DEFAULT false
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
  v_is_self boolean := false;
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
    IF NOT coalesce(p_allow_self_review, false) THEN
      RAISE EXCEPTION 'cannot_review_own_slip' USING ERRCODE = '42501';
    END IF;
    v_is_self := true;
  END IF;

  UPDATE public.inventory_count_slips
  SET status = 'approved',
      reviewed_by = v_uid,
      reviewed_at = now(),
      is_self_approved = v_is_self,
      updated_at = now()
  WHERE id = p_slip_id
    AND tenant_id = v_tenant;

  PERFORM public.log_audit(
    'approve',
    'inventory_count_slip',
    p_slip_id,
    jsonb_build_object('status', 'submitted'),
    jsonb_build_object(
      'status', 'approved',
      'is_self_approved', v_is_self
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
        'result', 'approved',
        'is_self_approved', v_is_self
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
    'already_approved', false,
    'is_self_approved', v_is_self
  );
END;
$$;
