-- Migration: inventory_valuation_lineage_and_stocktake_reconciliation

-- Restore branch/account lineage for valuation allocations, guarantee a cost
-- for positive stocktake movements, and make a completed physical count close
-- any pre-existing valuation quantity gap without changing physical stock.

ALTER TABLE public.inventory_cost_origins
  DROP CONSTRAINT IF EXISTS inventory_cost_origins_source_kind_check;

ALTER TABLE public.inventory_cost_origins
  ADD CONSTRAINT inventory_cost_origins_source_kind_check
  CHECK (source_kind = ANY (ARRAY[
    'opening'::text,
    'grn_receipt'::text,
    'stocktake_found'::text,
    'production_output'::text,
    'pos_sale_shortfall'::text,
    'transfer_shortfall'::text,
    'inventory_shortfall'::text,
    'stocktake_reconciliation'::text
  ]));

ALTER TABLE public.inventory_valuation_events
  DROP CONSTRAINT IF EXISTS inventory_valuation_events_event_type_check;

ALTER TABLE public.inventory_valuation_events
  ADD CONSTRAINT inventory_valuation_events_event_type_check
  CHECK (event_type = ANY (ARRAY[
    'opening'::text,
    'receipt'::text,
    'issue'::text,
    'issue_restore'::text,
    'refund_restore'::text,
    'transfer_out'::text,
    'transfer_in'::text,
    'transfer_receive'::text,
    'transfer_loss'::text,
    'production_input'::text,
    'production_output'::text,
    'stocktake_gain'::text,
    'stocktake_loss'::text,
    'stocktake_reconciliation'::text,
    'supplier_return'::text,
    'invoice_reprice'::text,
    'credit_reprice'::text,
    'rounding'::text,
    'company_wac_equalize'::text,
    'provisional_reprice'::text
  ]));

ALTER TABLE public.inventory_valuation_events
  DROP CONSTRAINT IF EXISTS inventory_valuation_events_terminal_bucket_check;

ALTER TABLE public.inventory_valuation_events
  ADD CONSTRAINT inventory_valuation_events_terminal_bucket_check
  CHECK (
    terminal_bucket IS NULL
    OR terminal_bucket = ANY (ARRAY[
      'food_cost'::text,
      'waste'::text,
      'stocktake_loss'::text,
      'stocktake_reconciliation'::text,
      'transfer_loss'::text,
      'supplier_return'::text,
      'legacy_purchase_price_variance'::text,
      'rounding'::text
    ])
  );

ALTER TABLE public.inventory_value_allocations
  DROP CONSTRAINT IF EXISTS inventory_value_allocations_allocation_bucket_check;

ALTER TABLE public.inventory_value_allocations
  ADD CONSTRAINT inventory_value_allocations_allocation_bucket_check
  CHECK (allocation_bucket = ANY (ARRAY[
    'inventory'::text,
    'production_inventory'::text,
    'transfer_holder'::text,
    'food_cost'::text,
    'waste'::text,
    'stocktake_loss'::text,
    'stocktake_reconciliation'::text,
    'transfer_loss'::text,
    'supplier_return'::text,
    'legacy_purchase_price_variance'::text,
    'rounding'::text
  ]));

CREATE OR REPLACE FUNCTION private.price_stocktake_gain_movement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_unit_cost numeric(24,8);
BEGIN
  IF NEW.type <> 'count_adjustment' OR NEW.quantity_change <= 0 THEN
    RETURN NEW;
  END IF;

  IF coalesce(NEW.unit_cost, 0) > 0 THEN
    RETURN NEW;
  END IF;

  v_unit_cost := private.ingredient_provisional_unit_cost(
    NEW.tenant_id,
    NEW.ingredient_id
  );

  IF v_unit_cost IS NULL OR v_unit_cost <= 0 THEN
    RAISE EXCEPTION 'stocktake_gain_unit_cost_missing'
      USING ERRCODE = '23514';
  END IF;

  NEW.unit_cost := v_unit_cost;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.price_stocktake_gain_movement() FROM PUBLIC;

DROP TRIGGER IF EXISTS inventory_price_stocktake_gain
  ON public.stock_movements;
CREATE TRIGGER inventory_price_stocktake_gain
BEFORE INSERT ON public.stock_movements
FOR EACH ROW
EXECUTE FUNCTION private.price_stocktake_gain_movement();

CREATE OR REPLACE FUNCTION private.normalize_inventory_valuation_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_movement public.stock_movements%ROWTYPE;
BEGIN
  IF NEW.stock_movement_id IS NOT NULL THEN
    SELECT movement.*
    INTO v_movement
    FROM public.stock_movements AS movement
    WHERE movement.id = NEW.stock_movement_id
      AND movement.tenant_id = NEW.tenant_id;
  END IF;

  IF NEW.from_account_id IS NOT NULL
     AND NEW.event_type IN (
       'issue',
       'transfer_out',
       'production_input',
       'stocktake_loss',
       'stocktake_reconciliation',
       'transfer_loss',
       'supplier_return'
     ) THEN
    NEW.quantity_delta := -abs(NEW.quantity_delta);
    NEW.value_delta := -abs(NEW.value_delta);
  END IF;

  IF NEW.terminal_bucket IS NULL THEN
    NEW.terminal_bucket := CASE
      WHEN NEW.event_type = 'issue'
        AND v_movement.type = 'consumption'
        AND v_movement.movement_subtype IN (
          'storage_loss',
          'writeoff',
          'cancelled_after_kds_ready'
        ) THEN 'waste'
      WHEN NEW.event_type = 'issue' THEN 'food_cost'
      WHEN NEW.event_type = 'stocktake_loss' THEN 'waste'
      WHEN NEW.event_type = 'stocktake_reconciliation'
        THEN 'stocktake_reconciliation'
      WHEN NEW.event_type = 'transfer_loss' THEN 'transfer_loss'
      WHEN NEW.event_type = 'supplier_return' THEN 'supplier_return'
      ELSE NULL
    END;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.normalize_inventory_valuation_event()
  FROM PUBLIC;

DROP TRIGGER IF EXISTS inventory_normalize_valuation_event
  ON public.inventory_valuation_events;
CREATE TRIGGER inventory_normalize_valuation_event
BEFORE INSERT ON public.inventory_valuation_events
FOR EACH ROW
EXECUTE FUNCTION private.normalize_inventory_valuation_event();

CREATE OR REPLACE FUNCTION private.complete_inventory_value_allocation_lineage()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_from_account_id bigint;
  v_event_type text;
  v_event_value numeric(20,2);
  v_candidate_count integer;
BEGIN
  IF NEW.from_balance_id IS NOT NULL
     OR NEW.source_origin_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT event.from_account_id, event.event_type, event.value_delta
  INTO v_from_account_id, v_event_type, v_event_value
  FROM public.inventory_valuation_events AS event
  WHERE event.id = NEW.valuation_event_id
    AND event.tenant_id = NEW.tenant_id;

  IF v_from_account_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF v_event_type = 'company_wac_equalize'
     AND v_event_value > 0
     AND NEW.to_balance_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT pg_catalog.count(*), min(balance.id)
  INTO v_candidate_count, NEW.from_balance_id
  FROM public.inventory_origin_balances AS balance
  WHERE balance.tenant_id = NEW.tenant_id
    AND balance.origin_id = NEW.source_origin_id
    AND balance.valuation_account_id = v_from_account_id
    AND balance.holder_kind = 'stock_pool';

  IF v_candidate_count <> 1 THEN
    RAISE EXCEPTION 'inventory_allocation_source_balance_ambiguous'
      USING ERRCODE = '23514',
            DETAIL = pg_catalog.format(
              'tenant=%s event=%s origin=%s account=%s candidates=%s',
              NEW.tenant_id,
              NEW.valuation_event_id,
              NEW.source_origin_id,
              v_from_account_id,
              v_candidate_count
            );
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.complete_inventory_value_allocation_lineage()
  FROM PUBLIC;

