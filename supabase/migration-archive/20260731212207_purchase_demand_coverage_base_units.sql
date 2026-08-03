-- Compare purchase-demand coverage against PO lines in base units.
-- Demand lines keep issue/export units; approved PO lines use receipt units.

CREATE OR REPLACE FUNCTION private.purchase_request_item_ordered_base(
  p_tenant_id bigint,
  p_request_item_id bigint
) RETURNS numeric
LANGUAGE sql
STABLE
SET search_path TO ''
AS $$
  SELECT coalesce(
    pg_catalog.sum(po_item.quantity * po_item.entry_to_base_factor),
    0
  )
  FROM public.purchase_order_items AS po_item
  JOIN public.purchase_orders AS purchase_order
    ON purchase_order.id = po_item.po_id
   AND purchase_order.tenant_id = po_item.tenant_id
  WHERE po_item.tenant_id = p_tenant_id
    AND po_item.purchase_request_item_id = p_request_item_id
    AND purchase_order.status <> 'cancelled'
    AND po_item.entry_to_base_factor IS NOT NULL
    AND po_item.entry_to_base_factor > 0;
$$;

REVOKE ALL ON FUNCTION private.purchase_request_item_ordered_base(
  bigint,
  bigint
) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION private.purchase_request_item_remaining_demand_qty(
  p_tenant_id bigint,
  p_request_item_id bigint
) RETURNS numeric
LANGUAGE plpgsql
STABLE
SET search_path TO ''
AS $$
DECLARE
  v_demand_qty numeric;
  v_demand_factor numeric;
  v_ordered_base numeric;
BEGIN
  SELECT
    demand_item.quantity,
    request_unit.to_base_factor
  INTO v_demand_qty, v_demand_factor
  FROM public.purchase_request_items AS demand_item
  JOIN public.ingredient_units AS request_unit
    ON request_unit.tenant_id = demand_item.tenant_id
   AND request_unit.ingredient_id = demand_item.ingredient_id
   AND request_unit.unit_id = demand_item.entry_unit_id
  WHERE demand_item.tenant_id = p_tenant_id
    AND demand_item.id = p_request_item_id;

  IF v_demand_qty IS NULL
     OR v_demand_factor IS NULL
     OR v_demand_factor <= 0 THEN
    RAISE EXCEPTION 'purchase_demand_coverage_unit_invalid'
      USING ERRCODE = '23514';
  END IF;

  v_ordered_base := private.purchase_request_item_ordered_base(
    p_tenant_id,
    p_request_item_id
  );

  RETURN pg_catalog.greatest(
    v_demand_qty
      - pg_catalog.round(v_ordered_base / v_demand_factor, 3),
    0
  );
END;
$$;

REVOKE ALL ON FUNCTION private.purchase_request_item_remaining_demand_qty(
  bigint,
  bigint
) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION private.recompute_purchase_request_status(
  p_request_id bigint,
  p_tenant_id bigint
) RETURNS text
LANGUAGE plpgsql
SET search_path TO ''
AS $$
DECLARE
  v_current text;
  v_line_count integer;
  v_covered_count integer;
  v_any_covered boolean;
  v_status text;
BEGIN
  SELECT demand.status
  INTO v_current
  FROM public.purchase_requests AS demand
  WHERE demand.id = p_request_id
    AND demand.tenant_id = p_tenant_id
  FOR UPDATE;

  IF NOT FOUND OR v_current IN ('closed', 'cancelled') THEN
    RETURN v_current;
  END IF;

  SELECT
    pg_catalog.count(*)::integer,
    pg_catalog.count(*) FILTER (
      WHERE request_unit.to_base_factor IS NOT NULL
        AND request_unit.to_base_factor > 0
        AND coalesce(coverage.base_quantity, 0)
          >= demand_item.quantity * request_unit.to_base_factor
    )::integer,
    pg_catalog.bool_or(
      coalesce(coverage.base_quantity, 0) > 0
    )
  INTO v_line_count, v_covered_count, v_any_covered
  FROM public.purchase_request_items AS demand_item
  LEFT JOIN public.ingredient_units AS request_unit
    ON request_unit.tenant_id = demand_item.tenant_id
   AND request_unit.ingredient_id = demand_item.ingredient_id
   AND request_unit.unit_id = demand_item.entry_unit_id
  LEFT JOIN LATERAL (
    SELECT private.purchase_request_item_ordered_base(
      p_tenant_id,
      demand_item.id
    ) AS base_quantity
  ) AS coverage ON TRUE
  WHERE demand_item.purchase_request_id = p_request_id
    AND demand_item.tenant_id = p_tenant_id;

  v_status := CASE
    WHEN v_line_count > 0 AND v_covered_count = v_line_count
      THEN 'ordered'
    WHEN coalesce(v_any_covered, FALSE)
      THEN 'partially_ordered'
    ELSE 'pending_allocation'
  END;

  UPDATE public.purchase_requests
  SET status = v_status,
      updated_at = pg_catalog.now()
  WHERE id = p_request_id
    AND tenant_id = p_tenant_id;

  RETURN v_status;
