-- Fix: Clamp Company WAC equalization book values to non-negative numbers (greatest(0, ...)).
-- Prevents 23514 (inventory_origin_balances_book_value_check) when WAC decreases or balances have low book values.

CREATE OR REPLACE FUNCTION private.project_company_wac(
  p_tenant_id bigint,
  p_ingredient_id bigint
) RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_total_qty numeric(20, 3);
  v_total_value numeric(20, 2);
  v_wac numeric(24, 8);
  v_account record;
  v_account_count integer;
  v_position integer := 0;
  v_assigned numeric(20, 2) := 0;
  v_target numeric(20, 2);
  v_delta numeric(20, 2);
  v_event_id bigint;
  v_year integer;
  v_month integer;
  v_now timestamptz := pg_catalog.now();
  v_balance record;
  v_balance_count integer;
  v_balance_position integer;
  v_balance_assigned numeric(20, 2);
  v_share numeric(20, 2);
BEGIN
  FOR v_account IN
    SELECT account.branch_id, account.location_id
    FROM public.inventory_valuation_accounts AS account
    WHERE account.tenant_id = p_tenant_id
      AND account.ingredient_id = p_ingredient_id
    ORDER BY account.branch_id, account.location_id, account.id
  LOOP
    PERFORM private.lock_inventory_valuation_pool(
      p_tenant_id,
      v_account.branch_id,
      v_account.location_id,
      p_ingredient_id
    );
  END LOOP;

  SELECT
    coalesce(pg_catalog.sum(account.quantity) FILTER (
      WHERE account.quantity > 0
    ), 0),
    coalesce(pg_catalog.sum(account.book_value) FILTER (
      WHERE account.quantity > 0
    ), 0)
  INTO v_total_qty, v_total_value
  FROM public.inventory_valuation_accounts AS account
  WHERE account.tenant_id = p_tenant_id
    AND account.ingredient_id = p_ingredient_id;

  IF v_total_qty > 0 AND v_total_value > 0 THEN
    v_wac := pg_catalog.round(v_total_value / v_total_qty, 8);
  ELSE
    v_wac := private.ingredient_provisional_unit_cost(
      p_tenant_id,
      p_ingredient_id
    );
  END IF;

  IF v_wac IS NULL OR v_wac <= 0 THEN
    RETURN NULL;
  END IF;

  UPDATE public.stock_levels AS stock
  SET avg_unit_cost = v_wac,
      updated_at = v_now
  WHERE stock.tenant_id = p_tenant_id
    AND stock.ingredient_id = p_ingredient_id;

  IF v_total_qty <= 0 OR v_total_value <= 0 THEN
    RETURN v_wac;
  END IF;

  SELECT pg_catalog.count(*)
  INTO v_account_count
  FROM public.inventory_valuation_accounts AS account
  WHERE account.tenant_id = p_tenant_id
    AND account.ingredient_id = p_ingredient_id
    AND account.quantity > 0;

  v_year := extract(YEAR FROM v_now AT TIME ZONE 'Asia/Ho_Chi_Minh')::integer;
  v_month := extract(MONTH FROM v_now AT TIME ZONE 'Asia/Ho_Chi_Minh')::integer;

  FOR v_account IN
    SELECT account.*
    FROM public.inventory_valuation_accounts AS account
    WHERE account.tenant_id = p_tenant_id
      AND account.ingredient_id = p_ingredient_id
      AND account.quantity > 0
    ORDER BY account.branch_id, account.location_id, account.id
    FOR UPDATE
  LOOP
    v_position := v_position + 1;
    IF v_position = v_account_count THEN
      v_target := greatest(0::numeric, v_total_value - v_assigned);
    ELSE
      v_target := pg_catalog.round(v_account.quantity * v_wac, 2);
    END IF;
    v_assigned := v_assigned + v_target;
    v_delta := v_target - v_account.book_value;
    IF v_delta = 0 THEN
      CONTINUE;
    END IF;

    INSERT INTO public.inventory_valuation_events (
      tenant_id,
      ingredient_id,
      event_type,
      from_account_id,
      to_account_id,
      quantity_delta,
      value_delta,
      effective_at,
      posting_year,
      posting_month,
      idempotency_key,
      metadata
    )
    VALUES (
      p_tenant_id,
      p_ingredient_id,
      'company_wac_equalize',
      v_account.id,
      v_account.id,
      0,
      v_delta,
      v_now,
      v_year,
      v_month,
      pg_catalog.md5(
        'company-wac-equalize:'
          || p_tenant_id::text || ':'
          || p_ingredient_id::text || ':'
          || v_account.id::text || ':'
          || v_account.valuation_version::text || ':'
          || v_delta::text
      )::uuid,
      pg_catalog.jsonb_build_object(
        'company_wac', v_wac,
        'target_book_value', v_target
      )
    )
    ON CONFLICT (tenant_id, idempotency_key) DO NOTHING
    RETURNING id INTO v_event_id;

    UPDATE public.inventory_valuation_accounts
    SET book_value = v_target,
        valuation_version = valuation_version + 1,
        updated_at = v_now
    WHERE id = v_account.id;

    SELECT pg_catalog.count(*)
    INTO v_balance_count
    FROM public.inventory_origin_balances AS balance
    WHERE balance.tenant_id = p_tenant_id
      AND balance.valuation_account_id = v_account.id
      AND balance.holder_kind = 'stock_pool'
      AND balance.quantity > 0;

    v_balance_position := 0;
    v_balance_assigned := 0;
    FOR v_balance IN
      SELECT balance.*
      FROM public.inventory_origin_balances AS balance
      WHERE balance.tenant_id = p_tenant_id
        AND balance.valuation_account_id = v_account.id
        AND balance.holder_kind = 'stock_pool'
        AND balance.quantity > 0
      ORDER BY balance.id
      FOR UPDATE
    LOOP
      v_balance_position := v_balance_position + 1;
      IF v_balance_position = v_balance_count THEN
        v_share := v_delta - v_balance_assigned;
      ELSE
        v_share := pg_catalog.round(
          v_delta * v_balance.quantity / v_account.quantity,
          2
        );
      END IF;
      v_balance_assigned := v_balance_assigned + v_share;

      UPDATE public.inventory_origin_balances
      SET book_value = greatest(0::numeric, book_value + v_share),
          updated_at = v_now
      WHERE id = v_balance.id;
    END LOOP;
  END LOOP;

  RETURN v_wac;