DROP TRIGGER IF EXISTS inventory_complete_value_allocation_lineage
  ON public.inventory_value_allocations;
CREATE TRIGGER inventory_complete_value_allocation_lineage
BEFORE INSERT ON public.inventory_value_allocations
FOR EACH ROW
EXECUTE FUNCTION private.complete_inventory_value_allocation_lineage();

CREATE OR REPLACE FUNCTION public.get_inventory_valuation_period_value(
  p_start_date date,
  p_end_date date,
  p_branch_id bigint DEFAULT NULL::bigint
) RETURNS TABLE(
  branch_id bigint,
  opening_value numeric,
  closing_value numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_tenant bigint := public.auth_tenant_id();
BEGIN
  IF auth.uid() IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  IF NOT public.has_permission_any('inventory:valuation_read') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_start_date IS NULL
     OR p_end_date IS NULL
     OR p_start_date > p_end_date THEN
    RAISE EXCEPTION 'inventory_valuation_period_invalid'
      USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  WITH allocation_accounts AS (
    SELECT
      event.effective_at,
      allocation.allocated_value,
      event.event_type,
      coalesce(to_balance_account.id, event_to_account.id) AS to_account_id,
      coalesce(from_balance_account.id, event_from_account.id)
        AS from_account_id,
      coalesce(to_balance_account.branch_id, event_to_account.branch_id)
        AS to_branch_id,
      coalesce(from_balance_account.branch_id, event_from_account.branch_id)
        AS from_branch_id
    FROM public.inventory_value_allocations AS allocation
    JOIN public.inventory_valuation_events AS event
      ON event.id = allocation.valuation_event_id
     AND event.tenant_id = allocation.tenant_id
    LEFT JOIN public.inventory_origin_balances AS to_balance
      ON to_balance.id = allocation.to_balance_id
     AND to_balance.tenant_id = allocation.tenant_id
    LEFT JOIN public.inventory_valuation_accounts AS to_balance_account
      ON to_balance_account.id = to_balance.valuation_account_id
     AND to_balance_account.tenant_id = to_balance.tenant_id
    LEFT JOIN public.inventory_valuation_accounts AS event_to_account
      ON event_to_account.id = event.to_account_id
     AND event_to_account.tenant_id = event.tenant_id
    LEFT JOIN public.inventory_origin_balances AS from_balance
      ON from_balance.id = allocation.from_balance_id
     AND from_balance.tenant_id = allocation.tenant_id
    LEFT JOIN public.inventory_valuation_accounts AS from_balance_account
      ON from_balance_account.id = from_balance.valuation_account_id
     AND from_balance_account.tenant_id = from_balance.tenant_id
    LEFT JOIN public.inventory_valuation_accounts AS event_from_account
      ON event_from_account.id = event.from_account_id
     AND event_from_account.tenant_id = event.tenant_id
    WHERE allocation.tenant_id = v_tenant
  ),
  allocation_impacts AS (
    SELECT
      account.effective_at,
      coalesce(account.to_branch_id, account.from_branch_id) AS event_branch_id,
      CASE
        WHEN account.event_type IN ('invoice_reprice', 'credit_reprice')
          AND account.to_account_id IS NOT NULL
          THEN account.allocated_value
        WHEN account.to_account_id IS NOT NULL
          THEN account.allocated_value
        WHEN account.from_account_id IS NOT NULL
          THEN -account.allocated_value
        ELSE 0::numeric
      END AS value_impact
    FROM allocation_accounts AS account
    WHERE coalesce(account.to_branch_id, account.from_branch_id) IS NOT NULL
      AND (
        p_branch_id IS NULL
        OR coalesce(account.to_branch_id, account.from_branch_id) = p_branch_id
      )
  ),
  branch_scope AS (
    SELECT branch.id
    FROM public.branches AS branch
    WHERE branch.tenant_id = v_tenant
      AND (p_branch_id IS NULL OR branch.id = p_branch_id)
  )
  SELECT
    branch.id,
    coalesce(pg_catalog.sum(impact.value_impact) FILTER (
      WHERE impact.effective_at
        < p_start_date::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh'
    ), 0),
    coalesce(pg_catalog.sum(impact.value_impact) FILTER (
      WHERE impact.effective_at
        < (p_end_date + 1)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh'
    ), 0)
  FROM branch_scope AS branch
  LEFT JOIN allocation_impacts AS impact
    ON impact.event_branch_id = branch.id
  GROUP BY branch.id
  ORDER BY branch.id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_inventory_valuation_period_value(
  date,
  date,
  bigint
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_inventory_valuation_period_value(
  date,
  date,
  bigint
) TO authenticated, service_role;

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
      event.terminal_bucket,
      allocation.from_balance_id,
      pg_catalog.sum(allocation.allocated_quantity)
        - CASE
            WHEN event.terminal_bucket = 'food_cost' THEN (
              SELECT coalesce(
                pg_catalog.sum(restore_allocation.allocated_quantity),
                0
              )
              FROM public.inventory_value_allocations AS restore_allocation
              JOIN public.inventory_valuation_events AS restore_event
                ON restore_event.id = restore_allocation.valuation_event_id
               AND restore_event.tenant_id = restore_allocation.tenant_id
              WHERE restore_allocation.tenant_id = p_tenant_id
                AND restore_allocation.source_origin_id = p_origin_id
                AND restore_allocation.to_balance_id
                  IS NOT DISTINCT FROM allocation.from_balance_id
                AND restore_event.event_type = 'issue_restore'
            )
            ELSE 0
          END AS allocated_quantity
    FROM public.inventory_value_allocations AS allocation
    JOIN public.inventory_valuation_events AS event
      ON event.id = allocation.valuation_event_id
     AND event.tenant_id = allocation.tenant_id
    WHERE allocation.tenant_id = p_tenant_id
      AND allocation.source_origin_id = p_origin_id
      AND allocation.derived_origin_id IS NULL
      AND allocation.to_balance_id IS NULL
      AND allocation.from_balance_id IS NOT NULL
      AND event.terminal_bucket IN (
        'food_cost',
        'waste',
        'stocktake_loss',
        'stocktake_reconciliation',
        'transfer_loss',
        'supplier_return'
      )
      AND allocation.valuation_event_id <> p_valuation_event_id
    GROUP BY event.terminal_bucket, allocation.from_balance_id
    HAVING pg_catalog.sum(allocation.allocated_quantity)
      - CASE
          WHEN event.terminal_bucket = 'food_cost' THEN (
            SELECT coalesce(
              pg_catalog.sum(restore_allocation.allocated_quantity),
              0
            )
            FROM public.inventory_value_allocations AS restore_allocation
            JOIN public.inventory_valuation_events AS restore_event
              ON restore_event.id = restore_allocation.valuation_event_id
             AND restore_event.tenant_id = restore_allocation.tenant_id
            WHERE restore_allocation.tenant_id = p_tenant_id
              AND restore_allocation.source_origin_id = p_origin_id
              AND restore_allocation.to_balance_id
                IS NOT DISTINCT FROM allocation.from_balance_id
              AND restore_event.event_type = 'issue_restore'
          )
          ELSE 0
        END > 0
    ORDER BY event.terminal_bucket, allocation.from_balance_id
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
      from_balance_id,
      allocation_bucket,
      allocated_quantity,
      allocated_value,
      allocation_fraction
    )
    VALUES (
      p_tenant_id,
      p_valuation_event_id,
      p_origin_id,
      v_terminal.from_balance_id,
      v_terminal.terminal_bucket,
      v_terminal.allocated_quantity,
      v_share,
      v_terminal.allocated_quantity / v_origin.original_quantity
    );
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION private.propagate_inventory_origin_reprice(
  bigint,
  bigint,
  bigint,
  numeric,
  text,
  integer
) FROM PUBLIC;

CREATE OR REPLACE FUNCTION private.reconcile_inventory_valuation_account_to_stock(
  p_tenant_id bigint,
  p_branch_id bigint,
  p_location_id bigint,
  p_ingredient_id bigint,
  p_effective_at timestamptz,
  p_stock_movement_id bigint,
  p_idempotency_seed text,
  p_created_by uuid DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_stock public.stock_levels%ROWTYPE;
  v_account public.inventory_valuation_accounts%ROWTYPE;
  v_balance record;
  v_balance_count integer;
  v_position integer := 0;
  v_origin_id bigint;
  v_to_balance_id bigint;
  v_event_id bigint;
  v_value_event_id bigint;
  v_target_quantity numeric(20,3);
  v_target_value numeric(20,2);
  v_delta_quantity numeric(20,3);
  v_delta_value numeric(20,2);
  v_remove_quantity numeric(20,3);
  v_remove_value numeric(20,2);
  v_assigned_quantity numeric(20,3) := 0;
  v_assigned_value numeric(20,2) := 0;
  v_share_quantity numeric(20,3);
  v_share_value numeric(20,2);
  v_balance_quantity numeric(20,3);
  v_balance_value numeric(20,2);
  v_unit_cost numeric(24,8);
  v_year integer;
  v_month integer;
  v_idempotency_key uuid;
BEGIN
  IF p_effective_at IS NULL OR nullif(pg_catalog.btrim(p_idempotency_seed), '') IS NULL THEN
    RAISE EXCEPTION 'inventory_stocktake_reconciliation_identity_missing'
      USING ERRCODE = '22023';
  END IF;

  v_year := extract(
    YEAR FROM p_effective_at AT TIME ZONE 'Asia/Ho_Chi_Minh'
  )::integer;
  v_month := extract(
    MONTH FROM p_effective_at AT TIME ZONE 'Asia/Ho_Chi_Minh'
  )::integer;

  PERFORM private.lock_inventory_valuation_pool(
    p_tenant_id,
    p_branch_id,
    p_location_id,
    p_ingredient_id
  );

  SELECT stock.*
  INTO v_stock
  FROM public.stock_levels AS stock
  WHERE stock.tenant_id = p_tenant_id
    AND stock.branch_id = p_branch_id
    AND stock.location_id = p_location_id
    AND stock.ingredient_id = p_ingredient_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'inventory_stock_level_missing'
      USING ERRCODE = '23514';
  END IF;

  SELECT account.*
  INTO v_account
  FROM public.inventory_valuation_accounts AS account
  WHERE account.tenant_id = p_tenant_id
    AND account.branch_id = p_branch_id
    AND account.location_id = p_location_id
    AND account.ingredient_id = p_ingredient_id
  FOR UPDATE;

  IF NOT FOUND THEN
    PERFORM private.ensure_inventory_valuation_account(
      p_tenant_id,
      p_branch_id,
      p_location_id,
      p_ingredient_id
    );
    SELECT account.*
    INTO STRICT v_account
    FROM public.inventory_valuation_accounts AS account
    WHERE account.tenant_id = p_tenant_id
      AND account.branch_id = p_branch_id
      AND account.location_id = p_location_id
      AND account.ingredient_id = p_ingredient_id
    FOR UPDATE;
  END IF;

  SELECT
    coalesce(pg_catalog.sum(balance.quantity), 0),
    coalesce(pg_catalog.sum(balance.book_value), 0)
  INTO v_balance_quantity, v_balance_value
  FROM public.inventory_origin_balances AS balance
  WHERE balance.tenant_id = p_tenant_id
    AND balance.valuation_account_id = v_account.id
    AND balance.holder_kind = 'stock_pool';

  IF v_balance_quantity IS DISTINCT FROM v_account.quantity THEN
    RAISE EXCEPTION 'inventory_origin_account_reconciliation_required'
      USING ERRCODE = '23514',
            DETAIL = pg_catalog.format(
              'account=%s account_qty=%s balance_qty=%s account_value=%s balance_value=%s',
              v_account.id,
              v_account.quantity,
              v_balance_quantity,
              v_account.book_value,
              v_balance_value
            );
  END IF;

  IF v_balance_value IS DISTINCT FROM v_account.book_value THEN
    SELECT balance.id, balance.origin_id
    INTO v_balance
    FROM public.inventory_origin_balances AS balance
    WHERE balance.tenant_id = p_tenant_id
      AND balance.valuation_account_id = v_account.id
      AND balance.holder_kind = 'stock_pool'
    ORDER BY balance.id
    LIMIT 1
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'inventory_reconciliation_balance_missing'
        USING ERRCODE = '23514';
    END IF;

    v_delta_value := v_balance_value - v_account.book_value;
    v_idempotency_key := pg_catalog.md5(
      p_idempotency_seed || ':account-value:' || v_account.id::text || ':'
        || v_balance_value::text
    )::uuid;

    INSERT INTO public.inventory_valuation_events (
      tenant_id,
      ingredient_id,
      event_type,
      terminal_bucket,
      stock_movement_id,
      from_account_id,
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
      p_tenant_id,
      p_ingredient_id,
      'rounding',
      CASE WHEN v_delta_value < 0 THEN 'rounding' END,
      p_stock_movement_id,
      CASE WHEN v_delta_value < 0 THEN v_account.id END,
      CASE WHEN v_delta_value > 0 THEN v_account.id END,
      0,
      v_delta_value,
      p_effective_at,
      v_year,
      v_month,
      v_idempotency_key,
      pg_catalog.jsonb_build_object(
        'repair', 'account_book_to_origin_sum',
        'idempotency_seed', p_idempotency_seed,
        'previous_value', v_account.book_value,
        'target_value', v_balance_value
      ),
      p_created_by
    )
    RETURNING id INTO v_value_event_id;

    INSERT INTO public.inventory_value_allocations (
      tenant_id,
      valuation_event_id,
      source_origin_id,
      from_balance_id,
      to_balance_id,
      allocation_bucket,
      allocated_quantity,
      allocated_value,
      allocation_fraction
    )
    VALUES (
      p_tenant_id,
      v_value_event_id,
      v_balance.origin_id,
      CASE WHEN v_delta_value < 0 THEN v_balance.id END,
      CASE WHEN v_delta_value > 0 THEN v_balance.id END,
      'rounding',
      0,
      abs(v_delta_value),
      0
    );

    UPDATE public.inventory_valuation_accounts
    SET book_value = v_balance_value,
        valuation_version = valuation_version + 1,
        updated_at = pg_catalog.now()
    WHERE id = v_account.id
      AND tenant_id = p_tenant_id;

    v_account.book_value := v_balance_value;
  END IF;

  v_target_quantity := greatest(v_stock.current_quantity, 0::numeric);

  IF v_target_quantity < v_account.quantity THEN
    v_target_value := CASE
      WHEN v_target_quantity = 0 OR v_account.quantity = 0 THEN 0
      ELSE pg_catalog.round(
        v_account.book_value * v_target_quantity / v_account.quantity,
        2
      )
    END;
  ELSIF v_target_quantity > v_account.quantity THEN
    v_unit_cost := coalesce(
      nullif(v_stock.avg_unit_cost, 0),
      private.ingredient_provisional_unit_cost(p_tenant_id, p_ingredient_id),
      CASE
        WHEN v_account.quantity > 0 AND v_account.book_value > 0
          THEN v_account.book_value / v_account.quantity
        ELSE NULL
      END
    );
    IF v_unit_cost IS NULL OR v_unit_cost <= 0 THEN
      RAISE EXCEPTION 'stocktake_reconciliation_unit_cost_missing'
        USING ERRCODE = '23514';
    END IF;
    v_target_value := v_account.book_value + pg_catalog.round(
      (v_target_quantity - v_account.quantity) * v_unit_cost,
      2
    );
  ELSE
    RETURN;
  END IF;

  v_delta_quantity := v_target_quantity - v_account.quantity;
  v_delta_value := v_target_value - v_account.book_value;
  v_idempotency_key := pg_catalog.md5(
    p_idempotency_seed || ':' || v_account.id::text || ':'
      || v_target_quantity::text || ':' || v_target_value::text
  )::uuid;

  INSERT INTO public.inventory_valuation_events (
    tenant_id,
    ingredient_id,
    event_type,
    terminal_bucket,
    stock_movement_id,
    from_account_id,
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
    p_tenant_id,
    p_ingredient_id,
    'stocktake_reconciliation',
    CASE WHEN v_delta_quantity < 0 THEN 'stocktake_reconciliation' END,
    p_stock_movement_id,
    CASE WHEN v_delta_quantity < 0 THEN v_account.id END,
    CASE WHEN v_delta_quantity > 0 THEN v_account.id END,
    v_delta_quantity,
    v_delta_value,
    p_effective_at,
    v_year,
    v_month,
    v_idempotency_key,
    pg_catalog.jsonb_build_object(
      'repair', 'valuation_to_physical_stock',
      'stock_quantity', v_stock.current_quantity,
      'target_quantity', v_target_quantity,
      'previous_quantity', v_account.quantity,
      'target_value', v_target_value,
      'previous_value', v_account.book_value,
      'negative_stock_preserved', v_stock.current_quantity < 0
    ),
    p_created_by
  )
  ON CONFLICT (tenant_id, idempotency_key) DO NOTHING
  RETURNING id INTO v_event_id;

  IF v_event_id IS NULL THEN
    RETURN;
  END IF;

  IF v_delta_quantity < 0 THEN
    v_remove_quantity := -v_delta_quantity;
    v_remove_value := -v_delta_value;

    SELECT pg_catalog.count(*)
    INTO v_balance_count
    FROM public.inventory_origin_balances AS balance
    WHERE balance.tenant_id = p_tenant_id
      AND balance.valuation_account_id = v_account.id
      AND balance.holder_kind = 'stock_pool'
      AND (balance.quantity > 0 OR balance.book_value > 0);

    IF v_balance_count = 0 THEN
      RAISE EXCEPTION 'inventory_reconciliation_balance_missing'
        USING ERRCODE = '23514';
    END IF;

    FOR v_balance IN
      SELECT balance.*, origin.original_quantity
      FROM public.inventory_origin_balances AS balance
      JOIN public.inventory_cost_origins AS origin
        ON origin.id = balance.origin_id
       AND origin.tenant_id = balance.tenant_id
      WHERE balance.tenant_id = p_tenant_id
        AND balance.valuation_account_id = v_account.id
        AND balance.holder_kind = 'stock_pool'
        AND (balance.quantity > 0 OR balance.book_value > 0)
      ORDER BY balance.id
      FOR UPDATE OF balance
    LOOP
      v_position := v_position + 1;
      IF v_position = v_balance_count THEN
        v_share_quantity := v_remove_quantity - v_assigned_quantity;
        v_share_value := v_remove_value - v_assigned_value;
      ELSE
        v_share_quantity := CASE
          WHEN v_account.quantity > 0 THEN pg_catalog.round(
            v_remove_quantity * v_balance.quantity / v_account.quantity,
            3
          )
          ELSE 0
        END;
        v_share_value := CASE
          WHEN v_account.book_value > 0 THEN pg_catalog.round(
            v_remove_value * v_balance.book_value / v_account.book_value,
            2
          )
          ELSE 0
        END;
      END IF;

      v_share_quantity := greatest(
        0::numeric,
        least(v_share_quantity, v_balance.quantity)
      );
      v_share_value := greatest(
        0::numeric,
        least(v_share_value, v_balance.book_value)
      );
      v_assigned_quantity := v_assigned_quantity + v_share_quantity;
      v_assigned_value := v_assigned_value + v_share_value;

      UPDATE public.inventory_origin_balances
      SET quantity = quantity - v_share_quantity,
          book_value = book_value - v_share_value,
          updated_at = pg_catalog.now()
      WHERE id = v_balance.id;

      INSERT INTO public.inventory_value_allocations (
        tenant_id,
        valuation_event_id,
        source_origin_id,
        from_balance_id,
        allocation_bucket,
        allocated_quantity,
        allocated_value,
        allocation_fraction
      )
      VALUES (
        p_tenant_id,
        v_event_id,
        v_balance.origin_id,
        v_balance.id,
        'stocktake_reconciliation',
        v_share_quantity,
        v_share_value,
        CASE
          WHEN v_balance.original_quantity > 0
            THEN v_share_quantity / v_balance.original_quantity
          ELSE NULL
        END
      );
    END LOOP;

    IF v_assigned_quantity IS DISTINCT FROM v_remove_quantity
       OR v_assigned_value IS DISTINCT FROM v_remove_value THEN
      RAISE EXCEPTION 'inventory_reconciliation_allocation_incomplete'
        USING ERRCODE = '23514';
    END IF;
  ELSE
    v_origin_id := private.create_inventory_cost_origin(
      p_tenant_id,
      p_ingredient_id,
      'stocktake_reconciliation',
      v_event_id,
      NULL,
      v_delta_quantity,
      v_delta_value,
      p_effective_at,
      'provisional'
    );

    INSERT INTO public.inventory_origin_balances (
      tenant_id,
      origin_id,
      holder_kind,
      valuation_account_id,
      quantity,
      book_value
    )
    VALUES (
      p_tenant_id,
      v_origin_id,
      'stock_pool',
      v_account.id,
      v_delta_quantity,
      v_delta_value
    )
    RETURNING id INTO v_to_balance_id;

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
      v_origin_id,
      v_to_balance_id,
      'inventory',
      v_delta_quantity,
      v_delta_value,
      1
    );
  END IF;

  UPDATE public.inventory_valuation_accounts
  SET quantity = v_target_quantity,
      book_value = v_target_value,
      valuation_version = valuation_version + 1,
      updated_at = pg_catalog.now()
  WHERE id = v_account.id
    AND tenant_id = p_tenant_id;

  SELECT
    coalesce(pg_catalog.sum(balance.quantity), 0),
    coalesce(pg_catalog.sum(balance.book_value), 0)
  INTO v_balance_quantity, v_balance_value
  FROM public.inventory_origin_balances AS balance
  WHERE balance.tenant_id = p_tenant_id
    AND balance.valuation_account_id = v_account.id
    AND balance.holder_kind = 'stock_pool';

  IF v_balance_quantity IS DISTINCT FROM v_target_quantity
     OR v_balance_value IS DISTINCT FROM v_target_value THEN
    RAISE EXCEPTION 'inventory_reconciliation_postcondition_failed'
      USING ERRCODE = '23514';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION private.reconcile_inventory_valuation_account_to_stock(
  bigint,
  bigint,
  bigint,
  bigint,
  timestamptz,
  bigint,
  text,
  uuid
) FROM PUBLIC;

CREATE OR REPLACE FUNCTION private.reconcile_stocktake_valuation_after_movement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_mode text;
BEGIN
  IF NEW.type <> 'count_adjustment' THEN
    RETURN NEW;
  END IF;

  SELECT cutover.status
  INTO v_mode
  FROM public.inventory_valuation_cutovers AS cutover
  WHERE cutover.tenant_id = NEW.tenant_id;

  IF v_mode <> 'active' THEN
    RETURN NEW;
  END IF;

  PERFORM private.reconcile_inventory_valuation_account_to_stock(
    NEW.tenant_id,
    NEW.branch_id,
    NEW.location_id,
    NEW.ingredient_id,
    NEW.created_at,
    NEW.id,
    'stocktake-reconciliation:movement:' || NEW.id::text,
    NEW.created_by
  );

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.reconcile_stocktake_valuation_after_movement()
  FROM PUBLIC;

DROP TRIGGER IF EXISTS zzz_inventory_stocktake_reconciliation
  ON public.stock_movements;
CREATE TRIGGER zzz_inventory_stocktake_reconciliation
AFTER INSERT ON public.stock_movements
FOR EACH ROW
EXECUTE FUNCTION private.reconcile_stocktake_valuation_after_movement();

CREATE OR REPLACE FUNCTION private.allocate_company_wac_equalization()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_balance public.inventory_origin_balances%ROWTYPE;
BEGIN
  IF NEW.event_type <> 'company_wac_equalize' OR NEW.value_delta = 0 THEN
    RETURN NEW;
  END IF;

  SELECT balance.*
  INTO v_balance
  FROM public.inventory_origin_balances AS balance
  WHERE balance.tenant_id = NEW.tenant_id
    AND balance.valuation_account_id = coalesce(
      NEW.to_account_id,
      NEW.from_account_id
    )
    AND balance.holder_kind = 'stock_pool'
  ORDER BY balance.id
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'company_wac_allocation_balance_missing'
      USING ERRCODE = '23514';
  END IF;

  INSERT INTO public.inventory_value_allocations (
    tenant_id,
    valuation_event_id,
    source_origin_id,
    from_balance_id,
    to_balance_id,
    allocation_bucket,
    allocated_quantity,
    allocated_value,
    allocation_fraction
  )
  VALUES (
    NEW.tenant_id,
    NEW.id,
    v_balance.origin_id,
    CASE WHEN NEW.value_delta < 0 THEN v_balance.id END,
    CASE WHEN NEW.value_delta > 0 THEN v_balance.id END,
    'inventory',
    0,
    abs(NEW.value_delta),
    0
  );

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.allocate_company_wac_equalization()
  FROM PUBLIC;

DROP TRIGGER IF EXISTS inventory_allocate_company_wac_equalization
  ON public.inventory_valuation_events;
CREATE TRIGGER inventory_allocate_company_wac_equalization
AFTER INSERT ON public.inventory_valuation_events
FOR EACH ROW
EXECUTE FUNCTION private.allocate_company_wac_equalization();

DO $validate_direct_lineage$
DECLARE
  v_invalid integer;
BEGIN
  WITH targets AS (
    SELECT
      allocation.id,
      pg_catalog.count(balance.id) AS candidate_count
    FROM public.inventory_value_allocations AS allocation
    JOIN public.inventory_valuation_events AS event
      ON event.id = allocation.valuation_event_id
     AND event.tenant_id = allocation.tenant_id
    LEFT JOIN public.inventory_origin_balances AS balance
      ON balance.tenant_id = allocation.tenant_id
     AND balance.origin_id = allocation.source_origin_id
     AND balance.valuation_account_id = event.from_account_id
     AND balance.holder_kind = 'stock_pool'
    WHERE allocation.from_balance_id IS NULL
      AND allocation.source_origin_id IS NOT NULL
      AND event.from_account_id IS NOT NULL
      AND NOT (
        event.event_type = 'company_wac_equalize'
        AND event.value_delta > 0
        AND allocation.to_balance_id IS NOT NULL
      )
    GROUP BY allocation.id
  )
  SELECT pg_catalog.count(*)
  INTO v_invalid
  FROM targets
  WHERE candidate_count <> 1;

  IF v_invalid <> 0 THEN
    RAISE EXCEPTION 'inventory_historical_lineage_not_unique'
      USING ERRCODE = '23514',
            DETAIL = pg_catalog.format('invalid_allocations=%s', v_invalid);
  END IF;
END;
$validate_direct_lineage$;

ALTER TABLE public.inventory_valuation_events
  DISABLE TRIGGER inventory_valuation_events_immutable;
ALTER TABLE public.inventory_value_allocations
  DISABLE TRIGGER inventory_value_allocations_immutable;

UPDATE public.inventory_valuation_events AS event
SET quantity_delta = CASE
      WHEN event.from_account_id IS NOT NULL
       AND event.event_type IN (
         'issue',
         'transfer_out',
         'production_input',
         'stocktake_loss',
         'transfer_loss',
         'supplier_return'
       ) THEN -abs(event.quantity_delta)
      ELSE event.quantity_delta
    END,
    value_delta = CASE
      WHEN event.from_account_id IS NOT NULL
       AND event.event_type IN (
         'issue',
         'transfer_out',
         'production_input',
         'stocktake_loss',
         'transfer_loss',
         'supplier_return'
       ) THEN -abs(event.value_delta)
      ELSE event.value_delta
    END,
    terminal_bucket = coalesce(
      event.terminal_bucket,
      CASE
        WHEN event.event_type = 'issue'
          AND movement.type = 'consumption'
          AND movement.movement_subtype IN (
            'storage_loss',
            'writeoff',
            'cancelled_after_kds_ready'
          ) THEN 'waste'
        WHEN event.event_type = 'issue' THEN 'food_cost'
        WHEN event.event_type = 'stocktake_loss' THEN 'waste'
        WHEN event.event_type = 'transfer_loss' THEN 'transfer_loss'
        WHEN event.event_type = 'supplier_return' THEN 'supplier_return'
        ELSE NULL
      END
    ),
    metadata = event.metadata || pg_catalog.jsonb_build_object(
      'lineage_repaired_at', pg_catalog.now(),
      'lineage_repair', '20260901013425'
    )
FROM public.stock_movements AS movement
WHERE movement.id = event.stock_movement_id
  AND movement.tenant_id = event.tenant_id
  AND event.event_type IN (
    'issue',
    'transfer_out',
    'production_input',
    'stocktake_loss',
    'transfer_loss',
    'supplier_return'
  );

WITH candidates AS (
  SELECT
    allocation.id AS allocation_id,
    min(balance.id) AS balance_id
  FROM public.inventory_value_allocations AS allocation
  JOIN public.inventory_valuation_events AS event
    ON event.id = allocation.valuation_event_id
   AND event.tenant_id = allocation.tenant_id
  JOIN public.inventory_origin_balances AS balance
    ON balance.tenant_id = allocation.tenant_id
   AND balance.origin_id = allocation.source_origin_id
   AND balance.valuation_account_id = event.from_account_id
   AND balance.holder_kind = 'stock_pool'
  WHERE allocation.from_balance_id IS NULL
    AND allocation.source_origin_id IS NOT NULL
    AND event.from_account_id IS NOT NULL
    AND NOT (
      event.event_type = 'company_wac_equalize'
      AND event.value_delta > 0
      AND allocation.to_balance_id IS NOT NULL
    )
  GROUP BY allocation.id
)
UPDATE public.inventory_value_allocations AS allocation
SET from_balance_id = candidate.balance_id
FROM candidates AS candidate
WHERE allocation.id = candidate.allocation_id;

-- Reprice allocations have no event account. Complete the historical rows
-- where nonzero terminal quantity identifies one source stock balance. Pure
-- rounding rows remain unassigned because they do not change branch inventory.
WITH candidates AS (
  SELECT
    missing.id AS allocation_id,
    min(source.from_balance_id) AS balance_id,
    pg_catalog.count(DISTINCT source.from_balance_id) AS candidate_count
  FROM public.inventory_value_allocations AS missing
  JOIN public.inventory_valuation_events AS event
    ON event.id = missing.valuation_event_id
   AND event.tenant_id = missing.tenant_id
  JOIN public.inventory_value_allocations AS source
    ON source.tenant_id = missing.tenant_id
   AND source.source_origin_id = missing.source_origin_id
   AND source.allocation_bucket = missing.allocation_bucket
   AND source.from_balance_id IS NOT NULL
   AND source.allocated_quantity <> 0
  WHERE missing.from_balance_id IS NULL
    AND missing.to_balance_id IS NULL
    AND missing.source_origin_id IS NOT NULL
    AND event.event_type IN (
      'invoice_reprice',
      'credit_reprice',
      'provisional_reprice'
    )
  GROUP BY missing.id
)
UPDATE public.inventory_value_allocations AS allocation
SET from_balance_id = candidate.balance_id
FROM candidates AS candidate
WHERE allocation.id = candidate.allocation_id
  AND candidate.candidate_count = 1;

-- Historical Company-WAC events changed account value but had no allocation,
-- so branch period valuation could not observe them.
INSERT INTO public.inventory_value_allocations (
  tenant_id,
  valuation_event_id,
  source_origin_id,
  from_balance_id,
  to_balance_id,
  allocation_bucket,
  allocated_quantity,
  allocated_value,
  allocation_fraction
)
SELECT
  event.tenant_id,
  event.id,
  balance.origin_id,
  CASE WHEN event.value_delta < 0 THEN balance.id END,
  CASE WHEN event.value_delta > 0 THEN balance.id END,
  'inventory',
  0,
  abs(event.value_delta),
  0
FROM public.inventory_valuation_events AS event
JOIN LATERAL (
  SELECT source_balance.id, source_balance.origin_id
  FROM public.inventory_origin_balances AS source_balance
  WHERE source_balance.tenant_id = event.tenant_id
    AND source_balance.valuation_account_id = coalesce(
      event.to_account_id,
      event.from_account_id
    )
    AND source_balance.holder_kind = 'stock_pool'
  ORDER BY source_balance.id
  LIMIT 1
) AS balance ON TRUE
WHERE event.event_type = 'company_wac_equalize'
  AND event.value_delta <> 0
  AND NOT EXISTS (
    SELECT 1
    FROM public.inventory_value_allocations AS existing
    WHERE existing.tenant_id = event.tenant_id
      AND existing.valuation_event_id = event.id
  );

ALTER TABLE public.inventory_value_allocations
  ENABLE TRIGGER inventory_value_allocations_immutable;
ALTER TABLE public.inventory_valuation_events
  ENABLE TRIGGER inventory_valuation_events_immutable;

DO $assert_direct_lineage$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.inventory_value_allocations AS allocation
    JOIN public.inventory_valuation_events AS event
      ON event.id = allocation.valuation_event_id
     AND event.tenant_id = allocation.tenant_id
    WHERE allocation.from_balance_id IS NULL
      AND allocation.source_origin_id IS NOT NULL
      AND event.from_account_id IS NOT NULL
      AND NOT (
        event.event_type = 'company_wac_equalize'
        AND event.value_delta > 0
        AND allocation.to_balance_id IS NOT NULL
      )
  ) THEN
    RAISE EXCEPTION 'inventory_direct_lineage_repair_incomplete'
      USING ERRCODE = '23514';
  END IF;
