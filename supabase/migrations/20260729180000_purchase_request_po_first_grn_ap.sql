-- D096: external purchase request -> supplier PO -> delivery GRN -> supplier AP.
-- Additive compatibility migration. Existing confirmed GRNs are not rewritten.

-- ---------------------------------------------------------------------------
-- Purchase requests
-- ---------------------------------------------------------------------------

ALTER TABLE public.tenant_inventory_doc_counters
  DROP CONSTRAINT tenant_inventory_doc_counters_kind_check,
  ADD CONSTRAINT tenant_inventory_doc_counters_kind_check CHECK (
    doc_kind IN (
      'grn',
      'transfer',
      'issue',
      'waste',
      'production',
      'stocktake',
      'count_slip',
      'stock_request',
      'purchase_request'
    )
  );

CREATE OR REPLACE FUNCTION public.next_inventory_doc_number(
  p_tenant_id bigint,
  p_doc_kind text
) RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_year smallint;
  v_seq bigint;
  v_prefix text;
  v_kind text :=
    pg_catalog.lower(pg_catalog.btrim(COALESCE(p_doc_kind, '')));
BEGIN
  IF p_tenant_id IS NULL OR p_tenant_id <= 0 THEN
    RAISE EXCEPTION 'next_inventory_doc_number: invalid tenant_id'
      USING ERRCODE = '22023';
  END IF;
  IF auth.role() IS DISTINCT FROM 'service_role'
     AND (
       public.auth_tenant_id() IS NULL
       OR public.auth_tenant_id() <> p_tenant_id
     ) THEN
    RAISE EXCEPTION 'next_inventory_doc_number: tenant scope mismatch'
      USING ERRCODE = '42501';
  END IF;

  v_prefix := CASE v_kind
    WHEN 'grn' THEN 'GRN'
    WHEN 'transfer' THEN 'DC'
    WHEN 'issue' THEN 'PXK'
    WHEN 'waste' THEN 'HH'
    WHEN 'production' THEN 'LSX'
    WHEN 'stocktake' THEN 'KK'
    WHEN 'count_slip' THEN 'PD'
    WHEN 'stock_request' THEN 'YC'
    WHEN 'purchase_request' THEN 'YCM'
    ELSE NULL
  END;

  IF v_prefix IS NULL THEN
    RAISE EXCEPTION 'next_inventory_doc_number: invalid doc_kind'
      USING ERRCODE = '22023';
  END IF;

  v_year := EXTRACT(
    year FROM (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')
  )::smallint;

  INSERT INTO public.tenant_inventory_doc_counters (
    tenant_id, doc_kind, year, next_seq, updated_at
  )
  VALUES (p_tenant_id, v_kind, v_year, 2, now())
  ON CONFLICT (tenant_id, doc_kind, year) DO UPDATE
  SET next_seq =
        public.tenant_inventory_doc_counters.next_seq + 1,
      updated_at = now()
  RETURNING public.tenant_inventory_doc_counters.next_seq - 1
  INTO v_seq;

  RETURN v_prefix
    || '-'
    || pg_catalog.to_char(
      now() AT TIME ZONE 'Asia/Ho_Chi_Minh',
      'DDMMYYYY'
    )
    || '-'
    || pg_catalog.lpad(v_seq::text, 4, '0');
END;
$$;

CREATE TABLE public.purchase_requests (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id bigint NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  branch_id bigint NOT NULL REFERENCES public.branches(id) ON DELETE RESTRICT,
  request_number text NOT NULL,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN (
      'draft',
      'submitted',
      'partially_ordered',
      'ordered',
      'cancelled'
    )),
  needed_by date,
  notes text,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  submitted_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  submitted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, request_number),
  UNIQUE (id, tenant_id)
);

CREATE TABLE public.purchase_request_items (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id bigint NOT NULL,
  purchase_request_id bigint NOT NULL,
  ingredient_id bigint NOT NULL REFERENCES public.ingredients(id) ON DELETE RESTRICT,
  quantity numeric(15,3) NOT NULL CHECK (quantity > 0),
  entry_unit_id bigint NOT NULL REFERENCES public.units(id) ON DELETE RESTRICT,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, tenant_id),
  FOREIGN KEY (purchase_request_id, tenant_id)
    REFERENCES public.purchase_requests(id, tenant_id) ON DELETE CASCADE
);

CREATE INDEX purchase_requests_queue_idx
  ON public.purchase_requests (tenant_id, branch_id, status, needed_by, id DESC);

CREATE INDEX purchase_request_items_request_idx
  ON public.purchase_request_items (tenant_id, purchase_request_id, id);

ALTER TABLE public.purchase_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_request_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY purchase_requests_select
ON public.purchase_requests
FOR SELECT TO authenticated
USING (
  tenant_id = public.auth_tenant_id()
  AND public.has_permission(branch_id, 'procurement:read')
);

CREATE POLICY purchase_request_items_select
ON public.purchase_request_items
FOR SELECT TO authenticated
USING (
  tenant_id = public.auth_tenant_id()
  AND EXISTS (
    SELECT 1
    FROM public.purchase_requests request
    WHERE request.id = purchase_request_items.purchase_request_id
      AND request.tenant_id = purchase_request_items.tenant_id
      AND public.has_permission(request.branch_id, 'procurement:read')
  )
);

REVOKE ALL ON TABLE
  public.purchase_requests,
  public.purchase_request_items
FROM PUBLIC, anon, authenticated;

GRANT SELECT ON TABLE
  public.purchase_requests,
  public.purchase_request_items
TO authenticated;

GRANT ALL ON TABLE
  public.purchase_requests,
  public.purchase_request_items
TO service_role;

GRANT USAGE, SELECT ON SEQUENCE
  public.purchase_requests_id_seq,
  public.purchase_request_items_id_seq
TO service_role;

-- ---------------------------------------------------------------------------
-- PO/GRN line identity and delivery snapshots
-- ---------------------------------------------------------------------------

ALTER TABLE public.purchase_orders
  ADD CONSTRAINT purchase_orders_id_tenant_key UNIQUE (id, tenant_id);
ALTER TABLE public.purchase_order_items
  ADD CONSTRAINT purchase_order_items_id_tenant_key UNIQUE (id, tenant_id);
ALTER TABLE public.goods_received_notes
  ADD CONSTRAINT goods_received_notes_id_tenant_key UNIQUE (id, tenant_id);
ALTER TABLE public.supplier_invoices
  ADD CONSTRAINT supplier_invoices_id_tenant_key UNIQUE (id, tenant_id);
ALTER TABLE public.supplier_payments
  ADD CONSTRAINT supplier_payments_id_tenant_key UNIQUE (id, tenant_id);
ALTER TABLE public.supplier_credit_notes
  ADD CONSTRAINT supplier_credit_notes_id_tenant_key UNIQUE (id, tenant_id);
ALTER TABLE public.suppliers
  ADD CONSTRAINT suppliers_id_tenant_key UNIQUE (id, tenant_id);

ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS purchase_request_id bigint,
  ADD COLUMN IF NOT EXISTS expected_delivery_date date;

ALTER TABLE public.purchase_orders
  ADD CONSTRAINT purchase_orders_purchase_request_tenant_fkey
  FOREIGN KEY (purchase_request_id, tenant_id)
  REFERENCES public.purchase_requests(id, tenant_id)
  ON DELETE RESTRICT;

CREATE INDEX purchase_orders_purchase_request_idx
  ON public.purchase_orders (tenant_id, purchase_request_id, id)
  WHERE purchase_request_id IS NOT NULL;

ALTER TABLE public.purchase_order_items
  ADD COLUMN IF NOT EXISTS purchase_request_item_id bigint;

ALTER TABLE public.purchase_order_items
  ADD CONSTRAINT purchase_order_items_request_item_tenant_fkey
  FOREIGN KEY (purchase_request_item_id, tenant_id)
  REFERENCES public.purchase_request_items(id, tenant_id)
  ON DELETE RESTRICT;

ALTER TABLE public.purchase_order_items
  DROP CONSTRAINT IF EXISTS
    purchase_order_items_po_id_ingredient_id_tenant_id_key;

CREATE INDEX purchase_order_items_request_item_idx
  ON public.purchase_order_items (tenant_id, purchase_request_item_id)
  WHERE purchase_request_item_id IS NOT NULL;

ALTER TABLE public.goods_received_notes
  ADD COLUMN IF NOT EXISTS expected_receive_date date,
  ADD COLUMN IF NOT EXISTS creation_idempotency_key uuid;

ALTER TABLE public.goods_received_notes
  ALTER COLUMN received_date DROP NOT NULL,
  ALTER COLUMN received_date DROP DEFAULT;

CREATE UNIQUE INDEX goods_received_notes_po_active_draft_uidx
  ON public.goods_received_notes (tenant_id, po_id)
  WHERE status = 'draft' AND po_id IS NOT NULL;

CREATE UNIQUE INDEX goods_received_notes_creation_key_uidx
  ON public.goods_received_notes (tenant_id, creation_idempotency_key)
  WHERE creation_idempotency_key IS NOT NULL;

ALTER TABLE public.grn_items
  ADD COLUMN IF NOT EXISTS purchase_order_item_id bigint,
  ADD COLUMN IF NOT EXISTS po_applied_quantity numeric(15,3) NOT NULL DEFAULT 0;

ALTER TABLE public.grn_items
  ADD CONSTRAINT grn_items_purchase_order_item_tenant_fkey
  FOREIGN KEY (purchase_order_item_id, tenant_id)
  REFERENCES public.purchase_order_items(id, tenant_id)
  ON DELETE RESTRICT,
  ADD CONSTRAINT grn_items_po_applied_non_negative
  CHECK (po_applied_quantity >= 0),
  ADD CONSTRAINT grn_items_po_applied_accepted
  CHECK (
    po_applied_quantity
    <= received_quantity - rejected_quantity
  );

CREATE UNIQUE INDEX grn_items_grn_po_item_uidx
  ON public.grn_items (grn_id, purchase_order_item_id)
  WHERE purchase_order_item_id IS NOT NULL;

GRANT SELECT (
  purchase_request_id,
  expected_delivery_date
) ON public.purchase_orders TO authenticated;

GRANT SELECT (
  purchase_request_item_id
) ON public.purchase_order_items TO authenticated;

GRANT SELECT (
  expected_receive_date,
  creation_idempotency_key
) ON public.goods_received_notes TO authenticated;

GRANT SELECT (
  purchase_order_item_id,
  po_applied_quantity
) ON public.grn_items TO authenticated;

COMMENT ON COLUMN public.goods_received_notes.creation_idempotency_key IS
  'Client intent key for create_grn_draft_from_po. NULL marks legacy rows.';
COMMENT ON COLUMN public.grn_items.po_applied_quantity IS
  'Accepted quantity from this receipt that fulfills the linked PO line. Accepted excess is the remainder and carries zero receipt value.';