END;
$$;

CREATE OR REPLACE FUNCTION private.propagate_inventory_origin_reprice(
  p_tenant_id bigint,
  p_valuation_event_id bigint,
  p_origin_id bigint,
  p_delta numeric,
  p_inventory_bucket text DEFAULT 'inventory'::text,
  p_depth integer DEFAULT 0
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_origin public.inventory_cost_origins%ROWTYPE;
  v_balance record;
  v_lineage record;
  v_terminal record;
  v_account record;
  v_share numeric(20,2);
BEGIN
  IF p_delta = 0 THEN
    RETURN;
  END IF;
  IF p_depth > 64 THEN
    RAISE EXCEPTION 'inventory_valuation_lineage_depth_exceeded'
      USING ERRCODE = '54001';
  END IF;

  FOR v_account IN
    SELECT DISTINCT
      account.id,
      account.branch_id,
      account.location_id,
      account.ingredient_id
    FROM public.inventory_origin_balances AS balance
    JOIN public.inventory_valuation_accounts AS account
      ON account.id = balance.valuation_account_id
     AND account.tenant_id = balance.tenant_id
    WHERE balance.tenant_id = p_tenant_id
      AND balance.origin_id = p_origin_id
      AND balance.holder_kind = 'stock_pool'
    ORDER BY
      account.branch_id,
      account.location_id,
      account.ingredient_id,
      account.id
  LOOP
    PERFORM private.lock_inventory_valuation_pool(
      p_tenant_id,
      v_account.branch_id,
      v_account.location_id,
      v_account.ingredient_id
    );
  END LOOP;

  PERFORM account.id
  FROM public.inventory_origin_balances AS balance
  JOIN public.inventory_valuation_accounts AS account
    ON account.id = balance.valuation_account_id
   AND account.tenant_id = balance.tenant_id
  WHERE balance.tenant_id = p_tenant_id
    AND balance.origin_id = p_origin_id
    AND balance.holder_kind = 'stock_pool'
  ORDER BY
    account.branch_id,
    account.location_id,
    account.ingredient_id,
    account.id
  FOR UPDATE OF account;

  SELECT origin.*
  INTO v_origin
  FROM public.inventory_cost_origins AS origin
  WHERE origin.id = p_origin_id
    AND origin.tenant_id = p_tenant_id
  FOR UPDATE;

  IF NOT FOUND OR v_origin.original_quantity <= 0 THEN
    RAISE EXCEPTION 'inventory_valuation_origin_invalid'
      USING ERRCODE = '23514';
  END IF;

  FOR v_balance IN
    SELECT balance.*
    FROM public.inventory_origin_balances AS balance
    WHERE balance.tenant_id = p_tenant_id
      AND balance.origin_id = p_origin_id
      AND balance.quantity > 0
    ORDER BY balance.id
    FOR UPDATE
  LOOP
    v_share := pg_catalog.round(
      p_delta * v_balance.quantity / v_origin.original_quantity,
      2
    );

    UPDATE public.inventory_origin_balances
    SET book_value = greatest(0::numeric, book_value + v_share),
        updated_at = pg_catalog.now()
    WHERE id = v_balance.id;

    IF v_balance.valuation_account_id IS NOT NULL THEN
      UPDATE public.inventory_valuation_accounts
      SET book_value = greatest(0::numeric, book_value + v_share),
          valuation_version = valuation_version + 1,
          updated_at = pg_catalog.now()
      WHERE id = v_balance.valuation_account_id
        AND tenant_id = p_tenant_id;
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
      p_tenant_id,
      p_valuation_event_id,
      p_origin_id,
      v_balance.id,
      CASE
        WHEN v_balance.holder_kind = 'transfer_item'
          THEN 'transfer_holder'
        ELSE p_inventory_bucket
      END,
      v_balance.quantity,
      v_share,
      v_balance.quantity / v_origin.original_quantity
    );
  END LOOP;

  FOR v_lineage IN
    SELECT
      allocation.derived_origin_id,
      pg_catalog.sum(allocation.allocated_quantity) AS allocated_quantity
    FROM public.inventory_value_allocations AS allocation
    WHERE allocation.tenant_id = p_tenant_id
      AND allocation.source_origin_id = p_origin_id
      AND allocation.derived_origin_id IS NOT NULL
      AND allocation.valuation_event_id <> p_valuation_event_id
    GROUP BY allocation.derived_origin_id
    ORDER BY allocation.derived_origin_id
  LOOP
    v_share := pg_catalog.round(
      p_delta
        * v_lineage.allocated_quantity
        / v_origin.original_quantity,
      2
    );
    PERFORM private.propagate_inventory_origin_reprice(
      p_tenant_id,
      p_valuation_event_id,
      v_lineage.derived_origin_id,
      v_share,
      p_inventory_bucket,
      p_depth + 1
    );
  END LOOP;

  FOR v_terminal IN
    SELECT
      allocation.id,
      allocation.allocation_bucket,
      allocation.allocated_quantity,
      allocation.allocated_value
    FROM public.inventory_value_allocations AS allocation
    WHERE allocation.tenant_id = p_tenant_id
      AND allocation.source_origin_id = p_origin_id
      AND allocation.allocation_bucket IN ('food_cost', 'waste', 'stocktake_loss', 'transfer_loss')
      AND allocation.valuation_event_id <> p_valuation_event_id
    ORDER BY allocation.id
  LOOP
    v_share := pg_catalog.round(
      p_delta
        * v_terminal.allocated_quantity
        / v_origin.original_quantity,
      2
    );
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
      p_valuation_event_id,
      p_origin_id,
      NULL,
      v_terminal.allocation_bucket,
      v_terminal.allocated_quantity,
      v_share,
      v_terminal.allocated_quantity / v_origin.original_quantity
    );
  END LOOP;
END;
$$;
