-- Unify stock-request and transfer operations without merging their records.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.stock_request_items
    WHERE status IN ('shipped', 'received')
      AND transfer_id IS NULL
  ) THEN
    RAISE EXCEPTION 'stock_request_legacy_items_require_manual_migration';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.stock_request_items
    GROUP BY request_id, ingredient_id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'stock_request_duplicate_ingredients_require_cleanup';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.stock_request_items
    WHERE transfer_id IS NOT NULL
    GROUP BY transfer_id
    HAVING count(DISTINCT request_id) > 1
  ) THEN
    RAISE EXCEPTION 'stock_transfer_multiple_requests_require_cleanup';
  END IF;
END;
$$;

ALTER TABLE public.stock_requests
  ADD COLUMN IF NOT EXISTS needed_at timestamptz,
  ADD COLUMN IF NOT EXISTS status_reason text,
  ADD COLUMN IF NOT EXISTS closed_at timestamptz,
  ADD COLUMN IF NOT EXISTS creation_idempotency_key uuid;

ALTER TABLE public.stock_transfers
  ADD COLUMN IF NOT EXISTS status_reason text,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS stock_request_id bigint;

ALTER TABLE public.stock_requests
  ADD CONSTRAINT stock_requests_id_tenant_unique UNIQUE (id, tenant_id);

ALTER TABLE public.stock_transfers
  ADD CONSTRAINT stock_transfers_request_tenant_fkey
    FOREIGN KEY (stock_request_id, tenant_id)
    REFERENCES public.stock_requests(id, tenant_id);

UPDATE public.stock_transfers AS transfer
SET stock_request_id = linked.request_id,
    updated_at = now()
FROM (
  SELECT item.transfer_id, min(item.request_id) AS request_id
  FROM public.stock_request_items AS item
  WHERE item.transfer_id IS NOT NULL
  GROUP BY item.transfer_id
) AS linked
WHERE transfer.id = linked.transfer_id
  AND transfer.stock_request_id IS NULL;

UPDATE public.stock_request_items
SET status = CASE
      WHEN status IN ('shipped', 'received') THEN 'allocated'
      ELSE status
    END,
    updated_at = now()
WHERE status IN ('shipped', 'received');

UPDATE public.stock_requests
SET status = 'submitted',
    updated_at = now()
WHERE status IN ('partially_fulfilled', 'fulfilled');

ALTER TABLE public.stock_requests
  DROP CONSTRAINT IF EXISTS stock_requests_status_check,
  ADD CONSTRAINT stock_requests_status_check CHECK (
    status IN ('draft', 'submitted', 'closed', 'cancelled')
  );

ALTER TABLE public.stock_request_items
  DROP CONSTRAINT IF EXISTS stock_request_items_status_check,
  ADD CONSTRAINT stock_request_items_status_check CHECK (
    status IN ('pending', 'allocated', 'rejected', 'cancelled')
  ),
  ADD CONSTRAINT stock_request_items_request_ingredient_unique
    UNIQUE (request_id, ingredient_id);

CREATE UNIQUE INDEX IF NOT EXISTS stock_requests_creation_key_uidx
  ON public.stock_requests (tenant_id, creation_idempotency_key)
  WHERE creation_idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS stock_transfers_stock_request_idx
  ON public.stock_transfers (tenant_id, stock_request_id)
  WHERE stock_request_id IS NOT NULL;

GRANT SELECT (
  needed_at,
  status_reason,
  closed_at,
  creation_idempotency_key
) ON public.stock_requests TO authenticated;

GRANT SELECT (
  status_reason,
  cancelled_at,
  stock_request_id
) ON public.stock_transfers TO authenticated;

