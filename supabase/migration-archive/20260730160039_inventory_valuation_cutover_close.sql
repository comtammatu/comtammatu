-- Controlled opening, shadow activation, reconciliation, and management close.

CREATE TABLE public.inventory_cost_close_snapshots (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id bigint NOT NULL
    REFERENCES public.tenants(id) ON DELETE CASCADE,
  year integer NOT NULL CHECK (year >= 2000),
  month integer NOT NULL CHECK (month BETWEEN 1 AND 12),
  opening_inventory numeric(20,2) NOT NULL,
  receipt_value numeric(20,2) NOT NULL,
  invoice_revaluation numeric(20,2) NOT NULL,
  food_cost numeric(20,2) NOT NULL,
  waste_value numeric(20,2) NOT NULL,
  transfer_loss numeric(20,2) NOT NULL,
  ending_inventory numeric(20,2) NOT NULL,
  attention_count integer NOT NULL DEFAULT 0,
  waiver_reason text,
  closed_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  closed_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  idempotency_key uuid NOT NULL,
  UNIQUE (tenant_id, year, month),
  UNIQUE (tenant_id, idempotency_key)
);

ALTER TABLE public.inventory_cost_close_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY inventory_cost_close_snapshots_read
ON public.inventory_cost_close_snapshots
FOR SELECT TO authenticated
USING (
  tenant_id = public.auth_tenant_id()
  AND public.has_permission_any('inventory:valuation_read')
);

REVOKE ALL ON public.inventory_cost_close_snapshots
FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.inventory_cost_close_snapshots TO authenticated;
GRANT ALL ON public.inventory_cost_close_snapshots TO service_role;
REVOKE ALL ON SEQUENCE public.inventory_cost_close_snapshots_id_seq
FROM PUBLIC, anon, authenticated;
GRANT ALL ON SEQUENCE public.inventory_cost_close_snapshots_id_seq
TO service_role;

