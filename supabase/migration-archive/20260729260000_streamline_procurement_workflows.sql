-- Streamline YCM -> PO -> GRN and YCH -> Transfer without a generic workflow engine.
-- This migration is additive so the previous application version can keep running.

-- ---------------------------------------------------------------------------
-- Statuses, audit reasons, and idempotency keys
-- ---------------------------------------------------------------------------

ALTER TABLE public.purchase_requests
  DROP CONSTRAINT IF EXISTS purchase_requests_status_check,
  ADD CONSTRAINT purchase_requests_status_check CHECK (
    status IN (
      'draft',
      'submitted',
      'partially_ordered',
      'ordered',
      'closed',
      'cancelled'
    )
  ),
  ADD COLUMN IF NOT EXISTS status_reason text,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS closed_at timestamptz,
  ADD COLUMN IF NOT EXISTS creation_idempotency_key uuid;

CREATE UNIQUE INDEX IF NOT EXISTS purchase_requests_creation_key_uidx
  ON public.purchase_requests (tenant_id, creation_idempotency_key)
  WHERE creation_idempotency_key IS NOT NULL;

ALTER TABLE public.purchase_orders
  DROP CONSTRAINT IF EXISTS purchase_orders_status_check,
  ADD CONSTRAINT purchase_orders_status_check CHECK (
    status IN (
      'draft',
      'sent',
      'partially_received',
      'received',
      'closed',
      'cancelled'
    )
  ),
  ADD COLUMN IF NOT EXISTS status_reason text,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS closed_at timestamptz,
  ADD COLUMN IF NOT EXISTS save_idempotency_key uuid;

CREATE UNIQUE INDEX IF NOT EXISTS purchase_orders_save_key_uidx
  ON public.purchase_orders (
    tenant_id,
    purchase_request_id,
    supplier_id,
    save_idempotency_key
  )
  WHERE save_idempotency_key IS NOT NULL;

ALTER TABLE public.stock_requests
  DROP CONSTRAINT IF EXISTS stock_requests_status_check,
  ADD CONSTRAINT stock_requests_status_check CHECK (
    status IN (
      'draft',
      'submitted',
      'partially_fulfilled',
      'fulfilled',
      'closed',
      'cancelled'
    )
  ),
  ADD COLUMN IF NOT EXISTS status_reason text,
  ADD COLUMN IF NOT EXISTS closed_at timestamptz,
  ADD COLUMN IF NOT EXISTS creation_idempotency_key uuid;

CREATE UNIQUE INDEX IF NOT EXISTS stock_requests_creation_key_uidx
  ON public.stock_requests (tenant_id, creation_idempotency_key)
  WHERE creation_idempotency_key IS NOT NULL;

ALTER TABLE public.stock_transfers
  ADD COLUMN IF NOT EXISTS status_reason text,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;

GRANT SELECT (
  status_reason,
  cancelled_at,
  closed_at,
  creation_idempotency_key
) ON public.purchase_requests TO authenticated;

GRANT SELECT (
  status_reason,
  cancelled_at,
  closed_at,
  save_idempotency_key
) ON public.purchase_orders TO authenticated;

GRANT SELECT (
  status_reason,
  closed_at,
  creation_idempotency_key
) ON public.stock_requests TO authenticated;

GRANT SELECT (
  status_reason,
  cancelled_at
) ON public.stock_transfers TO authenticated;

-- ---------------------------------------------------------------------------
-- Procurement-request permission
-- ---------------------------------------------------------------------------

INSERT INTO public.permission_keys (
  key,
  module,
  description,
  scope,
  is_delegable_to_staff
)
VALUES (
  'procurement:request_manage',
  'inventory_procurement',
  'Create, edit, submit, cancel, and close purchase requests',
  'branch',
  TRUE
)
ON CONFLICT (key) DO UPDATE
SET module = EXCLUDED.module,
    description = EXCLUDED.description,
    scope = EXCLUDED.scope,
    is_delegable_to_staff = EXCLUDED.is_delegable_to_staff;

UPDATE public.permission_keys
SET is_delegable_to_staff = true
WHERE key = 'procurement:request_manage';

UPDATE public.permission_keys
SET is_delegable_to_staff = true
WHERE key = ANY (ARRAY[
  'inventory:request_create',
  'inventory:request_submit',
  'inventory:request_cancel',
  'inventory:request_fulfill',
  'inventory:transfer_ship'
]::text[]);

UPDATE public.role_templates AS template
SET permission_keys = (
  SELECT coalesce(array_agg(DISTINCT key ORDER BY key), ARRAY[]::text[])
  FROM unnest(
    template.permission_keys || ARRAY['procurement:request_manage']::text[]
  ) AS key
)
WHERE template.position_code IN (
  'owner',
  'central_supply_ops',
  'central_kitchen_lead'
);

INSERT INTO public.staff_permissions (
  user_id,
  tenant_id,
  branch_id,
  permission_key,
  source_template,
  granted_by
)
SELECT
  profile.id,
  profile.tenant_id,
  profile.branch_id,
  'procurement:request_manage',
  template.id,
  NULL
FROM public.profiles AS profile
JOIN public.positions AS position
  ON position.id = profile.position_id
 AND position.tenant_id = profile.tenant_id
JOIN public.role_templates AS template
  ON template.tenant_id = profile.tenant_id
 AND template.position_code = position.code