CREATE OR REPLACE FUNCTION public.save_stock_request(
  p_request_id bigint,
  p_branch_id bigint,
  p_needed_at timestamptz,
  p_notes text,
  p_lines jsonb,
  p_submit boolean DEFAULT true,
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
  IF NOT public.auth_is_owner(v_uid)
     AND (
       NOT public.has_permission(p_branch_id, 'inventory:request_create')
       OR (
         p_submit
         AND NOT public.has_permission(p_branch_id, 'inventory:request_submit')
       )
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
    FROM jsonb_to_recordset(p_lines) AS line(ingredient_id bigint)
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

  IF p_request_id IS NULL AND p_idempotency_key IS NOT NULL THEN
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
      needed_at,
      notes,
      created_by,
      creation_idempotency_key
    )
    VALUES (
      v_tenant,
      p_branch_id,
      v_number,
      'draft',
      p_needed_at,
      NULLIF(btrim(p_notes), ''),
      v_uid,
      p_idempotency_key
    )
    ON CONFLICT (tenant_id, creation_idempotency_key)
      WHERE creation_idempotency_key IS NOT NULL
      DO NOTHING
    RETURNING id INTO v_request_id;

    IF v_request_id IS NULL THEN
      SELECT request.*
      INTO v_request
      FROM public.stock_requests AS request
      WHERE request.tenant_id = v_tenant
        AND request.creation_idempotency_key = p_idempotency_key
      FOR UPDATE;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'stock_request_idempotency_conflict'
          USING ERRCODE = '40001';
      END IF;

      RETURN jsonb_build_object(
        'request_id', v_request.id,
        'request_number', v_request.request_number,
        'status', v_request.status
      );
    END IF;
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

  v_status := CASE
    WHEN p_submit OR v_request.status = 'submitted' THEN 'submitted'
    ELSE 'draft'
  END;

  UPDATE public.stock_requests
  SET status = v_status,
      needed_at = p_needed_at,
      notes = NULLIF(btrim(p_notes), ''),
      submitted_at = CASE
        WHEN v_status = 'submitted' THEN COALESCE(submitted_at, now())
        ELSE NULL
      END,
      status_reason = NULL,
      updated_at = now()
  WHERE id = v_request_id
    AND tenant_id = v_tenant;

  PERFORM public.log_audit(
    CASE
      WHEN p_request_id IS NULL AND p_submit
        THEN 'inventory.request.created_submitted'
      WHEN p_request_id IS NULL THEN 'inventory.request.created_draft'
      WHEN p_submit THEN 'inventory.request.saved_submitted'
      ELSE 'inventory.request.saved_draft'
    END,
    'stock_request',
    v_request_id,
    CASE WHEN p_request_id IS NULL THEN NULL ELSE to_jsonb(v_request) END,
    jsonb_build_object(
      'status', v_status,
      'branch_id', p_branch_id,
      'line_count', jsonb_array_length(p_lines),
      'needed_at', p_needed_at
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
  IF v_request.status <> 'submitted'
     OR NOT EXISTS (
       SELECT 1
       FROM public.stock_request_items AS item
       WHERE item.request_id = p_request_id
         AND item.tenant_id = v_tenant
         AND item.status = 'pending'
     ) THEN
    RAISE EXCEPTION 'stock_request_not_closable'
      USING ERRCODE = '23514';
  END IF;
  IF NOT public.auth_is_owner(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden_request_close' USING ERRCODE = '42501';
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

CREATE OR REPLACE FUNCTION public.reject_stock_request_lines(
  p_request_id bigint,
  p_fulfill_site_kind text,
  p_item_ids bigint[],
  p_reason text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_tenant bigint := public.auth_tenant_id();
  v_actor_kind text;
  v_count integer;
BEGIN
  IF auth.uid() IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  IF length(btrim(COALESCE(p_reason, ''))) < 5 THEN
    RAISE EXCEPTION 'reason_required' USING ERRCODE = '22023';
  END IF;
  IF p_fulfill_site_kind NOT IN ('central_supply', 'central_kitchen')
     OR p_item_ids IS NULL
     OR cardinality(p_item_ids) = 0 THEN
    RAISE EXCEPTION 'stock_request_reject_invalid' USING ERRCODE = '22023';
  END IF;
  IF NOT public.auth_is_owner(auth.uid())
     AND NOT public.has_permission_any('inventory:request_fulfill') THEN
    RAISE EXCEPTION 'forbidden_request_fulfill' USING ERRCODE = '42501';
  END IF;

  v_actor_kind := CASE public.auth_role()
    WHEN 'central_supply_ops' THEN 'central_supply'
    WHEN 'central_kitchen_lead' THEN 'central_kitchen'
    ELSE p_fulfill_site_kind
  END;

  IF v_actor_kind IS DISTINCT FROM p_fulfill_site_kind THEN
    RAISE EXCEPTION 'forbidden_request_fulfill_scope'
      USING ERRCODE = '42501';
  END IF;

  PERFORM 1
  FROM public.stock_requests AS request
  WHERE request.id = p_request_id
    AND request.tenant_id = v_tenant
    AND request.status = 'submitted'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'stock_request_not_fulfillable'
      USING ERRCODE = '23514';
  END IF;

  UPDATE public.stock_request_items
  SET status = 'rejected',
      notes = concat_ws(E'\n', NULLIF(notes, ''), btrim(p_reason)),
      updated_at = now()
  WHERE request_id = p_request_id
    AND tenant_id = v_tenant
    AND id = ANY (p_item_ids)
    AND fulfill_site_kind = p_fulfill_site_kind
    AND status = 'pending';

  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count <> cardinality(p_item_ids) THEN
    RAISE EXCEPTION 'stock_request_lines_not_pending'
      USING ERRCODE = '23514';
  END IF;

  PERFORM public.log_audit(
    'inventory.request.lines_rejected',
    'stock_request',
    p_request_id,
    NULL,
    jsonb_build_object(
      'item_ids', p_item_ids,
      'fulfill_site_kind', p_fulfill_site_kind,
      'reason', btrim(p_reason)
    )
  );

  RETURN jsonb_build_object(
    'request_id', p_request_id,
    'rejected_count', v_count
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.fulfill_stock_request_lines(
  p_request_id bigint,
  p_fulfill_site_kind text,
  p_from_branch_id bigint,
  p_from_location_id bigint,
  p_item_ids bigint[]
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_tenant bigint := public.auth_tenant_id();
  v_request public.stock_requests%ROWTYPE;
  v_from_kind text;
  v_to_location_id bigint;
  v_lines jsonb := '[]'::jsonb;
  v_item public.stock_request_items%ROWTYPE;
  v_result jsonb;
  v_transfer_id bigint;
  v_stock numeric(15,3);
  v_required numeric(15,3);
  v_count integer := 0;
BEGIN
  IF auth.uid() IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  IF p_fulfill_site_kind NOT IN ('central_supply', 'central_kitchen')
     OR p_item_ids IS NULL
     OR cardinality(p_item_ids) = 0
     OR cardinality(p_item_ids) <> (
       SELECT count(DISTINCT item_id)
       FROM unnest(p_item_ids) AS ids(item_id)
     ) THEN
    RAISE EXCEPTION 'stock_request_fulfill_invalid'
      USING ERRCODE = '22023';
  END IF;
  IF NOT public.auth_is_owner(auth.uid())
     AND NOT public.has_permission_any('inventory:request_fulfill') THEN
    RAISE EXCEPTION 'forbidden_request_fulfill' USING ERRCODE = '42501';
  END IF;

  SELECT request.*
  INTO v_request
  FROM public.stock_requests AS request
  WHERE request.id = p_request_id
    AND request.tenant_id = v_tenant
  FOR UPDATE;

  IF NOT FOUND OR v_request.status <> 'submitted' THEN
    RAISE EXCEPTION 'stock_request_not_fulfillable'
      USING ERRCODE = '23514';
  END IF;

  SELECT branch.branch_kind
  INTO v_from_kind
  FROM public.branches AS branch
  WHERE branch.id = p_from_branch_id
    AND branch.tenant_id = v_tenant
    AND branch.is_active;

  IF v_from_kind IS DISTINCT FROM p_fulfill_site_kind THEN
    RAISE EXCEPTION 'fulfill_from_site_mismatch'
      USING ERRCODE = '23514';
  END IF;
  IF NOT public.auth_is_owner(auth.uid())
     AND (
       public.auth_branch_id() IS DISTINCT FROM p_from_branch_id
       OR CASE public.auth_role()
         WHEN 'central_supply_ops' THEN 'central_supply'
         WHEN 'central_kitchen_lead' THEN 'central_kitchen'
         ELSE NULL
       END IS DISTINCT FROM p_fulfill_site_kind
     ) THEN
    RAISE EXCEPTION 'forbidden_request_fulfill_scope'
      USING ERRCODE = '42501';
  END IF;

  SELECT location.id
  INTO v_to_location_id
  FROM public.inventory_locations AS location
  WHERE location.tenant_id = v_tenant
    AND location.branch_id = v_request.branch_id
    AND location.location_kind = 'warehouse'
    AND location.is_active
  ORDER BY location.id
  LIMIT 1;

  IF v_to_location_id IS NULL THEN
    RAISE EXCEPTION 'stock_request_destination_warehouse_missing'
      USING ERRCODE = '23514';
  END IF;

  FOR v_item IN
    SELECT item.*
    FROM public.stock_request_items AS item
    WHERE item.request_id = p_request_id
      AND item.tenant_id = v_tenant
      AND item.id = ANY (p_item_ids)
      AND item.fulfill_site_kind = p_fulfill_site_kind
      AND item.status = 'pending'
    ORDER BY item.ingredient_id
    FOR UPDATE
  LOOP
    v_count := v_count + 1;
    v_required := public.inv_to_base(
      v_item.ingredient_id,
      v_item.entry_unit_id,
      v_item.quantity
    );

    SELECT stock.current_quantity
    INTO v_stock
    FROM public.stock_levels AS stock
    WHERE stock.tenant_id = v_tenant
      AND stock.branch_id = p_from_branch_id
      AND stock.location_id = p_from_location_id
      AND stock.ingredient_id = v_item.ingredient_id
    FOR UPDATE;

    IF NOT FOUND OR COALESCE(v_stock, 0) < v_required THEN
      RAISE EXCEPTION 'insufficient_stock:%', v_item.ingredient_id
        USING ERRCODE = 'P0001';
    END IF;

    v_lines := v_lines || jsonb_build_array(
      jsonb_build_object(
        'ingredient_id', v_item.ingredient_id,
        'entry_unit_id', v_item.entry_unit_id,
        'quantity', v_item.quantity
      )
    );
  END LOOP;

  IF v_count <> cardinality(p_item_ids) THEN
    RAISE EXCEPTION 'stock_request_lines_not_pending'
      USING ERRCODE = '23514';
  END IF;

  v_result := public.create_stock_transfer_draft(
    p_from_branch_id,
    v_request.branch_id,
    '',
    'Fulfill stock request ' || v_request.request_number,
    NULL,
    v_lines,
    p_from_location_id,
    v_to_location_id
  );

  v_transfer_id := COALESCE(
    (v_result ->> 'id')::bigint,
    (v_result ->> 'transfer_id')::bigint
  );

  UPDATE public.stock_transfers
  SET stock_request_id = p_request_id,
      updated_at = now()
  WHERE id = v_transfer_id
    AND tenant_id = v_tenant;

  UPDATE public.stock_request_items
  SET status = 'allocated',
      transfer_id = v_transfer_id,
      updated_at = now()
  WHERE request_id = p_request_id
    AND tenant_id = v_tenant
    AND id = ANY (p_item_ids)
    AND status = 'pending';

  RETURN jsonb_build_object(
    'request_id', p_request_id,
    'transfer_id', v_transfer_id,
    'transfer_number', v_result ->> 'transfer_number'
  );
END;
$$;

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

ALTER FUNCTION public.stock_transfer_confirm_ship(bigint)
  RENAME TO stock_transfer_confirm_ship_legacy;

CREATE FUNCTION public.stock_transfer_confirm_ship(
  p_transfer_id bigint
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  PERFORM public.stock_transfer_confirm_ship_legacy(p_transfer_id);
  RETURN public.stock_transfer_mark_in_transit(p_transfer_id);
END;
$$;

REVOKE ALL ON FUNCTION public.stock_transfer_confirm_ship(bigint)
  FROM PUBLIC, anon, authenticated;

ALTER FUNCTION public.stock_transfer_receive(bigint, jsonb)
  RENAME TO stock_transfer_receive_legacy;

CREATE FUNCTION public.stock_transfer_receive(
  p_transfer_id bigint,
  p_items jsonb DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_tenant bigint := public.auth_tenant_id();
  v_line public.stock_transfer_items%ROWTYPE;
  v_payload jsonb;
  v_received numeric;
  v_note text;
BEGIN
  IF auth.uid() IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  FOR v_line IN
    SELECT item.*
    FROM public.stock_transfer_items AS item
    WHERE item.transfer_id = p_transfer_id
      AND item.tenant_id = v_tenant
  LOOP
    v_payload := p_items -> v_line.ingredient_id::text;
    v_received := CASE
      WHEN v_payload IS NULL THEN v_line.quantity
      WHEN jsonb_typeof(v_payload) = 'object'
        THEN (v_payload ->> 'qty')::numeric
      ELSE (v_payload #>> '{}')::numeric
    END;
    v_note := CASE
      WHEN jsonb_typeof(v_payload) = 'object'
        THEN NULLIF(btrim(v_payload ->> 'note'), '')
      ELSE NULL
    END;

    IF v_received < v_line.quantity
       AND length(COALESCE(v_note, '')) < 5 THEN
      RAISE EXCEPTION 'short_receive_reason_required:%',
        v_line.ingredient_id
        USING ERRCODE = '22023';
    END IF;
  END LOOP;

  RETURN public.stock_transfer_receive_legacy(p_transfer_id, p_items);
END;
$$;

REVOKE ALL ON FUNCTION
  public.save_stock_request(
    bigint, bigint, timestamptz, text, jsonb, boolean, uuid
  ),
  public.cancel_stock_request(bigint, text),
  public.close_stock_request(bigint, text),
  public.reject_stock_request_lines(bigint, text, bigint[], text),
  public.fulfill_stock_request_lines(bigint, text, bigint, bigint, bigint[]),
  public.cancel_stock_transfer(bigint, text),
  public.stock_transfer_confirm_ship(bigint),
  public.stock_transfer_confirm_ship_legacy(bigint),
  public.stock_transfer_receive(bigint, jsonb),
  public.stock_transfer_receive_legacy(bigint, jsonb)
FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION
  public.save_stock_request(
    bigint, bigint, timestamptz, text, jsonb, boolean, uuid
  ),
  public.cancel_stock_request(bigint, text),
  public.close_stock_request(bigint, text),
  public.reject_stock_request_lines(bigint, text, bigint[], text),
  public.fulfill_stock_request_lines(bigint, text, bigint, bigint, bigint[]),
  public.cancel_stock_transfer(bigint, text),
  public.stock_transfer_confirm_ship(bigint),
  public.stock_transfer_receive(bigint, jsonb)
TO authenticated, service_role;

REVOKE ALL ON FUNCTION
  public.create_stock_request_draft(bigint, text),
  public.add_stock_request_line(bigint, bigint, bigint, numeric),
  public.submit_stock_request(bigint),
  public.cancel_stock_request(bigint)
FROM PUBLIC, anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
