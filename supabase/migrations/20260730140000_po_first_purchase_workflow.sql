-- PO-first procurement: warehouse demand is saved directly as supplier POs.

ALTER TABLE public.purchase_orders
  DROP CONSTRAINT IF EXISTS purchase_orders_status_check,
  ADD CONSTRAINT purchase_orders_status_check CHECK (
    status IN (
      'draft',
      'sent',
      'pending_approval',
      'changes_requested',
      'approved',
      'partially_received',
      'received',
      'closed',
      'cancelled'
    )
  ),
  ADD COLUMN IF NOT EXISTS purchase_group_key uuid,
  ADD COLUMN IF NOT EXISTS purchase_group_code text,
  ADD COLUMN IF NOT EXISTS group_sequence smallint,
  ADD COLUMN IF NOT EXISTS group_save_idempotency_key uuid,
  ADD COLUMN IF NOT EXISTS submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS submitted_by uuid,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS reviewed_by uuid;

ALTER TABLE public.purchase_orders
  DROP CONSTRAINT IF EXISTS purchase_orders_group_shape_check,
  ADD CONSTRAINT purchase_orders_group_shape_check CHECK (
    (
      purchase_group_key IS NULL
      AND purchase_group_code IS NULL
      AND group_sequence IS NULL
    )
    OR (
      purchase_group_key IS NOT NULL
      AND purchase_group_code IS NOT NULL
      AND group_sequence BETWEEN 1 AND 99
    )
  );

CREATE UNIQUE INDEX IF NOT EXISTS purchase_orders_group_sequence_uidx
  ON public.purchase_orders (
    tenant_id,
    purchase_group_key,
    group_sequence
  )
  WHERE purchase_group_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS purchase_orders_group_save_key_uidx
  ON public.purchase_orders (
    tenant_id,
    group_save_idempotency_key,
    group_sequence
  )
  WHERE group_save_idempotency_key IS NOT NULL;

CREATE OR REPLACE FUNCTION private.enforce_retrospective_purchase_order_immutability()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $$
DECLARE
  v_linked boolean := FALSE;
  v_trusted_rpc boolean;
BEGIN
  SELECT CURRENT_USER = pg_catalog.pg_get_userbyid(relation.relowner)
  INTO v_trusted_rpc
  FROM pg_catalog.pg_class AS relation
  WHERE relation.oid = 'public.purchase_orders'::pg_catalog.regclass;

  IF TG_OP = 'INSERT' THEN
    IF v_trusted_rpc IS DISTINCT FROM TRUE THEN
      RAISE EXCEPTION 'purchase_order_insert_requires_rpc'
        USING ERRCODE = '42501';
    END IF;
    IF NEW.status NOT IN ('draft', 'pending_approval') THEN
      RAISE EXCEPTION 'purchase_order_initial_status_invalid'
        USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'retrospective-po:' || OLD.id::text,
      0
    )
  );

  SELECT EXISTS (
    SELECT 1
    FROM public.goods_received_notes AS grn
    WHERE grn.tenant_id = OLD.tenant_id
      AND (
        grn.po_id = OLD.id
        OR OLD.source_grn_id = grn.id
      )
  )
  INTO v_linked;

  IF TG_OP = 'DELETE' THEN
    IF v_linked THEN
      RAISE EXCEPTION 'linked_grn_purchase_order_immutable'
        USING ERRCODE = '23514';
    END IF;
    RETURN OLD;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF v_trusted_rpc IS DISTINCT FROM TRUE THEN
      RAISE EXCEPTION 'purchase_order_status_requires_rpc'
        USING ERRCODE = '42501';
    END IF;
    IF NOT (
      (OLD.status = 'draft'
        AND NEW.status IN ('sent', 'pending_approval', 'cancelled'))
      OR (
        OLD.status = 'changes_requested'
        AND NEW.status IN ('pending_approval', 'cancelled')
      )
      OR (
        OLD.status = 'pending_approval'
        AND NEW.status IN ('approved', 'changes_requested', 'cancelled')
      )
      OR (
        OLD.status = 'sent'
        AND NEW.status IN ('partially_received', 'received', 'cancelled')
      )
      OR (
        OLD.status = 'approved'
        AND NEW.status IN (
          'partially_received',
          'received',
          'closed',
          'cancelled'
        )
      )
      OR (
        OLD.status = 'partially_received'
        AND NEW.status IN ('received', 'closed')
      )
    ) THEN
      RAISE EXCEPTION 'purchase_order_status_transition_invalid'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  IF v_linked
     AND (
       NEW.id IS DISTINCT FROM OLD.id
       OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
       OR NEW.branch_id IS DISTINCT FROM OLD.branch_id
       OR NEW.supplier_id IS DISTINCT FROM OLD.supplier_id
       OR NEW.po_number IS DISTINCT FROM OLD.po_number
       OR NEW.display_id IS DISTINCT FROM OLD.display_id
       OR NEW.ordered_at IS DISTINCT FROM OLD.ordered_at
       OR NEW.expected_delivery_date IS DISTINCT FROM
         OLD.expected_delivery_date
       OR NEW.notes IS DISTINCT FROM OLD.notes
       OR NEW.created_by IS DISTINCT FROM OLD.created_by
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
       OR NEW.source_grn_id IS DISTINCT FROM OLD.source_grn_id
       OR NEW.purchase_group_key IS DISTINCT FROM OLD.purchase_group_key
       OR NEW.purchase_group_code IS DISTINCT FROM OLD.purchase_group_code
       OR NEW.group_sequence IS DISTINCT FROM OLD.group_sequence
     ) THEN
    RAISE EXCEPTION 'linked_grn_purchase_order_immutable'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS goods_received_notes_one_active_po_draft_uidx
  ON public.goods_received_notes (tenant_id, po_id)
  WHERE po_id IS NOT NULL AND status = 'draft';