WHERE position.code IN ('central_supply_ops', 'central_kitchen_lead')
  AND COALESCE(profile.is_active, TRUE)
  AND profile.branch_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.staff_permissions AS existing
    WHERE existing.user_id = profile.id
      AND existing.tenant_id = profile.tenant_id
      AND existing.permission_key = 'procurement:request_manage'
      AND existing.branch_id IS NOT DISTINCT FROM profile.branch_id
  );

-- ---------------------------------------------------------------------------
-- Shared purchase-request status derivation
-- ---------------------------------------------------------------------------

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
  SELECT request.status
  INTO v_current
  FROM public.purchase_requests AS request
  WHERE request.id = p_request_id
    AND request.tenant_id = p_tenant_id
  FOR UPDATE;

  IF NOT FOUND OR v_current IN ('closed', 'cancelled') THEN
    RETURN v_current;
  END IF;

  SELECT
    count(*)::integer,
    count(*) FILTER (
      WHERE COALESCE(coverage.quantity, 0) >= request_item.quantity
    )::integer,
    bool_or(COALESCE(coverage.quantity, 0) > 0)
  INTO v_line_count, v_covered_count, v_any_covered
  FROM public.purchase_request_items AS request_item
  LEFT JOIN LATERAL (
    SELECT sum(po_item.quantity) AS quantity
    FROM public.purchase_order_items AS po_item
    JOIN public.purchase_orders AS purchase_order
      ON purchase_order.id = po_item.po_id
     AND purchase_order.tenant_id = po_item.tenant_id
    WHERE po_item.tenant_id = p_tenant_id
      AND po_item.purchase_request_item_id = request_item.id
      AND purchase_order.status <> 'cancelled'
  ) AS coverage ON TRUE
  WHERE request_item.purchase_request_id = p_request_id
    AND request_item.tenant_id = p_tenant_id;

  v_status := CASE
    WHEN v_line_count > 0 AND v_covered_count = v_line_count THEN 'ordered'
    WHEN COALESCE(v_any_covered, FALSE) THEN 'partially_ordered'
    ELSE 'submitted'
  END;

  UPDATE public.purchase_requests
  SET status = v_status,
      updated_at = now()
  WHERE id = p_request_id
    AND tenant_id = p_tenant_id;

  RETURN v_status;
END;
$$;

