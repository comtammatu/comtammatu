-- Migration: 20260829110000_smart_count_slip_approval_and_self_review
-- 1. Add is_self_approved flag to inventory_count_slips for audit traceability.
-- 2. Enhance approve_inventory_count_slip_with_waste to accept per-line reason codes
--    and waive mandatory photo requirements for discrepancy/loss reasons.
-- 3. Support audited self-review for solo branch operators when explicitly requested.

ALTER TABLE public.inventory_count_slips
  ADD COLUMN IF NOT EXISTS is_self_approved boolean NOT NULL DEFAULT false;

-- ─── 1. Private: execute_approve_inventory_count_slip with self-review support ─

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
      reviewed_by = v_uid::text,
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

-- ─── 2. Public wrapper: approve_inventory_count_slip ─────────────────────────

DROP FUNCTION IF EXISTS public.approve_inventory_count_slip(bigint);

CREATE OR REPLACE FUNCTION public.approve_inventory_count_slip(
  p_slip_id bigint,
  p_allow_self_review boolean DEFAULT false
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  IF auth.uid() IS NULL OR public.auth_tenant_id() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  RETURN private.execute_approve_inventory_count_slip(
    p_slip_id,
    p_allow_self_review
  );
END;
$$;

REVOKE ALL ON FUNCTION public.approve_inventory_count_slip(bigint, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_inventory_count_slip(bigint, boolean) TO authenticated, service_role;

-- ─── 3. Atomic approval with optional waste and flexible reasons ─────────────

DROP FUNCTION IF EXISTS public.approve_inventory_count_slip_with_waste(bigint, jsonb);

CREATE OR REPLACE FUNCTION public.approve_inventory_count_slip_with_waste(
  p_slip_id bigint,
  p_photo_urls jsonb DEFAULT '{}'::jsonb,
  p_reasons jsonb DEFAULT '{}'::jsonb,
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
  v_items jsonb;
  v_waste jsonb;
  v_approval jsonb;
  v_existing_issue record;
  v_requires_approval boolean := false;
  v_is_self boolean := false;
BEGIN
  IF v_uid IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  IF p_photo_urls IS NULL OR jsonb_typeof(p_photo_urls) <> 'object' THEN
    RAISE EXCEPTION 'count_slip_waste_photos_invalid'
      USING ERRCODE = '22023';
  END IF;
  IF p_reasons IS NOT NULL AND jsonb_typeof(p_reasons) <> 'object' THEN
    RAISE EXCEPTION 'count_slip_waste_reasons_invalid'
      USING ERRCODE = '22023';
  END IF;

  SELECT slip.*
  INTO v_slip
  FROM public.inventory_count_slips AS slip
  WHERE slip.id = p_slip_id
    AND slip.tenant_id = v_tenant
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'slip_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_slip.status NOT IN ('submitted', 'approved') THEN
    RAISE EXCEPTION 'slip_not_submitted' USING ERRCODE = '22023';
  END IF;
  IF NOT public.has_permission(v_slip.branch_id, 'inventory:count_approve')
     OR NOT public.has_permission(v_slip.branch_id, 'inventory:writeoff') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
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

  SELECT
    issue.id,
    issue.issue_number,
    coalesce(bool_or(item.approval_required), false) AS requires_approval,
    count(item.id)::integer AS item_count
  INTO v_existing_issue
  FROM public.stock_issues AS issue
  LEFT JOIN public.stock_issue_items AS item
    ON item.issue_id = issue.id
   AND item.tenant_id = issue.tenant_id
  WHERE issue.tenant_id = v_tenant
    AND issue.issue_type = 'writeoff'
    AND (
      issue.source_ref @> jsonb_build_object(
        'source', 'count_slip_auto_waste',
        'count_slip_id', p_slip_id
      )
      OR issue.source_ref @> jsonb_build_object('countSlipId', p_slip_id)
    )
  GROUP BY issue.id, issue.issue_number
  ORDER BY issue.id
  LIMIT 1;

  IF v_existing_issue.id IS NOT NULL THEN
    v_approval := public.approve_inventory_count_slip(p_slip_id, p_allow_self_review);
    RETURN coalesce(v_approval, '{}'::jsonb) || jsonb_build_object(
      'waste_created', true,
      'waste_issue_id', v_existing_issue.id,
      'waste_issue_number', v_existing_issue.issue_number,
      'waste_items_count', v_existing_issue.item_count,
      'requires_approval', v_existing_issue.requires_approval,
      'is_self_approved', v_is_self
    );
  END IF;

  -- Validate photo requirements only for physical waste reasons (spoiled, expired, damaged)
  IF EXISTS (
    SELECT 1
    FROM public.inventory_count_slip_lines AS line
    WHERE line.tenant_id = v_tenant
      AND line.slip_id = p_slip_id
      AND line.system_quantity > coalesce(
        line.counted_base_quantity,
        public.inv_to_base_for_tenant(
          v_tenant,
          line.ingredient_id,
          line.entry_unit_id,
          line.counted_quantity
        )
      )
      AND coalesce(p_reasons ->> line.id::text, 'spoiled') IN ('spoiled', 'expired', 'damaged')
      AND (
        NOT (p_photo_urls ? line.id::text)
        OR jsonb_typeof(p_photo_urls -> line.id::text) <> 'array'
        OR jsonb_array_length(p_photo_urls -> line.id::text) = 0
        OR jsonb_array_length(p_photo_urls -> line.id::text) > 10
        OR EXISTS (
          SELECT 1
          FROM jsonb_array_elements(p_photo_urls -> line.id::text)
            AS photo(value)
          WHERE jsonb_typeof(photo.value) <> 'string'
            OR nullif(pg_catalog.btrim(photo.value #>> '{}'), '') IS NULL
        )
      )
  ) THEN
    RAISE EXCEPTION 'count_slip_waste_photo_required'
      USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.inventory_count_slip_lines AS line
    WHERE line.tenant_id = v_tenant
      AND line.slip_id = p_slip_id
      AND line.system_quantity > coalesce(
        line.counted_base_quantity,
        public.inv_to_base_for_tenant(
          v_tenant,
          line.ingredient_id,
          line.entry_unit_id,
          line.counted_quantity
        )
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.ingredient_units AS ingredient_unit
        WHERE ingredient_unit.tenant_id = v_tenant
          AND ingredient_unit.ingredient_id = line.ingredient_id
          AND ingredient_unit.is_base IS TRUE
          AND ingredient_unit.is_active IS TRUE
      )
  ) THEN
    RAISE EXCEPTION 'count_slip_waste_base_unit_missing'
      USING ERRCODE = '23503';
  END IF;

  SELECT jsonb_agg(
    jsonb_build_object(
      'ingredient_id', shortage.ingredient_id,
      'quantity', shortage.shortage_quantity,
      'entry_unit_id', shortage.base_unit_id,
      'reason_code', shortage.reason_code,
      'note', format('Hao hụt kiểm đếm giao ca #%s', v_slip.slip_number),
      'photo_urls', coalesce(p_photo_urls -> shortage.line_id::text, '[]'::jsonb)
    )
    ORDER BY shortage.line_id
  )
  INTO v_items
  FROM (
    SELECT
      line.id AS line_id,
      line.ingredient_id,
      base_unit.unit_id AS base_unit_id,
      round(
        line.system_quantity - coalesce(
          line.counted_base_quantity,
          public.inv_to_base_for_tenant(
            v_tenant,
            line.ingredient_id,
            line.entry_unit_id,
            line.counted_quantity
          )
        ),
        3
      )::numeric(15,3) AS shortage_quantity,
      coalesce(
        nullif(pg_catalog.btrim(p_reasons ->> line.id::text), ''),
        CASE WHEN (p_photo_urls ? line.id::text) AND jsonb_array_length(coalesce(p_photo_urls -> line.id::text, '[]'::jsonb)) > 0
             THEN 'spoiled'
             ELSE 'discrepancy'
        END
      ) AS reason_code
    FROM public.inventory_count_slip_lines AS line
    JOIN LATERAL (
      SELECT ingredient_unit.unit_id
      FROM public.ingredient_units AS ingredient_unit
      WHERE ingredient_unit.tenant_id = v_tenant
        AND ingredient_unit.ingredient_id = line.ingredient_id
        AND ingredient_unit.is_base IS TRUE
        AND ingredient_unit.is_active IS TRUE
      ORDER BY ingredient_unit.id
      LIMIT 1
    ) AS base_unit ON true
    WHERE line.tenant_id = v_tenant
      AND line.slip_id = p_slip_id
      AND line.system_quantity > coalesce(
        line.counted_base_quantity,
        public.inv_to_base_for_tenant(
          v_tenant,
          line.ingredient_id,
          line.entry_unit_id,
          line.counted_quantity
        )
      )
  ) AS shortage
  WHERE shortage.shortage_quantity > 0;

  IF v_items IS NULL OR jsonb_array_length(v_items) = 0 THEN
    v_approval := public.approve_inventory_count_slip(p_slip_id, p_allow_self_review);
    RETURN coalesce(v_approval, '{}'::jsonb) || jsonb_build_object(
      'waste_created', false,
      'waste_items_count', 0,
      'requires_approval', false,
      'is_self_approved', v_is_self
    );
  END IF;

  v_waste := private.execute_create_waste_entry(
    v_slip.branch_id,
    v_slip.location_id,
    v_items,
    'count_slip_auto_waste',
    jsonb_build_object(
      'source', 'count_slip_auto_waste',
      'count_slip_id', p_slip_id,
      'count_slip_number', v_slip.slip_number
    ),
    format('Hao hụt kiểm đếm giao ca #%s', v_slip.slip_number)
  );

  v_approval := public.approve_inventory_count_slip(p_slip_id, p_allow_self_review);
  v_requires_approval := coalesce(
    (v_waste ->> 'requires_approval')::boolean,
    false
  );

  RETURN coalesce(v_approval, '{}'::jsonb) || jsonb_build_object(
    'waste_created', true,
    'waste_issue_id', (v_waste ->> 'issue_id')::bigint,
    'waste_issue_number', v_waste ->> 'issue_number',
    'waste_items_count', jsonb_array_length(v_items),
    'requires_approval', v_requires_approval,
    'is_self_approved', v_is_self
  );
END;
$$;

REVOKE ALL ON FUNCTION public.approve_inventory_count_slip_with_waste(bigint, jsonb, jsonb, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_inventory_count_slip_with_waste(bigint, jsonb, jsonb, boolean) TO authenticated, service_role;

COMMENT ON FUNCTION public.approve_inventory_count_slip_with_waste(bigint, jsonb, jsonb, boolean) IS
  'Atomically approves a count slip and creates shortage writeoff with flexible reasons and audited self-review.';