ALTER TABLE public.grn_items
  ADD COLUMN IF NOT EXISTS cost_pending boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS provisional_cost_source text,
  DROP CONSTRAINT IF EXISTS grn_items_provisional_cost_source_check,
  ADD CONSTRAINT grn_items_provisional_cost_source_check CHECK (
    provisional_cost_source IS NULL
    OR provisional_cost_source IN ('wac', 'reference', 'pending')
  );

CREATE OR REPLACE FUNCTION private.enforce_linked_grn_line_immutability()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_grn record;
  v_po_item record;
  v_confirming boolean :=
    coalesce(
      pg_catalog.current_setting('comtammatu.grn_confirm', TRUE),
      'false'
    ) = 'true';
BEGIN
  SELECT grn.*
  INTO v_grn
  FROM public.goods_received_notes AS grn
  WHERE grn.id = coalesce(NEW.grn_id, OLD.grn_id)
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'grn_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF TG_OP = 'DELETE' THEN
    IF v_grn.status = 'draft' THEN
      RETURN OLD;
    END IF;
    RAISE EXCEPTION 'confirmed_grn_lines_immutable'
      USING ERRCODE = '23514';
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
    RAISE EXCEPTION 'grn_line_identity_immutable'
      USING ERRCODE = '23514';
  END IF;

  SELECT po_item.*, purchase_order.supplier_id
  INTO v_po_item
  FROM public.purchase_order_items AS po_item
  JOIN public.purchase_orders AS purchase_order
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
    RAISE EXCEPTION 'confirmed_grn_lines_immutable'
      USING ERRCODE = '23514';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    NEW.unit_cost := OLD.unit_cost;
    NEW.cost_pending := OLD.cost_pending;
    NEW.provisional_cost_source := OLD.provisional_cost_source;
  END IF;
  NEW.total_cost := 0;
  NEW.po_applied_quantity := 0;
  RETURN NEW;
END;
$$;

INSERT INTO public.permission_keys (
  key,
  module,
  description,
  scope,
  is_delegable_to_staff
)
VALUES (
  'procurement:po_create',
  'inventory_procurement',
  'Create, edit, submit, and resubmit purchase orders',
  'branch',
  TRUE
)
ON CONFLICT (key) DO UPDATE
SET module = EXCLUDED.module,
    description = EXCLUDED.description,
    scope = EXCLUDED.scope,
    is_delegable_to_staff = EXCLUDED.is_delegable_to_staff;

UPDATE public.role_templates AS template
SET permission_keys = (
  SELECT coalesce(array_agg(DISTINCT key ORDER BY key), ARRAY[]::text[])
  FROM unnest(
    template.permission_keys || ARRAY['procurement:po_create']::text[]
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
  'procurement:po_create',
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
      AND existing.permission_key = 'procurement:po_create'
      AND existing.branch_id IS NOT DISTINCT FROM profile.branch_id
  );

CREATE OR REPLACE FUNCTION private.po_group_result(
  p_tenant_id bigint,
  p_group_key uuid
) RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path TO ''
AS $$
  SELECT pg_catalog.jsonb_build_object(
    'ok',
    TRUE,
    'purchase_group_key',
    p_group_key,
    'purchase_group_code',
    pg_catalog.min(po.purchase_group_code),
    'purchase_orders',
    coalesce(
      pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'po_id', po.id,
          'po_number', coalesce(po.display_id, po.po_number),
          'supplier_id', po.supplier_id,
          'group_sequence', po.group_sequence,
          'status', po.status
        )
        ORDER BY po.group_sequence
      ),
      '[]'::jsonb
    )
  )
  FROM public.purchase_orders AS po
  WHERE po.tenant_id = p_tenant_id
    AND po.purchase_group_key = p_group_key;
$$;

