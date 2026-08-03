CREATE OR REPLACE FUNCTION public.save_purchase_request(
  p_request_id bigint,
  p_branch_id bigint,
  p_needed_by date,
  p_notes text,
  p_lines jsonb,
  p_submit boolean DEFAULT TRUE,
  p_idempotency_key uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_tenant bigint := public.auth_tenant_id();
  v_request public.purchase_requests%ROWTYPE;
  v_request_id bigint;
  v_number text;
  v_status text;
  v_old jsonb;
  v_was_pending boolean := FALSE;
BEGIN
  IF v_uid IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  IF p_branch_id IS NULL
     OR p_lines IS NULL
     OR pg_catalog.jsonb_typeof(p_lines) <> 'array'
     OR pg_catalog.jsonb_array_length(p_lines) = 0
     OR pg_catalog.jsonb_array_length(p_lines) > 200 THEN
    RAISE EXCEPTION 'purchase_request_invalid' USING ERRCODE = '22023';
  END IF;
  IF NOT public.has_permission(
    p_branch_id,
    'procurement:request_manage'
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.branches AS branch
    WHERE branch.id = p_branch_id
      AND branch.tenant_id = v_tenant
      AND branch.is_active
      AND branch.branch_kind IN ('central_supply', 'central_kitchen')
  ) THEN
    RAISE EXCEPTION 'purchase_request_central_site_required'
      USING ERRCODE = '23514';
  END IF;
  IF (
    SELECT pg_catalog.count(*) <>
      pg_catalog.count(DISTINCT line.ingredient_id)
    FROM pg_catalog.jsonb_to_recordset(p_lines)
      AS line(ingredient_id bigint)
  )
  OR EXISTS (
    SELECT 1
    FROM pg_catalog.jsonb_to_recordset(p_lines)
      AS line(
        ingredient_id bigint,
        quantity numeric,
        entry_unit_id bigint
      )
    WHERE line.ingredient_id IS NULL
       OR line.entry_unit_id IS NULL
       OR line.quantity IS NULL
       OR line.quantity <= 0
       OR NOT EXISTS (
         SELECT 1
         FROM public.ingredients AS ingredient
         JOIN public.ingredient_units AS ingredient_unit
           ON ingredient_unit.ingredient_id = ingredient.id
          AND ingredient_unit.tenant_id = ingredient.tenant_id
         WHERE ingredient.id = line.ingredient_id
           AND ingredient.tenant_id = v_tenant
           AND ingredient.is_active
           AND ingredient_unit.unit_id = line.entry_unit_id
           AND ingredient_unit.is_active
       )
  ) THEN
    RAISE EXCEPTION 'purchase_request_line_invalid'
      USING ERRCODE = '23514';
  END IF;

  IF p_request_id IS NULL
     AND p_idempotency_key IS NOT NULL THEN
    SELECT request.*
    INTO v_request
    FROM public.purchase_requests AS request
    WHERE request.tenant_id = v_tenant
      AND request.creation_idempotency_key = p_idempotency_key
    FOR UPDATE;

    IF FOUND THEN
      RETURN pg_catalog.jsonb_build_object(
        'request_id', v_request.id,
        'request_number', v_request.request_number,
        'status', v_request.status
      );
    END IF;
  END IF;

  IF p_request_id IS NULL THEN
    v_number := public.next_inventory_doc_number(
      v_tenant,
      'purchase_request'
    );
    INSERT INTO public.purchase_requests (
      tenant_id,
      branch_id,
      request_number,
      status,
      needed_by,
      notes,
      created_by,
      creation_idempotency_key
    )
    VALUES (
      v_tenant,
      p_branch_id,
      v_number,
      'draft',
      p_needed_by,
      pg_catalog.nullif(pg_catalog.btrim(p_notes), ''),
      v_uid,
      p_idempotency_key
    )
    RETURNING id INTO v_request_id;
    v_old := NULL;
  ELSE
    SELECT request.*
    INTO v_request
    FROM public.purchase_requests AS request
    WHERE request.id = p_request_id
      AND request.tenant_id = v_tenant
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'purchase_request_not_found'
        USING ERRCODE = 'P0002';
    END IF;
    v_old := pg_catalog.to_jsonb(v_request);
    v_was_pending := v_request.status = 'pending_allocation';

    IF v_request.status IN ('submitted', 'pending_allocation')
       AND EXISTS (
         SELECT 1
         FROM public.purchase_request_allocations AS allocation
         WHERE allocation.tenant_id = v_tenant
           AND allocation.purchase_request_id = p_request_id
       ) THEN
      RAISE EXCEPTION 'purchase_demand_allocation_started'
        USING ERRCODE = '23514';
    END IF;

    IF v_request.branch_id <> p_branch_id
       OR v_request.status NOT IN (
         'draft',
         'submitted',
         'pending_allocation'
       )
       OR EXISTS (
         SELECT 1
         FROM public.purchase_orders AS purchase_order
         WHERE purchase_order.tenant_id = v_tenant
           AND purchase_order.purchase_request_id = p_request_id
           AND purchase_order.status <> 'cancelled'
       ) THEN
      RAISE EXCEPTION 'purchase_request_not_editable'
        USING ERRCODE = '23514';
    END IF;

    v_request_id := p_request_id;
    v_number := v_request.request_number;
    DELETE FROM public.purchase_request_items
    WHERE purchase_request_id = v_request_id
      AND tenant_id = v_tenant;

    UPDATE public.purchase_requests
    SET needed_by = p_needed_by,
        notes = pg_catalog.nullif(pg_catalog.btrim(p_notes), ''),
        updated_at = pg_catalog.now()
    WHERE id = v_request_id
      AND tenant_id = v_tenant;
  END IF;

  INSERT INTO public.purchase_request_items (
    tenant_id,
    purchase_request_id,
    ingredient_id,
    quantity,
    entry_unit_id,
    notes
  )
  SELECT
    v_tenant,
    v_request_id,
    line.ingredient_id,
    line.quantity::numeric(15,3),
    line.entry_unit_id,
    pg_catalog.nullif(pg_catalog.btrim(line.notes), '')
  FROM pg_catalog.jsonb_to_recordset(p_lines)
    AS line(
      ingredient_id bigint,
      quantity numeric,
      entry_unit_id bigint,
      notes text
    );

  v_status := CASE
    WHEN v_was_pending THEN 'pending_allocation'
    WHEN p_submit THEN 'submitted'
    ELSE 'draft'
  END;
  UPDATE public.purchase_requests
  SET status = v_status,
      submitted_by = CASE
        WHEN v_was_pending THEN v_request.submitted_by
        WHEN p_submit THEN v_uid
        ELSE NULL
      END,
      submitted_at = CASE
        WHEN v_was_pending THEN v_request.submitted_at
        WHEN p_submit THEN pg_catalog.now()
        ELSE NULL
      END,
      updated_at = pg_catalog.now()
  WHERE id = v_request_id
    AND tenant_id = v_tenant;

  PERFORM public.log_audit(
    CASE
      WHEN v_was_pending THEN
        'procurement.demand.updated_pending_allocation'
      WHEN p_request_id IS NULL AND p_submit THEN
        'procurement.request.created_submitted'
      WHEN p_request_id IS NULL THEN
        'procurement.request.created_draft'
      WHEN p_submit THEN
        'procurement.request.saved_submitted'
      ELSE
        'procurement.request.saved_draft'
    END,
    'purchase_request',
    v_request_id,
    v_old,
    pg_catalog.jsonb_build_object(
      'status', v_status,
      'branch_id', p_branch_id,
      'line_count', pg_catalog.jsonb_array_length(p_lines)
    )
  );

  RETURN pg_catalog.jsonb_build_object(
    'request_id', v_request_id,
    'request_number', v_number,
    'status', v_status
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.save_purchase_demand(
  p_demand_id bigint,
  p_branch_id bigint,
  p_needed_by date,
  p_notes text,
  p_lines jsonb,
  p_submit boolean DEFAULT TRUE,
  p_idempotency_key uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_tenant bigint := public.auth_tenant_id();
  v_uid uuid := auth.uid();
  v_demand public.purchase_requests%ROWTYPE;
  v_saved jsonb;
  v_demand_id bigint;
  v_status text;
  v_was_pending boolean := FALSE;
BEGIN
  IF v_uid IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  IF p_demand_id IS NULL AND p_idempotency_key IS NULL THEN
    RAISE EXCEPTION 'purchase_demand_idempotency_required'
      USING ERRCODE = '22023';
  END IF;

  IF p_demand_id IS NOT NULL THEN
    SELECT demand.*
    INTO v_demand
    FROM public.purchase_requests AS demand
    WHERE demand.id = p_demand_id
      AND demand.tenant_id = v_tenant
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'purchase_demand_not_found'
        USING ERRCODE = 'P0002';
    END IF;
    IF NOT public.has_permission(
      v_demand.branch_id,
      'procurement:request_manage'
    ) THEN
      RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
    END IF;

    v_was_pending := v_demand.status = 'pending_allocation';
    IF v_was_pending
       AND EXISTS (
         SELECT 1
         FROM public.purchase_request_allocations AS allocation
         WHERE allocation.tenant_id = v_tenant
           AND allocation.purchase_request_id = p_demand_id
       ) THEN
      RAISE EXCEPTION 'purchase_demand_allocation_started'
        USING ERRCODE = '23514';
    END IF;

    IF v_demand.status NOT IN (
      'draft',
      'changes_requested',
      'pending_allocation'
    )
       OR EXISTS (
         SELECT 1
         FROM public.purchase_orders AS purchase_order
         WHERE purchase_order.tenant_id = v_tenant
           AND purchase_order.purchase_request_id = p_demand_id
           AND purchase_order.status <> 'cancelled'
       ) THEN
      RAISE EXCEPTION 'purchase_demand_not_editable'
        USING ERRCODE = '23514';
    END IF;

    IF v_demand.status = 'changes_requested' THEN
      UPDATE public.purchase_requests
      SET status = 'draft',
          updated_at = pg_catalog.now()
      WHERE id = p_demand_id
        AND tenant_id = v_tenant;
    END IF;
  END IF;

  v_status := CASE
    WHEN v_was_pending THEN 'pending_allocation'
    WHEN p_submit THEN 'pending_allocation'
    ELSE 'draft'
  END;
  v_saved := public.save_purchase_request(
    p_demand_id,
    p_branch_id,
    p_needed_by,
    p_notes,
    p_lines,
    FALSE,
    p_idempotency_key
  );
  v_demand_id := (v_saved ->> 'request_id')::bigint;

  UPDATE public.purchase_requests
  SET status = v_status,
      status_reason = NULL,
      submitted_by = CASE
        WHEN v_was_pending THEN v_demand.submitted_by
        WHEN p_submit THEN v_uid
        ELSE NULL
      END,
      submitted_at = CASE
        WHEN v_was_pending THEN v_demand.submitted_at
        WHEN p_submit THEN pg_catalog.now()
        ELSE NULL
      END,
      updated_at = pg_catalog.now()
  WHERE id = v_demand_id
    AND tenant_id = v_tenant;

  IF NOT v_was_pending THEN
    PERFORM public.log_audit(
      CASE
        WHEN p_submit THEN 'procurement.demand.submitted'
        ELSE 'procurement.demand.draft_saved'
      END,
      'purchase_request',
      v_demand_id,
      NULL,
      pg_catalog.jsonb_build_object('status', v_status)
    );
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'demand_id', v_demand_id,
    'demand_number', v_saved ->> 'request_number',
    'status', v_status
  );
END;
$$;

REVOKE ALL ON FUNCTION public.save_purchase_request(
  bigint,
  bigint,
  date,
  text,
  jsonb,
  boolean,
  uuid
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_purchase_request(
  bigint,
  bigint,
  date,
  text,
  jsonb,
  boolean,
  uuid
) TO service_role;

REVOKE ALL ON FUNCTION public.save_purchase_demand(
  bigint,
  bigint,
  date,
  text,
  jsonb,
  boolean,
  uuid
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_purchase_demand(
  bigint,
  bigint,
  date,
  text,
  jsonb,
  boolean,
  uuid
) TO authenticated, service_role;
