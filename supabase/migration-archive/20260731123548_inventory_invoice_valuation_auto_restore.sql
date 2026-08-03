BEGIN;

UPDATE public.inventory_valuation_cutovers
SET status = 'active',
    activated_at = coalesce(activated_at, pg_catalog.now()),
    updated_at = pg_catalog.now()
WHERE status = 'shadow';

ALTER TABLE public.inventory_valuation_cutovers
  DROP CONSTRAINT IF EXISTS inventory_valuation_cutovers_status_check,
  ADD CONSTRAINT inventory_valuation_cutovers_status_check
    CHECK (status IN ('inactive', 'active'));

CREATE OR REPLACE FUNCTION private.apply_latest_supplier_price_to_grn_line()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  NEW.unit_cost := 0;
  NEW.cost_pending := TRUE;
  NEW.provisional_cost_source := 'pending';
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.bootstrap_inventory_valuation_from_invoices(
  p_tenant_id bigint
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_cutover public.inventory_valuation_cutovers%ROWTYPE;
  v_movement record;
  v_invoice record;
  v_origin public.inventory_cost_origins%ROWTYPE;
  v_account public.inventory_valuation_accounts%ROWTYPE;
  v_grn_item_id bigint;
  v_balance_id bigint;
  v_event_id bigint;
  v_quantity numeric(20,3);
  v_cutoff_at timestamptz;
  v_opening_quantity numeric(20,3) := 0;
  v_opening_value numeric(20,2) := 0;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'inventory-valuation-bootstrap:' || p_tenant_id::text,
      0
    )
  );

  SELECT cutover.*
  INTO v_cutover
  FROM public.inventory_valuation_cutovers AS cutover
  WHERE cutover.tenant_id = p_tenant_id
  FOR UPDATE;

  IF FOUND AND v_cutover.status = 'active' THEN
    RETURN pg_catalog.jsonb_build_object(
      'status', 'active',
      'opening_quantity', v_cutover.opening_quantity,
      'opening_value', v_cutover.opening_value,
      'replayed', TRUE
    );
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.inventory_valuation_accounts AS account
    WHERE account.tenant_id = p_tenant_id
  ) OR EXISTS (
    SELECT 1
    FROM public.inventory_cost_origins AS origin
    WHERE origin.tenant_id = p_tenant_id
  ) OR EXISTS (
    SELECT 1
    FROM public.inventory_valuation_events AS event
    WHERE event.tenant_id = p_tenant_id
  ) THEN
    RAISE EXCEPTION 'inventory_valuation_ledger_not_pristine'
      USING ERRCODE = '23514';
  END IF;

  WITH candidates AS (
    SELECT
      movement.id AS movement_id,
      pg_catalog.min(item.id) AS grn_item_id,
      pg_catalog.count(*) AS item_count
    FROM public.stock_movements AS movement
    JOIN public.grn_items AS item
      ON item.tenant_id = movement.tenant_id
     AND item.grn_id = movement.grn_id
     AND item.ingredient_id = movement.ingredient_id
    WHERE movement.tenant_id = p_tenant_id
      AND movement.type IN ('grn_receipt', 'grn_amend')
      AND movement.grn_item_id IS NULL
    GROUP BY movement.id
  )
  UPDATE public.stock_movements AS movement
  SET grn_item_id = candidate.grn_item_id
  FROM candidates AS candidate
  WHERE movement.id = candidate.movement_id
    AND candidate.item_count = 1;

  IF EXISTS (
    SELECT 1
    FROM public.stock_movements AS movement
    WHERE movement.tenant_id = p_tenant_id
      AND movement.type IN ('grn_receipt', 'grn_amend')
      AND movement.grn_item_id IS NULL
  ) THEN
    RAISE EXCEPTION 'inventory_valuation_grn_lineage_missing'
      USING ERRCODE = '23514';
  END IF;

  SELECT coalesce(pg_catalog.min(grn.received_date), pg_catalog.now())
  INTO v_cutoff_at
  FROM public.goods_received_notes AS grn
  WHERE grn.tenant_id = p_tenant_id
    AND grn.status = 'confirmed';

  INSERT INTO public.inventory_valuation_cutovers (
    tenant_id,
    status,
    cutoff_at,
    prepared_at,
    prepared_by,
    activated_at,
    activated_by,
    idempotency_key
  )
  VALUES (
    p_tenant_id,
    'active',
    v_cutoff_at,
    pg_catalog.now(),
    auth.uid(),
    pg_catalog.now(),
    auth.uid(),
    pg_catalog.md5('inventory-valuation-auto:' || p_tenant_id::text)::uuid
  )
  ON CONFLICT (tenant_id) DO UPDATE
  SET status = 'active',
      cutoff_at = EXCLUDED.cutoff_at,
      prepared_at = EXCLUDED.prepared_at,
      prepared_by = EXCLUDED.prepared_by,
      activated_at = EXCLUDED.activated_at,
      activated_by = EXCLUDED.activated_by,
      idempotency_key = EXCLUDED.idempotency_key,
      updated_at = pg_catalog.now();

  INSERT INTO public.inventory_valuation_settings (tenant_id)
  VALUES (p_tenant_id)
  ON CONFLICT (tenant_id) DO NOTHING;

  CREATE TRIGGER zzzz_inventory_valuation_bootstrap_replay
  AFTER UPDATE OF unit_cost ON public.stock_movements
  FOR EACH ROW
  EXECUTE FUNCTION private.post_stock_movement_valuation();

  FOR v_movement IN
    SELECT movement.id
    FROM public.stock_movements AS movement
    WHERE movement.tenant_id = p_tenant_id
      AND movement.type <> 'grn_amend'
    ORDER BY movement.created_at, movement.id
  LOOP
    UPDATE public.stock_movements
    SET unit_cost = unit_cost
    WHERE id = v_movement.id
      AND tenant_id = p_tenant_id;
  END LOOP;

  DROP TRIGGER zzzz_inventory_valuation_bootstrap_replay
    ON public.stock_movements;

  FOR v_movement IN
    SELECT
      movement.id,
      movement.grn_id,
      movement.ingredient_id,
      movement.branch_id,
      movement.location_id,
      movement.quantity_change,
      movement.created_at,
      movement.created_by
    FROM public.stock_movements AS movement
    WHERE movement.tenant_id = p_tenant_id
      AND movement.type = 'grn_amend'
    ORDER BY movement.created_at, movement.id
  LOOP
    SELECT item.id
    INTO v_grn_item_id
    FROM public.grn_items AS item
    WHERE item.tenant_id = p_tenant_id
      AND item.grn_id = v_movement.grn_id
      AND item.ingredient_id = v_movement.ingredient_id
    ORDER BY item.id
    LIMIT 1;

    IF v_grn_item_id IS NULL THEN
      RAISE EXCEPTION 'inventory_valuation_grn_amend_lineage_missing'
        USING ERRCODE = '23514';
    END IF;

    v_quantity := v_movement.quantity_change;
    IF v_quantity <= 0 THEN
      RAISE EXCEPTION 'inventory_valuation_grn_amend_quantity_invalid'
        USING ERRCODE = '23514';
    END IF;

    SELECT origin.*
    INTO v_origin
    FROM public.inventory_cost_origins AS origin
    WHERE origin.tenant_id = p_tenant_id
      AND origin.source_kind = 'grn_receipt'
      AND origin.grn_item_id = v_grn_item_id
    ORDER BY origin.id
    LIMIT 1
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'inventory_valuation_grn_amend_origin_missing'
        USING ERRCODE = '23514';
    END IF;

    SELECT account.*
    INTO v_account
    FROM public.inventory_valuation_accounts AS account
    WHERE account.tenant_id = p_tenant_id
      AND account.branch_id = v_movement.branch_id
      AND account.location_id = v_movement.location_id
      AND account.ingredient_id = v_movement.ingredient_id
    FOR UPDATE;

    SELECT balance.id
    INTO v_balance_id
    FROM public.inventory_origin_balances AS balance
    WHERE balance.tenant_id = p_tenant_id
      AND balance.origin_id = v_origin.id
      AND balance.valuation_account_id = v_account.id
      AND balance.holder_kind = 'stock_pool'
    FOR UPDATE;

    UPDATE public.inventory_cost_origins
    SET original_quantity = original_quantity + v_quantity
    WHERE id = v_origin.id
      AND tenant_id = p_tenant_id;

    UPDATE public.inventory_origin_balances
    SET quantity = quantity + v_quantity,
        updated_at = pg_catalog.now()
    WHERE id = v_balance_id;

    UPDATE public.inventory_valuation_accounts
    SET quantity = quantity + v_quantity,
        valuation_version = valuation_version + 1,
        updated_at = pg_catalog.now()
    WHERE id = v_account.id
      AND tenant_id = p_tenant_id;

    INSERT INTO public.inventory_valuation_events (
      tenant_id,
      ingredient_id,
      event_type,
      stock_movement_id,
      grn_item_id,
      to_account_id,
      quantity_delta,
      value_delta,
      effective_at,
      posting_year,
      posting_month,
      idempotency_key,
      created_by
    )
    VALUES (
      p_tenant_id,
      v_movement.ingredient_id,
      'receipt',
      v_movement.id,
      v_grn_item_id,
      v_account.id,
      v_quantity,
      0,
      v_movement.created_at,
      extract(
        YEAR FROM v_movement.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh'
      )::integer,
      extract(
        MONTH FROM v_movement.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh'
      )::integer,
      pg_catalog.md5('stock-movement:' || v_movement.id::text)::uuid,
      v_movement.created_by
    )
    RETURNING id INTO v_event_id;

    INSERT INTO public.inventory_value_allocations (
      tenant_id,
      valuation_event_id,
      source_origin_id,
      to_balance_id,
      allocation_bucket,
      allocated_quantity,
      allocated_value,
      allocation_fraction
    )
    VALUES (
      p_tenant_id,
      v_event_id,
      v_origin.id,
      v_balance_id,
      'inventory',
      v_quantity,
      0,
      v_quantity / (v_origin.original_quantity + v_quantity)
    );
  END LOOP;

  FOR v_invoice IN
    SELECT invoice.id
    FROM public.supplier_invoices AS invoice
    WHERE invoice.tenant_id = p_tenant_id
      AND invoice.document_status = 'confirmed'
      AND invoice.invoice_kind = 'goods'
    ORDER BY invoice.id
  LOOP
    PERFORM private.settle_supplier_invoice_valuation(
      v_invoice.id,
      pg_catalog.md5(
        'inventory-valuation-auto-settlement:' || v_invoice.id::text
      )::uuid
    );
  END LOOP;

  UPDATE public.stock_levels AS stock
  SET avg_unit_cost = CASE
        WHEN account.quantity > 0
          THEN pg_catalog.round(account.book_value / account.quantity, 8)
        ELSE 0
      END,
      updated_at = pg_catalog.now()
  FROM public.inventory_valuation_accounts AS account
  WHERE account.tenant_id = p_tenant_id
    AND stock.tenant_id = account.tenant_id
    AND stock.branch_id = account.branch_id
    AND stock.location_id = account.location_id
    AND stock.ingredient_id = account.ingredient_id;

  SELECT
    coalesce(pg_catalog.sum(account.quantity), 0),
    coalesce(pg_catalog.sum(account.book_value), 0)
  INTO v_opening_quantity, v_opening_value
  FROM public.inventory_valuation_accounts AS account
  WHERE account.tenant_id = p_tenant_id;

  UPDATE public.inventory_valuation_cutovers
  SET opening_quantity = v_opening_quantity,
      opening_value = v_opening_value,
      updated_at = pg_catalog.now()
  WHERE tenant_id = p_tenant_id;

  RETURN pg_catalog.jsonb_build_object(
    'status', 'active',
    'opening_quantity', v_opening_quantity,
    'opening_value', v_opening_value,
    'replayed', FALSE
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.prepare_inventory_valuation_cutover(
  p_idempotency_key uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_tenant bigint := public.auth_tenant_id();
BEGIN
  IF auth.uid() IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  IF NOT public.auth_is_owner(auth.uid())
     OR NOT public.has_permission_any('inventory:valuation_read') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_idempotency_key IS NULL THEN
    RAISE EXCEPTION 'inventory_valuation_cutover_invalid'
      USING ERRCODE = '22023';
  END IF;

  RETURN private.bootstrap_inventory_valuation_from_invoices(v_tenant);
END;
$$;

CREATE OR REPLACE FUNCTION public.activate_inventory_valuation_cutover(
  p_idempotency_key uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  RETURN public.prepare_inventory_valuation_cutover(p_idempotency_key);
END;
$$;

REVOKE ALL ON FUNCTION
  private.apply_latest_supplier_price_to_grn_line(),
  private.bootstrap_inventory_valuation_from_invoices(bigint)
FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION
  public.prepare_inventory_valuation_cutover(uuid),
  public.activate_inventory_valuation_cutover(uuid)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION
  public.prepare_inventory_valuation_cutover(uuid),
  public.activate_inventory_valuation_cutover(uuid)
TO authenticated, service_role;

DO $$
DECLARE
  v_tenant record;
BEGIN
  FOR v_tenant IN
    SELECT id, owner_user_id
    FROM public.tenants
    ORDER BY id
  LOOP
    PERFORM pg_catalog.set_config(
      'request.jwt.claims',
      pg_catalog.jsonb_build_object(
        'sub', v_tenant.owner_user_id::text,
        'role', 'authenticated'
      )::text,
      TRUE
    );
    PERFORM private.bootstrap_inventory_valuation_from_invoices(v_tenant.id);
  END LOOP;
END;
$$;

COMMIT;
