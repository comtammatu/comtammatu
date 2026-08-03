-- Warehouse demand is allocated by accounting before supplier POs exist.

ALTER TABLE public.purchase_requests
  DROP CONSTRAINT IF EXISTS purchase_requests_status_check,
  ADD CONSTRAINT purchase_requests_status_check CHECK (
    status IN (
      'draft',
      'submitted',
      'pending_allocation',
      'changes_requested',
      'partially_ordered',
      'ordered',
      'closed',
      'cancelled'
    )
  ),
  ADD COLUMN IF NOT EXISTS allocation_save_idempotency_key uuid;

CREATE TABLE public.purchase_request_allocations (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id bigint NOT NULL,
  purchase_request_id bigint NOT NULL,
  purchase_request_item_id bigint NOT NULL,
  supplier_id bigint NOT NULL,
  quantity numeric(15,3) NOT NULL CHECK (quantity > 0),
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  UNIQUE (
    tenant_id,
    purchase_request_id,
    purchase_request_item_id,
    supplier_id
  ),
  FOREIGN KEY (purchase_request_id, tenant_id)
    REFERENCES public.purchase_requests(id, tenant_id) ON DELETE CASCADE,
  FOREIGN KEY (purchase_request_item_id, tenant_id)
    REFERENCES public.purchase_request_items(id, tenant_id) ON DELETE CASCADE,
  FOREIGN KEY (supplier_id, tenant_id)
    REFERENCES public.suppliers(id, tenant_id) ON DELETE RESTRICT
);

CREATE INDEX purchase_request_allocations_request_idx
  ON public.purchase_request_allocations (
    tenant_id,
    purchase_request_id,
    purchase_request_item_id
  );

ALTER TABLE public.purchase_request_allocations ENABLE ROW LEVEL SECURITY;

CREATE POLICY purchase_request_allocations_select
ON public.purchase_request_allocations
FOR SELECT TO authenticated
USING (
  tenant_id = public.auth_tenant_id()
  AND EXISTS (
    SELECT 1
    FROM public.purchase_requests AS demand
    WHERE demand.id = purchase_request_allocations.purchase_request_id
      AND demand.tenant_id = purchase_request_allocations.tenant_id
      AND public.has_permission(
        demand.branch_id,
        'procurement:po_approve'
      )
  )
);

REVOKE ALL ON TABLE public.purchase_request_allocations
FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.purchase_request_allocations TO authenticated;
GRANT ALL ON TABLE public.purchase_request_allocations TO service_role;
GRANT USAGE, SELECT ON SEQUENCE
  public.purchase_request_allocations_id_seq
TO service_role;

GRANT SELECT (allocation_save_idempotency_key)
ON public.purchase_requests TO authenticated;

UPDATE public.permission_keys
SET description = 'Create, edit, submit, cancel, and close purchase demand'
WHERE key = 'procurement:request_manage';

UPDATE public.role_templates AS template
SET permission_keys = ARRAY(
  SELECT key
  FROM unnest(template.permission_keys) AS key
  WHERE key <> 'procurement:po_create'
  ORDER BY key
)
WHERE template.position_code IN (
  'central_supply_ops',
  'central_kitchen_lead'
);

DELETE FROM public.staff_permissions AS permission
USING public.profiles AS profile,
      public.positions AS position
WHERE permission.user_id = profile.id
  AND permission.tenant_id = profile.tenant_id
  AND position.id = profile.position_id
  AND position.tenant_id = profile.tenant_id
  AND position.code IN ('central_supply_ops', 'central_kitchen_lead')
  AND permission.permission_key = 'procurement:po_create';

CREATE OR REPLACE FUNCTION private.purchase_demand_allocation_result(
  p_tenant_id bigint,
  p_demand_id bigint
) RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path TO ''
AS $$
  SELECT pg_catalog.jsonb_build_object(
    'demand_id',
    p_demand_id,
    'allocations',
    coalesce(
      pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'request_item_id', allocation.purchase_request_item_id,
          'supplier_id', allocation.supplier_id,
          'quantity', allocation.quantity
        )
        ORDER BY
          allocation.purchase_request_item_id,
          allocation.supplier_id
      ) FILTER (WHERE allocation.id IS NOT NULL),
      '[]'::jsonb
    )
  )
  FROM public.purchase_request_allocations AS allocation
  WHERE allocation.tenant_id = p_tenant_id
    AND allocation.purchase_request_id = p_demand_id;