-- ---------------------------------------------------------------------------
-- Purchase request and PO creation
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_purchase_request(
  p_branch_id bigint,
  p_needed_by date,
  p_notes text,
  p_lines jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_tenant bigint := public.auth_tenant_id();
  v_request_id bigint;
  v_request_number text;
  v_line_count integer;
BEGIN
  IF v_uid IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  IF p_branch_id IS NULL
     OR jsonb_typeof(p_lines) <> 'array'
     OR jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION 'purchase_request_invalid'
      USING ERRCODE = '22023';
  END IF;
  IF NOT public.has_permission(p_branch_id, 'procurement:grn_create') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.branches branch
    WHERE branch.id = p_branch_id
      AND branch.tenant_id = v_tenant
      AND branch.is_active
      AND branch.branch_kind IN ('central_supply', 'central_kitchen')
  ) THEN
    RAISE EXCEPTION 'purchase_request_central_site_required'
      USING ERRCODE = '23514';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(p_lines)
      AS line(ingredient_id bigint, quantity numeric, entry_unit_id bigint)
    WHERE line.ingredient_id IS NULL
       OR line.entry_unit_id IS NULL
       OR line.quantity IS NULL
       OR line.quantity <= 0
       OR NOT EXISTS (
         SELECT 1
         FROM public.ingredients ingredient
         JOIN public.ingredient_units ingredient_unit
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

  v_request_number :=
    public.next_inventory_doc_number(v_tenant, 'purchase_request');

  INSERT INTO public.purchase_requests (
    tenant_id,
    branch_id,
    request_number,
    status,
    needed_by,
    notes,
    created_by
  )
  VALUES (
    v_tenant,
    p_branch_id,
    v_request_number,
    'draft',
    p_needed_by,
    NULLIF(btrim(p_notes), ''),
    v_uid
  )
  RETURNING id INTO v_request_id;

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

  GET DIAGNOSTICS v_line_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'request_id', v_request_id,
    'request_number', v_request_number,
    'status', 'draft',
    'line_count', v_line_count
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.submit_purchase_request(
  p_request_id bigint
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_tenant bigint := public.auth_tenant_id();
  v_request record;
BEGIN
  IF v_uid IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT request.*
  INTO v_request
  FROM public.purchase_requests request
  WHERE request.id = p_request_id
    AND request.tenant_id = v_tenant
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'purchase_request_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.has_permission(v_request.branch_id, 'procurement:grn_create') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF v_request.status <> 'draft' THEN
    RAISE EXCEPTION 'purchase_request_not_draft' USING ERRCODE = '23514';
  END IF;

  UPDATE public.purchase_requests
  SET status = 'submitted',
      submitted_by = v_uid,
      submitted_at = now(),
      updated_at = now()
  WHERE id = p_request_id
    AND tenant_id = v_tenant;

  RETURN jsonb_build_object(
    'request_id', p_request_id,
    'status', 'submitted'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.create_purchase_order_from_request(
  p_request_id bigint,
  p_supplier_id bigint,
  p_expected_delivery_date date,
  p_notes text,
  p_lines jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_tenant bigint := public.auth_tenant_id();
  v_request record;
  v_po_id bigint;
  v_po_number text;
  v_line_count integer;
  v_all_ordered boolean;
BEGIN
  IF v_uid IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  IF p_supplier_id IS NULL
     OR jsonb_typeof(p_lines) <> 'array'
     OR jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION 'purchase_order_invalid' USING ERRCODE = '22023';
  END IF;

  SELECT request.*
  INTO v_request
  FROM public.purchase_requests request
  WHERE request.id = p_request_id
    AND request.tenant_id = v_tenant
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'purchase_request_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.has_permission(v_request.branch_id, 'procurement:po_create') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF v_request.status NOT IN ('submitted', 'partially_ordered') THEN
    RAISE EXCEPTION 'purchase_request_not_orderable'
      USING ERRCODE = '23514';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.suppliers supplier
    WHERE supplier.id = p_supplier_id
      AND supplier.tenant_id = v_tenant
      AND supplier.is_active
  ) THEN
    RAISE EXCEPTION 'supplier_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(p_lines)
      AS line(
        request_item_id bigint,
        quantity numeric,
        unit_price numeric
      )
    JOIN public.purchase_request_items request_item
      ON request_item.id = line.request_item_id
     AND request_item.tenant_id = v_tenant
     AND request_item.purchase_request_id = p_request_id
    WHERE line.quantity IS NULL
       OR line.quantity <= 0
       OR line.unit_price IS NULL
       OR line.unit_price < 0
       OR line.quantity > (
         request_item.quantity - COALESCE((
           SELECT sum(po_item.quantity)
           FROM public.purchase_order_items po_item
           JOIN public.purchase_orders purchase_order
             ON purchase_order.id = po_item.po_id
            AND purchase_order.tenant_id = po_item.tenant_id
           WHERE po_item.tenant_id = v_tenant
             AND po_item.purchase_request_item_id = request_item.id
             AND purchase_order.status <> 'cancelled'
         ), 0)
       )
  )
  OR (
    SELECT count(*)
    FROM jsonb_to_recordset(p_lines)
      AS line(request_item_id bigint)
  ) <> (
    SELECT count(*)
    FROM jsonb_to_recordset(p_lines)
      AS line(request_item_id bigint)
    JOIN public.purchase_request_items request_item
      ON request_item.id = line.request_item_id
     AND request_item.tenant_id = v_tenant
     AND request_item.purchase_request_id = p_request_id
  )
  OR EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(p_lines)
      AS line(request_item_id bigint, quantity numeric)
    JOIN public.purchase_request_items request_item
      ON request_item.id = line.request_item_id
     AND request_item.tenant_id = v_tenant
     AND request_item.purchase_request_id = p_request_id
    GROUP BY request_item.id, request_item.quantity
    HAVING sum(line.quantity) > (
      request_item.quantity - COALESCE((
        SELECT sum(po_item.quantity)
        FROM public.purchase_order_items po_item
        JOIN public.purchase_orders purchase_order
          ON purchase_order.id = po_item.po_id
         AND purchase_order.tenant_id = po_item.tenant_id
        WHERE po_item.tenant_id = v_tenant
          AND po_item.purchase_request_item_id = request_item.id
          AND purchase_order.status <> 'cancelled'
      ), 0)
    )
  )
  OR EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(p_lines)
      AS line(request_item_id bigint)
    JOIN public.purchase_request_items request_item
      ON request_item.id = line.request_item_id
     AND request_item.tenant_id = v_tenant
     AND request_item.purchase_request_id = p_request_id
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.supplier_items supplier_item
      WHERE supplier_item.tenant_id = v_tenant
        AND supplier_item.supplier_id = p_supplier_id
        AND supplier_item.ingredient_id = request_item.ingredient_id
        AND supplier_item.is_active
    )
  ) THEN
    IF EXISTS (
      SELECT 1
      FROM jsonb_to_recordset(p_lines)
        AS line(request_item_id bigint)
      JOIN public.purchase_request_items request_item
        ON request_item.id = line.request_item_id
       AND request_item.tenant_id = v_tenant
       AND request_item.purchase_request_id = p_request_id
      WHERE NOT EXISTS (
        SELECT 1
        FROM public.supplier_items supplier_item
        WHERE supplier_item.tenant_id = v_tenant
          AND supplier_item.supplier_id = p_supplier_id
          AND supplier_item.ingredient_id = request_item.ingredient_id
          AND supplier_item.is_active
      )
    ) THEN
      RAISE EXCEPTION 'supplier_item_mapping_required'
        USING ERRCODE = '23514';
    END IF;
    RAISE EXCEPTION 'purchase_order_line_invalid'
      USING ERRCODE = '23514';
  END IF;

  v_po_number := public.next_po_display_id(v_tenant);

  INSERT INTO public.purchase_orders (
    tenant_id,
    branch_id,
    supplier_id,
    purchase_request_id,
    po_number,
    display_id,
    status,
    expected_delivery_date,
    notes,
    created_by,
    source_grn_id
  )
  VALUES (
    v_tenant,
    v_request.branch_id,
    p_supplier_id,
    p_request_id,
    v_po_number,
    v_po_number,
    'draft',
    p_expected_delivery_date,
    NULLIF(btrim(p_notes), ''),
    v_uid,
    NULL
  )
  RETURNING id INTO v_po_id;

  INSERT INTO public.purchase_order_items (
    tenant_id,
    po_id,
    purchase_request_item_id,
    ingredient_id,
    quantity,
    unit_price_est,
    line_total,
    entry_unit_id
  )
  SELECT
    v_tenant,
    v_po_id,
    request_item.id,
    request_item.ingredient_id,
    line.quantity::numeric(15,3),
    line.unit_price::numeric(15,2),
    round(line.quantity * line.unit_price, 2),
    request_item.entry_unit_id
  FROM jsonb_to_recordset(p_lines)
    AS line(
      request_item_id bigint,
      quantity numeric,
      unit_price numeric
    )
  JOIN public.purchase_request_items request_item
    ON request_item.id = line.request_item_id
   AND request_item.tenant_id = v_tenant
   AND request_item.purchase_request_id = p_request_id;

  GET DIAGNOSTICS v_line_count = ROW_COUNT;

  SELECT bool_and(
    COALESCE(ordered.quantity, 0) >= request_item.quantity
  )
  INTO v_all_ordered
  FROM public.purchase_request_items request_item
  LEFT JOIN LATERAL (
    SELECT sum(po_item.quantity) AS quantity
    FROM public.purchase_order_items po_item
    JOIN public.purchase_orders purchase_order
      ON purchase_order.id = po_item.po_id
     AND purchase_order.tenant_id = po_item.tenant_id
    WHERE po_item.tenant_id = v_tenant
      AND po_item.purchase_request_item_id = request_item.id
      AND purchase_order.status <> 'cancelled'
  ) ordered ON TRUE
  WHERE request_item.purchase_request_id = p_request_id
    AND request_item.tenant_id = v_tenant;

  UPDATE public.purchase_requests
  SET status = CASE
        WHEN COALESCE(v_all_ordered, FALSE) THEN 'ordered'
        ELSE 'partially_ordered'
      END,
      updated_at = now()
  WHERE id = p_request_id
    AND tenant_id = v_tenant;

  RETURN jsonb_build_object(
    'po_id', v_po_id,
    'po_number', v_po_number,
    'status', 'draft',
    'line_count', v_line_count
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.create_purchase_orders_from_request(
  p_request_id bigint,
  p_orders jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_order jsonb;
  v_result jsonb;
  v_results jsonb := '[]'::jsonb;
BEGIN
  IF jsonb_typeof(p_orders) <> 'array'
     OR jsonb_array_length(p_orders) = 0
     OR jsonb_array_length(p_orders) > 100 THEN
    RAISE EXCEPTION 'purchase_orders_invalid'
      USING ERRCODE = '22023';
  END IF;
  IF (
    SELECT count(*) <> count(DISTINCT order_row.supplier_id)
    FROM jsonb_to_recordset(p_orders)
      AS order_row(supplier_id bigint)
  ) THEN
    RAISE EXCEPTION 'purchase_orders_duplicate_supplier'
      USING ERRCODE = '22023';
  END IF;

  FOR v_order IN
    SELECT value
    FROM jsonb_array_elements(p_orders)
  LOOP
    v_result := public.create_purchase_order_from_request(
      p_request_id,
      (v_order ->> 'supplier_id')::bigint,
      NULLIF(v_order ->> 'expected_delivery_date', '')::date,
      COALESCE(v_order ->> 'notes', ''),
      v_order -> 'lines'
    );
    v_results := v_results || jsonb_build_array(v_result);
  END LOOP;

  RETURN jsonb_build_object('purchase_orders', v_results);
END;
$$;

REVOKE ALL ON FUNCTION
  public.create_purchase_request(bigint, date, text, jsonb),
  public.submit_purchase_request(bigint),
  public.create_purchase_order_from_request(bigint, bigint, date, text, jsonb),
  public.create_purchase_orders_from_request(bigint, jsonb)
FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION
  public.create_purchase_request(bigint, date, text, jsonb),
  public.submit_purchase_request(bigint),
  public.create_purchase_order_from_request(bigint, bigint, date, text, jsonb),
  public.create_purchase_orders_from_request(bigint, jsonb)
TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Zero-price PO support
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.update_purchase_order_prices(
  p_po_id bigint,
  p_lines jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_tenant bigint := public.auth_tenant_id();
  v_po record;
  v_input_count integer;
  v_distinct_count integer;
  v_expected_count integer;
  v_updated_count integer;
BEGIN
  IF auth.uid() IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT purchase_order.*
  INTO v_po
  FROM public.purchase_orders purchase_order
  WHERE purchase_order.id = p_po_id
    AND purchase_order.tenant_id = v_tenant
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'purchase_order_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.has_permission(v_po.branch_id, 'procurement:po_create') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF v_po.status <> 'draft'
     OR jsonb_typeof(p_lines) <> 'array' THEN
    RAISE EXCEPTION 'purchase_order_not_editable' USING ERRCODE = '23514';
  END IF;

  SELECT count(*), count(DISTINCT line_id)
  INTO v_input_count, v_distinct_count
  FROM jsonb_to_recordset(p_lines)
    AS line(line_id bigint, unit_price numeric);

  SELECT count(*)
  INTO v_expected_count
  FROM public.purchase_order_items item
  WHERE item.tenant_id = v_tenant
    AND item.po_id = p_po_id;

  IF v_input_count <> v_distinct_count
     OR v_input_count <> v_expected_count
     OR EXISTS (
       SELECT 1
       FROM jsonb_to_recordset(p_lines)
         AS line(line_id bigint, unit_price numeric)
       LEFT JOIN public.purchase_order_items item
         ON item.id = line.line_id
        AND item.tenant_id = v_tenant
        AND item.po_id = p_po_id
       WHERE item.id IS NULL
          OR line.unit_price IS NULL
          OR line.unit_price < 0
     ) THEN
    RAISE EXCEPTION 'purchase_order_price_lines_invalid'
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.purchase_order_items item
  SET unit_price_est = line.unit_price,
      line_total = round(item.quantity * line.unit_price, 2)
  FROM jsonb_to_recordset(p_lines)
    AS line(line_id bigint, unit_price numeric)
  WHERE item.id = line.line_id
    AND item.tenant_id = v_tenant
    AND item.po_id = p_po_id;

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'id', p_po_id,
    'updated_lines', v_updated_count
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.update_purchase_order_prices_protected(
  p_po_id bigint,
  p_lines jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  IF NOT public.can_read_inventory_monetary(
    'procurement:price_list_read'
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  RETURN public.update_purchase_order_prices(p_po_id, p_lines);
END;
$$;

CREATE OR REPLACE FUNCTION public.approve_purchase_order(
  p_po_id bigint
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_tenant bigint := public.auth_tenant_id();
  v_po record;
  v_synced_lines integer := 0;
BEGIN
  IF v_uid IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT purchase_order.*
  INTO v_po
  FROM public.purchase_orders purchase_order
  WHERE purchase_order.id = p_po_id
    AND purchase_order.tenant_id = v_tenant
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'purchase_order_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.has_permission(v_po.branch_id, 'procurement:po_approve') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF v_po.status <> 'draft' THEN
    RAISE EXCEPTION 'purchase_order_not_draft' USING ERRCODE = '23514';
  END IF;
  IF v_po.purchase_request_id IS NULL
     AND v_po.source_grn_id IS NULL THEN
    RAISE EXCEPTION 'purchase_order_source_required'
      USING ERRCODE = '23514';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.purchase_order_items item
    WHERE item.po_id = p_po_id
      AND item.tenant_id = v_tenant
  )
  OR EXISTS (
    SELECT 1
    FROM public.purchase_order_items item
    WHERE item.po_id = p_po_id
      AND item.tenant_id = v_tenant
      AND (
        item.quantity <= 0
        OR item.unit_price_est IS NULL
        OR item.unit_price_est < 0
      )
  ) THEN
    RAISE EXCEPTION 'purchase_order_lines_incomplete'
      USING ERRCODE = '23514';
  END IF;

  UPDATE public.purchase_order_items
  SET line_total = round(quantity * unit_price_est, 2)
  WHERE po_id = p_po_id
    AND tenant_id = v_tenant;

  -- Compatibility only: price an existing retrospective draft GRN.
  WITH synced AS (
    UPDATE public.grn_items grn_item
    SET unit_cost = po_item.unit_price_est,
        total_cost = round(
          (grn_item.received_quantity - grn_item.rejected_quantity)
          * po_item.unit_price_est,
          2
        )
    FROM public.purchase_order_items po_item
    WHERE v_po.source_grn_id IS NOT NULL
      AND grn_item.grn_id = v_po.source_grn_id
      AND grn_item.tenant_id = v_tenant
      AND po_item.po_id = p_po_id
      AND po_item.tenant_id = v_tenant
      AND po_item.ingredient_id = grn_item.ingredient_id
      AND po_item.entry_unit_id IS NOT DISTINCT FROM grn_item.entry_unit_id
    RETURNING grn_item.id
  )
  SELECT count(*)::integer
  INTO v_synced_lines
  FROM synced;

  UPDATE public.purchase_orders
  SET status = 'sent',
      ordered_at = now(),
      updated_at = now()
  WHERE id = p_po_id
    AND tenant_id = v_tenant;

  RETURN jsonb_build_object(
    'id', p_po_id,
    'status', 'sent',
    'grn_unit_cost_synced_lines', v_synced_lines
  );
END;
$$;

REVOKE ALL ON FUNCTION
  public.update_purchase_order_prices(bigint, jsonb),
  public.update_purchase_order_prices_protected(bigint, jsonb),
  public.approve_purchase_order(bigint)
FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION
  public.update_purchase_order_prices_protected(bigint, jsonb),
  public.approve_purchase_order(bigint)
TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION
  public.update_purchase_order_prices(bigint, jsonb)
TO service_role;

-- ---------------------------------------------------------------------------
-- PO -> one active GRN draft
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.enforce_retrospective_grn_immutability()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $$
DECLARE
  v_po record;
  v_trusted boolean;
BEGIN
  SELECT CURRENT_USER = pg_catalog.pg_get_userbyid(relation.relowner)
  INTO v_trusted
  FROM pg_catalog.pg_class relation
  WHERE relation.oid =
    'public.goods_received_notes'::pg_catalog.regclass;

  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'draft' THEN
      RAISE EXCEPTION 'grn_must_start_as_draft'
        USING ERRCODE = '23514';
    END IF;
    IF NEW.creation_idempotency_key IS NOT NULL
       AND (
         v_trusted IS DISTINCT FROM TRUE
         OR COALESCE(
           current_setting('comtammatu.po_first_grn_insert', TRUE),
           'false'
         ) <> 'true'
       ) THEN
      RAISE EXCEPTION 'grn_insert_requires_rpc'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'grn_delete_forbidden' USING ERRCODE = '23514';
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
     OR NEW.branch_id IS DISTINCT FROM OLD.branch_id
     OR NEW.po_id IS DISTINCT FROM OLD.po_id
     OR NEW.supplier_id IS DISTINCT FROM OLD.supplier_id
     OR NEW.grn_number IS DISTINCT FROM OLD.grn_number
     OR NEW.location_id IS DISTINCT FROM OLD.location_id
     OR NEW.creation_idempotency_key IS DISTINCT FROM
       OLD.creation_idempotency_key THEN
    RAISE EXCEPTION 'grn_identity_immutable' USING ERRCODE = '23514';
  END IF;

  IF OLD.status = 'draft'
     AND NEW.status IN ('draft', 'confirmed', 'cancelled') THEN
    IF NEW.po_id IS NOT NULL THEN
      SELECT purchase_order.*
      INTO v_po
      FROM public.purchase_orders purchase_order
      WHERE purchase_order.id = NEW.po_id
        AND purchase_order.tenant_id = NEW.tenant_id;

      IF NOT FOUND
         OR v_po.branch_id <> NEW.branch_id
         OR v_po.supplier_id <> NEW.supplier_id THEN
        RAISE EXCEPTION 'grn_po_mismatch' USING ERRCODE = '23514';
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'grn_status_transition_invalid' USING ERRCODE = '23514';
END;
$$;

CREATE OR REPLACE FUNCTION private.enforce_linked_grn_line_immutability()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $$
DECLARE
  v_grn record;
  v_po_item record;
  v_confirming boolean :=
    COALESCE(
      current_setting('comtammatu.grn_confirm', TRUE),
      'false'
    ) = 'true';
BEGIN
  SELECT grn.*
  INTO v_grn
  FROM public.goods_received_notes grn
  WHERE grn.id = COALESCE(NEW.grn_id, OLD.grn_id)
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'grn_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_grn.creation_idempotency_key IS NULL THEN
    IF v_grn.status = 'draft' OR v_confirming THEN
      RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
    END IF;
    RAISE EXCEPTION 'legacy_grn_lines_immutable' USING ERRCODE = '23514';
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF v_grn.status = 'draft' THEN
      RETURN OLD;
    END IF;
    RAISE EXCEPTION 'confirmed_grn_lines_immutable' USING ERRCODE = '23514';
  END IF;

  IF TG_OP = 'UPDATE'
     AND (
       NEW.id IS DISTINCT FROM OLD.id
       OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
       OR NEW.grn_id IS DISTINCT FROM OLD.grn_id
       OR NEW.purchase_order_item_id IS DISTINCT FROM
         OLD.purchase_order_item_id
       OR NEW.ingredient_id IS DISTINCT FROM OLD.ingredient_id
       OR NEW.entry_unit_id IS DISTINCT FROM OLD.entry_unit_id
       OR NEW.supplier_id IS DISTINCT FROM OLD.supplier_id
     ) THEN
    RAISE EXCEPTION 'grn_line_identity_immutable' USING ERRCODE = '23514';
  END IF;

  SELECT po_item.*, purchase_order.supplier_id
  INTO v_po_item
  FROM public.purchase_order_items po_item
  JOIN public.purchase_orders purchase_order
    ON purchase_order.id = po_item.po_id
   AND purchase_order.tenant_id = po_item.tenant_id
  WHERE po_item.id = NEW.purchase_order_item_id
    AND po_item.tenant_id = v_grn.tenant_id
    AND po_item.po_id = v_grn.po_id;

  IF NOT FOUND
     OR NEW.ingredient_id <> v_po_item.ingredient_id
     OR NEW.entry_unit_id IS DISTINCT FROM v_po_item.entry_unit_id
     OR NEW.supplier_id <> v_po_item.supplier_id THEN
    RAISE EXCEPTION 'grn_line_po_mismatch' USING ERRCODE = '23514';
  END IF;

  IF v_confirming THEN
    RETURN NEW;
  END IF;
  IF v_grn.status <> 'draft' THEN
    RAISE EXCEPTION 'confirmed_grn_lines_immutable' USING ERRCODE = '23514';
  END IF;

  NEW.unit_cost := v_po_item.unit_price_est;
  NEW.total_cost := 0;
  NEW.po_applied_quantity := 0;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_grn_draft_from_po(
  p_po_id bigint,
  p_idempotency_key uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_tenant bigint := public.auth_tenant_id();
  v_po record;
  v_existing record;
  v_location_id bigint;
  v_grn_id bigint;
  v_grn_number text;
  v_line_count integer;
BEGIN
  IF v_uid IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  IF p_po_id IS NULL OR p_idempotency_key IS NULL THEN
    RAISE EXCEPTION 'grn_create_invalid' USING ERRCODE = '22023';
  END IF;

  SELECT grn.id, grn.grn_number, grn.status
  INTO v_existing
  FROM public.goods_received_notes grn
  WHERE grn.tenant_id = v_tenant
    AND grn.creation_idempotency_key = p_idempotency_key;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'grn_id', v_existing.id,
      'grn_number', v_existing.grn_number,
      'status', v_existing.status
    );
  END IF;

  SELECT purchase_order.*
  INTO v_po
  FROM public.purchase_orders purchase_order
  WHERE purchase_order.id = p_po_id
    AND purchase_order.tenant_id = v_tenant
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'purchase_order_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.has_permission(v_po.branch_id, 'procurement:grn_create') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF v_po.purchase_request_id IS NULL THEN
    RAISE EXCEPTION 'legacy_po_not_receivable_in_new_flow'
      USING ERRCODE = '23514';
  END IF;
  IF v_po.status NOT IN ('sent', 'partially_received') THEN
    RAISE EXCEPTION 'purchase_order_not_receivable'
      USING ERRCODE = '23514';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.goods_received_notes grn
    WHERE grn.tenant_id = v_tenant
      AND grn.po_id = p_po_id
      AND grn.status = 'draft'
  ) THEN
    RAISE EXCEPTION 'purchase_order_has_active_grn'
      USING ERRCODE = '23505';
  END IF;

  SELECT location.id
  INTO v_location_id
  FROM public.inventory_locations location
  WHERE location.tenant_id = v_tenant
    AND location.branch_id = v_po.branch_id
    AND location.location_kind = 'warehouse'
    AND location.is_active
    AND location.is_default_receive
  ORDER BY location.id
  LIMIT 1;

  IF v_location_id IS NULL THEN
    RAISE EXCEPTION 'receiving_warehouse_required'
      USING ERRCODE = 'P0002';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.purchase_order_items po_item
    LEFT JOIN LATERAL (
      SELECT sum(grn_item.po_applied_quantity) AS quantity
      FROM public.grn_items grn_item
      JOIN public.goods_received_notes grn
        ON grn.id = grn_item.grn_id
       AND grn.tenant_id = grn_item.tenant_id
      WHERE grn_item.tenant_id = v_tenant
        AND grn_item.purchase_order_item_id = po_item.id
        AND grn.status = 'confirmed'
    ) received ON TRUE
    WHERE po_item.po_id = p_po_id
      AND po_item.tenant_id = v_tenant
      AND po_item.quantity > COALESCE(received.quantity, 0)
  ) THEN
    RAISE EXCEPTION 'purchase_order_fully_received'
      USING ERRCODE = '02000';
  END IF;

  v_grn_number := public.next_inventory_doc_number(v_tenant, 'grn');
  PERFORM set_config('comtammatu.po_first_grn_insert', 'true', TRUE);

  INSERT INTO public.goods_received_notes (
    tenant_id,
    branch_id,
    po_id,
    supplier_id,
    grn_number,
    received_date,
    expected_receive_date,
    status,
    notes,
    created_by,
    location_id,
    creation_idempotency_key
  )
  VALUES (
    v_tenant,
    v_po.branch_id,
    v_po.id,
    v_po.supplier_id,
    v_grn_number,
    NULL,
    v_po.expected_delivery_date,
    'draft',
    NULL,
    v_uid,
    v_location_id,
    p_idempotency_key
  )
  RETURNING id INTO v_grn_id;

  INSERT INTO public.grn_items (
    tenant_id,
    grn_id,
    ingredient_id,
    supplier_id,
    purchase_order_item_id,
    received_quantity,
    rejected_quantity,
    rejection_reason,
    rejected_photo_url,
    entry_unit_id,
    unit_cost,
    total_cost,
    po_applied_quantity
  )
  SELECT
    v_tenant,
    v_grn_id,
    po_item.ingredient_id,
    v_po.supplier_id,
    po_item.id,
    0,
    0,
    NULL,
    NULL,
    po_item.entry_unit_id,
    po_item.unit_price_est,
    0,
    0
  FROM public.purchase_order_items po_item
  LEFT JOIN LATERAL (
    SELECT sum(grn_item.po_applied_quantity) AS quantity
    FROM public.grn_items grn_item
    JOIN public.goods_received_notes grn
      ON grn.id = grn_item.grn_id
     AND grn.tenant_id = grn_item.tenant_id
    WHERE grn_item.tenant_id = v_tenant
      AND grn_item.purchase_order_item_id = po_item.id
      AND grn.status = 'confirmed'
  ) received ON TRUE
  WHERE po_item.po_id = p_po_id
    AND po_item.tenant_id = v_tenant
    AND po_item.quantity > COALESCE(received.quantity, 0)
  ORDER BY po_item.id;

  GET DIAGNOSTICS v_line_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'grn_id', v_grn_id,
    'grn_number', v_grn_number,
    'status', 'draft',
    'line_count', v_line_count
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_grn_draft_from_po(bigint, uuid)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_grn_draft_from_po(bigint, uuid)
TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Atomic receipt confirmation with applied/excess split
-- ---------------------------------------------------------------------------

ALTER FUNCTION public.confirm_goods_receipt_note(bigint)
  RENAME TO confirm_goods_receipt_note_legacy;

CREATE OR REPLACE FUNCTION public.confirm_goods_receipt_note(
  p_grn_id bigint
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_tenant bigint := public.auth_tenant_id();
  v_grn record;
  v_po record;
  v_item record;
  v_old_quantity numeric(15,3);
  v_old_wac numeric(15,2);
  v_accepted numeric(15,3);
  v_applied numeric(15,3);
  v_excess numeric(15,3);
  v_previously_applied numeric(15,3);
  v_remaining numeric(15,3);
  v_applied_base numeric(15,3);
  v_excess_base numeric(15,3);
  v_total_base numeric(15,3);
  v_applied_money numeric(15,2);
  v_applied_cost_base numeric(15,2);
  v_new_quantity numeric(15,3);
  v_new_wac numeric(15,2);
  v_po_complete boolean;
  v_po_status text;
BEGIN
  IF v_uid IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT grn.*
  INTO v_grn
  FROM public.goods_received_notes grn
  WHERE grn.id = p_grn_id
    AND grn.tenant_id = v_tenant
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'grn_not_found' USING ERRCODE = 'P0002';
  END IF;

  -- Existing retrospective GRNs remain on the compatibility contract.
  IF v_grn.creation_idempotency_key IS NULL THEN
    RETURN public.confirm_goods_receipt_note_legacy(p_grn_id);
  END IF;
  IF NOT public.has_permission(v_grn.branch_id, 'procurement:grn_confirm') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF v_grn.status <> 'draft' THEN
    RAISE EXCEPTION 'grn_not_draft' USING ERRCODE = '23514';
  END IF;

  SELECT purchase_order.*
  INTO v_po
  FROM public.purchase_orders purchase_order
  WHERE purchase_order.id = v_grn.po_id
    AND purchase_order.tenant_id = v_tenant
  FOR UPDATE;

  IF NOT FOUND
     OR v_po.status NOT IN ('sent', 'partially_received')
     OR v_po.supplier_id <> v_grn.supplier_id
     OR v_po.branch_id <> v_grn.branch_id THEN
    RAISE EXCEPTION 'grn_purchase_order_invalid'
      USING ERRCODE = '23514';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.grn_items item
    WHERE item.grn_id = p_grn_id
      AND item.tenant_id = v_tenant
      AND (
        item.received_quantity < 0
        OR item.rejected_quantity < 0
        OR item.rejected_quantity > item.received_quantity
        OR (
          item.rejected_quantity > 0
          AND (
            NULLIF(btrim(item.rejection_reason), '') IS NULL
            OR NOT private.grn_rejection_photo_exists(
              item.tenant_id,
              item.grn_id,
              item.id,
              item.rejected_photo_url
            )
          )
        )
      )
  ) THEN
    RAISE EXCEPTION 'grn_physical_qc_incomplete'
      USING ERRCODE = '23514';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.grn_items item
    WHERE item.grn_id = p_grn_id
      AND item.tenant_id = v_tenant
      AND item.received_quantity - item.rejected_quantity > 0
  ) THEN
    RAISE EXCEPTION 'grn_has_no_accepted_quantity'
      USING ERRCODE = '23514';
  END IF;

  PERFORM 1
  FROM public.purchase_order_items po_item
  WHERE po_item.po_id = v_po.id
    AND po_item.tenant_id = v_tenant
  ORDER BY po_item.id
  FOR UPDATE;

  PERFORM set_config('comtammatu.grn_confirm', 'true', TRUE);

  FOR v_item IN
    SELECT
      grn_item.*,
      po_item.quantity AS ordered_quantity,
      po_item.unit_price_est
    FROM public.grn_items grn_item
    JOIN public.purchase_order_items po_item
      ON po_item.id = grn_item.purchase_order_item_id
     AND po_item.tenant_id = grn_item.tenant_id
     AND po_item.po_id = v_po.id
    WHERE grn_item.grn_id = p_grn_id
      AND grn_item.tenant_id = v_tenant
    ORDER BY grn_item.id
    FOR UPDATE OF grn_item
  LOOP
    v_accepted := v_item.received_quantity - v_item.rejected_quantity;

    SELECT COALESCE(sum(previous_item.po_applied_quantity), 0)
    INTO v_previously_applied
    FROM public.grn_items previous_item
    JOIN public.goods_received_notes previous_grn
      ON previous_grn.id = previous_item.grn_id
     AND previous_grn.tenant_id = previous_item.tenant_id
    WHERE previous_item.tenant_id = v_tenant
      AND previous_item.purchase_order_item_id =
        v_item.purchase_order_item_id
      AND previous_grn.status = 'confirmed';

    v_remaining := greatest(
      v_item.ordered_quantity - v_previously_applied,
      0
    );
    v_applied := least(v_accepted, v_remaining);
    v_excess := greatest(v_accepted - v_remaining, 0);
    v_applied_base := public.inv_to_base(
      v_item.ingredient_id,
      v_item.entry_unit_id,
      v_applied
    );
    v_excess_base := public.inv_to_base(
      v_item.ingredient_id,
      v_item.entry_unit_id,
      v_excess
    );
    v_total_base := v_applied_base + v_excess_base;
    v_applied_money := round(v_applied * v_item.unit_price_est, 2);
    v_applied_cost_base := CASE
      WHEN v_applied_base > 0
        THEN round(v_applied_money / v_applied_base, 2)
      ELSE 0
    END;

    SELECT stock.current_quantity, stock.avg_unit_cost
    INTO v_old_quantity, v_old_wac
    FROM public.stock_levels stock
    WHERE stock.tenant_id = v_tenant
      AND stock.branch_id = v_grn.branch_id
      AND stock.location_id = v_grn.location_id
      AND stock.ingredient_id = v_item.ingredient_id
    FOR UPDATE;

    IF NOT FOUND THEN
      v_old_quantity := 0;
      v_old_wac := NULL;
    END IF;

    IF v_applied > 0 THEN
      INSERT INTO public.stock_movements (
        tenant_id,
        branch_id,
        ingredient_id,
        type,
        quantity_change,
        reason,
        created_by,
        grn_id,
        unit_cost,
        location_id,
        entry_unit_id,
        entry_quantity
      )
      VALUES (
        v_tenant,
        v_grn.branch_id,
        v_item.ingredient_id,
        'grn_receipt',
        v_applied_base,
        'GRN ' || v_grn.grn_number,
        v_uid,
        p_grn_id,
        v_applied_cost_base,
        v_grn.location_id,
        v_item.entry_unit_id,
        v_applied
      );
    END IF;

    IF v_excess > 0 THEN
      INSERT INTO public.stock_movements (
        tenant_id,
        branch_id,
        ingredient_id,
        type,
        quantity_change,
        reason,
        created_by,
        grn_id,
        unit_cost,
        location_id,
        entry_unit_id,
        entry_quantity
      )
      VALUES (
        v_tenant,
        v_grn.branch_id,
        v_item.ingredient_id,
        'grn_receipt',
        v_excess_base,
        'GRN ' || v_grn.grn_number || ' excess',
        v_uid,
        p_grn_id,
        0,
        v_grn.location_id,
        v_item.entry_unit_id,
        v_excess
      );
    END IF;

    v_new_quantity := COALESCE(v_old_quantity, 0) + v_total_base;
    v_new_wac := CASE
      WHEN v_new_quantity > 0 THEN (
        COALESCE(v_old_quantity, 0) * COALESCE(v_old_wac, 0)
        + v_applied_money
      ) / v_new_quantity
      ELSE COALESCE(v_old_wac, 0)
    END;

    UPDATE public.stock_levels stock
    SET avg_unit_cost = v_new_wac,
        updated_at = now()
    WHERE stock.tenant_id = v_tenant
      AND stock.branch_id = v_grn.branch_id
      AND stock.location_id = v_grn.location_id
      AND stock.ingredient_id = v_item.ingredient_id;

    UPDATE public.grn_items
    SET po_applied_quantity = v_applied,
        unit_cost = v_item.unit_price_est,
        total_cost = v_applied_money
    WHERE id = v_item.id
      AND tenant_id = v_tenant;
  END LOOP;

  UPDATE public.goods_received_notes
  SET status = 'confirmed',
      received_date = now(),
      received_by = v_uid,
      updated_at = now()
  WHERE id = p_grn_id
    AND tenant_id = v_tenant;

  SELECT bool_and(
    COALESCE(received.quantity, 0) >= po_item.quantity
  )
  INTO v_po_complete
  FROM public.purchase_order_items po_item
  LEFT JOIN LATERAL (
    SELECT sum(grn_item.po_applied_quantity) AS quantity
    FROM public.grn_items grn_item
    JOIN public.goods_received_notes grn
      ON grn.id = grn_item.grn_id
     AND grn.tenant_id = grn_item.tenant_id
    WHERE grn_item.tenant_id = v_tenant
      AND grn_item.purchase_order_item_id = po_item.id
      AND grn.status = 'confirmed'
  ) received ON TRUE
  WHERE po_item.po_id = v_po.id
    AND po_item.tenant_id = v_tenant;

  v_po_status := CASE
    WHEN COALESCE(v_po_complete, FALSE) THEN 'received'
    ELSE 'partially_received'
  END;

  UPDATE public.purchase_orders
  SET status = v_po_status,
      updated_at = now()
  WHERE id = v_po.id
    AND tenant_id = v_tenant;

  RETURN jsonb_build_object(
    'grn_id', p_grn_id,
    'status', 'confirmed',
    'po_id', v_po.id,
    'po_status', v_po_status
  );
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_goods_receipt_note(bigint)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirm_goods_receipt_note(bigint)
TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.confirm_goods_receipt_note_legacy(bigint)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirm_goods_receipt_note_legacy(bigint)
TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.list_goods_receipt_notes(
  p_query text DEFAULT NULL,
  p_status text DEFAULT 'draft',
  p_supplier_id bigint DEFAULT NULL,
  p_date_field text DEFAULT 'expected',
  p_date_from date DEFAULT NULL,
  p_date_to date DEFAULT NULL,
  p_po_id bigint DEFAULT NULL,
  p_purchase_request_id bigint DEFAULT NULL,
  p_branch_id bigint DEFAULT NULL,
  p_limit integer DEFAULT 100,
  p_offset integer DEFAULT 0
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_tenant bigint := public.auth_tenant_id();
  v_can_money boolean;
  v_rows jsonb;
  v_total bigint;
BEGIN
  IF auth.uid() IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  IF p_status NOT IN ('draft', 'confirmed', 'cancelled', 'all')
     OR p_date_field NOT IN ('expected', 'received')
     OR p_limit NOT BETWEEN 1 AND 200
     OR p_offset < 0 THEN
    RAISE EXCEPTION 'grn_list_filter_invalid' USING ERRCODE = '22023';
  END IF;

  v_can_money := public.can_read_inventory_monetary(
    'procurement:price_list_read'
  );

  WITH filtered AS (
    SELECT
      grn.*,
      purchase_order.po_number,
      purchase_order.display_id,
      purchase_order.supplier_id AS list_supplier_id,
      purchase_order.purchase_request_id,
      request.request_number,
      supplier.name AS supplier_name,
      branch.name AS receiving_site_name,
      profile.full_name AS handled_by,
      metrics.line_count,
      metrics.completed_line_count,
      metrics.shortage_line_count,
      metrics.excess_line_count,
      metrics.rejected_line_count,
      metrics.receipt_value,
      invoice.id AS invoice_id,
      invoice.matching_status AS invoice_status
    FROM public.goods_received_notes grn
    JOIN public.purchase_orders purchase_order
      ON purchase_order.id = grn.po_id
     AND purchase_order.tenant_id = grn.tenant_id
    LEFT JOIN public.purchase_requests request
      ON request.id = purchase_order.purchase_request_id
     AND request.tenant_id = purchase_order.tenant_id
    JOIN public.suppliers supplier
      ON supplier.id = purchase_order.supplier_id
     AND supplier.tenant_id = purchase_order.tenant_id
    JOIN public.branches branch
      ON branch.id = grn.branch_id
     AND branch.tenant_id = grn.tenant_id
    LEFT JOIN public.profiles profile
      ON profile.id = COALESCE(grn.received_by, grn.created_by)
     AND profile.tenant_id = grn.tenant_id
    LEFT JOIN LATERAL (
      SELECT
        count(*)::integer AS line_count,
        count(*) FILTER (
          WHERE item.received_quantity - item.rejected_quantity > 0
        )::integer AS completed_line_count,
        count(*) FILTER (
          WHERE grn.status = 'confirmed'
            AND item.po_applied_quantity < greatest(
              po_item.quantity - COALESCE((
                SELECT sum(previous_item.po_applied_quantity)
                FROM public.grn_items previous_item
                JOIN public.goods_received_notes previous_grn
                  ON previous_grn.id = previous_item.grn_id
                 AND previous_grn.tenant_id = previous_item.tenant_id
                WHERE previous_item.tenant_id = item.tenant_id
                  AND previous_item.purchase_order_item_id =
                    item.purchase_order_item_id
                  AND previous_grn.status = 'confirmed'
                  AND previous_grn.id <> grn.id
              ), 0),
              0
            )
        )::integer AS shortage_line_count,
        count(*) FILTER (
          WHERE item.received_quantity - item.rejected_quantity
            > item.po_applied_quantity
        )::integer AS excess_line_count,
        count(*) FILTER (
          WHERE item.rejected_quantity > 0
        )::integer AS rejected_line_count,
        COALESCE(sum(item.total_cost), 0)::numeric(15,2)
          AS receipt_value
      FROM public.grn_items item
      LEFT JOIN public.purchase_order_items po_item
        ON po_item.id = item.purchase_order_item_id
       AND po_item.tenant_id = item.tenant_id
      WHERE item.grn_id = grn.id
        AND item.tenant_id = grn.tenant_id
    ) metrics ON TRUE
    LEFT JOIN LATERAL (
      SELECT matched_invoice.id, matched_invoice.matching_status
      FROM public.supplier_invoices matched_invoice
      WHERE matched_invoice.tenant_id = grn.tenant_id
        AND (
          matched_invoice.grn_id = grn.id
          OR EXISTS (
            SELECT 1
            FROM public.supplier_invoice_receipt_allocations allocation
            WHERE allocation.tenant_id = grn.tenant_id
              AND allocation.supplier_invoice_id = matched_invoice.id
              AND allocation.grn_id = grn.id
          )
        )
      ORDER BY matched_invoice.id DESC
      LIMIT 1
    ) invoice ON TRUE
    WHERE grn.tenant_id = v_tenant
      AND public.has_permission(grn.branch_id, 'procurement:read')
      AND (p_branch_id IS NULL OR grn.branch_id = p_branch_id)
      AND (p_status = 'all' OR grn.status = p_status)
      AND (p_supplier_id IS NULL OR purchase_order.supplier_id = p_supplier_id)
      AND (p_po_id IS NULL OR purchase_order.id = p_po_id)
      AND (
        p_purchase_request_id IS NULL
        OR purchase_order.purchase_request_id = p_purchase_request_id
      )
      AND (
        p_date_from IS NULL
        OR CASE p_date_field
          WHEN 'expected' THEN grn.expected_receive_date >= p_date_from
          ELSE grn.received_date::date >= p_date_from
        END
      )
      AND (
        p_date_to IS NULL
        OR CASE p_date_field
          WHEN 'expected' THEN grn.expected_receive_date <= p_date_to
          ELSE grn.received_date::date <= p_date_to
        END
      )
      AND (
        NULLIF(btrim(p_query), '') IS NULL
        OR grn.grn_number ILIKE '%' || btrim(p_query) || '%'
        OR purchase_order.po_number ILIKE '%' || btrim(p_query) || '%'
        OR purchase_order.display_id ILIKE '%' || btrim(p_query) || '%'
        OR request.request_number ILIKE '%' || btrim(p_query) || '%'
        OR supplier.name ILIKE '%' || btrim(p_query) || '%'
      )
  ),
  counted AS (
    SELECT count(*)::bigint AS total
    FROM filtered
  ),
  paged AS (
    SELECT *
    FROM filtered
    ORDER BY
      CASE WHEN status = 'draft' THEN 0 ELSE 1 END,
      expected_receive_date ASC NULLS LAST,
      updated_at DESC,
      id DESC
    LIMIT p_limit
    OFFSET p_offset
  )
  SELECT
    COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'id', paged.id,
          'code', paged.grn_number,
          'status', paged.status,
          'supplierId', paged.list_supplier_id,
          'supplierName', paged.supplier_name,
          'poId', paged.po_id,
          'poCode', COALESCE(paged.display_id, paged.po_number),
          'purchaseRequestId', paged.purchase_request_id,
          'purchaseRequestCode', paged.request_number,
          'receivingSiteId', paged.branch_id,
          'receivingSiteName', paged.receiving_site_name,
          'expectedReceiveDate', paged.expected_receive_date,
          'receivedDate', paged.received_date,
          'lineCount', paged.line_count,
          'completedLineCount', paged.completed_line_count,
          'shortageLineCount', paged.shortage_line_count,
          'excessLineCount', paged.excess_line_count,
          'rejectedLineCount', paged.rejected_line_count,
          'updatedAt', paged.updated_at,
          'handledBy', paged.handled_by,
          'monetary', CASE
            WHEN v_can_money THEN jsonb_build_object(
              'receiptValue', paged.receipt_value,
              'invoiceId', paged.invoice_id,
              'invoiceStatus', paged.invoice_status
            )
            ELSE 'null'::jsonb
          END
        )
        ORDER BY
          CASE WHEN paged.status = 'draft' THEN 0 ELSE 1 END,
          paged.expected_receive_date ASC NULLS LAST,
          paged.updated_at DESC,
          paged.id DESC
      ),
      '[]'::jsonb
    ),
    COALESCE((SELECT total FROM counted), 0)
  INTO v_rows, v_total
  FROM paged;

  RETURN jsonb_build_object('rows', v_rows, 'total', v_total);