-- ---------------------------------------------------------------------------
-- YCM: one atomic save, optional direct submit
-- ---------------------------------------------------------------------------

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
BEGIN
  IF v_uid IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  IF p_branch_id IS NULL
     OR p_lines IS NULL
     OR jsonb_typeof(p_lines) <> 'array'
     OR jsonb_array_length(p_lines) = 0
     OR jsonb_array_length(p_lines) > 200 THEN
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
    SELECT count(*) <> count(DISTINCT line.ingredient_id)
    FROM jsonb_to_recordset(p_lines)
      AS line(ingredient_id bigint)
  )
  OR EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(p_lines)
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
      RETURN jsonb_build_object(
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
      NULLIF(btrim(p_notes), ''),
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
    v_old := to_jsonb(v_request);
    IF v_request.branch_id <> p_branch_id
       OR v_request.status NOT IN ('draft', 'submitted')
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
        notes = NULLIF(btrim(p_notes), ''),
        updated_at = now()
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
    NULLIF(btrim(line.notes), '')
  FROM jsonb_to_recordset(p_lines)
    AS line(
      ingredient_id bigint,
      quantity numeric,
      entry_unit_id bigint,
      notes text
    );

  v_status := CASE WHEN p_submit THEN 'submitted' ELSE 'draft' END;
  UPDATE public.purchase_requests
  SET status = v_status,
      submitted_by = CASE WHEN p_submit THEN v_uid ELSE NULL END,
      submitted_at = CASE WHEN p_submit THEN now() ELSE NULL END,
      updated_at = now()
  WHERE id = v_request_id
    AND tenant_id = v_tenant;

  PERFORM public.log_audit(
    CASE
      WHEN p_request_id IS NULL AND p_submit THEN 'procurement.request.created_submitted'
      WHEN p_request_id IS NULL THEN 'procurement.request.created_draft'
      WHEN p_submit THEN 'procurement.request.saved_submitted'
      ELSE 'procurement.request.saved_draft'
    END,
    'purchase_request',
    v_request_id,
    v_old,
    jsonb_build_object(
      'status', v_status,
      'branch_id', p_branch_id,
      'line_count', jsonb_array_length(p_lines)
    )
  );

  RETURN jsonb_build_object(
    'request_id', v_request_id,
    'request_number', v_number,
    'status', v_status
  );
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
  IF length(btrim(COALESCE(p_reason, ''))) < 5 THEN
    RAISE EXCEPTION 'reason_required' USING ERRCODE = '22023';
  END IF;

  SELECT request.*
  INTO v_request
  FROM public.purchase_requests AS request
  WHERE request.id = p_request_id
    AND request.tenant_id = v_tenant
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'purchase_request_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.has_permission(
    v_request.branch_id,
    'procurement:request_manage'
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF v_request.status NOT IN ('draft', 'submitted')
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

  UPDATE public.purchase_requests
  SET status = 'cancelled',
      status_reason = btrim(p_reason),
      cancelled_at = now(),
      updated_at = now()
  WHERE id = p_request_id
    AND tenant_id = v_tenant;

  PERFORM public.log_audit(
    'procurement.request.cancelled',
    'purchase_request',
    p_request_id,
    to_jsonb(v_request),
    jsonb_build_object('status', 'cancelled', 'reason', btrim(p_reason))
  );

  RETURN jsonb_build_object(
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
  IF length(btrim(COALESCE(p_reason, ''))) < 5 THEN
    RAISE EXCEPTION 'reason_required' USING ERRCODE = '22023';
  END IF;

  SELECT request.*
  INTO v_request
  FROM public.purchase_requests AS request
  WHERE request.id = p_request_id
    AND request.tenant_id = v_tenant
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'purchase_request_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.has_permission(
    v_request.branch_id,
    'procurement:request_manage'
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF v_request.status <> 'partially_ordered' THEN
    RAISE EXCEPTION 'purchase_request_not_closable'
      USING ERRCODE = '23514';
  END IF;

  UPDATE public.purchase_requests
  SET status = 'closed',
      status_reason = btrim(p_reason),
      closed_at = now(),
      updated_at = now()
  WHERE id = p_request_id
    AND tenant_id = v_tenant;

  PERFORM public.log_audit(
    'procurement.request.closed',
    'purchase_request',
    p_request_id,
    to_jsonb(v_request),
    jsonb_build_object('status', 'closed', 'reason', btrim(p_reason))
  );

  RETURN jsonb_build_object(
    'request_id', p_request_id,
    'status', 'closed'
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- PO: create/save and send in one transaction
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.send_purchase_order(
  p_po_id bigint
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_tenant bigint := public.auth_tenant_id();
  v_po public.purchase_orders%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
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
  IF NOT public.has_permission(v_po.branch_id, 'procurement:po_create') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF v_po.status = 'sent' THEN
    RETURN jsonb_build_object('id', p_po_id, 'status', 'sent');
  END IF;
  IF v_po.status <> 'draft'
     OR v_po.purchase_request_id IS NULL
     OR NOT EXISTS (
       SELECT 1
       FROM public.purchase_order_items AS item
       WHERE item.po_id = p_po_id
         AND item.tenant_id = v_tenant
     )
     OR EXISTS (
       SELECT 1
       FROM public.purchase_order_items AS item
       WHERE item.po_id = p_po_id
         AND item.tenant_id = v_tenant
         AND (
           item.quantity <= 0
           OR item.unit_price_est IS NULL
           OR item.unit_price_est < 0
         )
     ) THEN
    RAISE EXCEPTION 'purchase_order_not_sendable'
      USING ERRCODE = '23514';
  END IF;

  UPDATE public.purchase_order_items
  SET line_total = round(quantity * unit_price_est, 2)
  WHERE po_id = p_po_id
    AND tenant_id = v_tenant;

  UPDATE public.purchase_orders
  SET status = 'sent',
      ordered_at = now(),
      updated_at = now()
  WHERE id = p_po_id
    AND tenant_id = v_tenant;

  PERFORM public.log_audit(
    'procurement.po.sent',
    'purchase_order',
    p_po_id,
    to_jsonb(v_po),
    jsonb_build_object('status', 'sent')
  );

  RETURN jsonb_build_object('id', p_po_id, 'status', 'sent');
END;
$$;

CREATE OR REPLACE FUNCTION public.save_purchase_orders_from_request(
  p_request_id bigint,
  p_orders jsonb,
  p_send boolean DEFAULT TRUE,
  p_idempotency_key uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_tenant bigint := public.auth_tenant_id();
  v_result jsonb;
  v_po jsonb;
  v_po_id bigint;
  v_results jsonb := '[]'::jsonb;
BEGIN
  IF auth.uid() IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  IF p_orders IS NULL
     OR jsonb_typeof(p_orders) <> 'array'
     OR jsonb_array_length(p_orders) = 0
     OR jsonb_array_length(p_orders) > 100 THEN
    RAISE EXCEPTION 'purchase_orders_invalid' USING ERRCODE = '22023';
  END IF;

  IF p_idempotency_key IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM public.purchase_orders AS purchase_order
       WHERE purchase_order.tenant_id = v_tenant
         AND purchase_order.purchase_request_id = p_request_id
         AND purchase_order.save_idempotency_key = p_idempotency_key
     ) THEN
    SELECT jsonb_build_object(
      'purchase_orders',
      jsonb_agg(
        jsonb_build_object(
          'po_id', purchase_order.id,
          'po_number', purchase_order.po_number,
          'status', purchase_order.status
        )
        ORDER BY purchase_order.id
      )
    )
    INTO v_result
    FROM public.purchase_orders AS purchase_order
    WHERE purchase_order.tenant_id = v_tenant
      AND purchase_order.purchase_request_id = p_request_id
      AND purchase_order.save_idempotency_key = p_idempotency_key;
    RETURN v_result;
  END IF;

  v_result := public.create_purchase_orders_from_request(
    p_request_id,
    p_orders
  );

  FOR v_po IN
    SELECT value
    FROM jsonb_array_elements(v_result -> 'purchase_orders')
  LOOP
    v_po_id := (v_po ->> 'po_id')::bigint;
    UPDATE public.purchase_orders
    SET save_idempotency_key = p_idempotency_key
    WHERE id = v_po_id
      AND tenant_id = v_tenant;

    IF p_send THEN
      v_po := v_po || public.send_purchase_order(v_po_id);
    END IF;
    v_results := v_results || jsonb_build_array(v_po);
  END LOOP;

  RETURN jsonb_build_object('purchase_orders', v_results);
END;
$$;

CREATE OR REPLACE FUNCTION public.save_purchase_order(
  p_po_id bigint,
  p_expected_delivery_date date,
  p_notes text,
  p_lines jsonb,
  p_send boolean DEFAULT FALSE
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_tenant bigint := public.auth_tenant_id();
  v_po public.purchase_orders%ROWTYPE;
  v_line_count integer;
  v_expected_count integer;
  v_status text;
BEGIN
  IF auth.uid() IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
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
  IF NOT public.has_permission(v_po.branch_id, 'procurement:po_create') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF v_po.status NOT IN ('draft', 'sent')
     OR EXISTS (
       SELECT 1
       FROM public.goods_received_notes AS grn
       WHERE grn.tenant_id = v_tenant
         AND grn.po_id = p_po_id
         AND grn.status = 'confirmed'
     ) THEN
    RAISE EXCEPTION 'purchase_order_not_editable'
      USING ERRCODE = '23514';
  END IF;

  UPDATE public.purchase_orders
  SET expected_delivery_date = p_expected_delivery_date,
      notes = NULLIF(btrim(p_notes), ''),
      updated_at = now()
  WHERE id = p_po_id
    AND tenant_id = v_tenant;

  IF p_lines IS NOT NULL THEN
    IF jsonb_typeof(p_lines) <> 'array'
       OR EXISTS (
         SELECT 1
         FROM public.goods_received_notes AS grn
         WHERE grn.tenant_id = v_tenant
           AND grn.po_id = p_po_id
           AND grn.status = 'draft'
       ) THEN
      RAISE EXCEPTION 'purchase_order_lines_locked'
        USING ERRCODE = '23514';
    END IF;

    SELECT count(*), count(DISTINCT line.line_id)
    INTO v_line_count, v_expected_count
    FROM jsonb_to_recordset(p_lines)
      AS line(line_id bigint);

    IF v_line_count <> v_expected_count
       OR v_line_count <> (
         SELECT count(*)
         FROM public.purchase_order_items AS item
         WHERE item.po_id = p_po_id
           AND item.tenant_id = v_tenant
       )
       OR EXISTS (
         SELECT 1
         FROM jsonb_to_recordset(p_lines)
           AS line(line_id bigint, quantity numeric, unit_price numeric)
         LEFT JOIN public.purchase_order_items AS item
           ON item.id = line.line_id
          AND item.po_id = p_po_id
          AND item.tenant_id = v_tenant
         WHERE item.id IS NULL
            OR line.quantity IS NULL
            OR line.quantity <= 0
            OR line.unit_price IS NULL
            OR line.unit_price < 0
       ) THEN
      RAISE EXCEPTION 'purchase_order_lines_invalid'
        USING ERRCODE = '22023';
    END IF;

    UPDATE public.purchase_order_items AS item
    SET quantity = line.quantity::numeric(15,3),
        unit_price_est = line.unit_price::numeric(15,2),
        line_total = round(line.quantity * line.unit_price, 2)
    FROM jsonb_to_recordset(p_lines)
      AS line(line_id bigint, quantity numeric, unit_price numeric)
    WHERE item.id = line.line_id
      AND item.po_id = p_po_id
      AND item.tenant_id = v_tenant;

    IF v_po.purchase_request_id IS NOT NULL THEN
      PERFORM private.recompute_purchase_request_status(
        v_po.purchase_request_id,
        v_tenant
      );
    END IF;
  END IF;

  IF p_send AND v_po.status = 'draft' THEN
    v_status := public.send_purchase_order(p_po_id) ->> 'status';
  ELSE
    v_status := v_po.status;
  END IF;

  PERFORM public.log_audit(
    'procurement.po.saved',
    'purchase_order',
    p_po_id,
    to_jsonb(v_po),
    jsonb_build_object(
      'status', v_status,
      'expected_delivery_date', p_expected_delivery_date,
      'line_count', CASE
        WHEN p_lines IS NULL THEN NULL
        ELSE jsonb_array_length(p_lines)
      END
    )
  );

  RETURN jsonb_build_object('id', p_po_id, 'status', v_status);
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
BEGIN
  IF auth.uid() IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  IF length(btrim(COALESCE(p_reason, ''))) < 5 THEN
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
  IF NOT public.has_permission(v_po.branch_id, 'procurement:po_create') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF v_po.status NOT IN ('draft', 'sent')
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
      notes = concat_ws(
        E'\n',
        NULLIF(notes, ''),
        'Hủy cùng PO: ' || btrim(p_reason)
      ),
      updated_at = now()
  WHERE tenant_id = v_tenant
    AND po_id = p_po_id
    AND status = 'draft';
  GET DIAGNOSTICS v_cancelled_grns = ROW_COUNT;

  UPDATE public.purchase_orders
  SET status = 'cancelled',
      status_reason = btrim(p_reason),
      cancelled_at = now(),
      updated_at = now()
  WHERE id = p_po_id
    AND tenant_id = v_tenant;

  IF v_po.purchase_request_id IS NOT NULL THEN
    PERFORM private.recompute_purchase_request_status(
      v_po.purchase_request_id,
      v_tenant
    );
  END IF;

  PERFORM public.log_audit(
    'procurement.po.cancelled',
    'purchase_order',
    p_po_id,
    to_jsonb(v_po),
    jsonb_build_object(
      'status', 'cancelled',
      'reason', btrim(p_reason),
      'cancelled_draft_grns', v_cancelled_grns
    )
  );

  RETURN jsonb_build_object(
    'id', p_po_id,
    'status', 'cancelled',
    'cancelled_draft_grns', v_cancelled_grns
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.close_purchase_order(
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
BEGIN
  IF auth.uid() IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  IF length(btrim(COALESCE(p_reason, ''))) < 5 THEN
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
  IF NOT public.has_permission(v_po.branch_id, 'procurement:po_create') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF v_po.status <> 'partially_received' THEN
    RAISE EXCEPTION 'purchase_order_not_closable'
      USING ERRCODE = '23514';
  END IF;

  UPDATE public.goods_received_notes
  SET status = 'cancelled',
      notes = concat_ws(
        E'\n',
        NULLIF(notes, ''),
        'Đóng phần còn lại của PO: ' || btrim(p_reason)
      ),
      updated_at = now()
  WHERE tenant_id = v_tenant
    AND po_id = p_po_id
    AND status = 'draft';

  UPDATE public.purchase_orders
  SET status = 'closed',
      status_reason = btrim(p_reason),
      closed_at = now(),
      updated_at = now()
  WHERE id = p_po_id
    AND tenant_id = v_tenant;

  PERFORM public.log_audit(
    'procurement.po.closed',
    'purchase_order',
    p_po_id,
    to_jsonb(v_po),
    jsonb_build_object('status', 'closed', 'reason', btrim(p_reason))
  );

  RETURN jsonb_build_object('id', p_po_id, 'status', 'closed');
END;
$$;

-- ---------------------------------------------------------------------------
-- GRN: save all editable fields in one transaction; confirm stays separate
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.save_goods_receipt_note(
  p_grn_id bigint,
  p_received_date timestamptz,
  p_notes text,
  p_lines jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_tenant bigint := public.auth_tenant_id();
  v_grn public.goods_received_notes%ROWTYPE;
  v_input_count integer;
  v_distinct_count integer;
  v_expected_count integer;
BEGIN
  IF auth.uid() IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array' THEN
    RAISE EXCEPTION 'grn_lines_invalid' USING ERRCODE = '22023';
  END IF;

  SELECT grn.*
  INTO v_grn
  FROM public.goods_received_notes AS grn
  WHERE grn.id = p_grn_id
    AND grn.tenant_id = v_tenant
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'grn_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.has_permission(v_grn.branch_id, 'procurement:grn_create') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF v_grn.status <> 'draft' THEN
    RAISE EXCEPTION 'grn_not_draft' USING ERRCODE = '23514';
  END IF;

  SELECT count(*), count(DISTINCT line.line_id)
  INTO v_input_count, v_distinct_count
  FROM jsonb_to_recordset(p_lines)
    AS line(line_id bigint);

  SELECT count(*)
  INTO v_expected_count
  FROM public.grn_items AS item
  WHERE item.grn_id = p_grn_id
    AND item.tenant_id = v_tenant;

  IF v_input_count <> v_distinct_count
     OR v_input_count <> v_expected_count
     OR EXISTS (
       SELECT 1
       FROM jsonb_to_recordset(p_lines)
         AS line(
           line_id bigint,
           received_quantity numeric,
           rejected_quantity numeric,
           rejection_reason text,
           rejected_photo_url text
         )
       LEFT JOIN public.grn_items AS item
         ON item.id = line.line_id
        AND item.grn_id = p_grn_id
        AND item.tenant_id = v_tenant
       WHERE item.id IS NULL
          OR line.received_quantity IS NULL
          OR line.received_quantity < 0
          OR COALESCE(line.rejected_quantity, 0) < 0
          OR COALESCE(line.rejected_quantity, 0) > line.received_quantity
          OR (
            COALESCE(line.rejected_quantity, 0) > 0
            AND (
              length(btrim(COALESCE(line.rejection_reason, ''))) = 0
              OR length(btrim(COALESCE(line.rejected_photo_url, ''))) = 0
            )
          )
     ) THEN
    RAISE EXCEPTION 'grn_lines_invalid' USING ERRCODE = '23514';
  END IF;

  UPDATE public.grn_items AS item
  SET received_quantity = line.received_quantity::numeric(15,3),
      rejected_quantity = COALESCE(
        line.rejected_quantity,
        0
      )::numeric(15,3),
      rejection_reason = NULLIF(btrim(line.rejection_reason), ''),
      rejected_photo_url = NULLIF(btrim(line.rejected_photo_url), '')
  FROM jsonb_to_recordset(p_lines)
    AS line(
      line_id bigint,
      received_quantity numeric,
      rejected_quantity numeric,
      rejection_reason text,
      rejected_photo_url text
    )
  WHERE item.id = line.line_id
    AND item.grn_id = p_grn_id
    AND item.tenant_id = v_tenant;

  UPDATE public.goods_received_notes
  SET received_date = COALESCE(p_received_date, received_date),
      notes = CASE
        WHEN p_notes IS NULL THEN notes
        ELSE NULLIF(btrim(p_notes), '')
      END,
      updated_at = now()
  WHERE id = p_grn_id
    AND tenant_id = v_tenant;

  PERFORM public.log_audit(
    'inventory.grn.saved',
    'goods_received_note',
    p_grn_id,
    to_jsonb(v_grn),
    jsonb_build_object(
      'status', 'draft',
      'line_count', v_input_count,
      'received_date', p_received_date
    )
  );

  RETURN jsonb_build_object(
    'id', p_grn_id,
    'status', 'draft',
    'updated_lines', v_input_count
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_goods_receipt_note(
  p_grn_id bigint,
  p_reason text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_tenant bigint := public.auth_tenant_id();
  v_grn public.goods_received_notes%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  IF length(btrim(COALESCE(p_reason, ''))) < 5 THEN
    RAISE EXCEPTION 'reason_required' USING ERRCODE = '22023';
  END IF;

  SELECT grn.*
  INTO v_grn
  FROM public.goods_received_notes AS grn
  WHERE grn.id = p_grn_id
    AND grn.tenant_id = v_tenant
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'grn_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.has_permission(v_grn.branch_id, 'procurement:grn_create') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF v_grn.status <> 'draft' THEN
    RAISE EXCEPTION 'grn_not_cancellable' USING ERRCODE = '23514';
  END IF;

  UPDATE public.goods_received_notes
  SET status = 'cancelled',
      notes = concat_ws(E'\n', NULLIF(notes, ''), btrim(p_reason)),
      updated_at = now()
  WHERE id = p_grn_id
    AND tenant_id = v_tenant;

  PERFORM public.log_audit(
    'inventory.grn.cancelled',
    'goods_received_note',
    p_grn_id,
    to_jsonb(v_grn),
    jsonb_build_object('status', 'cancelled', 'reason', btrim(p_reason))
  );

  RETURN jsonb_build_object('id', p_grn_id, 'status', 'cancelled');
END;
$$;

-- ---------------------------------------------------------------------------
-- YCH: one atomic save, optional direct submit
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.save_stock_request(
  p_request_id bigint,
  p_branch_id bigint,
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
  v_request public.stock_requests%ROWTYPE;
  v_request_id bigint;
  v_number text;
  v_status text;
  v_old jsonb;
BEGIN
  IF v_uid IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  IF p_branch_id IS NULL
     OR p_lines IS NULL
     OR jsonb_typeof(p_lines) <> 'array'
     OR jsonb_array_length(p_lines) = 0
     OR jsonb_array_length(p_lines) > 200 THEN
    RAISE EXCEPTION 'stock_request_invalid' USING ERRCODE = '22023';
  END IF;
  IF NOT public.auth_is_owner(auth.uid())
     AND NOT public.has_permission(
       p_branch_id,
       CASE
         WHEN p_submit THEN 'inventory:request_submit'
         ELSE 'inventory:request_create'
       END
     ) THEN
    RAISE EXCEPTION 'forbidden_request_save' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.branches AS branch
    WHERE branch.id = p_branch_id
      AND branch.tenant_id = v_tenant
      AND branch.is_active
      AND branch.branch_kind = 'branch'
  ) THEN
    RAISE EXCEPTION 'stock_request_branch_site_only'
      USING ERRCODE = '23514';
  END IF;
  IF (
    SELECT count(*) <> count(DISTINCT line.ingredient_id)
    FROM jsonb_to_recordset(p_lines)
      AS line(ingredient_id bigint)
  )
  OR EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(p_lines)
      AS line(
        ingredient_id bigint,
        entry_unit_id bigint,
        quantity numeric
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
           AND ingredient.default_fulfill_site_kind IN (
             'central_supply',
             'central_kitchen'
           )
           AND ingredient_unit.unit_id = line.entry_unit_id
           AND ingredient_unit.is_active
       )
  ) THEN
    RAISE EXCEPTION 'stock_request_line_invalid'
      USING ERRCODE = '23514';
  END IF;

  IF p_request_id IS NULL
     AND p_idempotency_key IS NOT NULL THEN
    SELECT request.*
    INTO v_request
    FROM public.stock_requests AS request
    WHERE request.tenant_id = v_tenant
      AND request.creation_idempotency_key = p_idempotency_key
    FOR UPDATE;

    IF FOUND THEN
      RETURN jsonb_build_object(
        'request_id', v_request.id,
        'request_number', v_request.request_number,
        'status', v_request.status
      );
    END IF;
  END IF;

  IF p_request_id IS NULL THEN
    v_number := public.next_inventory_doc_number(v_tenant, 'stock_request');
    INSERT INTO public.stock_requests (
      tenant_id,
      branch_id,
      request_number,
      status,
      notes,
      created_by,
      creation_idempotency_key
    )
    VALUES (
      v_tenant,
      p_branch_id,
      v_number,
      'draft',
      NULLIF(btrim(p_notes), ''),
      v_uid,
      p_idempotency_key
    )
    RETURNING id INTO v_request_id;
    v_old := NULL;
  ELSE
    SELECT request.*
    INTO v_request
    FROM public.stock_requests AS request
    WHERE request.id = p_request_id
      AND request.tenant_id = v_tenant
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'stock_request_not_found' USING ERRCODE = 'P0002';
    END IF;
    v_old := to_jsonb(v_request);
    IF v_request.branch_id <> p_branch_id
       OR v_request.status NOT IN ('draft', 'submitted')
       OR EXISTS (
         SELECT 1
         FROM public.stock_request_items AS item
         WHERE item.request_id = p_request_id
           AND item.tenant_id = v_tenant
           AND item.status <> 'pending'
       ) THEN
      RAISE EXCEPTION 'stock_request_not_editable'
        USING ERRCODE = '23514';
    END IF;

    v_request_id := p_request_id;
    v_number := v_request.request_number;
    DELETE FROM public.stock_request_items
    WHERE request_id = v_request_id
      AND tenant_id = v_tenant;

    UPDATE public.stock_requests
    SET notes = NULLIF(btrim(p_notes), ''),
        updated_at = now()
    WHERE id = v_request_id
      AND tenant_id = v_tenant;
  END IF;

  INSERT INTO public.stock_request_items (
    tenant_id,
    request_id,
    ingredient_id,
    entry_unit_id,
    quantity,
    fulfill_site_kind,
    status,
    notes
  )
  SELECT
    v_tenant,
    v_request_id,
    line.ingredient_id,
    line.entry_unit_id,
    line.quantity::numeric(15,3),
    ingredient.default_fulfill_site_kind,
    'pending',
    NULLIF(btrim(line.notes), '')
  FROM jsonb_to_recordset(p_lines)
    AS line(
      ingredient_id bigint,
      entry_unit_id bigint,
      quantity numeric,
      notes text
    )
  JOIN public.ingredients AS ingredient
    ON ingredient.id = line.ingredient_id
   AND ingredient.tenant_id = v_tenant;

  v_status := CASE WHEN p_submit THEN 'submitted' ELSE 'draft' END;
  UPDATE public.stock_requests
  SET status = v_status,
      submitted_at = CASE WHEN p_submit THEN now() ELSE NULL END,
      updated_at = now()
  WHERE id = v_request_id
    AND tenant_id = v_tenant;

  PERFORM public.log_audit(
    CASE
      WHEN p_request_id IS NULL AND p_submit THEN 'inventory.request.created_submitted'
      WHEN p_request_id IS NULL THEN 'inventory.request.created_draft'
      WHEN p_submit THEN 'inventory.request.saved_submitted'
      ELSE 'inventory.request.saved_draft'
    END,
    'stock_request',
    v_request_id,
    v_old,
    jsonb_build_object(
      'status', v_status,
      'branch_id', p_branch_id,
      'line_count', jsonb_array_length(p_lines)
    )
  );

  RETURN jsonb_build_object(
    'request_id', v_request_id,
    'request_number', v_number,
    'status', v_status
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_stock_request(
  p_request_id bigint,
  p_reason text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_tenant bigint := public.auth_tenant_id();
  v_request public.stock_requests%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  IF length(btrim(COALESCE(p_reason, ''))) < 5 THEN
    RAISE EXCEPTION 'reason_required' USING ERRCODE = '22023';
  END IF;

  SELECT request.*
  INTO v_request
  FROM public.stock_requests AS request
  WHERE request.id = p_request_id
    AND request.tenant_id = v_tenant
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'stock_request_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.auth_is_owner(auth.uid())
     AND NOT public.has_permission(
       v_request.branch_id,
       'inventory:request_cancel'
     ) THEN
    RAISE EXCEPTION 'forbidden_request_cancel' USING ERRCODE = '42501';
  END IF;
  IF v_request.status NOT IN ('draft', 'submitted')
     OR EXISTS (
       SELECT 1
       FROM public.stock_request_items AS item
       WHERE item.request_id = p_request_id
         AND item.tenant_id = v_tenant
         AND item.status <> 'pending'
     ) THEN
    RAISE EXCEPTION 'stock_request_not_cancellable'
      USING ERRCODE = '23514';
  END IF;

  UPDATE public.stock_request_items
  SET status = 'cancelled',
      updated_at = now()
  WHERE request_id = p_request_id
    AND tenant_id = v_tenant
    AND status = 'pending';

  UPDATE public.stock_requests
  SET status = 'cancelled',
      status_reason = btrim(p_reason),
      cancelled_at = now(),
      updated_at = now()
  WHERE id = p_request_id
    AND tenant_id = v_tenant;

  PERFORM public.log_audit(
    'inventory.request.cancelled',
    'stock_request',
    p_request_id,
    to_jsonb(v_request),
    jsonb_build_object('status', 'cancelled', 'reason', btrim(p_reason))
  );

  RETURN jsonb_build_object(
    'request_id', p_request_id,
    'status', 'cancelled'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.close_stock_request(
  p_request_id bigint,
  p_reason text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_tenant bigint := public.auth_tenant_id();
  v_request public.stock_requests%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  IF length(btrim(COALESCE(p_reason, ''))) < 5 THEN
    RAISE EXCEPTION 'reason_required' USING ERRCODE = '22023';
  END IF;

  SELECT request.*
  INTO v_request
  FROM public.stock_requests AS request
  WHERE request.id = p_request_id
    AND request.tenant_id = v_tenant
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'stock_request_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_request.status <> 'partially_fulfilled' THEN
    RAISE EXCEPTION 'stock_request_not_closable'
      USING ERRCODE = '23514';
  END IF;
  IF NOT public.auth_is_owner(auth.uid())
     AND NOT public.has_permission_any('inventory:request_fulfill') THEN
    RAISE EXCEPTION 'forbidden_request_fulfill' USING ERRCODE = '42501';
  END IF;

  UPDATE public.stock_request_items
  SET status = 'cancelled',
      updated_at = now()
  WHERE request_id = p_request_id
    AND tenant_id = v_tenant
    AND status = 'pending';

  UPDATE public.stock_requests
  SET status = 'closed',
      status_reason = btrim(p_reason),
      closed_at = now(),
      updated_at = now()
  WHERE id = p_request_id
    AND tenant_id = v_tenant;

  PERFORM public.log_audit(
    'inventory.request.closed',
    'stock_request',
    p_request_id,
    to_jsonb(v_request),
    jsonb_build_object('status', 'closed', 'reason', btrim(p_reason))
  );

  RETURN jsonb_build_object(
    'request_id', p_request_id,
    'status', 'closed'
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- Draft Transfer cancellation restores YCH allocation
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.cancel_stock_transfer(
  p_transfer_id bigint,
  p_reason text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_tenant bigint := public.auth_tenant_id();
  v_transfer public.stock_transfers%ROWTYPE;
  v_request_id bigint;
  v_pending integer;
  v_active integer;
  v_request_status text;
BEGIN
  IF auth.uid() IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  IF length(btrim(COALESCE(p_reason, ''))) < 5 THEN
    RAISE EXCEPTION 'reason_required' USING ERRCODE = '22023';
  END IF;

  SELECT transfer.*
  INTO v_transfer
  FROM public.stock_transfers AS transfer
  WHERE transfer.id = p_transfer_id
    AND transfer.tenant_id = v_tenant
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'stock_transfer_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_transfer.status <> 'draft' THEN
    RAISE EXCEPTION 'stock_transfer_not_cancellable'
      USING ERRCODE = '23514';
  END IF;
  IF NOT public.auth_is_owner(auth.uid())
     AND (
       public.auth_branch_id() IS DISTINCT FROM v_transfer.from_branch_id
       OR NOT public.has_permission(
         v_transfer.from_branch_id,
         'inventory:transfer_create'
       )
     ) THEN
    RAISE EXCEPTION 'forbidden_transfer_cancel' USING ERRCODE = '42501';
  END IF;

  SELECT min(item.request_id)
  INTO v_request_id
  FROM public.stock_request_items AS item
  WHERE item.tenant_id = v_tenant
    AND item.transfer_id = p_transfer_id;

  UPDATE public.stock_request_items
  SET status = 'pending',
      transfer_id = NULL,
      updated_at = now()
  WHERE tenant_id = v_tenant
    AND transfer_id = p_transfer_id
    AND status = 'allocated';

  UPDATE public.stock_transfers
  SET status = 'cancelled',
      status_reason = btrim(p_reason),
      cancelled_at = now(),
      updated_at = now()
  WHERE id = p_transfer_id
    AND tenant_id = v_tenant;

  IF v_request_id IS NOT NULL THEN
    SELECT
      count(*) FILTER (WHERE item.status = 'pending')::integer,
      count(*) FILTER (
        WHERE item.status IN ('allocated', 'shipped', 'received')
      )::integer
    INTO v_pending, v_active
    FROM public.stock_request_items AS item
    WHERE item.request_id = v_request_id
      AND item.tenant_id = v_tenant
      AND item.status <> 'cancelled';

    v_request_status := CASE
      WHEN v_pending = 0 AND v_active > 0 THEN 'fulfilled'
      WHEN v_pending > 0 AND v_active > 0 THEN 'partially_fulfilled'
      ELSE 'submitted'
    END;

    UPDATE public.stock_requests
    SET status = v_request_status,
        updated_at = now()
    WHERE id = v_request_id
      AND tenant_id = v_tenant
      AND status NOT IN ('closed', 'cancelled');
  END IF;

  PERFORM public.log_audit(
    'inventory.transfer.cancelled',
    'stock_transfer',
    p_transfer_id,
    to_jsonb(v_transfer),
    jsonb_build_object(
      'status', 'cancelled',
      'reason', btrim(p_reason),
      'stock_request_id', v_request_id
    )
  );

  RETURN jsonb_build_object(
    'id', p_transfer_id,
    'status', 'cancelled',
    'stock_request_id', v_request_id
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- Explicit grants. Existing RPCs stay available during the compatibility window.
-- ---------------------------------------------------------------------------

REVOKE ALL ON FUNCTION
  public.save_purchase_request(bigint, bigint, date, text, jsonb, boolean, uuid),
  public.cancel_purchase_request(bigint, text),
  public.close_purchase_request(bigint, text),
  public.send_purchase_order(bigint),
  public.save_purchase_orders_from_request(bigint, jsonb, boolean, uuid),
  public.save_purchase_order(bigint, date, text, jsonb, boolean),
  public.cancel_purchase_order(bigint, text),
  public.close_purchase_order(bigint, text),
  public.save_goods_receipt_note(bigint, timestamptz, text, jsonb),
  public.cancel_goods_receipt_note(bigint, text),
  public.save_stock_request(bigint, bigint, text, jsonb, boolean, uuid),
  public.cancel_stock_request(bigint, text),
  public.close_stock_request(bigint, text),
  public.cancel_stock_transfer(bigint, text)
FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION
  public.save_purchase_request(bigint, bigint, date, text, jsonb, boolean, uuid),
  public.cancel_purchase_request(bigint, text),
  public.close_purchase_request(bigint, text),
  public.send_purchase_order(bigint),
  public.save_purchase_orders_from_request(bigint, jsonb, boolean, uuid),
  public.save_purchase_order(bigint, date, text, jsonb, boolean),
  public.cancel_purchase_order(bigint, text),
  public.close_purchase_order(bigint, text),
  public.save_goods_receipt_note(bigint, timestamptz, text, jsonb),
  public.cancel_goods_receipt_note(bigint, text),
  public.save_stock_request(bigint, bigint, text, jsonb, boolean, uuid),
  public.cancel_stock_request(bigint, text),
  public.close_stock_request(bigint, text),
  public.cancel_stock_transfer(bigint, text)
TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