REVOKE ALL ON FUNCTION private.po_group_result(bigint, uuid)
FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.save_purchase_order_group(
  p_group_key uuid,
  p_branch_id bigint,
  p_expected_delivery_date date,
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
  v_group_key uuid := p_group_key;
  v_group_code text;
  v_status text := CASE
    WHEN p_submit THEN 'pending_approval'
    ELSE 'draft'
  END;
  v_missing jsonb;
  v_supplier record;
  v_po_id bigint;
  v_sequence smallint;
BEGIN
  IF v_uid IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  IF p_branch_id IS NULL
     OR p_lines IS NULL
     OR pg_catalog.jsonb_typeof(p_lines) <> 'array'
     OR pg_catalog.jsonb_array_length(p_lines) = 0
     OR pg_catalog.jsonb_array_length(p_lines) > 200
     OR p_idempotency_key IS NULL THEN
    RAISE EXCEPTION 'purchase_order_group_invalid'
      USING ERRCODE = '22023';
  END IF;
  IF NOT public.has_permission(
    p_branch_id,
    'procurement:po_create'
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
    RAISE EXCEPTION 'purchase_order_central_site_required'
      USING ERRCODE = '23514';
  END IF;
  IF (
    SELECT count(*) <> count(DISTINCT line.ingredient_id)
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
    RAISE EXCEPTION 'purchase_order_line_invalid'
      USING ERRCODE = '23514';
  END IF;

  SELECT po.purchase_group_key
  INTO v_group_key
  FROM public.purchase_orders AS po
  WHERE po.tenant_id = v_tenant
    AND po.group_save_idempotency_key = p_idempotency_key
  ORDER BY po.group_sequence
  LIMIT 1;

  IF FOUND THEN
    RETURN private.po_group_result(v_tenant, v_group_key);
  END IF;

  SELECT pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'ingredient_id', ingredient.id,
      'ingredient_name', ingredient.name
    )
    ORDER BY ingredient.name, ingredient.id
  )
  INTO v_missing
  FROM pg_catalog.jsonb_to_recordset(p_lines)
    AS line(ingredient_id bigint)
  JOIN public.ingredients AS ingredient
    ON ingredient.id = line.ingredient_id
   AND ingredient.tenant_id = v_tenant
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.supplier_items AS supplier_item
    JOIN public.suppliers AS supplier
      ON supplier.id = supplier_item.supplier_id
     AND supplier.tenant_id = supplier_item.tenant_id
     AND supplier.is_active
    WHERE supplier_item.tenant_id = v_tenant
      AND supplier_item.ingredient_id = line.ingredient_id
      AND supplier_item.is_active
      AND supplier_item.is_preferred
  );

  IF v_missing IS NOT NULL THEN
    RETURN pg_catalog.jsonb_build_object(
      'ok', FALSE,
      'error_code', 'supplier_default_missing',
      'missing_supplier_items', v_missing
    );
  END IF;

  IF p_group_key IS NULL THEN
    v_group_key := pg_catalog.gen_random_uuid();
    v_group_code := public.next_po_display_id(v_tenant);
  ELSE
    SELECT po.purchase_group_code
    INTO v_group_code
    FROM public.purchase_orders AS po
    WHERE po.tenant_id = v_tenant
      AND po.purchase_group_key = p_group_key
    ORDER BY po.group_sequence
    LIMIT 1
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'purchase_order_group_not_found'
        USING ERRCODE = 'P0002';
    END IF;
    IF NOT EXISTS (
      SELECT 1
      FROM public.purchase_orders AS po
      WHERE po.tenant_id = v_tenant
        AND po.purchase_group_key = p_group_key
        AND po.status IN ('draft', 'changes_requested')
    ) THEN
      RAISE EXCEPTION 'purchase_order_group_not_editable'
        USING ERRCODE = '23514';
    END IF;

    DELETE FROM public.purchase_order_items AS po_item
    USING public.purchase_orders AS po
    WHERE po.id = po_item.po_id
      AND po.tenant_id = po_item.tenant_id
      AND po.tenant_id = v_tenant
      AND po.purchase_group_key = v_group_key
      AND po.status IN ('draft', 'changes_requested');
  END IF;

  FOR v_supplier IN
    SELECT
      supplier_item.supplier_id,
      pg_catalog.row_number() OVER (
        ORDER BY supplier_item.supplier_id
      )::smallint AS initial_sequence
    FROM pg_catalog.jsonb_to_recordset(p_lines)
      AS line(ingredient_id bigint)
    JOIN public.supplier_items AS supplier_item
      ON supplier_item.tenant_id = v_tenant
     AND supplier_item.ingredient_id = line.ingredient_id
     AND supplier_item.is_active
     AND supplier_item.is_preferred
    GROUP BY supplier_item.supplier_id
    ORDER BY supplier_item.supplier_id
  LOOP
    SELECT po.id, po.group_sequence
    INTO v_po_id, v_sequence
    FROM public.purchase_orders AS po
    WHERE po.tenant_id = v_tenant
      AND po.purchase_group_key = v_group_key
      AND po.supplier_id = v_supplier.supplier_id
      AND po.status IN ('draft', 'changes_requested')
    ORDER BY po.group_sequence
    LIMIT 1
    FOR UPDATE;

    IF NOT FOUND THEN
      IF p_group_key IS NULL THEN
        v_sequence := v_supplier.initial_sequence;
      ELSE
        SELECT (
          coalesce(pg_catalog.max(po.group_sequence), 0) + 1
        )::smallint
        INTO v_sequence
        FROM public.purchase_orders AS po
        WHERE po.tenant_id = v_tenant
          AND po.purchase_group_key = v_group_key;
      END IF;
      IF v_sequence > 99 THEN
        RAISE EXCEPTION 'purchase_order_group_supplier_limit'
          USING ERRCODE = '54000';
      END IF;

      INSERT INTO public.purchase_orders (
        tenant_id,
        branch_id,
        supplier_id,
        po_number,
        display_id,
        ordered_at,
        expected_delivery_date,
        status,
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
        p_branch_id,
        v_supplier.supplier_id,
        v_group_code || '-' || pg_catalog.lpad(v_sequence::text, 2, '0'),
        v_group_code || '-' || pg_catalog.lpad(v_sequence::text, 2, '0'),
        pg_catalog.now(),
        p_expected_delivery_date,
        v_status,
        nullif(pg_catalog.btrim(p_notes), ''),
        v_uid,
        v_group_key,
        v_group_code,
        v_sequence,
        p_idempotency_key,
        CASE WHEN p_submit THEN pg_catalog.now() ELSE NULL END,
        CASE WHEN p_submit THEN v_uid ELSE NULL END
      )
      RETURNING id INTO v_po_id;
    ELSE
      DELETE FROM public.purchase_order_items AS po_item
      WHERE po_item.tenant_id = v_tenant
        AND po_item.po_id = v_po_id;

      UPDATE public.purchase_orders
      SET branch_id = p_branch_id,
          expected_delivery_date = p_expected_delivery_date,
          notes = nullif(pg_catalog.btrim(p_notes), ''),
          status = v_status,
          status_reason = NULL,
          group_save_idempotency_key = p_idempotency_key,
          submitted_at = CASE
            WHEN p_submit THEN pg_catalog.now()
            ELSE submitted_at
          END,
          submitted_by = CASE
            WHEN p_submit THEN v_uid
            ELSE submitted_by
          END,
          updated_at = pg_catalog.now()
      WHERE id = v_po_id
        AND tenant_id = v_tenant;
    END IF;

    INSERT INTO public.purchase_order_items (
      tenant_id,
      po_id,
      ingredient_id,
      quantity,
      entry_unit_id,
      unit_price_est,
      line_total
    )
    SELECT
      v_tenant,
      v_po_id,
      line.ingredient_id,
      line.quantity::numeric(15,3),
      line.entry_unit_id,
      NULL,
      NULL
    FROM pg_catalog.jsonb_to_recordset(p_lines)
      AS line(
        ingredient_id bigint,
        quantity numeric,
        entry_unit_id bigint
      )
    JOIN public.supplier_items AS supplier_item
      ON supplier_item.tenant_id = v_tenant
     AND supplier_item.ingredient_id = line.ingredient_id
     AND supplier_item.supplier_id = v_supplier.supplier_id
     AND supplier_item.is_active
     AND supplier_item.is_preferred
    ORDER BY line.ingredient_id;
  END LOOP;

  UPDATE public.purchase_orders AS po
  SET status = 'cancelled',
      status_reason = 'NCC mặc định đã thay đổi khi gửi lại',
      cancelled_at = pg_catalog.now(),
      updated_at = pg_catalog.now()
  WHERE po.tenant_id = v_tenant
    AND po.purchase_group_key = v_group_key
    AND po.status IN ('draft', 'changes_requested')
    AND NOT EXISTS (
      SELECT 1
      FROM public.purchase_order_items AS po_item
      WHERE po_item.tenant_id = v_tenant
        AND po_item.po_id = po.id
    );

  PERFORM public.log_audit(
    CASE
      WHEN p_group_key IS NULL
        THEN 'procurement.po_group.created'
      ELSE 'procurement.po_group.resubmitted'
    END,
    'purchase_order_group',
    NULL,
    NULL,
    pg_catalog.jsonb_build_object(
      'purchase_group_key', v_group_key,
      'purchase_group_code', v_group_code,
      'status', v_status
    )
  );

  RETURN private.po_group_result(v_tenant, v_group_key);