END;
$$;

CREATE OR REPLACE FUNCTION public.save_purchase_demand_allocations(
  p_demand_id bigint,
  p_allocations jsonb,
  p_idempotency_key uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_tenant bigint := public.auth_tenant_id();
  v_uid uuid := auth.uid();
  v_demand public.purchase_requests%ROWTYPE;
  v_old jsonb;
BEGIN
  IF v_uid IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  IF p_demand_id IS NULL
     OR p_idempotency_key IS NULL
     OR p_allocations IS NULL
     OR pg_catalog.jsonb_typeof(p_allocations) <> 'array'
     OR pg_catalog.jsonb_array_length(p_allocations) > 500 THEN
    RAISE EXCEPTION 'purchase_demand_allocations_invalid'
      USING ERRCODE = '22023';
  END IF;

  SELECT demand.*
  INTO v_demand
  FROM public.purchase_requests AS demand
  WHERE demand.id = p_demand_id
    AND demand.tenant_id = v_tenant
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'purchase_demand_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.has_permission(
    v_demand.branch_id,
    'procurement:po_approve'
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF v_demand.status NOT IN (
    'submitted',
    'pending_allocation',
    'partially_ordered'
  ) THEN
    RAISE EXCEPTION 'purchase_demand_not_allocatable'
      USING ERRCODE = '23514';
  END IF;

  IF v_demand.allocation_save_idempotency_key = p_idempotency_key THEN
    RETURN private.purchase_demand_allocation_result(
      v_tenant,
      p_demand_id
    );
  END IF;

  IF (
    SELECT pg_catalog.count(*) <> pg_catalog.count(
      DISTINCT (allocation.request_item_id, allocation.supplier_id)
    )
    FROM pg_catalog.jsonb_to_recordset(p_allocations)
      AS allocation(
        request_item_id bigint,
        supplier_id bigint
      )
  )
  OR EXISTS (
    SELECT 1
    FROM pg_catalog.jsonb_to_recordset(p_allocations)
      AS allocation(
        request_item_id bigint,
        supplier_id bigint,
        quantity numeric
      )
    LEFT JOIN public.purchase_request_items AS demand_item
      ON demand_item.id = allocation.request_item_id
     AND demand_item.tenant_id = v_tenant
     AND demand_item.purchase_request_id = p_demand_id
    LEFT JOIN public.supplier_items AS supplier_item
      ON supplier_item.tenant_id = v_tenant
     AND supplier_item.supplier_id = allocation.supplier_id
     AND supplier_item.ingredient_id = demand_item.ingredient_id
     AND supplier_item.is_active
    LEFT JOIN public.suppliers AS supplier
      ON supplier.id = allocation.supplier_id
     AND supplier.tenant_id = v_tenant
     AND supplier.is_active
    WHERE allocation.request_item_id IS NULL
       OR allocation.supplier_id IS NULL
       OR allocation.quantity IS NULL
       OR allocation.quantity <= 0
       OR demand_item.id IS NULL
       OR supplier_item.id IS NULL
       OR supplier.id IS NULL
  )
  OR EXISTS (
    SELECT 1
    FROM public.purchase_request_items AS demand_item
    LEFT JOIN LATERAL (
      SELECT coalesce(
        pg_catalog.sum(allocation.quantity),
        0
      ) AS quantity
      FROM pg_catalog.jsonb_to_recordset(p_allocations)
        AS allocation(request_item_id bigint, quantity numeric)
      WHERE allocation.request_item_id = demand_item.id
    ) AS planned ON TRUE
    WHERE demand_item.tenant_id = v_tenant
      AND demand_item.purchase_request_id = p_demand_id
      AND planned.quantity >
        private.purchase_request_item_remaining_demand_qty(
          v_tenant,
          demand_item.id
        )
  ) THEN
    RAISE EXCEPTION 'purchase_demand_allocations_invalid'
      USING ERRCODE = '23514';
  END IF;

  SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(allocation))
  INTO v_old
  FROM public.purchase_request_allocations AS allocation
  WHERE allocation.tenant_id = v_tenant
    AND allocation.purchase_request_id = p_demand_id;

  DELETE FROM public.purchase_request_allocations
  WHERE tenant_id = v_tenant
    AND purchase_request_id = p_demand_id;

  INSERT INTO public.purchase_request_allocations (
    tenant_id,
    purchase_request_id,
    purchase_request_item_id,
    supplier_id,
    quantity,
    created_by
  )
  SELECT
    v_tenant,
    p_demand_id,
    allocation.request_item_id,
    allocation.supplier_id,
    allocation.quantity::numeric(15,3),
    v_uid
  FROM pg_catalog.jsonb_to_recordset(p_allocations)
    AS allocation(
      request_item_id bigint,
      supplier_id bigint,
      quantity numeric
    );

  UPDATE public.purchase_requests
  SET allocation_save_idempotency_key = p_idempotency_key,
      updated_at = pg_catalog.now()
  WHERE id = p_demand_id
    AND tenant_id = v_tenant;

  PERFORM public.log_audit(
    'procurement.demand.allocations_saved',
    'purchase_request',
    p_demand_id,
    v_old,
    p_allocations
  );

  RETURN private.purchase_demand_allocation_result(
    v_tenant,
    p_demand_id
  );