END;
$$;

REVOKE ALL ON FUNCTION public.list_goods_receipt_notes(
  text, text, bigint, text, date, date, bigint, bigint, bigint, integer, integer
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_goods_receipt_notes(
  text, text, bigint, text, date, date, bigint, bigint, bigint, integer, integer
) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Supplier invoice, payment, and credit allocations
-- ---------------------------------------------------------------------------

ALTER TABLE public.supplier_invoices
  ADD COLUMN IF NOT EXISTS document_discount_amount
    numeric(15,2) NOT NULL DEFAULT 0
    CHECK (document_discount_amount >= 0),
  ADD COLUMN IF NOT EXISTS discrepancy_accepted_by uuid
    REFERENCES auth.users(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS discrepancy_accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS discrepancy_reason text;

CREATE TABLE public.supplier_invoice_lines (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id bigint NOT NULL,
  supplier_invoice_id bigint NOT NULL,
  ingredient_id bigint REFERENCES public.ingredients(id) ON DELETE RESTRICT,
  description text NOT NULL,
  quantity numeric(15,3) NOT NULL CHECK (quantity >= 0),
  unit_price numeric(15,2) NOT NULL CHECK (unit_price >= 0),
  line_discount_amount numeric(15,2) NOT NULL DEFAULT 0
    CHECK (line_discount_amount >= 0),
  allocated_document_discount numeric(15,2) NOT NULL DEFAULT 0
    CHECK (allocated_document_discount >= 0),
  line_total numeric(15,2) NOT NULL CHECK (line_total >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, tenant_id),
  FOREIGN KEY (supplier_invoice_id, tenant_id)
    REFERENCES public.supplier_invoices(id, tenant_id) ON DELETE CASCADE
);

CREATE TABLE public.supplier_invoice_receipt_allocations (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id bigint NOT NULL,
  supplier_invoice_id bigint NOT NULL,
  grn_id bigint NOT NULL,
  po_id bigint NOT NULL,
  purchase_order_item_id bigint,
  invoice_line_id bigint,
  billed_quantity numeric(15,3) NOT NULL CHECK (billed_quantity >= 0),
  matched_quantity numeric(15,3) NOT NULL CHECK (matched_quantity >= 0),
  unplanned_billed_quantity numeric(15,3) NOT NULL DEFAULT 0
    CHECK (unplanned_billed_quantity >= 0),
  accepted_discrepancy boolean NOT NULL DEFAULT false,
  discrepancy_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (
    supplier_invoice_id,
    grn_id,
    purchase_order_item_id,
    invoice_line_id
  ),
  FOREIGN KEY (supplier_invoice_id, tenant_id)
    REFERENCES public.supplier_invoices(id, tenant_id) ON DELETE CASCADE,
  FOREIGN KEY (grn_id, tenant_id)
    REFERENCES public.goods_received_notes(id, tenant_id) ON DELETE RESTRICT,
  FOREIGN KEY (po_id, tenant_id)
    REFERENCES public.purchase_orders(id, tenant_id) ON DELETE RESTRICT,
  FOREIGN KEY (purchase_order_item_id, tenant_id)
    REFERENCES public.purchase_order_items(id, tenant_id) ON DELETE RESTRICT,
  FOREIGN KEY (invoice_line_id, tenant_id)
    REFERENCES public.supplier_invoice_lines(id, tenant_id) ON DELETE CASCADE,
  CHECK (
    (accepted_discrepancy = false AND discrepancy_reason IS NULL)
    OR (
      accepted_discrepancy = true
      AND char_length(btrim(discrepancy_reason)) >= 5
    )
  )
);

ALTER TABLE public.supplier_payments
  ALTER COLUMN supplier_invoice_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS supplier_id bigint;

UPDATE public.supplier_payments payment
SET supplier_id = invoice.supplier_id
FROM public.supplier_invoices invoice
WHERE payment.supplier_invoice_id = invoice.id
  AND payment.tenant_id = invoice.tenant_id
  AND payment.supplier_id IS NULL;

ALTER TABLE public.supplier_payments
  ALTER COLUMN supplier_id SET NOT NULL,
  ADD CONSTRAINT supplier_payments_supplier_tenant_fkey
  FOREIGN KEY (supplier_id, tenant_id)
  REFERENCES public.suppliers(id, tenant_id)
  ON DELETE RESTRICT;

CREATE TABLE public.supplier_payment_allocations (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id bigint NOT NULL,
  supplier_payment_id bigint NOT NULL,
  supplier_invoice_id bigint NOT NULL,
  amount numeric(15,2) NOT NULL CHECK (amount > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (supplier_payment_id, supplier_invoice_id),
  FOREIGN KEY (supplier_payment_id, tenant_id)
    REFERENCES public.supplier_payments(id, tenant_id) ON DELETE CASCADE,
  FOREIGN KEY (supplier_invoice_id, tenant_id)
    REFERENCES public.supplier_invoices(id, tenant_id) ON DELETE RESTRICT
);

ALTER TABLE public.supplier_credit_notes
  ALTER COLUMN return_id DROP NOT NULL;

CREATE TABLE public.supplier_credit_allocations (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id bigint NOT NULL,
  supplier_credit_note_id bigint NOT NULL,
  supplier_invoice_id bigint NOT NULL,
  amount numeric(15,2) NOT NULL CHECK (amount > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (supplier_credit_note_id, supplier_invoice_id),
  FOREIGN KEY (supplier_credit_note_id, tenant_id)
    REFERENCES public.supplier_credit_notes(id, tenant_id) ON DELETE CASCADE,
  FOREIGN KEY (supplier_invoice_id, tenant_id)
    REFERENCES public.supplier_invoices(id, tenant_id) ON DELETE RESTRICT
);

CREATE INDEX supplier_invoice_receipt_allocations_invoice_idx
  ON public.supplier_invoice_receipt_allocations
    (tenant_id, supplier_invoice_id, grn_id);
CREATE UNIQUE INDEX supplier_invoice_receipt_header_uidx
  ON public.supplier_invoice_receipt_allocations
    (tenant_id, supplier_invoice_id, grn_id)
  WHERE purchase_order_item_id IS NULL
    AND invoice_line_id IS NULL;
CREATE INDEX supplier_payment_allocations_invoice_idx
  ON public.supplier_payment_allocations
    (tenant_id, supplier_invoice_id);
CREATE INDEX supplier_credit_allocations_invoice_idx
  ON public.supplier_credit_allocations
    (tenant_id, supplier_invoice_id);

ALTER TABLE public.supplier_invoice_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_invoice_receipt_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_payment_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_credit_allocations ENABLE ROW LEVEL SECURITY;

CREATE POLICY supplier_invoice_lines_finance
ON public.supplier_invoice_lines
TO authenticated
USING (
  tenant_id = public.auth_tenant_id()
  AND public.can_read_inventory_monetary('procurement:price_list_read')
)
WITH CHECK (
  tenant_id = public.auth_tenant_id()
  AND (
    public.has_permission_any('procurement:invoice_create')
    OR public.has_permission_any('procurement:invoice_match')
  )
);

CREATE POLICY supplier_invoice_receipt_allocations_finance
ON public.supplier_invoice_receipt_allocations
TO authenticated
USING (
  tenant_id = public.auth_tenant_id()
  AND public.can_read_inventory_monetary('procurement:price_list_read')
)
WITH CHECK (
  tenant_id = public.auth_tenant_id()
  AND public.has_permission_any('procurement:invoice_match')
);

CREATE POLICY supplier_payment_allocations_finance
ON public.supplier_payment_allocations
TO authenticated
USING (
  tenant_id = public.auth_tenant_id()
  AND public.has_permission_any('finance:view')
)
WITH CHECK (
  tenant_id = public.auth_tenant_id()
  AND public.has_permission_any('finance:ap_pay')
);

CREATE POLICY supplier_credit_allocations_finance
ON public.supplier_credit_allocations
TO authenticated
USING (
  tenant_id = public.auth_tenant_id()
  AND public.has_permission_any('finance:view')
)
WITH CHECK (
  tenant_id = public.auth_tenant_id()
  AND public.has_permission_any('procurement:invoice_match')
);

REVOKE ALL ON TABLE
  public.supplier_invoice_lines,
  public.supplier_invoice_receipt_allocations,
  public.supplier_payment_allocations,
  public.supplier_credit_allocations
FROM PUBLIC, anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  public.supplier_invoice_lines,
  public.supplier_invoice_receipt_allocations,
  public.supplier_payment_allocations,
  public.supplier_credit_allocations
TO authenticated;

GRANT ALL ON TABLE
  public.supplier_invoice_lines,
  public.supplier_invoice_receipt_allocations,
  public.supplier_payment_allocations,
  public.supplier_credit_allocations
TO service_role;

GRANT USAGE, SELECT ON SEQUENCE
  public.supplier_invoice_lines_id_seq,
  public.supplier_invoice_receipt_allocations_id_seq,
  public.supplier_payment_allocations_id_seq,
  public.supplier_credit_allocations_id_seq
TO authenticated, service_role;

GRANT SELECT (
  supplier_id
) ON public.supplier_payments TO authenticated;

GRANT SELECT (
  document_discount_amount,
  discrepancy_accepted_by,
  discrepancy_accepted_at,
  discrepancy_reason
) ON public.supplier_invoices TO authenticated;

COMMENT ON TABLE public.supplier_invoice_receipt_allocations IS
  'Explicit supplier invoice matching across multiple confirmed GRNs and POs of the same supplier.';
COMMENT ON TABLE public.supplier_payment_allocations IS
  'Allocates one supplier payment to multiple invoices. Unallocated payment amount is supplier advance.';
COMMENT ON TABLE public.supplier_credit_allocations IS
  'Allocates supplier credit notes independently from inventory returns.';

CREATE OR REPLACE FUNCTION public.create_supplier_invoice_with_allocations(
  p_supplier_id bigint,
  p_invoice_number text,
  p_invoice_date date,
  p_vat_breakdown jsonb,
  p_matching_notes text,
  p_due_date date,
  p_document_discount_amount numeric,
  p_receipts jsonb
) RETURNS bigint
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO ''
AS $$
DECLARE
  v_tenant bigint := public.auth_tenant_id();
  v_receipt_count integer := COALESCE(jsonb_array_length(p_receipts), 0);
  v_first_receipt jsonb;
  v_invoice_id bigint;
  v_bucket jsonb;
  v_bucket_index integer := 0;
  v_bucket_count integer := COALESCE(jsonb_array_length(p_vat_breakdown), 0);
  v_taxable_total numeric(15,2);
  v_bucket_taxable numeric(15,2);
  v_discount numeric(15,2) :=
    COALESCE(p_document_discount_amount, 0)::numeric(15,2);
  v_allocated_discount numeric(15,2);
  v_remaining_discount numeric(15,2);
  v_receipt_value numeric(15,2);
  v_invoice_subtotal numeric(15,2);
BEGIN
  IF jsonb_typeof(p_receipts) <> 'array'
     OR jsonb_typeof(p_vat_breakdown) <> 'array'
     OR v_bucket_count = 0
     OR v_discount < 0 THEN
    RAISE EXCEPTION 'supplier_invoice_allocations_invalid'
      USING ERRCODE = '22023';
  END IF;

  IF v_receipt_count > 0 AND (
    SELECT count(DISTINCT (receipt.value->>'grn_id')::bigint)
    FROM jsonb_array_elements(p_receipts) receipt
  ) <> v_receipt_count THEN
    RAISE EXCEPTION 'supplier_invoice_receipt_duplicate'
      USING ERRCODE = '23505';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_receipts) receipt
    LEFT JOIN public.goods_received_notes grn
      ON grn.id = (receipt.value->>'grn_id')::bigint
     AND grn.tenant_id = v_tenant
    LEFT JOIN public.purchase_orders purchase_order
      ON purchase_order.id = (receipt.value->>'po_id')::bigint
     AND purchase_order.tenant_id = v_tenant
    WHERE grn.id IS NULL
       OR grn.status <> 'confirmed'
       OR grn.po_id IS DISTINCT FROM purchase_order.id
       OR purchase_order.supplier_id IS DISTINCT FROM p_supplier_id
  ) THEN
    RAISE EXCEPTION 'supplier_invoice_receipt_mismatch'
      USING ERRCODE = '23514';
  END IF;

  v_first_receipt := p_receipts->0;
  v_invoice_id := public.create_supplier_invoice_with_vat_breakdown(
    p_supplier_id,
    CASE
      WHEN v_first_receipt IS NULL THEN NULL
      ELSE (v_first_receipt->>'grn_id')::bigint
    END,
    CASE
      WHEN v_first_receipt IS NULL THEN NULL
      ELSE (v_first_receipt->>'po_id')::bigint
    END,
    p_invoice_number,
    p_invoice_date,
    p_vat_breakdown,
    p_matching_notes,
    p_due_date
  );

  SELECT COALESCE(sum((bucket.value->>'taxable_amount')::numeric), 0)
  INTO v_taxable_total
  FROM jsonb_array_elements(p_vat_breakdown) bucket;

  IF v_taxable_total <= 0 THEN
    RAISE EXCEPTION 'supplier_invoice_vat_breakdown_invalid'
      USING ERRCODE = '23514';
  END IF;

  v_remaining_discount := v_discount;
  FOR v_bucket IN
    SELECT bucket.value
    FROM jsonb_array_elements(p_vat_breakdown) WITH ORDINALITY bucket(value, ord)
    ORDER BY bucket.ord
  LOOP
    v_bucket_index := v_bucket_index + 1;
    v_bucket_taxable := (v_bucket->>'taxable_amount')::numeric(15,2);
    v_allocated_discount := CASE
      WHEN v_bucket_index = v_bucket_count THEN v_remaining_discount
      ELSE round(v_discount * v_bucket_taxable / v_taxable_total, 2)
    END;
    v_remaining_discount := v_remaining_discount - v_allocated_discount;

    INSERT INTO public.supplier_invoice_lines (
      tenant_id,
      supplier_invoice_id,
      description,
      quantity,
      unit_price,
      line_discount_amount,
      allocated_document_discount,
      line_total
    )
    VALUES (
      v_tenant,
      v_invoice_id,
      'Thuế suất ' || (v_bucket->>'vat_rate') || '%',
      1,
      v_bucket_taxable + v_allocated_discount,
      0,
      v_allocated_discount,
      v_bucket_taxable
    );
  END LOOP;

  UPDATE public.supplier_invoices
  SET document_discount_amount = v_discount,
      updated_at = now()
  WHERE id = v_invoice_id
    AND tenant_id = v_tenant
  RETURNING subtotal INTO v_invoice_subtotal;

  INSERT INTO public.supplier_invoice_receipt_allocations (
    tenant_id,
    supplier_invoice_id,
    grn_id,
    po_id,
    billed_quantity,
    matched_quantity
  )
  SELECT
    v_tenant,
    v_invoice_id,
    (receipt.value->>'grn_id')::bigint,
    (receipt.value->>'po_id')::bigint,
    0,
    0
  FROM jsonb_array_elements(p_receipts) receipt;

  SELECT COALESCE(
    sum(grn_item.po_applied_quantity * purchase_order_item.unit_price_est),
    0
  )
  INTO v_receipt_value
  FROM jsonb_array_elements(p_receipts) receipt
  JOIN public.grn_items grn_item
    ON grn_item.grn_id = (receipt.value->>'grn_id')::bigint
   AND grn_item.tenant_id = v_tenant
  JOIN public.purchase_order_items purchase_order_item
    ON purchase_order_item.id = grn_item.purchase_order_item_id
   AND purchase_order_item.tenant_id = grn_item.tenant_id;

  UPDATE public.supplier_invoices
  SET matching_status = CASE
        WHEN v_receipt_count = 0 THEN 'pending'
        WHEN abs(
          (v_invoice_subtotal + v_discount) - v_receipt_value
        ) <= 1 THEN 'matched'
        ELSE 'discrepancy'
      END,
      matching_notes = CASE
        WHEN v_receipt_count > 0
         AND abs((v_invoice_subtotal + v_discount) - v_receipt_value) > 1
        THEN concat_ws(
          E'\n',
          NULLIF(btrim(p_matching_notes), ''),
          'Chênh lệch giá trị đối chiếu: '
            || ((v_invoice_subtotal + v_discount) - v_receipt_value)::text
        )
        ELSE NULLIF(btrim(p_matching_notes), '')
      END,
      updated_at = now()
  WHERE id = v_invoice_id
    AND tenant_id = v_tenant;

  RETURN v_invoice_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_supplier_invoice_with_allocations(
  bigint, text, date, jsonb, text, date, numeric, jsonb
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_supplier_invoice_with_allocations(
  bigint, text, date, jsonb, text, date, numeric, jsonb
) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.accept_supplier_invoice_discrepancy(
  p_invoice_id bigint,
  p_reason text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_tenant bigint := public.auth_tenant_id();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  IF NOT public.has_permission_any('procurement:invoice_match') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF char_length(btrim(p_reason)) < 5 THEN
    RAISE EXCEPTION 'discrepancy_reason_required' USING ERRCODE = '22023';
  END IF;

  UPDATE public.supplier_invoices
  SET matching_status = 'matched',
      discrepancy_accepted_by = v_uid,
      discrepancy_accepted_at = now(),
      discrepancy_reason = btrim(p_reason),
      matching_notes = concat_ws(
        E'\n',
        NULLIF(btrim(matching_notes), ''),
        'Chấp nhận chênh lệch: ' || btrim(p_reason)
      ),
      updated_at = now()
  WHERE id = p_invoice_id
    AND tenant_id = v_tenant
    AND matching_status = 'discrepancy';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'supplier_invoice_not_discrepant'
      USING ERRCODE = '23514';
  END IF;

  RETURN jsonb_build_object(
    'invoice_id', p_invoice_id,
    'matching_status', 'matched'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.accept_supplier_invoice_discrepancy(bigint, text)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION
  public.accept_supplier_invoice_discrepancy(bigint, text)
TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.record_supplier_payment_allocated(
  p_tenant_id bigint,
  p_supplier_id bigint,
  p_amount numeric,
  p_payment_method text,
  p_idempotency_key uuid,
  p_reference_note text,
  p_allocations jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_payment_id bigint;
  v_existing record;
  v_allocated numeric(15,2);
  v_result_status text := 'partial';
  v_single_invoice_id bigint;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  IF NOT public.auth_is_owner(v_uid)
     OR NOT public.has_permission_any('finance:ap_pay')
     OR p_tenant_id IS DISTINCT FROM public.auth_tenant_id() THEN
    RAISE EXCEPTION 'forbidden_owner_only' USING ERRCODE = '42501';
  END IF;
  IF p_idempotency_key IS NULL
     OR p_amount IS NULL
     OR p_amount <= 0
     OR p_amount <> round(p_amount, 2)
     OR p_payment_method NOT IN ('cash', 'bank_transfer')
     OR jsonb_typeof(p_allocations) <> 'array' THEN
    RAISE EXCEPTION 'supplier_payment_invalid' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.suppliers supplier
    WHERE supplier.id = p_supplier_id
      AND supplier.tenant_id = p_tenant_id
  ) THEN
    RAISE EXCEPTION 'supplier_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF (
    SELECT count(DISTINCT (allocation.value->>'invoice_id')::bigint)
    FROM jsonb_array_elements(p_allocations) allocation
  ) <> jsonb_array_length(p_allocations) THEN
    RAISE EXCEPTION 'supplier_payment_invoice_duplicate'
      USING ERRCODE = '23505';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'supplier-payment:' || p_tenant_id::text || ':' || p_idempotency_key::text,
      0
    )
  );

  SELECT payment.*
  INTO v_existing
  FROM public.supplier_payments payment
  WHERE payment.tenant_id = p_tenant_id
    AND payment.idempotency_key = p_idempotency_key
  FOR UPDATE;

  IF FOUND THEN
    IF v_existing.supplier_id IS DISTINCT FROM p_supplier_id
       OR v_existing.amount IS DISTINCT FROM p_amount
       OR v_existing.payment_method IS DISTINCT FROM p_payment_method
       OR v_existing.reference_note IS DISTINCT FROM NULLIF(btrim(p_reference_note), '')
       OR (
         SELECT count(*)
         FROM public.supplier_payment_allocations allocation
         WHERE allocation.supplier_payment_id = v_existing.id
           AND allocation.tenant_id = p_tenant_id
       ) <> jsonb_array_length(p_allocations)
       OR EXISTS (
         SELECT 1
         FROM jsonb_array_elements(p_allocations) requested
         WHERE NOT EXISTS (
           SELECT 1
           FROM public.supplier_payment_allocations allocation
           WHERE allocation.supplier_payment_id = v_existing.id
             AND allocation.tenant_id = p_tenant_id
             AND allocation.supplier_invoice_id =
               (requested.value->>'invoice_id')::bigint
             AND allocation.amount =
               (requested.value->>'amount')::numeric
         )
       ) THEN
      RAISE EXCEPTION 'supplier_payment_idempotency_conflict'
        USING ERRCODE = '22023';
    END IF;
    RETURN jsonb_build_object(
      'payment_id', v_existing.id,
      'payment_status', v_existing.idempotency_result_status,
      'unallocated_amount', v_existing.amount - COALESCE((
        SELECT sum(allocation.amount)
        FROM public.supplier_payment_allocations allocation
        WHERE allocation.supplier_payment_id = v_existing.id
          AND allocation.tenant_id = p_tenant_id
      ), 0)
    );
  END IF;

  SELECT COALESCE(sum((allocation.value->>'amount')::numeric), 0)
  INTO v_allocated
  FROM jsonb_array_elements(p_allocations) allocation;

  PERFORM 1
  FROM public.supplier_invoices invoice
  JOIN (
    SELECT DISTINCT (allocation.value->>'invoice_id')::bigint AS invoice_id
    FROM jsonb_array_elements(p_allocations) allocation
  ) requested ON requested.invoice_id = invoice.id
  WHERE invoice.tenant_id = p_tenant_id
  ORDER BY invoice.id
  FOR UPDATE;

  IF v_allocated > p_amount
     OR EXISTS (
       SELECT 1
       FROM jsonb_array_elements(p_allocations) allocation
       LEFT JOIN public.supplier_invoices invoice
         ON invoice.id = (allocation.value->>'invoice_id')::bigint
        AND invoice.tenant_id = p_tenant_id
       WHERE invoice.id IS NULL
          OR invoice.supplier_id IS DISTINCT FROM p_supplier_id
          OR (allocation.value->>'amount')::numeric <= 0
          OR invoice.matching_status <> 'matched'
          OR invoice.vat_invoice_attachment_path IS NULL
          OR (allocation.value->>'amount')::numeric >
            invoice.total_amount
              - invoice.paid_amount
              - invoice.credit_applied_amount
     ) THEN
    RAISE EXCEPTION 'supplier_payment_allocation_invalid'
      USING ERRCODE = '23514';
  END IF;

  SELECT CASE
    WHEN jsonb_array_length(p_allocations) = 1
    THEN (p_allocations->0->>'invoice_id')::bigint
    ELSE NULL
  END
  INTO v_single_invoice_id;

  INSERT INTO public.supplier_payments (
    tenant_id,
    supplier_id,
    supplier_invoice_id,
    payment_method,
    amount,
    payment_date,
    reference_note,
    created_by,
    idempotency_key,
    idempotency_result_status
  )
  VALUES (
    p_tenant_id,
    p_supplier_id,
    v_single_invoice_id,
    p_payment_method,
    p_amount,
    now(),
    NULLIF(btrim(p_reference_note), ''),
    v_uid,
    p_idempotency_key,
    'partial'
  )
  RETURNING id INTO v_payment_id;

  INSERT INTO public.supplier_payment_allocations (
    tenant_id,
    supplier_payment_id,
    supplier_invoice_id,
    amount
  )
  SELECT
    p_tenant_id,
    v_payment_id,
    (allocation.value->>'invoice_id')::bigint,
    (allocation.value->>'amount')::numeric(15,2)
  FROM jsonb_array_elements(p_allocations) allocation;

  WITH allocated AS (
    SELECT
      (allocation.value->>'invoice_id')::bigint AS invoice_id,
      sum((allocation.value->>'amount')::numeric(15,2)) AS amount
    FROM jsonb_array_elements(p_allocations) allocation
    GROUP BY (allocation.value->>'invoice_id')::bigint
  )
  UPDATE public.supplier_invoices invoice
  SET paid_amount = invoice.paid_amount + allocated.amount,
      payment_status = CASE
        WHEN invoice.paid_amount
           + allocated.amount
           + invoice.credit_applied_amount
             >= invoice.total_amount THEN 'paid'
        ELSE 'partial'
      END,
      paid_at = CASE
        WHEN invoice.paid_amount
           + allocated.amount
           + invoice.credit_applied_amount
             >= invoice.total_amount THEN now()
        ELSE invoice.paid_at
      END,
      updated_at = now()
  FROM allocated
  WHERE invoice.id = allocated.invoice_id
    AND invoice.tenant_id = p_tenant_id;

  IF v_allocated = p_amount AND NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_allocations) allocation
    JOIN public.supplier_invoices invoice
      ON invoice.id = (allocation.value->>'invoice_id')::bigint
     AND invoice.tenant_id = p_tenant_id
    WHERE invoice.payment_status <> 'paid'
  ) THEN
    v_result_status := 'paid';
  END IF;

  UPDATE public.supplier_payments
  SET idempotency_result_status = v_result_status,
      updated_at = now()
  WHERE id = v_payment_id
    AND tenant_id = p_tenant_id;

  RETURN jsonb_build_object(
    'payment_id', v_payment_id,
    'payment_status', v_result_status,
    'unallocated_amount', p_amount - v_allocated
  );