END;
$assert_direct_lineage$;

DO $repair_nht_stocktake$
DECLARE
  v_branch_id bigint;
  v_tenant_id bigint;
  v_branch_count integer;
  v_session_id bigint;
  v_session_number text;
  v_session_completed_at timestamptz;
  v_session_location_id bigint;
  v_session_actor uuid;
  v_session_count integer;
  v_origin public.inventory_cost_origins%ROWTYPE;
  v_account record;
  v_ingredient_id bigint;
  v_confirmed_ingredient_id bigint;
  v_confirmed_ingredient_count integer;
  v_confirmed_existing_cost numeric(24,8);
  v_confirmed_unit_cost constant numeric(24,8) := 3046.04;
  v_repriced_ingredients bigint[] := ARRAY[]::bigint[];
  v_unit_cost numeric(24,8);
  v_new_value numeric(20,2);
  v_delta numeric(20,2);
  v_event_id bigint;
  v_repriced_count integer := 0;
  v_repaired_count integer := 0;
  v_now timestamptz := pg_catalog.now();
  v_year integer;
  v_month integer;
BEGIN
  SELECT pg_catalog.count(*), min(branch.id), min(branch.tenant_id)
  INTO v_branch_count, v_branch_id, v_tenant_id
  FROM public.branches AS branch
  WHERE branch.code = 'NHT';

  IF v_branch_count = 0 THEN
    RETURN;
  END IF;
  IF v_branch_count <> 1 THEN
    RAISE EXCEPTION 'nht_branch_identity_ambiguous'
      USING ERRCODE = '23514';
  END IF;

  SELECT
    pg_catalog.count(*),
    min(session.id)
  INTO
    v_session_count,
    v_session_id
  FROM public.stocktake_sessions AS session
  WHERE session.tenant_id = v_tenant_id
    AND session.branch_id = v_branch_id
    AND session.status = 'completed'
    AND (session.completed_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
      = DATE '2026-08-31';

  IF v_session_count = 0 THEN
    RETURN;
  END IF;
  IF v_session_count <> 1 THEN
    RAISE EXCEPTION 'nht_august_stocktake_identity_ambiguous'
      USING ERRCODE = '23514';
  END IF;

  SELECT
    session.session_number,
    session.completed_at,
    session.location_id,
    session.created_by
  INTO STRICT
    v_session_number,
    v_session_completed_at,
    v_session_location_id,
    v_session_actor
  FROM public.stocktake_sessions AS session
  WHERE session.id = v_session_id
    AND session.tenant_id = v_tenant_id;

  IF EXISTS (
    SELECT 1
    FROM public.stocktake_sessions AS newer
    WHERE newer.tenant_id = v_tenant_id
      AND newer.branch_id = v_branch_id
      AND newer.status = 'completed'
      AND newer.completed_at > v_session_completed_at
  ) THEN
    RAISE EXCEPTION 'nht_newer_stocktake_requires_review'
      USING ERRCODE = '23514';
  END IF;

  WITH target AS (
    SELECT DISTINCT ingredient.id, ingredient.unit_cost
    FROM public.ingredients AS ingredient
    JOIN public.ingredient_units AS ingredient_unit
      ON ingredient_unit.tenant_id = ingredient.tenant_id
     AND ingredient_unit.ingredient_id = ingredient.id
     AND ingredient_unit.is_base
     AND ingredient_unit.is_active
    JOIN public.units AS unit
      ON unit.tenant_id = ingredient_unit.tenant_id
     AND unit.id = ingredient_unit.unit_id
     AND unit.code = 'phần'
    WHERE ingredient.tenant_id = v_tenant_id
      AND ingredient.name = 'Canh khổ qua'
      AND ingredient.is_active
  )
  SELECT pg_catalog.count(*), min(target.id), min(target.unit_cost)
  INTO
    v_confirmed_ingredient_count,
    v_confirmed_ingredient_id,
    v_confirmed_existing_cost
  FROM target;

  IF v_confirmed_ingredient_count <> 1 THEN
    RAISE EXCEPTION 'nht_confirmed_unit_cost_ingredient_ambiguous'
      USING ERRCODE = '23514',
            DETAIL = pg_catalog.format(
              'ingredient=Canh khổ qua unit=phần candidates=%s',
              v_confirmed_ingredient_count
            );
  END IF;

  IF coalesce(v_confirmed_existing_cost, 0) > 0
     AND v_confirmed_existing_cost IS DISTINCT FROM v_confirmed_unit_cost THEN
    RAISE EXCEPTION 'nht_confirmed_unit_cost_conflict'
      USING ERRCODE = '23514',
            DETAIL = pg_catalog.format(
              'ingredient=%s expected=%s actual=%s',
              v_confirmed_ingredient_id,
              v_confirmed_unit_cost,
              v_confirmed_existing_cost
            );
  END IF;

  UPDATE public.ingredients
  SET unit_cost = v_confirmed_unit_cost,
      updated_at = v_now
  WHERE tenant_id = v_tenant_id
    AND id = v_confirmed_ingredient_id
    AND unit_cost IS DISTINCT FROM v_confirmed_unit_cost;

  v_year := extract(YEAR FROM v_now AT TIME ZONE 'Asia/Ho_Chi_Minh')::integer;
  v_month := extract(MONTH FROM v_now AT TIME ZONE 'Asia/Ho_Chi_Minh')::integer;

  FOR v_origin IN
    SELECT origin.*
    FROM public.inventory_cost_origins AS origin
    WHERE origin.tenant_id = v_tenant_id
      AND origin.source_kind = 'stocktake_found'
      AND origin.original_quantity > 0
      AND coalesce(origin.provisional_value, 0) = 0
      AND coalesce(origin.finalized_value, 0) = 0
      AND EXISTS (
        SELECT 1
        FROM public.inventory_origin_balances AS balance
        JOIN public.inventory_valuation_accounts AS account
          ON account.id = balance.valuation_account_id
         AND account.tenant_id = balance.tenant_id
        WHERE balance.tenant_id = origin.tenant_id
          AND balance.origin_id = origin.id
          AND balance.holder_kind = 'stock_pool'
          AND account.branch_id = v_branch_id
          AND account.location_id = v_session_location_id
      )
    ORDER BY origin.id
    FOR UPDATE
  LOOP
    v_unit_cost := CASE
      WHEN v_origin.ingredient_id = v_confirmed_ingredient_id
        THEN v_confirmed_unit_cost
      ELSE private.ingredient_provisional_unit_cost(
        v_tenant_id,
        v_origin.ingredient_id
      )
    END;
    IF v_unit_cost IS NULL OR v_unit_cost <= 0 THEN
      RAISE EXCEPTION 'nht_stocktake_origin_unit_cost_missing'
        USING ERRCODE = '23514',
              DETAIL = pg_catalog.format('origin=%s', v_origin.id);
    END IF;

    v_new_value := pg_catalog.round(
      v_origin.original_quantity * v_unit_cost,
      2
    );
    v_delta := v_new_value - v_origin.provisional_value;

    INSERT INTO public.inventory_valuation_events (
      tenant_id,
      ingredient_id,
      event_type,
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
      v_tenant_id,
      v_origin.ingredient_id,
      'provisional_reprice',
      0,
      v_delta,
      v_origin.effective_at,
      v_year,
      v_month,
      pg_catalog.md5(
        'nht-stocktake-zero-reprice:' || v_origin.id::text
      )::uuid,
      pg_catalog.jsonb_build_object(
        'repair', 'nht_stocktake_zero_value',
        'origin_id', v_origin.id,
        'source_kind', v_origin.source_kind,
        'provisional_unit_cost', v_unit_cost,
        'repair_cost_source', CASE
          WHEN v_origin.ingredient_id = v_confirmed_ingredient_id
            THEN 'owner_confirmed_2026-09-01'
          ELSE 'provisional_cost_hierarchy'
        END,
        'stocktake_session_id', v_session_id,
        'stocktake_session_number', v_session_number
      ),
      v_session_actor
    )
    RETURNING id INTO v_event_id;

    PERFORM private.propagate_inventory_origin_reprice(
      v_tenant_id,
      v_event_id,
      v_origin.id,
      v_delta
    );

    UPDATE public.inventory_cost_origins
    SET provisional_value = v_new_value,
        cost_status = 'provisional'
    WHERE id = v_origin.id
      AND tenant_id = v_tenant_id;

    v_repriced_ingredients := pg_catalog.array_append(
      v_repriced_ingredients,
      v_origin.ingredient_id
    );
    v_repriced_count := v_repriced_count + 1;
  END LOOP;

  FOR v_ingredient_id IN
    SELECT DISTINCT ingredient_id
    FROM pg_catalog.unnest(v_repriced_ingredients) AS ingredient(ingredient_id)
    ORDER BY ingredient_id
  LOOP
    PERFORM private.project_company_wac(v_tenant_id, v_ingredient_id);
  END LOOP;

  FOR v_account IN
    SELECT account.id, account.ingredient_id
    FROM public.inventory_valuation_accounts AS account
    JOIN public.stock_levels AS stock
      ON stock.tenant_id = account.tenant_id
     AND stock.branch_id = account.branch_id
     AND stock.location_id = account.location_id
     AND stock.ingredient_id = account.ingredient_id
    WHERE account.tenant_id = v_tenant_id
      AND account.branch_id = v_branch_id
      AND account.location_id = v_session_location_id
      AND account.quantity IS DISTINCT FROM greatest(
        stock.current_quantity,
        0::numeric
      )
    ORDER BY account.ingredient_id, account.id
  LOOP
    PERFORM private.reconcile_inventory_valuation_account_to_stock(
      v_tenant_id,
      v_branch_id,
      v_session_location_id,
      v_account.ingredient_id,
      v_session_completed_at,
      NULL,
      'nht-stocktake-reconciliation:' || v_session_number,
      v_session_actor
    );
    v_repaired_count := v_repaired_count + 1;
  END LOOP;

  IF v_repaired_count <> 18 THEN
    RAISE EXCEPTION 'nht_stocktake_reconciliation_count_changed'
      USING ERRCODE = '23514',
            DETAIL = pg_catalog.format(
              'expected=18 actual=%s repriced=%s',
              v_repaired_count,
              v_repriced_count
            );
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.inventory_cost_origins AS origin
    JOIN public.inventory_origin_balances AS balance
      ON balance.origin_id = origin.id
     AND balance.tenant_id = origin.tenant_id
    JOIN public.inventory_valuation_accounts AS account
      ON account.id = balance.valuation_account_id
     AND account.tenant_id = balance.tenant_id
    WHERE origin.tenant_id = v_tenant_id
      AND origin.source_kind = 'stocktake_found'
      AND account.branch_id = v_branch_id
      AND account.location_id = v_session_location_id
      AND balance.quantity > 0
      AND balance.book_value <= 0
  ) THEN
    RAISE EXCEPTION 'nht_zero_value_stocktake_balance_remains'
      USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.inventory_valuation_accounts AS account
    JOIN public.stock_levels AS stock
      ON stock.tenant_id = account.tenant_id
     AND stock.branch_id = account.branch_id
     AND stock.location_id = account.location_id
     AND stock.ingredient_id = account.ingredient_id
    WHERE account.tenant_id = v_tenant_id
      AND account.branch_id = v_branch_id
      AND account.location_id = v_session_location_id
      AND account.quantity IS DISTINCT FROM greatest(
        stock.current_quantity,
        0::numeric
      )
  ) THEN
    RAISE EXCEPTION 'nht_valuation_quantity_reconciliation_incomplete'
      USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.inventory_valuation_accounts AS account
    LEFT JOIN LATERAL (
      SELECT
        coalesce(pg_catalog.sum(balance.quantity), 0) AS quantity,
        coalesce(pg_catalog.sum(balance.book_value), 0) AS book_value
      FROM public.inventory_origin_balances AS balance
      WHERE balance.tenant_id = account.tenant_id
        AND balance.valuation_account_id = account.id
        AND balance.holder_kind = 'stock_pool'
    ) AS origin_total ON TRUE
    WHERE account.tenant_id = v_tenant_id
      AND account.branch_id = v_branch_id
      AND account.location_id = v_session_location_id
      AND (
        account.quantity IS DISTINCT FROM origin_total.quantity
        OR account.book_value IS DISTINCT FROM origin_total.book_value
      )
  ) THEN
    RAISE EXCEPTION 'nht_origin_account_reconciliation_incomplete'
      USING ERRCODE = '23514';
  END IF;