END;
$$;

REVOKE ALL ON FUNCTION public.save_purchase_order_group(
  uuid,
  bigint,
  date,
  text,
  jsonb,
  boolean,
  uuid
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_purchase_order_group(
  uuid,
  bigint,
  date,
  text,
  jsonb,
  boolean,
  uuid
) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION private.ensure_grn_draft_for_po(
  p_tenant_id bigint,
  p_po_id bigint,
  p_created_by uuid,
  p_idempotency_key uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_po public.purchase_orders%ROWTYPE;
  v_existing record;
  v_location_id bigint;
  v_grn_id bigint;
  v_grn_number text;
  v_line_count integer;
BEGIN
  SELECT grn.id, grn.grn_number, grn.status
  INTO v_existing
  FROM public.goods_received_notes AS grn
  WHERE grn.tenant_id = p_tenant_id
    AND grn.po_id = p_po_id
    AND grn.status = 'draft'
  ORDER BY grn.id
  LIMIT 1;

  IF FOUND THEN
    RETURN pg_catalog.jsonb_build_object(
      'grn_id', v_existing.id,
      'grn_number', v_existing.grn_number,
      'status', v_existing.status
    );
  END IF;

  SELECT po.*
  INTO v_po
  FROM public.purchase_orders AS po
  WHERE po.id = p_po_id
    AND po.tenant_id = p_tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'purchase_order_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_po.status NOT IN ('sent', 'approved', 'partially_received') THEN
    RAISE EXCEPTION 'purchase_order_not_receivable'
      USING ERRCODE = '23514';
  END IF;

  SELECT location.id
  INTO v_location_id
  FROM public.inventory_locations AS location
  WHERE location.tenant_id = p_tenant_id
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
    FROM public.purchase_order_items AS po_item
    LEFT JOIN LATERAL (
      SELECT pg_catalog.sum(grn_item.po_applied_quantity) AS quantity
      FROM public.grn_items AS grn_item
      JOIN public.goods_received_notes AS grn
        ON grn.id = grn_item.grn_id
       AND grn.tenant_id = grn_item.tenant_id
      WHERE grn_item.tenant_id = p_tenant_id
        AND grn_item.purchase_order_item_id = po_item.id
        AND grn.status = 'confirmed'
    ) AS received ON TRUE
    WHERE po_item.po_id = p_po_id
      AND po_item.tenant_id = p_tenant_id
      AND po_item.quantity > coalesce(received.quantity, 0)
  ) THEN
    RAISE EXCEPTION 'purchase_order_fully_received'
      USING ERRCODE = '02000';
  END IF;

  v_grn_number := public.next_inventory_doc_number(p_tenant_id, 'grn');
  PERFORM pg_catalog.set_config(
    'comtammatu.po_first_grn_insert',
    'true',
    TRUE
  );

  INSERT INTO public.goods_received_notes (
    tenant_id,
    branch_id,
    po_id,
    supplier_id,
    grn_number,
    expected_receive_date,
    status,
    created_by,
    location_id,
    creation_idempotency_key
  )
  VALUES (
    p_tenant_id,
    v_po.branch_id,
    v_po.id,
    v_po.supplier_id,
    v_grn_number,
    v_po.expected_delivery_date,
    'draft',
    p_created_by,
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
    entry_unit_id,
    unit_cost,
    total_cost,
    po_applied_quantity,
    cost_pending,
    provisional_cost_source
  )
  SELECT
    p_tenant_id,
    v_grn_id,
    po_item.ingredient_id,
    v_po.supplier_id,
    po_item.id,
    0,
    0,
    po_item.entry_unit_id,
    CASE
      WHEN stock.avg_unit_cost > 0
        THEN stock.avg_unit_cost * public.inv_to_base(
          po_item.ingredient_id,
          po_item.entry_unit_id,
          1
        )
      WHEN ingredient.unit_cost > 0
        THEN ingredient.unit_cost * public.inv_to_base(
          po_item.ingredient_id,
          po_item.entry_unit_id,
          1
        )
      ELSE 0
    END,
    0,
    0,
    coalesce(stock.avg_unit_cost, 0) <= 0
      AND coalesce(ingredient.unit_cost, 0) <= 0,
    CASE
      WHEN stock.avg_unit_cost > 0 THEN 'wac'
      WHEN ingredient.unit_cost > 0 THEN 'reference'
      ELSE 'pending'
    END
  FROM public.purchase_order_items AS po_item
  JOIN public.ingredients AS ingredient
    ON ingredient.id = po_item.ingredient_id
   AND ingredient.tenant_id = po_item.tenant_id
  LEFT JOIN public.stock_levels AS stock
    ON stock.tenant_id = po_item.tenant_id
   AND stock.branch_id = v_po.branch_id
   AND stock.location_id = v_location_id
   AND stock.ingredient_id = po_item.ingredient_id
  LEFT JOIN LATERAL (
    SELECT pg_catalog.sum(grn_item.po_applied_quantity) AS quantity
    FROM public.grn_items AS grn_item
    JOIN public.goods_received_notes AS grn
      ON grn.id = grn_item.grn_id
     AND grn.tenant_id = grn_item.tenant_id
    WHERE grn_item.tenant_id = p_tenant_id
      AND grn_item.purchase_order_item_id = po_item.id
      AND grn.status = 'confirmed'
  ) AS received ON TRUE
  WHERE po_item.po_id = p_po_id
    AND po_item.tenant_id = p_tenant_id
    AND po_item.quantity > coalesce(received.quantity, 0)
  ORDER BY po_item.id;

  GET DIAGNOSTICS v_line_count = ROW_COUNT;

  RETURN pg_catalog.jsonb_build_object(
    'grn_id', v_grn_id,
    'grn_number', v_grn_number,
    'status', 'draft',
    'line_count', v_line_count
  );
END;
$$;

REVOKE ALL ON FUNCTION private.ensure_grn_draft_for_po(
  bigint,
  bigint,
  uuid,
  uuid
) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.review_purchase_order(
  p_po_id bigint,
  p_action text,
  p_reason text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_tenant bigint := public.auth_tenant_id();
  v_po public.purchase_orders%ROWTYPE;
  v_action text :=
    pg_catalog.lower(pg_catalog.btrim(coalesce(p_action, '')));
  v_reason text := nullif(
    pg_catalog.btrim(coalesce(p_reason, '')),
    ''
  );
  v_grn jsonb;
BEGIN
  IF v_uid IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  IF v_action NOT IN ('approve', 'request_changes', 'reject') THEN
    RAISE EXCEPTION 'purchase_order_review_action_invalid'
      USING ERRCODE = '22023';
  END IF;
  IF v_action IN ('request_changes', 'reject')
     AND pg_catalog.length(coalesce(v_reason, '')) < 5 THEN
    RAISE EXCEPTION 'reason_required' USING ERRCODE = '22023';
  END IF;

  SELECT po.*
  INTO v_po
  FROM public.purchase_orders AS po
  WHERE po.id = p_po_id
    AND po.tenant_id = v_tenant
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'purchase_order_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.has_permission(
    v_po.branch_id,
    'procurement:po_approve'
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF v_action = 'approve'
     AND v_po.status IN (
       'approved',
       'partially_received',
       'received',
       'closed'
     ) THEN
    SELECT pg_catalog.jsonb_build_object(
      'grn_id', grn.id,
      'grn_number', grn.grn_number,
      'status', grn.status
    )
    INTO v_grn
    FROM public.goods_received_notes AS grn
    WHERE grn.tenant_id = v_tenant
      AND grn.po_id = p_po_id
    ORDER BY (grn.status = 'draft') DESC, grn.id DESC
    LIMIT 1;

    RETURN pg_catalog.jsonb_build_object(
      'po_id', p_po_id,
      'status', v_po.status,
      'grn', v_grn
    );
  END IF;
  IF v_po.status <> 'pending_approval' THEN
    RAISE EXCEPTION 'purchase_order_not_reviewable'
      USING ERRCODE = '23514';
  END IF;

  IF v_action = 'approve' THEN
    UPDATE public.purchase_orders
    SET status = 'approved',
        status_reason = NULL,
        reviewed_at = pg_catalog.now(),
        reviewed_by = v_uid,
        updated_at = pg_catalog.now()
    WHERE id = p_po_id
      AND tenant_id = v_tenant;

    v_grn := private.ensure_grn_draft_for_po(
      v_tenant,
      p_po_id,
      v_uid,
      pg_catalog.gen_random_uuid()
    );
  ELSIF v_action = 'request_changes' THEN
    UPDATE public.purchase_orders
    SET status = 'changes_requested',
        status_reason = v_reason,
        reviewed_at = pg_catalog.now(),
        reviewed_by = v_uid,
        updated_at = pg_catalog.now()
    WHERE id = p_po_id
      AND tenant_id = v_tenant;
  ELSE
    UPDATE public.purchase_orders
    SET status = 'cancelled',
        status_reason = v_reason,
        reviewed_at = pg_catalog.now(),
        reviewed_by = v_uid,
        cancelled_at = pg_catalog.now(),
        updated_at = pg_catalog.now()
    WHERE id = p_po_id
      AND tenant_id = v_tenant;
  END IF;

  PERFORM public.log_audit(
    'procurement.po.' || v_action,
    'purchase_order',
    p_po_id,
    pg_catalog.to_jsonb(v_po),
    pg_catalog.jsonb_build_object(
      'status',
      CASE v_action
        WHEN 'approve' THEN 'approved'
        WHEN 'request_changes' THEN 'changes_requested'
        ELSE 'cancelled'
      END,
      'reason',
      v_reason,
      'grn',
      v_grn
    )
  );

  RETURN pg_catalog.jsonb_build_object(
    'po_id', p_po_id,
    'status',
    CASE v_action
      WHEN 'approve' THEN 'approved'
      WHEN 'request_changes' THEN 'changes_requested'
      ELSE 'cancelled'
    END,
    'grn',
    v_grn
  );
END;
$$;

REVOKE ALL ON FUNCTION public.review_purchase_order(bigint, text, text)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_purchase_order(bigint, text, text)
TO authenticated, service_role;

CREATE OR REPLACE FUNCTION private.ensure_grn_draft_after_po_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  PERFORM private.ensure_grn_draft_for_po(
    NEW.tenant_id,
    NEW.id,
    coalesce(auth.uid(), NEW.created_by),
    pg_catalog.gen_random_uuid()
  );
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.ensure_grn_draft_after_po_status()
FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS ensure_grn_draft_after_po_status
ON public.purchase_orders;

CREATE TRIGGER ensure_grn_draft_after_po_status
AFTER UPDATE OF status ON public.purchase_orders
FOR EACH ROW
WHEN (
  OLD.status IS DISTINCT FROM NEW.status
  AND NEW.status IN ('sent', 'approved', 'partially_received')
)
EXECUTE FUNCTION private.ensure_grn_draft_after_po_status();

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
  v_previously_applied numeric(15,3);
  v_remaining numeric(15,3);
  v_applied_base numeric(15,3);
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
  FROM public.goods_received_notes AS grn
  WHERE grn.id = p_grn_id
    AND grn.tenant_id = v_tenant
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'grn_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.has_permission(
    v_grn.branch_id,
    'procurement:grn_confirm'
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF v_grn.status = 'confirmed' THEN
    SELECT po.status
    INTO v_po_status
    FROM public.purchase_orders AS po
    WHERE po.id = v_grn.po_id
      AND po.tenant_id = v_tenant;

    RETURN pg_catalog.jsonb_build_object(
      'grn_id', p_grn_id,
      'status', 'confirmed',
      'po_id', v_grn.po_id,
      'po_status', v_po_status
    );
  END IF;
  IF v_grn.status <> 'draft' THEN
    RAISE EXCEPTION 'grn_not_draft' USING ERRCODE = '23514';
  END IF;

  SELECT po.*
  INTO v_po
  FROM public.purchase_orders AS po
  WHERE po.id = v_grn.po_id
    AND po.tenant_id = v_tenant
  FOR UPDATE;

  IF NOT FOUND
     OR v_po.status NOT IN ('sent', 'approved', 'partially_received')
     OR v_po.supplier_id <> v_grn.supplier_id
     OR v_po.branch_id <> v_grn.branch_id THEN
    RAISE EXCEPTION 'grn_purchase_order_invalid'
      USING ERRCODE = '23514';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.grn_items AS item
    WHERE item.grn_id = p_grn_id
      AND item.tenant_id = v_tenant
      AND (
        item.received_quantity < 0
        OR item.rejected_quantity < 0
        OR item.rejected_quantity > item.received_quantity
        OR (
          item.rejected_quantity > 0
          AND (
            nullif(
              pg_catalog.btrim(item.rejection_reason),
              ''
            ) IS NULL
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
    FROM public.grn_items AS item
    WHERE item.grn_id = p_grn_id
      AND item.tenant_id = v_tenant
      AND item.received_quantity - item.rejected_quantity > 0
  ) THEN
    RAISE EXCEPTION 'grn_has_no_accepted_quantity'
      USING ERRCODE = '23514';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.grn_items AS item
    JOIN public.purchase_order_items AS po_item
      ON po_item.id = item.purchase_order_item_id
     AND po_item.tenant_id = item.tenant_id
     AND po_item.po_id = v_po.id
    LEFT JOIN LATERAL (
      SELECT pg_catalog.sum(previous_item.po_applied_quantity) AS quantity
      FROM public.grn_items AS previous_item
      JOIN public.goods_received_notes AS previous_grn
        ON previous_grn.id = previous_item.grn_id
       AND previous_grn.tenant_id = previous_item.tenant_id
      WHERE previous_item.tenant_id = v_tenant
        AND previous_item.purchase_order_item_id = po_item.id
        AND previous_grn.status = 'confirmed'
    ) AS received ON TRUE
    WHERE item.grn_id = p_grn_id
      AND item.tenant_id = v_tenant
      AND item.received_quantity - item.rejected_quantity
        > greatest(
          po_item.quantity - coalesce(received.quantity, 0),
          0
        )
  ) THEN
    RAISE EXCEPTION 'grn_over_receipt_not_allowed'
      USING ERRCODE = '23514';
  END IF;

  PERFORM 1
  FROM public.purchase_order_items AS po_item
  WHERE po_item.po_id = v_po.id
    AND po_item.tenant_id = v_tenant
  ORDER BY po_item.id
  FOR UPDATE;

  PERFORM pg_catalog.set_config(
    'comtammatu.grn_confirm',
    'true',
    TRUE
  );

  FOR v_item IN
    SELECT
      grn_item.*,
      po_item.quantity AS ordered_quantity
    FROM public.grn_items AS grn_item
    JOIN public.purchase_order_items AS po_item
      ON po_item.id = grn_item.purchase_order_item_id
     AND po_item.tenant_id = grn_item.tenant_id
     AND po_item.po_id = v_po.id
    WHERE grn_item.grn_id = p_grn_id
      AND grn_item.tenant_id = v_tenant
    ORDER BY grn_item.id
    FOR UPDATE OF grn_item
  LOOP
    v_accepted := v_item.received_quantity - v_item.rejected_quantity;

    SELECT coalesce(
      pg_catalog.sum(previous_item.po_applied_quantity),
      0
    )
    INTO v_previously_applied
    FROM public.grn_items AS previous_item
    JOIN public.goods_received_notes AS previous_grn
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
    IF v_accepted > v_remaining THEN
      RAISE EXCEPTION 'grn_over_receipt_not_allowed'
        USING ERRCODE = '23514';
    END IF;

    v_applied_base := public.inv_to_base(
      v_item.ingredient_id,
      v_item.entry_unit_id,
      v_accepted
    );

    SELECT stock.current_quantity, stock.avg_unit_cost
    INTO v_old_quantity, v_old_wac
    FROM public.stock_levels AS stock
    WHERE stock.tenant_id = v_tenant
      AND stock.branch_id = v_grn.branch_id
      AND stock.location_id = v_grn.location_id
      AND stock.ingredient_id = v_item.ingredient_id
    FOR UPDATE;

    IF NOT FOUND THEN
      v_old_quantity := 0;
      v_old_wac := NULL;
    END IF;

    v_applied_money := CASE
      WHEN v_item.cost_pending
        THEN pg_catalog.round(
          v_applied_base * coalesce(v_old_wac, 0),
          2
        )
      ELSE pg_catalog.round(v_accepted * v_item.unit_cost, 2)
    END;
    v_applied_cost_base := CASE
      WHEN v_applied_base > 0
        THEN pg_catalog.round(v_applied_money / v_applied_base, 2)
      ELSE 0
    END;

    IF v_accepted > 0 THEN
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
        v_accepted
      );
    END IF;

    v_new_quantity :=
      coalesce(v_old_quantity, 0) + v_applied_base;
    v_new_wac := CASE
      WHEN v_new_quantity > 0 THEN (
        coalesce(v_old_quantity, 0)
          * coalesce(v_old_wac, 0)
        + v_applied_money
      ) / v_new_quantity
      ELSE coalesce(v_old_wac, 0)
    END;

    UPDATE public.stock_levels AS stock
    SET avg_unit_cost = v_new_wac,
        updated_at = pg_catalog.now()
    WHERE stock.tenant_id = v_tenant
      AND stock.branch_id = v_grn.branch_id
      AND stock.location_id = v_grn.location_id
      AND stock.ingredient_id = v_item.ingredient_id;

    UPDATE public.grn_items
    SET po_applied_quantity = v_accepted,
        total_cost = v_applied_money
    WHERE id = v_item.id
      AND tenant_id = v_tenant;
  END LOOP;

  UPDATE public.goods_received_notes
  SET status = 'confirmed',
      received_date = pg_catalog.now(),
      received_by = v_uid,
      updated_at = pg_catalog.now()
  WHERE id = p_grn_id
    AND tenant_id = v_tenant;

  SELECT pg_catalog.bool_and(
    coalesce(received.quantity, 0) >= po_item.quantity
  )
  INTO v_po_complete
  FROM public.purchase_order_items AS po_item
  LEFT JOIN LATERAL (
    SELECT pg_catalog.sum(grn_item.po_applied_quantity) AS quantity
    FROM public.grn_items AS grn_item
    JOIN public.goods_received_notes AS grn
      ON grn.id = grn_item.grn_id
     AND grn.tenant_id = grn_item.tenant_id
    WHERE grn_item.tenant_id = v_tenant
      AND grn_item.purchase_order_item_id = po_item.id
      AND grn.status = 'confirmed'
  ) AS received ON TRUE
  WHERE po_item.po_id = v_po.id
    AND po_item.tenant_id = v_tenant;

  v_po_status := CASE
    WHEN coalesce(v_po_complete, FALSE) THEN 'received'
    ELSE 'partially_received'
  END;

  UPDATE public.purchase_orders
  SET status = v_po_status,
      updated_at = pg_catalog.now()
  WHERE id = v_po.id
    AND tenant_id = v_tenant;

  PERFORM public.log_audit(
    'inventory.grn.confirmed',
    'goods_received_note',
    p_grn_id,
    pg_catalog.to_jsonb(v_grn),
    pg_catalog.jsonb_build_object(
      'status', 'confirmed',
      'po_id', v_po.id,
      'po_status', v_po_status
    )
  );

  RETURN pg_catalog.jsonb_build_object(
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
BEGIN
  IF auth.uid() IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  IF pg_catalog.length(
    pg_catalog.btrim(coalesce(p_reason, ''))
  ) < 5 THEN
    RAISE EXCEPTION 'reason_required' USING ERRCODE = '22023';
  END IF;

  SELECT po.*
  INTO v_po
  FROM public.purchase_orders AS po
  WHERE po.id = p_po_id
    AND po.tenant_id = v_tenant
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
        nullif(notes, ''),
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

  PERFORM public.log_audit(
    'procurement.po.cancelled',
    'purchase_order',
    p_po_id,
    pg_catalog.to_jsonb(v_po),
    pg_catalog.jsonb_build_object(
      'status', 'cancelled',
      'reason', pg_catalog.btrim(p_reason),
      'cancelled_draft_grns', v_cancelled_grns
    )
  );

  RETURN pg_catalog.jsonb_build_object(
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
  IF pg_catalog.length(
    pg_catalog.btrim(coalesce(p_reason, ''))
  ) < 5 THEN
    RAISE EXCEPTION 'reason_required' USING ERRCODE = '22023';
  END IF;

  SELECT po.*
  INTO v_po
  FROM public.purchase_orders AS po
  WHERE po.id = p_po_id
    AND po.tenant_id = v_tenant
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'purchase_order_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.has_permission(
    v_po.branch_id,
    'procurement:po_approve'
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF v_po.status <> 'partially_received' THEN
    RAISE EXCEPTION 'purchase_order_not_closable'
      USING ERRCODE = '23514';
  END IF;

  UPDATE public.goods_received_notes
  SET status = 'cancelled',
      notes = pg_catalog.concat_ws(
        E'\n',
        nullif(notes, ''),
        'Đóng phần còn lại của PO: ' || pg_catalog.btrim(p_reason)
      ),
      updated_at = pg_catalog.now()
  WHERE tenant_id = v_tenant
    AND po_id = p_po_id
    AND status = 'draft';

  UPDATE public.purchase_orders
  SET status = 'closed',
      status_reason = pg_catalog.btrim(p_reason),
      closed_at = pg_catalog.now(),
      updated_at = pg_catalog.now()
  WHERE id = p_po_id
    AND tenant_id = v_tenant;

  PERFORM public.log_audit(
    'procurement.po.closed',
    'purchase_order',
    p_po_id,
    pg_catalog.to_jsonb(v_po),
    pg_catalog.jsonb_build_object(
      'status', 'closed',
      'reason', pg_catalog.btrim(p_reason)
    )
  );

  RETURN pg_catalog.jsonb_build_object(
    'id', p_po_id,
    'status', 'closed'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_purchase_order(bigint, text)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_purchase_order(bigint, text)
TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.close_purchase_order(bigint, text)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.close_purchase_order(bigint, text)
TO authenticated, service_role;

COMMENT ON FUNCTION public.save_purchase_order_group(
  uuid,
  bigint,
  date,
  text,
  jsonb,
  boolean,
  uuid
) IS
  'Atomically saves one warehouse purchase group as one PO per preferred supplier. Missing preferred suppliers return structured validation and create no rows.';

COMMENT ON FUNCTION public.review_purchase_order(bigint, text, text) IS
  'Approves, returns, or rejects a pending PO. Approval creates exactly one active draft GRN in the same transaction.';