$$;

REVOKE ALL ON FUNCTION private.purchase_demand_allocation_result(
  bigint,
  bigint
) FROM PUBLIC, anon, authenticated, service_role;

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
  v_status text := CASE
    WHEN p_submit THEN 'pending_allocation'
    ELSE 'draft'
  END;
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
    IF v_demand.status NOT IN ('draft', 'changes_requested')
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
      submitted_by = CASE WHEN p_submit THEN v_uid ELSE NULL END,
      submitted_at = CASE
        WHEN p_submit THEN pg_catalog.now()
        ELSE NULL
      END,
      updated_at = pg_catalog.now()
  WHERE id = v_demand_id
    AND tenant_id = v_tenant;

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

  RETURN pg_catalog.jsonb_build_object(
    'demand_id', v_demand_id,
    'demand_number', v_saved ->> 'request_number',
    'status', v_status
  );
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
      SELECT pg_catalog.coalesce(
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
      SELECT pg_catalog.coalesce(
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
        pg_catalog.greatest(demand_item.quantity - ordered.quantity, 0)
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
      WHERE pg_catalog.coalesce(coverage.quantity, 0) >= demand_item.quantity
    )::integer,
    pg_catalog.bool_or(
      pg_catalog.coalesce(coverage.quantity, 0) > 0
    )
  INTO v_line_count, v_covered_count, v_any_covered
  FROM public.purchase_request_items AS demand_item
  LEFT JOIN LATERAL (
    SELECT pg_catalog.sum(po_item.quantity) AS quantity
    FROM public.purchase_order_items AS po_item
    JOIN public.purchase_orders AS purchase_order
      ON purchase_order.id = po_item.po_id
     AND purchase_order.tenant_id = po_item.tenant_id
    WHERE po_item.tenant_id = p_tenant_id
      AND po_item.purchase_request_item_id = demand_item.id
      AND purchase_order.status <> 'cancelled'
  ) AS coverage ON TRUE
  WHERE demand_item.purchase_request_id = p_request_id
    AND demand_item.tenant_id = p_tenant_id;

  v_status := CASE
    WHEN v_line_count > 0 AND v_covered_count = v_line_count
      THEN 'ordered'
    WHEN pg_catalog.coalesce(v_any_covered, FALSE)
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

CREATE OR REPLACE FUNCTION public.cancel_purchase_request(
  p_request_id bigint,
  p_reason text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_tenant bigint := public.auth_tenant_id();
  v_request public.purchase_requests%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  IF pg_catalog.length(
    pg_catalog.btrim(pg_catalog.coalesce(p_reason, ''))
  ) < 5 THEN
    RAISE EXCEPTION 'reason_required' USING ERRCODE = '22023';
  END IF;

  SELECT demand.*
  INTO v_request
  FROM public.purchase_requests AS demand
  WHERE demand.id = p_request_id
    AND demand.tenant_id = v_tenant
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'purchase_demand_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.has_permission(
    v_request.branch_id,
    'procurement:request_manage'
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF v_request.status NOT IN (
    'draft',
    'submitted',
    'pending_allocation',
    'changes_requested'
  )
  OR EXISTS (
    SELECT 1
    FROM public.purchase_orders AS purchase_order
    WHERE purchase_order.tenant_id = v_tenant
      AND purchase_order.purchase_request_id = p_request_id
      AND purchase_order.status <> 'cancelled'
  ) THEN
    RAISE EXCEPTION 'purchase_request_not_cancellable'
      USING ERRCODE = '23514';
  END IF;

  DELETE FROM public.purchase_request_allocations
  WHERE tenant_id = v_tenant
    AND purchase_request_id = p_request_id;

  UPDATE public.purchase_requests
  SET status = 'cancelled',
      status_reason = pg_catalog.btrim(p_reason),
      cancelled_at = pg_catalog.now(),
      updated_at = pg_catalog.now()
  WHERE id = p_request_id
    AND tenant_id = v_tenant;

  PERFORM public.log_audit(
    'procurement.demand.cancelled',
    'purchase_request',
    p_request_id,
    pg_catalog.to_jsonb(v_request),
    pg_catalog.jsonb_build_object(
      'status', 'cancelled',
      'reason', pg_catalog.btrim(p_reason)
    )
  );

  RETURN pg_catalog.jsonb_build_object(
    'request_id', p_request_id,
    'status', 'cancelled'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.close_purchase_request(
  p_request_id bigint,
  p_reason text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_tenant bigint := public.auth_tenant_id();
  v_request public.purchase_requests%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  IF pg_catalog.length(
    pg_catalog.btrim(pg_catalog.coalesce(p_reason, ''))
  ) < 5 THEN
    RAISE EXCEPTION 'reason_required' USING ERRCODE = '22023';
  END IF;

  SELECT demand.*
  INTO v_request
  FROM public.purchase_requests AS demand
  WHERE demand.id = p_request_id
    AND demand.tenant_id = v_tenant
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'purchase_demand_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.has_permission(
    v_request.branch_id,
    'procurement:po_approve'
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF v_request.status <> 'partially_ordered' THEN
    RAISE EXCEPTION 'purchase_request_not_closable'
      USING ERRCODE = '23514';
  END IF;

  DELETE FROM public.purchase_request_allocations
  WHERE tenant_id = v_tenant
    AND purchase_request_id = p_request_id;

  UPDATE public.purchase_requests
  SET status = 'closed',
      status_reason = pg_catalog.btrim(p_reason),
      closed_at = pg_catalog.now(),
      updated_at = pg_catalog.now()
  WHERE id = p_request_id
    AND tenant_id = v_tenant;

  PERFORM public.log_audit(
    'procurement.demand.closed',
    'purchase_request',
    p_request_id,
    pg_catalog.to_jsonb(v_request),
    pg_catalog.jsonb_build_object(
      'status', 'closed',
      'reason', pg_catalog.btrim(p_reason)
    )
  );

  RETURN pg_catalog.jsonb_build_object(
    'request_id', p_request_id,
    'status', 'closed'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.review_purchase_demand(
  p_demand_id bigint,
  p_action text,
  p_allocations jsonb DEFAULT NULL,
  p_reason text DEFAULT NULL,
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
  v_action text :=
    pg_catalog.lower(pg_catalog.btrim(pg_catalog.coalesce(p_action, '')));
  v_reason text :=
    pg_catalog.nullif(pg_catalog.btrim(pg_catalog.coalesce(p_reason, '')), '');
  v_group_key uuid;
  v_group_code text;
  v_max_sequence integer := 0;
  v_sequence integer;
  v_supplier record;
  v_po_id bigint;
  v_status text;
  v_result jsonb;
BEGIN
  IF v_uid IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  IF v_action NOT IN ('approve', 'request_changes', 'reject') THEN
    RAISE EXCEPTION 'purchase_demand_review_action_invalid'
      USING ERRCODE = '22023';
  END IF;
  IF v_action IN ('request_changes', 'reject')
     AND pg_catalog.length(pg_catalog.coalesce(v_reason, '')) < 5 THEN
    RAISE EXCEPTION 'reason_required' USING ERRCODE = '22023';
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

  IF v_action = 'approve' AND p_idempotency_key IS NULL THEN
    RAISE EXCEPTION 'purchase_demand_idempotency_required'
      USING ERRCODE = '22023';
  END IF;

  IF v_action = 'approve' THEN
    SELECT purchase_order.purchase_group_key
    INTO v_group_key
    FROM public.purchase_orders AS purchase_order
    WHERE purchase_order.tenant_id = v_tenant
      AND purchase_order.purchase_request_id = p_demand_id
      AND purchase_order.group_save_idempotency_key = p_idempotency_key
    ORDER BY purchase_order.group_sequence
    LIMIT 1;

    IF FOUND THEN
      SELECT pg_catalog.jsonb_build_object(
        'demand_id', p_demand_id,
        'status', v_demand.status,
        'purchase_group_key', v_group_key,
        'purchase_group_code',
          pg_catalog.min(purchase_order.purchase_group_code),
        'purchase_orders',
          pg_catalog.jsonb_agg(
            pg_catalog.jsonb_build_object(
              'po_id', purchase_order.id,
              'po_number',
                pg_catalog.coalesce(
                  purchase_order.display_id,
                  purchase_order.po_number
                ),
              'supplier_id', purchase_order.supplier_id,
              'status', purchase_order.status
            )
            ORDER BY purchase_order.group_sequence
          )
      )
      INTO v_result
      FROM public.purchase_orders AS purchase_order
      WHERE purchase_order.tenant_id = v_tenant
        AND purchase_order.purchase_request_id = p_demand_id
        AND purchase_order.group_save_idempotency_key = p_idempotency_key;
      RETURN v_result;
    END IF;
  END IF;

  IF v_action IN ('request_changes', 'reject') THEN
    IF v_demand.status NOT IN ('submitted', 'pending_allocation')
       OR EXISTS (
         SELECT 1
         FROM public.purchase_orders AS purchase_order
         WHERE purchase_order.tenant_id = v_tenant
           AND purchase_order.purchase_request_id = p_demand_id
           AND purchase_order.status <> 'cancelled'
       ) THEN
      RAISE EXCEPTION 'purchase_demand_not_reviewable'
        USING ERRCODE = '23514';
    END IF;

    v_status := CASE
      WHEN v_action = 'request_changes' THEN 'changes_requested'
      ELSE 'cancelled'
    END;
    UPDATE public.purchase_requests
    SET status = v_status,
        status_reason = v_reason,
        cancelled_at = CASE
          WHEN v_action = 'reject' THEN pg_catalog.now()
          ELSE cancelled_at
        END,
        updated_at = pg_catalog.now()
    WHERE id = p_demand_id
      AND tenant_id = v_tenant;

    PERFORM public.log_audit(
      'procurement.demand.' || v_action,
      'purchase_request',
      p_demand_id,
      pg_catalog.to_jsonb(v_demand),
      pg_catalog.jsonb_build_object(
        'status', v_status,
        'reason', v_reason
      )
    );

    RETURN pg_catalog.jsonb_build_object(
      'demand_id', p_demand_id,
      'status', v_status
    );
  END IF;

  IF v_demand.status NOT IN (
    'submitted',
    'pending_allocation',
    'partially_ordered'
  ) THEN
    RAISE EXCEPTION 'purchase_demand_not_reviewable'
      USING ERRCODE = '23514';
  END IF;

  IF p_allocations IS NOT NULL THEN
    PERFORM public.save_purchase_demand_allocations(
      p_demand_id,
      p_allocations,
      p_idempotency_key
    );
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.purchase_request_items AS demand_item
    LEFT JOIN LATERAL (
      SELECT pg_catalog.coalesce(
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
      SELECT pg_catalog.coalesce(
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
        pg_catalog.greatest(demand_item.quantity - ordered.quantity, 0)
  ) THEN
    RAISE EXCEPTION 'purchase_demand_allocation_incomplete'
      USING ERRCODE = '23514';
  END IF;

  PERFORM 1
  FROM public.purchase_orders AS purchase_order
  WHERE purchase_order.tenant_id = v_tenant
    AND purchase_order.purchase_request_id = p_demand_id
  FOR UPDATE;

  SELECT
    purchase_order.purchase_group_key,
    purchase_order.purchase_group_code,
    pg_catalog.coalesce(
      pg_catalog.max(purchase_order.group_sequence),
      0
    )
  INTO v_group_key, v_group_code, v_max_sequence
  FROM public.purchase_orders AS purchase_order
  WHERE purchase_order.tenant_id = v_tenant
    AND purchase_order.purchase_request_id = p_demand_id
    AND purchase_order.purchase_group_key IS NOT NULL
  GROUP BY
    purchase_order.purchase_group_key,
    purchase_order.purchase_group_code
  ORDER BY pg_catalog.max(purchase_order.group_sequence) DESC
  LIMIT 1;

  IF v_group_key IS NULL THEN
    v_group_key := pg_catalog.gen_random_uuid();
    v_group_code := public.next_po_display_id(v_tenant);
    v_max_sequence := 0;
  END IF;

  FOR v_supplier IN
    SELECT
      allocation.supplier_id,
      pg_catalog.row_number() OVER (
        ORDER BY allocation.supplier_id
      )::integer AS ordinal
    FROM public.purchase_request_allocations AS allocation
    WHERE allocation.tenant_id = v_tenant
      AND allocation.purchase_request_id = p_demand_id
    GROUP BY allocation.supplier_id
    ORDER BY allocation.supplier_id
  LOOP
    v_sequence := v_max_sequence + v_supplier.ordinal;
    IF v_sequence > 99 THEN
      RAISE EXCEPTION 'purchase_order_group_supplier_limit'
        USING ERRCODE = '54000';
    END IF;

    INSERT INTO public.purchase_orders (
      tenant_id,
      branch_id,
      supplier_id,
      purchase_request_id,
      po_number,
      display_id,
      status,
      ordered_at,
      expected_delivery_date,
      notes,
      created_by,
      purchase_group_key,
      purchase_group_code,
      group_sequence,
      group_save_idempotency_key,
      submitted_at,
      submitted_by
    )
    VALUES (
      v_tenant,
      v_demand.branch_id,
      v_supplier.supplier_id,
      p_demand_id,
      v_group_code || '-' ||
        pg_catalog.lpad(v_sequence::text, 2, '0'),
      v_group_code || '-' ||
        pg_catalog.lpad(v_sequence::text, 2, '0'),
      'pending_approval',
      pg_catalog.now(),
      v_demand.needed_by,
      v_demand.notes,
      v_uid,
      v_group_key,
      v_group_code,
      v_sequence,
      p_idempotency_key,
      pg_catalog.now(),
      v_uid
    )
    RETURNING id INTO v_po_id;

    INSERT INTO public.purchase_order_items (
      tenant_id,
      po_id,
      purchase_request_item_id,
      ingredient_id,
      quantity,
      entry_unit_id,
      unit_price_est,
      line_total
    )
    SELECT
      v_tenant,
      v_po_id,
      demand_item.id,
      demand_item.ingredient_id,
      allocation.quantity,
      demand_item.entry_unit_id,
      NULL,
      NULL
    FROM public.purchase_request_allocations AS allocation
    JOIN public.purchase_request_items AS demand_item
      ON demand_item.id = allocation.purchase_request_item_id
     AND demand_item.tenant_id = allocation.tenant_id
     AND demand_item.purchase_request_id = allocation.purchase_request_id
    WHERE allocation.tenant_id = v_tenant
      AND allocation.purchase_request_id = p_demand_id
      AND allocation.supplier_id = v_supplier.supplier_id
    ORDER BY demand_item.id;

    UPDATE public.purchase_orders
    SET status = 'approved',
        reviewed_at = pg_catalog.now(),
        reviewed_by = v_uid,
        updated_at = pg_catalog.now()
    WHERE id = v_po_id
      AND tenant_id = v_tenant;
  END LOOP;

  v_status := private.recompute_purchase_request_status(
    p_demand_id,
    v_tenant
  );

  SELECT pg_catalog.jsonb_build_object(
    'demand_id', p_demand_id,
    'status', v_status,
    'purchase_group_key', v_group_key,
    'purchase_group_code', v_group_code,
    'purchase_orders',
      pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'po_id', purchase_order.id,
          'po_number',
            pg_catalog.coalesce(
              purchase_order.display_id,
              purchase_order.po_number
            ),
          'supplier_id', purchase_order.supplier_id,
          'status', purchase_order.status
        )
        ORDER BY purchase_order.group_sequence
      )
  )
  INTO v_result
  FROM public.purchase_orders AS purchase_order
  WHERE purchase_order.tenant_id = v_tenant
    AND purchase_order.purchase_request_id = p_demand_id
    AND purchase_order.group_save_idempotency_key = p_idempotency_key;

  PERFORM public.log_audit(
    'procurement.demand.approved',
    'purchase_request',
    p_demand_id,
    pg_catalog.to_jsonb(v_demand),
    v_result
  );

  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_purchase_order(
  p_po_id bigint,
  p_reason text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_tenant bigint := public.auth_tenant_id();
  v_po public.purchase_orders%ROWTYPE;
  v_cancelled_grns integer;
  v_permission text;
  v_demand_status text;
BEGIN
  IF auth.uid() IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  IF pg_catalog.length(
    pg_catalog.btrim(pg_catalog.coalesce(p_reason, ''))
  ) < 5 THEN
    RAISE EXCEPTION 'reason_required' USING ERRCODE = '22023';
  END IF;

  SELECT purchase_order.*
  INTO v_po
  FROM public.purchase_orders AS purchase_order
  WHERE purchase_order.id = p_po_id
    AND purchase_order.tenant_id = v_tenant
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'purchase_order_not_found' USING ERRCODE = 'P0002';
  END IF;

  v_permission := CASE
    WHEN v_po.status IN ('draft', 'changes_requested')
      THEN 'procurement:po_create'
    ELSE 'procurement:po_approve'
  END;
  IF NOT public.has_permission(v_po.branch_id, v_permission) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF v_po.status NOT IN (
    'draft',
    'changes_requested',
    'pending_approval',
    'sent',
    'approved'
  )
  OR EXISTS (
    SELECT 1
    FROM public.goods_received_notes AS grn
    WHERE grn.tenant_id = v_tenant
      AND grn.po_id = p_po_id
      AND grn.status = 'confirmed'
  ) THEN
    RAISE EXCEPTION 'purchase_order_not_cancellable'
      USING ERRCODE = '23514';
  END IF;

  UPDATE public.goods_received_notes
  SET status = 'cancelled',
      notes = pg_catalog.concat_ws(
        E'\n',
        pg_catalog.nullif(notes, ''),
        'Hủy cùng PO: ' || pg_catalog.btrim(p_reason)
      ),
      updated_at = pg_catalog.now()
  WHERE tenant_id = v_tenant
    AND po_id = p_po_id
    AND status = 'draft';
  GET DIAGNOSTICS v_cancelled_grns = ROW_COUNT;

  UPDATE public.purchase_orders
  SET status = 'cancelled',
      status_reason = pg_catalog.btrim(p_reason),
      cancelled_at = pg_catalog.now(),
      updated_at = pg_catalog.now()
  WHERE id = p_po_id
    AND tenant_id = v_tenant;

  IF v_po.purchase_request_id IS NOT NULL THEN
    DELETE FROM public.purchase_request_allocations
    WHERE tenant_id = v_tenant
      AND purchase_request_id = v_po.purchase_request_id;

    v_demand_status := private.recompute_purchase_request_status(
      v_po.purchase_request_id,
      v_tenant
    );
  END IF;

  PERFORM public.log_audit(
    'procurement.po.cancelled',
    'purchase_order',
    p_po_id,
    pg_catalog.to_jsonb(v_po),
    pg_catalog.jsonb_build_object(
      'status', 'cancelled',
      'reason', pg_catalog.btrim(p_reason),
      'cancelled_draft_grns', v_cancelled_grns,
      'demand_id', v_po.purchase_request_id,
      'demand_status', v_demand_status
    )
  );

  RETURN pg_catalog.jsonb_build_object(
    'id', p_po_id,
    'status', 'cancelled',
    'cancelled_draft_grns', v_cancelled_grns,
    'demand_id', v_po.purchase_request_id,
    'demand_status', v_demand_status
  );
END;
$$;

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

REVOKE ALL ON FUNCTION public.save_purchase_demand_allocations(
  bigint,
  jsonb,
  uuid
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_purchase_demand_allocations(
  bigint,
  jsonb,
  uuid
) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.review_purchase_demand(
  bigint,
  text,
  jsonb,
  text,
  uuid
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_purchase_demand(
  bigint,
  text,
  jsonb,
  text,
  uuid
) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.cancel_purchase_request(bigint, text)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_purchase_request(bigint, text)
TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.close_purchase_request(bigint, text)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.close_purchase_request(bigint, text)
TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.cancel_purchase_order(bigint, text)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_purchase_order(bigint, text)
TO authenticated, service_role;

COMMENT ON TABLE public.purchase_request_allocations IS
  'Current accountant supplier allocation for uncovered purchase demand.';
COMMENT ON FUNCTION public.save_purchase_demand(
  bigint,
  bigint,
  date,
  text,
  jsonb,
  boolean,
  uuid
) IS
  'Atomically saves warehouse demand without assigning a supplier or price.';
COMMENT ON FUNCTION public.review_purchase_demand(
  bigint,
  text,
  jsonb,
  text,
  uuid
) IS
  'Reviews demand and atomically creates approved supplier POs and GRN drafts.';