END;
$$;

DO $review_purchase_demand_remaining_base$
DECLARE
  v_before text;
  v_definition text;
BEGIN
  SELECT pg_catalog.pg_get_functiondef(
    'public.review_purchase_demand(bigint,text,jsonb,text,uuid)'::regprocedure
  ) INTO v_definition;
  v_before := v_definition;
  v_definition := replace(
    v_definition,
    $$    LEFT JOIN LATERAL (
      SELECT coalesce(
        pg_catalog.sum(po_item.quantity),
        0
      ) AS quantity
      FROM public.purchase_order_items AS po_item
      JOIN public.purchase_orders AS purchase_order
        ON purchase_order.id = po_item.po_id
       AND purchase_order.tenant_id = po_item.tenant_id
      WHERE po_item.tenant_id = v_tenant
        AND po_item.purchase_request_item_id = demand_item.id
        AND purchase_order.status <> 'cancelled'
    ) AS ordered ON TRUE
    LEFT JOIN LATERAL (
      SELECT coalesce(
        pg_catalog.sum(allocation.quantity),
        0
      ) AS quantity
      FROM public.purchase_request_allocations AS allocation
      WHERE allocation.tenant_id = v_tenant
        AND allocation.purchase_request_id = p_demand_id
        AND allocation.purchase_request_item_id = demand_item.id
    ) AS planned ON TRUE
    WHERE demand_item.tenant_id = v_tenant
      AND demand_item.purchase_request_id = p_demand_id
      AND planned.quantity IS DISTINCT FROM
        greatest(demand_item.quantity - ordered.quantity, 0)$$,
    $$    LEFT JOIN LATERAL (
      SELECT coalesce(
        pg_catalog.sum(allocation.quantity),
        0
      ) AS quantity
      FROM public.purchase_request_allocations AS allocation
      WHERE allocation.tenant_id = v_tenant
        AND allocation.purchase_request_id = p_demand_id
        AND allocation.purchase_request_item_id = demand_item.id
    ) AS planned ON TRUE
    WHERE demand_item.tenant_id = v_tenant
      AND demand_item.purchase_request_id = p_demand_id
      AND planned.quantity IS DISTINCT FROM
        private.purchase_request_item_remaining_demand_qty(
          v_tenant,
          demand_item.id
        )$$
  );
  IF v_definition = v_before THEN
    RAISE EXCEPTION 'review_purchase_demand_remaining_base_not_found';
  END IF;
  EXECUTE v_definition;
END;
$review_purchase_demand_remaining_base$;

DO $repair_demand_coverage_status$
DECLARE
  v_demand record;
BEGIN
  FOR v_demand IN
    SELECT demand.id, demand.tenant_id
    FROM public.purchase_requests AS demand
    WHERE demand.status IN (
      'pending_allocation',
      'partially_ordered',
      'ordered'
    )
  LOOP
    PERFORM private.recompute_purchase_request_status(
      v_demand.id,
      v_demand.tenant_id
    );
  END LOOP;
END;
$repair_demand_coverage_status$;