END;
$$;

REVOKE ALL ON FUNCTION public.record_supplier_payment_allocated(
  bigint, bigint, numeric, text, uuid, text, jsonb
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_supplier_payment_allocated(
  bigint, bigint, numeric, text, uuid, text, jsonb
) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.create_supplier_credit_allocated(
  p_supplier_id bigint,
  p_credit_number text,
  p_amount numeric,
  p_notes text,
  p_allocations jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_tenant bigint := public.auth_tenant_id();
  v_credit_id bigint;
  v_allocated numeric(15,2);
  v_single_invoice_id bigint;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  IF NOT public.has_permission_any('procurement:invoice_match') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_amount IS NULL
     OR p_amount <= 0
     OR p_amount <> round(p_amount, 2)
     OR btrim(p_credit_number) = ''
     OR jsonb_typeof(p_allocations) <> 'array' THEN
    RAISE EXCEPTION 'supplier_credit_invalid' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.suppliers supplier
    WHERE supplier.id = p_supplier_id
      AND supplier.tenant_id = v_tenant
  ) THEN
    RAISE EXCEPTION 'supplier_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF (
    SELECT count(DISTINCT (allocation.value->>'invoice_id')::bigint)
    FROM jsonb_array_elements(p_allocations) allocation
  ) <> jsonb_array_length(p_allocations) THEN
    RAISE EXCEPTION 'supplier_credit_invoice_duplicate'
      USING ERRCODE = '23505';
  END IF;

  SELECT COALESCE(sum((allocation.value->>'amount')::numeric), 0)
  INTO v_allocated
  FROM jsonb_array_elements(p_allocations) allocation;

  PERFORM 1
  FROM public.supplier_invoices invoice
  JOIN (
    SELECT DISTINCT (allocation.value->>'invoice_id')::bigint AS invoice_id
    FROM jsonb_array_elements(p_allocations) allocation
  ) requested ON requested.invoice_id = invoice.id
  WHERE invoice.tenant_id = v_tenant
  ORDER BY invoice.id
  FOR UPDATE;

  IF v_allocated > p_amount
     OR EXISTS (
       SELECT 1
       FROM jsonb_array_elements(p_allocations) allocation
       LEFT JOIN public.supplier_invoices invoice
         ON invoice.id = (allocation.value->>'invoice_id')::bigint
        AND invoice.tenant_id = v_tenant
       WHERE invoice.id IS NULL
          OR invoice.supplier_id IS DISTINCT FROM p_supplier_id
          OR (allocation.value->>'amount')::numeric <= 0
          OR (allocation.value->>'amount')::numeric >
            invoice.total_amount
              - invoice.paid_amount
              - invoice.credit_applied_amount
     ) THEN
    RAISE EXCEPTION 'supplier_credit_allocation_invalid'
      USING ERRCODE = '23514';
  END IF;

  SELECT CASE
    WHEN jsonb_array_length(p_allocations) = 1
    THEN (p_allocations->0->>'invoice_id')::bigint
    ELSE NULL
  END
  INTO v_single_invoice_id;

  INSERT INTO public.supplier_credit_notes (
    tenant_id,
    supplier_id,
    return_id,
    invoice_id,
    credit_number,
    kind,
    amount,
    status,
    applied_amount,
    notes,
    created_by,
    applied_at
  )
  VALUES (
    v_tenant,
    p_supplier_id,
    NULL,
    v_single_invoice_id,
    btrim(p_credit_number),
    'credit_note',
    p_amount,
    CASE WHEN v_allocated = p_amount THEN 'applied' ELSE 'open' END,
    v_allocated,
    NULLIF(btrim(p_notes), ''),
    v_uid,
    CASE WHEN v_allocated > 0 THEN now() ELSE NULL END
  )
  RETURNING id INTO v_credit_id;

  INSERT INTO public.supplier_credit_allocations (
    tenant_id,
    supplier_credit_note_id,
    supplier_invoice_id,
    amount
  )
  SELECT
    v_tenant,
    v_credit_id,
    (allocation.value->>'invoice_id')::bigint,
    (allocation.value->>'amount')::numeric(15,2)
  FROM jsonb_array_elements(p_allocations) allocation;

  WITH allocated AS (
    SELECT
      (allocation.value->>'invoice_id')::bigint AS invoice_id,
      sum((allocation.value->>'amount')::numeric(15,2)) AS amount
    FROM jsonb_array_elements(p_allocations) allocation
    GROUP BY (allocation.value->>'invoice_id')::bigint
  )
  UPDATE public.supplier_invoices invoice
  SET credit_applied_amount = invoice.credit_applied_amount + allocated.amount,
      payment_status = CASE
        WHEN invoice.paid_amount
           + invoice.credit_applied_amount
           + allocated.amount
             >= invoice.total_amount THEN 'paid'
        WHEN invoice.paid_amount > 0 THEN 'partial'
        ELSE invoice.payment_status
      END,
      updated_at = now()
  FROM allocated
  WHERE invoice.id = allocated.invoice_id
    AND invoice.tenant_id = v_tenant;

  RETURN jsonb_build_object(
    'credit_id', v_credit_id,
    'unallocated_amount', p_amount - v_allocated
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_supplier_credit_allocated(
  bigint, text, numeric, text, jsonb
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_supplier_credit_allocated(
  bigint, text, numeric, text, jsonb
) TO authenticated, service_role;

-- Legacy GRN-first creators stay callable only for controlled compatibility.
REVOKE ALL ON FUNCTION
  public.create_purchase_orders_from_grn(bigint),
  public.create_purchase_order_from_grn(bigint)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION
  public.create_purchase_orders_from_grn(bigint),
  public.create_purchase_order_from_grn(bigint)
TO service_role;