END;
$repair_nht_stocktake$;

CREATE OR REPLACE FUNCTION public.get_inventory_valuation_reconciliation(
  p_year integer,
  p_month integer,
  p_branch_id bigint DEFAULT NULL::bigint
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_tenant bigint := public.auth_tenant_id();
  v_quantity_mismatches integer;
  v_value_mismatches integer;
  v_origin_mismatches integer;
  v_negative_stock_count integer;
  v_total_quantity numeric(20,3);
  v_total_value numeric(20,2);
BEGIN
  IF v_tenant IS NULL OR auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  IF NOT public.has_permission_any('inventory:valuation_read') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_year < 2000 OR p_month NOT BETWEEN 1 AND 12 THEN
    RAISE EXCEPTION 'inventory_valuation_period_invalid'
      USING ERRCODE = '22023';
  END IF;

  SELECT
    pg_catalog.count(*) FILTER (
      WHERE coalesce(account.quantity, 0) IS DISTINCT FROM greatest(
        coalesce(stock.current_quantity, 0),
        0::numeric
      )
    ),
    pg_catalog.count(*) FILTER (
      WHERE stock.current_quantity < 0
    ),
    coalesce(pg_catalog.sum(account.quantity), 0),
    coalesce(pg_catalog.sum(account.book_value), 0)
  INTO
    v_quantity_mismatches,
    v_negative_stock_count,
    v_total_quantity,
    v_total_value
  FROM public.inventory_valuation_accounts AS account
  FULL JOIN public.stock_levels AS stock
    ON stock.tenant_id = account.tenant_id
   AND stock.branch_id = account.branch_id
   AND stock.location_id = account.location_id
   AND stock.ingredient_id = account.ingredient_id
  WHERE coalesce(account.tenant_id, stock.tenant_id) = v_tenant
    AND (
      p_branch_id IS NULL
      OR coalesce(account.branch_id, stock.branch_id) = p_branch_id
    );

  SELECT pg_catalog.count(*)
  INTO v_value_mismatches
  FROM public.inventory_valuation_accounts AS account
  LEFT JOIN LATERAL (
    SELECT coalesce(pg_catalog.sum(balance.book_value), 0) AS value
    FROM public.inventory_origin_balances AS balance
    WHERE balance.tenant_id = account.tenant_id
      AND balance.valuation_account_id = account.id
      AND balance.holder_kind = 'stock_pool'
  ) AS origin_value ON TRUE
  WHERE account.tenant_id = v_tenant
    AND (p_branch_id IS NULL OR account.branch_id = p_branch_id)
    AND account.book_value IS DISTINCT FROM origin_value.value;

  SELECT pg_catalog.count(*)
  INTO v_origin_mismatches
  FROM public.inventory_valuation_accounts AS account
  LEFT JOIN LATERAL (
    SELECT coalesce(pg_catalog.sum(balance.quantity), 0) AS quantity
    FROM public.inventory_origin_balances AS balance
    WHERE balance.tenant_id = account.tenant_id
      AND balance.valuation_account_id = account.id
      AND balance.holder_kind = 'stock_pool'
  ) AS origin_quantity ON TRUE
  WHERE account.tenant_id = v_tenant
    AND (p_branch_id IS NULL OR account.branch_id = p_branch_id)
    AND account.quantity IS DISTINCT FROM origin_quantity.quantity;

  RETURN pg_catalog.jsonb_build_object(
    'year', p_year,
    'month', p_month,
    'branch_id', p_branch_id,
    'quantity_mismatches', v_quantity_mismatches,
    'value_mismatches', v_value_mismatches,
    'origin_mismatches', v_origin_mismatches,
    'negative_stock_count', v_negative_stock_count,
    'total_quantity', v_total_quantity,
    'total_value', v_total_value,
    'ledger_is_reconciled',
      v_quantity_mismatches = 0
      AND v_value_mismatches = 0
      AND v_origin_mismatches = 0,
    'is_reconciled',
      v_quantity_mismatches = 0
      AND v_value_mismatches = 0
      AND v_origin_mismatches = 0
      AND v_negative_stock_count = 0
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_inventory_valuation_reconciliation(
  integer,
  integer,
  bigint
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_inventory_valuation_reconciliation(
  integer,
  integer,
  bigint
) TO authenticated, service_role;