CREATE OR REPLACE FUNCTION public.prepare_inventory_valuation_cutover(
  p_idempotency_key uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_tenant bigint := public.auth_tenant_id();
  v_existing public.inventory_valuation_cutovers%ROWTYPE;
  v_stock record;
  v_account_id bigint;
  v_origin_id bigint;
  v_balance_id bigint;
  v_event_id bigint;
  v_value numeric(20,2);
  v_total_quantity numeric(20,3) := 0;
  v_total_value numeric(20,2) := 0;
  v_hash text;
BEGIN
  IF v_uid IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  IF NOT public.has_permission_any('inventory:valuation_read') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_idempotency_key IS NULL THEN
    RAISE EXCEPTION 'inventory_valuation_cutover_invalid'
      USING ERRCODE = '22023';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'inventory-valuation-cutover:' || v_tenant::text,
      0
    )
  );

  SELECT cutover.*
  INTO v_existing
  FROM public.inventory_valuation_cutovers AS cutover
  WHERE cutover.tenant_id = v_tenant
  FOR UPDATE;

  IF FOUND THEN
    IF v_existing.idempotency_key = p_idempotency_key
       OR v_existing.status IN ('shadow', 'active') THEN
      RETURN pg_catalog.jsonb_build_object(
        'status', v_existing.status,
        'cutoff_at', v_existing.cutoff_at,
        'opening_quantity', v_existing.opening_quantity,
        'opening_value', v_existing.opening_value,
        'reconciliation_hash', v_existing.reconciliation_hash,
        'replayed', TRUE
      );
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.stock_levels AS stock
    WHERE stock.tenant_id = v_tenant
      AND stock.current_quantity > 0
      AND coalesce(stock.avg_unit_cost, 0) <= 0
  ) THEN
    RAISE EXCEPTION 'inventory_valuation_zero_cost_stock'
      USING ERRCODE = '23514';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.inventory_origin_balances AS balance
    JOIN public.inventory_cost_origins AS origin
      ON origin.id = balance.origin_id
     AND origin.tenant_id = balance.tenant_id
    WHERE balance.tenant_id = v_tenant
      AND balance.quantity > 0
      AND origin.cost_status = 'pending'
  ) THEN
    RAISE EXCEPTION 'inventory_valuation_cost_pending'
      USING ERRCODE = '23514';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.inventory_valuation_accounts AS account
    WHERE account.tenant_id = v_tenant
      AND account.quantity = 0
      AND account.book_value <> 0
  ) THEN
    RAISE EXCEPTION 'inventory_valuation_zero_quantity_residual'
      USING ERRCODE = '23514';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.stock_movements AS movement
    JOIN public.inventory_valuation_cutovers AS cutover
      ON cutover.tenant_id = movement.tenant_id
    LEFT JOIN public.inventory_valuation_events AS event
      ON event.tenant_id = movement.tenant_id
     AND event.stock_movement_id = movement.id
    WHERE movement.tenant_id = v_tenant
      AND movement.created_at >= cutover.cutoff_at
      AND event.id IS NULL
  ) THEN
    RAISE EXCEPTION 'inventory_valuation_movement_unposted'
      USING ERRCODE = '23514';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.stock_levels AS stock
    WHERE stock.tenant_id = v_tenant
      AND stock.current_quantity < 0
  ) THEN
    RAISE EXCEPTION 'inventory_valuation_negative_stock'
      USING ERRCODE = '23514';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.stock_movements AS movement
    WHERE movement.tenant_id = v_tenant
      AND movement.quantity_change <> 0
      AND movement.unit_cost IS NULL
  ) THEN
    RAISE EXCEPTION 'inventory_valuation_movement_cost_missing'
      USING ERRCODE = '23514';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.stock_levels AS stock
    FULL JOIN (
      SELECT
        movement.tenant_id,
        movement.branch_id,
        movement.location_id,
        movement.ingredient_id,
        pg_catalog.sum(movement.quantity_change) AS quantity
      FROM public.stock_movements AS movement
      WHERE movement.tenant_id = v_tenant
      GROUP BY
        movement.tenant_id,
        movement.branch_id,
        movement.location_id,
        movement.ingredient_id
    ) AS movement_total
      ON movement_total.tenant_id = stock.tenant_id
     AND movement_total.branch_id = stock.branch_id
     AND movement_total.location_id = stock.location_id
     AND movement_total.ingredient_id = stock.ingredient_id
    WHERE coalesce(stock.tenant_id, movement_total.tenant_id) = v_tenant
      AND coalesce(stock.current_quantity, 0)
        IS DISTINCT FROM coalesce(movement_total.quantity, 0)
  ) THEN
    RAISE EXCEPTION 'inventory_valuation_quantity_drift'
      USING ERRCODE = '23514';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.grn_items AS item
    JOIN public.stock_movements AS movement
      ON movement.tenant_id = item.tenant_id
     AND movement.grn_id = item.grn_id
     AND movement.ingredient_id = item.ingredient_id
     AND movement.type = 'grn_receipt'
     AND movement.grn_item_id IS NULL
    WHERE item.tenant_id = v_tenant
    GROUP BY item.grn_id, item.ingredient_id
    HAVING pg_catalog.count(*) > 1
  ) THEN
    RAISE EXCEPTION 'inventory_valuation_ambiguous_grn_lineage'
      USING ERRCODE = '23514';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.stock_transfers AS transfer
    WHERE transfer.tenant_id = v_tenant
      AND transfer.status IN ('confirmed_ship', 'in_transit', 'confirmed_receive')
  ) OR EXISTS (
    SELECT 1
    FROM public.production_runs AS run
    WHERE run.tenant_id = v_tenant
      AND run.status = 'in_progress'
  ) THEN
    RAISE EXCEPTION 'inventory_valuation_propagation_unfinished'
      USING ERRCODE = '23514';
  END IF;

  INSERT INTO public.inventory_valuation_cutovers (
    tenant_id,
    status,
    cutoff_at,
    prepared_at,
    prepared_by,
    idempotency_key
  )
  VALUES (
    v_tenant,
    'inactive',
    pg_catalog.now(),
    pg_catalog.now(),
    v_uid,
    p_idempotency_key
  )
  ON CONFLICT (tenant_id)
  DO UPDATE SET
    cutoff_at = EXCLUDED.cutoff_at,
    prepared_at = EXCLUDED.prepared_at,
    prepared_by = EXCLUDED.prepared_by,
    idempotency_key = EXCLUDED.idempotency_key,
    updated_at = pg_catalog.now();

  INSERT INTO public.inventory_valuation_settings (tenant_id)
  VALUES (v_tenant)
  ON CONFLICT (tenant_id) DO NOTHING;

  FOR v_stock IN
    SELECT stock.*
    FROM public.stock_levels AS stock
    WHERE stock.tenant_id = v_tenant
      AND stock.current_quantity > 0
    ORDER BY
      stock.branch_id,
      stock.location_id,
      stock.ingredient_id
    FOR UPDATE
  LOOP
    PERFORM private.lock_inventory_valuation_pool(
      v_tenant,
      v_stock.branch_id,
      v_stock.location_id,
      v_stock.ingredient_id
    );
    v_value := pg_catalog.round(
      v_stock.current_quantity * v_stock.avg_unit_cost,
      2
    );

    INSERT INTO public.inventory_valuation_accounts (
      tenant_id,
      branch_id,
      location_id,
      ingredient_id,
      quantity,
      book_value
    )
    VALUES (
      v_tenant,
      v_stock.branch_id,
      v_stock.location_id,
      v_stock.ingredient_id,
      v_stock.current_quantity,
      v_value
    )
    ON CONFLICT (tenant_id, branch_id, location_id, ingredient_id)
    DO UPDATE SET
      quantity = EXCLUDED.quantity,
      book_value = EXCLUDED.book_value,
      valuation_version =
        public.inventory_valuation_accounts.valuation_version + 1,
      updated_at = pg_catalog.now()
    RETURNING id INTO v_account_id;

    v_origin_id := private.create_inventory_cost_origin(
      v_tenant,
      v_stock.ingredient_id,
      'opening',
      v_stock.id,
      NULL,
      v_stock.current_quantity,
      v_value,
      pg_catalog.now(),
      'finalized'
    );

    UPDATE public.inventory_cost_origins
    SET finalized_quantity = original_quantity,
        finalized_value = provisional_value,
        cost_status = 'finalized'
    WHERE id = v_origin_id;

    INSERT INTO public.inventory_origin_balances (
      tenant_id,
      origin_id,
      holder_kind,
      valuation_account_id,
      quantity,
      book_value
    )
    VALUES (
      v_tenant,
      v_origin_id,
      'stock_pool',
      v_account_id,
      v_stock.current_quantity,
      v_value
    )
    ON CONFLICT (
      tenant_id,
      origin_id,
      valuation_account_id
    ) WHERE holder_kind = 'stock_pool'
    DO UPDATE SET
      quantity = EXCLUDED.quantity,
      book_value = EXCLUDED.book_value,
      updated_at = pg_catalog.now()
    RETURNING id INTO v_balance_id;

    INSERT INTO public.inventory_valuation_events (
      tenant_id,
      ingredient_id,
      event_type,
      to_account_id,
      quantity_delta,
      value_delta,
      effective_at,
      posting_year,
      posting_month,
      idempotency_key,
      metadata,
      created_by
    )
    VALUES (
      v_tenant,
      v_stock.ingredient_id,
      'opening',
      v_account_id,
      v_stock.current_quantity,
      v_value,
      pg_catalog.now(),
      extract(
        YEAR FROM pg_catalog.now() AT TIME ZONE 'Asia/Ho_Chi_Minh'
      )::integer,
      extract(
        MONTH FROM pg_catalog.now() AT TIME ZONE 'Asia/Ho_Chi_Minh'
      )::integer,
      pg_catalog.md5(
        'inventory-opening:' || v_tenant::text || ':' || v_stock.id::text
      )::uuid,
      pg_catalog.jsonb_build_object('stock_level_id', v_stock.id),
      v_uid
    )
    ON CONFLICT (tenant_id, idempotency_key) DO NOTHING
    RETURNING id INTO v_event_id;

    IF v_event_id IS NULL THEN
      SELECT event.id
      INTO v_event_id
      FROM public.inventory_valuation_events AS event
      WHERE event.tenant_id = v_tenant
        AND event.idempotency_key = pg_catalog.md5(
          'inventory-opening:' || v_tenant::text || ':' || v_stock.id::text
        )::uuid;
    END IF;

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
      v_tenant,
      v_event_id,
      v_origin_id,
      v_balance_id,
      'inventory',
      v_stock.current_quantity,
      v_value,
      1
    )
    ON CONFLICT DO NOTHING;

    v_total_quantity := v_total_quantity + v_stock.current_quantity;
    v_total_value := v_total_value + v_value;
  END LOOP;

  SELECT pg_catalog.md5(
    coalesce(
      pg_catalog.string_agg(
        account.branch_id::text || ':'
          || account.location_id::text || ':'
          || account.ingredient_id::text || ':'
          || account.quantity::text || ':'
          || account.book_value::text,
        '|' ORDER BY
          account.branch_id,
          account.location_id,
          account.ingredient_id
      ),
      ''
    )
  )
  INTO v_hash
  FROM public.inventory_valuation_accounts AS account
  WHERE account.tenant_id = v_tenant;

  UPDATE public.inventory_valuation_cutovers
  SET status = 'shadow',
      opening_quantity = v_total_quantity,
      opening_value = v_total_value,
      reconciliation_hash = v_hash,
      updated_at = pg_catalog.now()
  WHERE tenant_id = v_tenant;

  RETURN pg_catalog.jsonb_build_object(
    'status', 'shadow',
    'opening_quantity', v_total_quantity,
    'opening_value', v_total_value,
    'reconciliation_hash', v_hash,
    'replayed', FALSE
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.activate_inventory_valuation_cutover(
  p_idempotency_key uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_tenant bigint := public.auth_tenant_id();
  v_cutover public.inventory_valuation_cutovers%ROWTYPE;
  v_quantity_mismatches integer;
  v_value_mismatches integer;
BEGIN
  IF v_uid IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  IF NOT public.has_permission_any('inventory:valuation_read') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_idempotency_key IS NULL THEN
    RAISE EXCEPTION 'inventory_valuation_activation_invalid'
      USING ERRCODE = '22023';
  END IF;

  SELECT cutover.*
  INTO v_cutover
  FROM public.inventory_valuation_cutovers AS cutover
  WHERE cutover.tenant_id = v_tenant
  FOR UPDATE;

  IF NOT FOUND OR v_cutover.status = 'inactive' THEN
    RAISE EXCEPTION 'inventory_valuation_cutover_not_prepared'
      USING ERRCODE = '23514';
  END IF;
  IF v_cutover.status = 'active' THEN
    RETURN pg_catalog.jsonb_build_object(
      'status', 'active',
      'activated_at', v_cutover.activated_at,
      'replayed', TRUE
    );
  END IF;

  SELECT
    pg_catalog.count(*) FILTER (
      WHERE account.quantity IS DISTINCT FROM stock.current_quantity
    ),
    pg_catalog.count(*) FILTER (
      WHERE account.book_value IS DISTINCT FROM origin_totals.book_value
         OR account.quantity IS DISTINCT FROM origin_totals.quantity
    )
  INTO v_quantity_mismatches, v_value_mismatches
  FROM public.inventory_valuation_accounts AS account
  FULL JOIN public.stock_levels AS stock
    ON stock.tenant_id = account.tenant_id
   AND stock.branch_id = account.branch_id
   AND stock.location_id = account.location_id
   AND stock.ingredient_id = account.ingredient_id
  LEFT JOIN LATERAL (
    SELECT
      coalesce(pg_catalog.sum(balance.quantity), 0) AS quantity,
      coalesce(pg_catalog.sum(balance.book_value), 0) AS book_value
    FROM public.inventory_origin_balances AS balance
    WHERE balance.tenant_id = account.tenant_id
      AND balance.valuation_account_id = account.id
      AND balance.holder_kind = 'stock_pool'
  ) AS origin_totals ON TRUE
  WHERE coalesce(account.tenant_id, stock.tenant_id) = v_tenant;

  IF v_quantity_mismatches <> 0 OR v_value_mismatches <> 0 THEN
    RAISE EXCEPTION 'inventory_valuation_reconciliation_failed'
      USING ERRCODE = '23514';
  END IF;

  UPDATE public.stock_levels AS stock
  SET avg_unit_cost = CASE
        WHEN account.quantity > 0
          THEN pg_catalog.round(account.book_value / account.quantity, 8)
        ELSE 0
      END,
      updated_at = pg_catalog.now()
  FROM public.inventory_valuation_accounts AS account
  WHERE account.tenant_id = v_tenant
    AND stock.tenant_id = account.tenant_id
    AND stock.branch_id = account.branch_id
    AND stock.location_id = account.location_id
    AND stock.ingredient_id = account.ingredient_id;

  UPDATE public.inventory_valuation_cutovers
  SET status = 'active',
      activated_at = pg_catalog.now(),
      activated_by = v_uid,
      idempotency_key = p_idempotency_key,
      updated_at = pg_catalog.now()
  WHERE tenant_id = v_tenant;

  RETURN pg_catalog.jsonb_build_object(
    'status', 'active',
    'activated_at', pg_catalog.now(),
    'replayed', FALSE
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.run_inventory_valuation_reconciliation()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_actor_tenant bigint := public.auth_tenant_id();
  v_tenant record;
  v_quantity_mismatches integer;
  v_value_mismatches integer;
  v_result jsonb := '[]'::jsonb;
BEGIN
  IF v_actor IS NOT NULL
     AND (
       v_actor_tenant IS NULL
       OR NOT public.has_permission_any('inventory:valuation_read')
     ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  FOR v_tenant IN
    SELECT cutover.tenant_id, cutover.status
    FROM public.inventory_valuation_cutovers AS cutover
    WHERE cutover.status IN ('shadow', 'active')
      AND (
        v_actor IS NULL
        OR cutover.tenant_id = v_actor_tenant
      )
    ORDER BY cutover.tenant_id
  LOOP
    SELECT
      pg_catalog.count(*) FILTER (
        WHERE account.quantity IS DISTINCT FROM stock.current_quantity
      ),
      pg_catalog.count(*) FILTER (
        WHERE account.book_value IS DISTINCT FROM origin_totals.book_value
           OR account.quantity IS DISTINCT FROM origin_totals.quantity
      )
    INTO v_quantity_mismatches, v_value_mismatches
    FROM public.inventory_valuation_accounts AS account
    FULL JOIN public.stock_levels AS stock
      ON stock.tenant_id = account.tenant_id
     AND stock.branch_id = account.branch_id
     AND stock.location_id = account.location_id
     AND stock.ingredient_id = account.ingredient_id
    LEFT JOIN LATERAL (
      SELECT
        coalesce(pg_catalog.sum(balance.quantity), 0) AS quantity,
        coalesce(pg_catalog.sum(balance.book_value), 0) AS book_value
      FROM public.inventory_origin_balances AS balance
      WHERE balance.tenant_id = account.tenant_id
        AND balance.valuation_account_id = account.id
        AND balance.holder_kind = 'stock_pool'
    ) AS origin_totals ON TRUE
    WHERE coalesce(account.tenant_id, stock.tenant_id) = v_tenant.tenant_id;

    v_result := v_result || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'tenant_id', v_tenant.tenant_id,
        'status', v_tenant.status,
        'quantity_mismatches', v_quantity_mismatches,
        'value_mismatches', v_value_mismatches,
        'is_reconciled',
          v_quantity_mismatches = 0 AND v_value_mismatches = 0
      )
    );
  END LOOP;

  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.close_inventory_cost_period(
  p_year integer,
  p_month integer,
  p_waiver_reason text,
  p_idempotency_key uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_tenant bigint := public.auth_tenant_id();
  v_period_start timestamptz;
  v_period_end timestamptz;
  v_attention_count integer;
  v_reconciliation jsonb;
  v_waiver text := nullif(pg_catalog.btrim(p_waiver_reason), '');
  v_snapshot public.inventory_cost_close_snapshots%ROWTYPE;
BEGIN
  IF v_uid IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  IF NOT public.has_permission_any('accounting:period_close') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_year < 2000
     OR p_month NOT BETWEEN 1 AND 12
     OR p_idempotency_key IS NULL THEN
    RAISE EXCEPTION 'inventory_cost_period_invalid'
      USING ERRCODE = '22023';
  END IF;

  SELECT snapshot.*
  INTO v_snapshot
  FROM public.inventory_cost_close_snapshots AS snapshot
  WHERE snapshot.tenant_id = v_tenant
    AND snapshot.year = p_year
    AND snapshot.month = p_month;
  IF FOUND THEN
    RETURN pg_catalog.jsonb_build_object(
      'status', 'closed',
      'year', p_year,
      'month', p_month,
      'attention_count', v_snapshot.attention_count,
      'replayed', TRUE
    );
  END IF;

  IF private.inventory_valuation_mode(v_tenant) <> 'active' THEN
    RAISE EXCEPTION 'inventory_valuation_not_active'
      USING ERRCODE = '23514';
  END IF;

  v_reconciliation := public.get_inventory_valuation_reconciliation(
    p_year,
    p_month,
    NULL
  );
  IF NOT (v_reconciliation->>'is_reconciled')::boolean THEN
    RAISE EXCEPTION 'inventory_valuation_reconciliation_failed'
      USING ERRCODE = '23514';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.inventory_valuation_accounts AS account
    WHERE account.tenant_id = v_tenant
      AND account.quantity > 0
      AND account.book_value <= 0
  ) THEN
    RAISE EXCEPTION 'inventory_valuation_zero_cost_stock'
      USING ERRCODE = '23514';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.inventory_origin_balances AS balance
    JOIN public.inventory_cost_origins AS origin
      ON origin.id = balance.origin_id
     AND origin.tenant_id = balance.tenant_id
    WHERE balance.tenant_id = v_tenant
      AND balance.quantity > 0
      AND origin.cost_status = 'pending'
  ) THEN
    RAISE EXCEPTION 'inventory_valuation_cost_pending'
      USING ERRCODE = '23514';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.inventory_valuation_accounts AS account
    WHERE account.tenant_id = v_tenant
      AND account.quantity = 0
      AND account.book_value <> 0
  ) THEN
    RAISE EXCEPTION 'inventory_valuation_zero_quantity_residual'
      USING ERRCODE = '23514';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.stock_movements AS movement
    JOIN public.inventory_valuation_cutovers AS cutover
      ON cutover.tenant_id = movement.tenant_id
    LEFT JOIN public.inventory_valuation_events AS event
      ON event.tenant_id = movement.tenant_id
     AND event.stock_movement_id = movement.id
    WHERE movement.tenant_id = v_tenant
      AND movement.created_at >= cutover.cutoff_at
      AND event.id IS NULL
  ) THEN
    RAISE EXCEPTION 'inventory_valuation_movement_unposted'
      USING ERRCODE = '23514';
  END IF;

  v_period_start := pg_catalog.make_timestamptz(
    p_year,
    p_month,
    1,
    0,
    0,
    0,
    'Asia/Ho_Chi_Minh'
  );
  v_period_end := v_period_start + interval '1 month';

  SELECT pg_catalog.count(*)
  INTO v_attention_count
  FROM public.inventory_cost_origins AS origin
  WHERE origin.tenant_id = v_tenant
    AND origin.source_kind = 'grn_receipt'
    AND origin.effective_at >= v_period_start
    AND origin.effective_at < v_period_end
    AND origin.cost_status IN ('pending', 'provisional', 'partial');

  IF v_attention_count > 0
     AND (v_waiver IS NULL OR pg_catalog.char_length(v_waiver) < 5) THEN
    RAISE EXCEPTION 'inventory_cost_close_waiver_required'
      USING ERRCODE = '23514';
  END IF;

  WITH period_totals AS (
    SELECT
      coalesce(pg_catalog.sum(event.value_delta) FILTER (
        WHERE event.event_type = 'receipt'
      ), 0) AS receipt_value,
      coalesce(pg_catalog.sum(event.value_delta) FILTER (
        WHERE event.event_type IN ('invoice_reprice', 'credit_reprice')
      ), 0) AS invoice_revaluation,
      coalesce(-pg_catalog.sum(event.value_delta) FILTER (
        WHERE event.terminal_bucket = 'food_cost'
      ), 0) AS food_cost,
      coalesce(-pg_catalog.sum(event.value_delta) FILTER (
        WHERE event.terminal_bucket IN ('waste', 'stocktake_loss')
      ), 0) AS waste_value,
      coalesce(-pg_catalog.sum(event.value_delta) FILTER (
        WHERE event.terminal_bucket = 'transfer_loss'
      ), 0) AS transfer_loss,
      coalesce(pg_catalog.sum(event.value_delta) FILTER (
        WHERE event.event_type IN (
          'receipt',
          'stocktake_gain',
          'issue_restore',
          'invoice_reprice',
          'credit_reprice'
        )
        OR event.terminal_bucket IS NOT NULL
      ), 0) AS external_net_change
    FROM public.inventory_valuation_events AS event
    WHERE event.tenant_id = v_tenant
      AND event.posting_year = p_year
      AND event.posting_month = p_month
  ),
  ending AS (
    SELECT coalesce(pg_catalog.sum(balance.book_value), 0) AS inventory_value
    FROM public.inventory_origin_balances AS balance
    WHERE balance.tenant_id = v_tenant
  )
  INSERT INTO public.inventory_cost_close_snapshots (
    tenant_id,
    year,
    month,
    opening_inventory,
    receipt_value,
    invoice_revaluation,
    food_cost,
    waste_value,
    transfer_loss,
    ending_inventory,
    attention_count,
    waiver_reason,
    closed_by,
    idempotency_key
  )
  SELECT
    v_tenant,
    p_year,
    p_month,
    ending.inventory_value - period.external_net_change,
    period.receipt_value,
    period.invoice_revaluation,
    period.food_cost,
    period.waste_value,
    period.transfer_loss,
    ending.inventory_value,
    v_attention_count,
    v_waiver,
    v_uid,
    p_idempotency_key
  FROM period_totals AS period
  CROSS JOIN ending;

  PERFORM public.close_period_hard(v_tenant, p_year, p_month);

  RETURN pg_catalog.jsonb_build_object(
    'status', 'closed',
    'year', p_year,
    'month', p_month,
    'attention_count', v_attention_count,
    'replayed', FALSE
  );
END;
$$;

REVOKE ALL ON FUNCTION
  public.prepare_inventory_valuation_cutover(uuid),
  public.activate_inventory_valuation_cutover(uuid),
  public.run_inventory_valuation_reconciliation(),
  public.close_inventory_cost_period(integer, integer, text, uuid)
FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION
  public.prepare_inventory_valuation_cutover(uuid),
  public.activate_inventory_valuation_cutover(uuid),
  public.run_inventory_valuation_reconciliation(),
  public.close_inventory_cost_period(integer, integer, text, uuid)
TO authenticated, service_role;
