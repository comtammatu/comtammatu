-- Migration: repair_inventory_unit_rebase_incident
-- Prevent catalog base-unit swaps from changing an already-established
-- conversion ratio, then repair the 2026-08-29 inverted l -> ml rebase.
-- The data repair resolves tenant and ingredient identity by uniqueness-checked
-- business keys and runs only when the exact incident fingerprint is present.

DO $migration$
DECLARE
  v_signature regprocedure :=
    'public.save_ingredient_catalog(bigint,text,text,bigint,text,text,numeric,numeric,numeric,integer,jsonb,text,bigint,bigint,bigint,boolean,boolean)'::regprocedure;
  v_definition text;
  v_old_block text := $old$
    -- How many new-base units equal one old-base unit.
    IF v_old_base_unit_id IS NOT NULL
       AND v_old_base_unit_id IS DISTINCT FROM v_base_unit_id THEN
      SELECT public.inv_catalog_unit_to_base(v_base_unit_id, incoming, p_units)
      INTO v_scale
      FROM jsonb_array_elements(p_units) AS incoming
      WHERE (incoming ->> 'unit_id')::bigint = v_old_base_unit_id
      LIMIT 1;

      IF v_scale IS NULL THEN
        SELECT unit_row.to_base_factor
        INTO v_bridge_factor
        FROM public.ingredient_units AS unit_row
        WHERE unit_row.tenant_id = v_tenant
          AND unit_row.ingredient_id = v_id
          AND unit_row.unit_id = v_base_unit_id;
        IF v_bridge_factor IS NOT NULL AND v_bridge_factor > 0 THEN
          v_scale := 1 / v_bridge_factor;
        ELSE
          -- Sole-unit rename / swap without an explicit bridge: treat as 1:1.
          v_scale := 1;
        END IF;
      END IF;
    END IF;
$old$;
  v_new_block text := $new$
    -- How many new-base units equal one old-base unit. When both units already
    -- belong to the stored graph, the incoming bridge must preserve that graph.
    -- Ratio edits remain available as a separate save while the base is stable.
    IF v_old_base_unit_id IS NOT NULL
       AND v_old_base_unit_id IS DISTINCT FROM v_base_unit_id THEN
      SELECT unit_row.to_base_factor
      INTO v_bridge_factor
      FROM public.ingredient_units AS unit_row
      WHERE unit_row.tenant_id = v_tenant
        AND unit_row.ingredient_id = v_id
        AND unit_row.unit_id = v_base_unit_id;

      SELECT public.inv_catalog_unit_to_base(v_base_unit_id, incoming, p_units)
      INTO v_scale
      FROM jsonb_array_elements(p_units) AS incoming
      WHERE (incoming ->> 'unit_id')::bigint = v_old_base_unit_id
      LIMIT 1;

      IF v_bridge_factor IS NOT NULL AND v_bridge_factor > 0 THEN
        v_expected_scale := 1 / v_bridge_factor;
        IF v_scale IS NOT NULL
           AND abs(v_scale - v_expected_scale) >
             greatest(0.000000001, abs(v_expected_scale) * 0.000000001) THEN
          RAISE EXCEPTION 'unit_rebase_ratio_changed' USING ERRCODE = '23514';
        END IF;
        v_scale := COALESCE(v_scale, v_expected_scale);
      ELSIF v_scale IS NULL THEN
        -- Sole-unit rename / swap without an explicit bridge: treat as 1:1.
        v_scale := 1;
      END IF;
    END IF;
$new$;
BEGIN
  SELECT pg_catalog.pg_get_functiondef(v_signature)
  INTO v_definition;

  v_definition := pg_catalog.replace(
    v_definition,
    pg_catalog.chr(13) || pg_catalog.chr(10),
    pg_catalog.chr(10)
  );

  IF pg_catalog.strpos(v_definition, 'v_bridge_factor numeric;') = 0
     OR pg_catalog.strpos(v_definition, v_old_block) = 0 THEN
    RAISE EXCEPTION 'save_ingredient_catalog_definition_drift';
  END IF;

  v_definition := pg_catalog.replace(
    v_definition,
    'v_bridge_factor numeric;',
    'v_bridge_factor numeric;' || pg_catalog.chr(10) ||
      '  v_expected_scale numeric;'
  );
  v_definition := pg_catalog.replace(v_definition, v_old_block, v_new_block);
  EXECUTE v_definition;
END;
$migration$;

REVOKE ALL ON FUNCTION public.save_ingredient_catalog(
  bigint, text, text, bigint, text, text, numeric, numeric, numeric, integer,
  jsonb, text, bigint, bigint, bigint, boolean, boolean
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_ingredient_catalog(
  bigint, text, text, bigint, text, text, numeric, numeric, numeric, integer,
  jsonb, text, bigint, bigint, bigint, boolean, boolean
) TO authenticated, service_role;

DO $repair$
DECLARE
  v_tenant_id bigint;
  v_ingredient_id bigint;
  v_match_count integer;
  v_incident_at constant timestamptz :=
    timestamptz '2026-08-29 09:58:33.972597+00';
  v_quantity_scale constant numeric := 1000000;
  v_correct_wac numeric(24,8);
  v_opening_quantity numeric(20,3);
  v_opening_book numeric(20,2);
  v_post_quantity numeric(20,3);
  v_movement_count integer;
  v_issue_count integer;
  v_receipt_count integer;
  v_synthetic_count integer;
  v_before_stock_value numeric;
  v_before_food_cost numeric;
  v_after_stock_value numeric;
  v_after_food_cost numeric;
BEGIN
  SELECT count(*), min(id)
  INTO v_match_count, v_tenant_id
  FROM public.tenants
  WHERE slug = 'comtammatu';
  IF v_match_count = 0 THEN
    RETURN;
  END IF;
  IF v_match_count <> 1 THEN
    RAISE EXCEPTION 'inventory_unit_rebase_tenant_ambiguous';
  END IF;

  SELECT count(*), min(id)
  INTO v_match_count, v_ingredient_id
  FROM public.ingredients
  WHERE tenant_id = v_tenant_id
    AND name = 'Nước mắm Má Tư';
  IF v_match_count = 0 THEN
    RETURN;
  END IF;
  IF v_match_count <> 1 THEN
    RAISE EXCEPTION 'inventory_unit_rebase_ingredient_ambiguous';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.audit_logs
    WHERE tenant_id = v_tenant_id
      AND entity_type = 'ingredient'
      AND entity_id = v_ingredient_id
      AND action = 'inventory.unit_rebase_incident_repaired'
  ) THEN
    RETURN;
  END IF;

  SELECT count(*)
  INTO v_match_count
  FROM public.ingredient_units AS relation
  JOIN public.units AS unit_row
    ON unit_row.id = relation.unit_id
   AND unit_row.tenant_id = relation.tenant_id
  WHERE relation.tenant_id = v_tenant_id
    AND relation.ingredient_id = v_ingredient_id
    AND (
      (unit_row.code = 'ml' AND relation.is_base AND relation.to_base_factor = 1)
      OR
      (unit_row.code = 'l' AND NOT relation.is_base AND relation.to_base_factor = 1000)
    );
  IF v_match_count <> 2 THEN
    RETURN;
  END IF;

  PERFORM 1
  FROM public.ingredients
  WHERE id = v_ingredient_id
    AND tenant_id = v_tenant_id
  FOR UPDATE;
  PERFORM 1
  FROM public.stock_levels
  WHERE ingredient_id = v_ingredient_id
    AND tenant_id = v_tenant_id
  ORDER BY id
  FOR UPDATE;
  PERFORM 1
  FROM public.inventory_valuation_accounts
  WHERE ingredient_id = v_ingredient_id
    AND tenant_id = v_tenant_id
  ORDER BY id
  FOR UPDATE;

  IF EXISTS (
    SELECT 1
    FROM public.stock_movements
    WHERE tenant_id = v_tenant_id
      AND ingredient_id = v_ingredient_id
      AND created_at >= v_incident_at
      AND (
        type <> 'consumption'
        OR movement_subtype IS DISTINCT FROM 'sale_consumption'
        OR order_id IS NULL
      )
  ) THEN
    RAISE EXCEPTION 'inventory_unit_rebase_unexpected_movement';
  END IF;

  CREATE TEMP TABLE incident_accounts ON COMMIT DROP AS
  SELECT
    account.id AS account_id,
    stock.id AS stock_level_id,
    account.branch_id,
    account.location_id,
    stock.current_quantity AS broken_quantity,
    stock.avg_unit_cost AS broken_wac,
    COALESCE(movement.post_quantity, 0)::numeric(20,3) AS post_quantity,
    (stock.current_quantity - COALESCE(movement.post_quantity, 0))::numeric(20,3)
      AS broken_opening_quantity,
    (
      (stock.current_quantity - COALESCE(movement.post_quantity, 0))
        * v_quantity_scale
      + COALESCE(movement.post_quantity, 0)
    )::numeric(20,3) AS corrected_quantity
  FROM public.inventory_valuation_accounts AS account
  JOIN public.stock_levels AS stock
    ON stock.tenant_id = account.tenant_id
   AND stock.branch_id = account.branch_id
   AND stock.location_id = account.location_id
   AND stock.ingredient_id = account.ingredient_id
  LEFT JOIN LATERAL (
    SELECT COALESCE(sum(movement_row.quantity_change), 0) AS post_quantity
    FROM public.stock_movements AS movement_row
    WHERE movement_row.tenant_id = account.tenant_id
      AND movement_row.ingredient_id = account.ingredient_id
      AND movement_row.branch_id = account.branch_id
      AND movement_row.location_id = account.location_id
      AND movement_row.created_at >= v_incident_at
  ) AS movement ON TRUE
  WHERE account.tenant_id = v_tenant_id
    AND account.ingredient_id = v_ingredient_id;

  SELECT
    COALESCE(sum(broken_opening_quantity), 0),
    COALESCE(sum(post_quantity), 0),
    COALESCE(sum(broken_quantity * broken_wac), 0)
  INTO v_opening_quantity, v_post_quantity, v_before_stock_value
  FROM incident_accounts;
  IF v_opening_quantity <> 0.014
     OR EXISTS (
       SELECT 1 FROM incident_accounts
       WHERE broken_opening_quantity NOT IN (0, 0.004, 0.010)
          OR broken_wac < 1000000
     ) THEN
    RAISE EXCEPTION 'inventory_unit_rebase_fingerprint_mismatch';
  END IF;

  SELECT count(*), COALESCE(sum(-quantity_change), 0)
  INTO v_movement_count, v_post_quantity
  FROM public.stock_movements
  WHERE tenant_id = v_tenant_id
    AND ingredient_id = v_ingredient_id
    AND created_at >= v_incident_at;

  CREATE TEMP TABLE incident_issue_events ON COMMIT DROP AS
  SELECT event.*
  FROM public.inventory_valuation_events AS event
  WHERE event.tenant_id = v_tenant_id
    AND event.ingredient_id = v_ingredient_id
    AND event.effective_at >= v_incident_at
    AND event.event_type = 'issue';

  CREATE TEMP TABLE incident_receipt_events ON COMMIT DROP AS
  SELECT event.*
  FROM public.inventory_valuation_events AS event
  WHERE event.tenant_id = v_tenant_id
    AND event.ingredient_id = v_ingredient_id
    AND event.effective_at >= v_incident_at
    AND event.event_type = 'receipt';

  CREATE TEMP TABLE incident_synthetic_origins ON COMMIT DROP AS
  SELECT origin.*
  FROM public.inventory_cost_origins AS origin
  WHERE origin.tenant_id = v_tenant_id
    AND origin.ingredient_id = v_ingredient_id
    AND origin.source_kind = 'pos_sale_shortfall'
    AND origin.created_at >= v_incident_at;

  SELECT count(*) INTO v_issue_count FROM incident_issue_events;
  SELECT count(*) INTO v_receipt_count FROM incident_receipt_events;
  SELECT count(*) INTO v_synthetic_count FROM incident_synthetic_origins;
  IF v_issue_count <> v_movement_count
     OR v_receipt_count <> v_movement_count
     OR v_synthetic_count <> v_movement_count
     OR (SELECT COALESCE(sum(quantity_delta), 0) FROM incident_issue_events)
        <> v_post_quantity THEN
    RAISE EXCEPTION 'inventory_unit_rebase_valuation_fingerprint_mismatch';
  END IF;

  SELECT COALESCE(sum(allocation.allocated_value), 0)
  INTO v_before_food_cost
  FROM public.inventory_value_allocations AS allocation
  JOIN incident_issue_events AS event
    ON event.id = allocation.valuation_event_id
  WHERE allocation.allocation_bucket = 'food_cost';

  CREATE TEMP TABLE incident_opening_balance_base ON COMMIT DROP AS
  SELECT
    balance.id AS balance_id,
    balance.valuation_account_id AS account_id,
    origin.id AS origin_id,
    origin.effective_at,
    (
      balance.book_value
      + COALESCE(consumed.allocated_value, 0)
    )::numeric(20,2) AS opening_book,
    account.broken_opening_quantity * v_quantity_scale
      AS account_opening_quantity
  FROM public.inventory_cost_origins AS origin
  JOIN public.inventory_origin_balances AS balance
    ON balance.tenant_id = origin.tenant_id
   AND balance.origin_id = origin.id
   AND balance.holder_kind = 'stock_pool'
   AND balance.valuation_account_id IS NOT NULL
  JOIN incident_accounts AS account
    ON account.account_id = balance.valuation_account_id
  LEFT JOIN LATERAL (
    SELECT COALESCE(sum(allocation.allocated_value), 0) AS allocated_value
    FROM public.inventory_value_allocations AS allocation
    JOIN incident_issue_events AS event
      ON event.id = allocation.valuation_event_id
     AND event.from_account_id = balance.valuation_account_id
    WHERE allocation.tenant_id = v_tenant_id
      AND allocation.source_origin_id = origin.id
      AND allocation.allocation_bucket = 'food_cost'
  ) AS consumed ON TRUE
  WHERE origin.tenant_id = v_tenant_id
    AND origin.ingredient_id = v_ingredient_id
    AND origin.created_at < v_incident_at;

  SELECT COALESCE(sum(account_opening_quantity), 0)
  INTO v_opening_quantity
  FROM (
    SELECT DISTINCT account_id, account_opening_quantity
    FROM incident_opening_balance_base
  ) AS account_totals;
  SELECT COALESCE(sum(opening_book), 0)
  INTO v_opening_book
  FROM incident_opening_balance_base;

  IF v_opening_quantity <> 14000 OR v_opening_book <= 0 THEN
    RAISE EXCEPTION 'inventory_unit_rebase_opening_lineage_mismatch';
  END IF;
  v_correct_wac := round(v_opening_book / v_opening_quantity, 8);

  CREATE TEMP TABLE incident_origin_plan ON COMMIT DROP AS
  WITH weighted AS (
    SELECT
      base.*,
      sum(base.opening_book) OVER (
        PARTITION BY base.account_id
      ) AS account_opening_book,
      row_number() OVER (
        PARTITION BY base.account_id
        ORDER BY base.effective_at, base.origin_id
      ) AS sequence_number,
      row_number() OVER (
        PARTITION BY base.account_id
        ORDER BY base.effective_at DESC, base.origin_id DESC
      ) AS reverse_sequence_number
    FROM incident_opening_balance_base AS base
    WHERE base.opening_book > 0
  ), provisional AS (
    SELECT
      weighted.*,
      round(
        weighted.account_opening_quantity
          * weighted.opening_book
          / weighted.account_opening_book,
        3
      ) AS provisional_quantity
    FROM weighted
  ), apportioned AS (
    SELECT
      provisional.*,
      CASE
        WHEN provisional.reverse_sequence_number = 1 THEN
          provisional.account_opening_quantity
            - COALESCE(
                sum(provisional.provisional_quantity) OVER (
                  PARTITION BY provisional.account_id
                  ORDER BY provisional.sequence_number
                  ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
                ),
                0
              )
        ELSE provisional.provisional_quantity
      END::numeric(20,3) AS opening_quantity
    FROM provisional
  )
  SELECT
    apportioned.*,
    COALESCE(
      sum(apportioned.opening_quantity) OVER (
        PARTITION BY apportioned.account_id
        ORDER BY apportioned.sequence_number
        ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
      ),
      0
    )::numeric(20,3) AS origin_start,
    sum(apportioned.opening_quantity) OVER (
      PARTITION BY apportioned.account_id
      ORDER BY apportioned.sequence_number
      ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
    )::numeric(20,3) AS origin_end
  FROM apportioned;

  CREATE TEMP TABLE incident_issue_intervals ON COMMIT DROP AS
  SELECT
    event.id AS event_id,
    event.from_account_id AS account_id,
    event.quantity_delta,
    event.effective_at,
    COALESCE(
      sum(event.quantity_delta) OVER (
        PARTITION BY event.from_account_id
        ORDER BY event.effective_at, event.id
        ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
      ),
      0
    )::numeric(20,3) AS issue_start,
    sum(event.quantity_delta) OVER (
      PARTITION BY event.from_account_id
      ORDER BY event.effective_at, event.id
      ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
    )::numeric(20,3) AS issue_end
  FROM incident_issue_events AS event;

  IF EXISTS (
    SELECT 1
    FROM incident_issue_intervals AS issue
    JOIN incident_accounts AS account ON account.account_id = issue.account_id
    WHERE issue.issue_end > account.broken_opening_quantity * v_quantity_scale
  ) THEN
    RAISE EXCEPTION 'inventory_unit_rebase_true_shortfall';
  END IF;

  CREATE TEMP TABLE incident_allocation_overlap ON COMMIT DROP AS
  SELECT
    issue.event_id,
    origin.account_id,
    origin.origin_id,
    origin.balance_id,
    greatest(
      0,
      least(origin.origin_end, issue.issue_end)
        - greatest(origin.origin_start, issue.issue_start)
    )::numeric(20,3) AS allocated_quantity
  FROM incident_issue_intervals AS issue
  JOIN incident_origin_plan AS origin
    ON origin.account_id = issue.account_id
   AND origin.origin_end > issue.issue_start
   AND origin.origin_start < issue.issue_end;
  DELETE FROM incident_allocation_overlap WHERE allocated_quantity <= 0;

  CREATE TEMP TABLE incident_new_allocations ON COMMIT DROP AS
  WITH priced AS (
    SELECT
      overlap.*,
      round(overlap.allocated_quantity * v_correct_wac, 2)
        AS provisional_value,
      row_number() OVER (
        PARTITION BY overlap.event_id
        ORDER BY overlap.origin_id DESC
      ) AS reverse_sequence_number
    FROM incident_allocation_overlap AS overlap
  )
  SELECT
    priced.*,
    CASE
      WHEN priced.reverse_sequence_number = 1 THEN
        round(event.quantity_delta * v_correct_wac, 2)
          - COALESCE(
              sum(priced.provisional_value) OVER (
                PARTITION BY priced.event_id
                ORDER BY priced.origin_id
                ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
              ),
              0
            )
      ELSE priced.provisional_value
    END::numeric(20,2) AS allocated_value
  FROM priced
  JOIN incident_issue_events AS event ON event.id = priced.event_id;

  ALTER TABLE public.inventory_value_allocations
    DISABLE TRIGGER inventory_value_allocations_immutable;
  ALTER TABLE public.inventory_valuation_events
    DISABLE TRIGGER inventory_valuation_events_immutable;

  DELETE FROM public.inventory_value_allocations AS allocation
  WHERE allocation.tenant_id = v_tenant_id
    AND (
      allocation.valuation_event_id IN (
        SELECT id FROM incident_issue_events
        UNION ALL
        SELECT id FROM incident_receipt_events
      )
      OR allocation.source_origin_id IN (
        SELECT id FROM incident_synthetic_origins
      )
    );

  DELETE FROM public.inventory_valuation_events AS event
  WHERE event.tenant_id = v_tenant_id
    AND event.id IN (SELECT id FROM incident_receipt_events);

  UPDATE public.inventory_valuation_events AS event
  SET value_delta = round(event.quantity_delta * v_correct_wac, 2),
      metadata = COALESCE(event.metadata, '{}'::jsonb) || jsonb_build_object(
        'incident_repair', '2026-08-29-unit-rebase',
        'repaired_at', now()
      )
  WHERE event.tenant_id = v_tenant_id
    AND event.id IN (SELECT id FROM incident_issue_events);

  ALTER TABLE public.inventory_valuation_events
    ENABLE TRIGGER inventory_valuation_events_immutable;
  ALTER TABLE public.inventory_value_allocations
    ENABLE TRIGGER inventory_value_allocations_immutable;

  DELETE FROM public.inventory_origin_balances AS balance
  WHERE balance.tenant_id = v_tenant_id
    AND balance.origin_id IN (SELECT id FROM incident_synthetic_origins);
  DELETE FROM public.inventory_cost_origins AS origin
  WHERE origin.tenant_id = v_tenant_id
    AND origin.id IN (SELECT id FROM incident_synthetic_origins);

  UPDATE public.inventory_cost_origins
  SET original_quantity = original_quantity * v_quantity_scale,
      finalized_quantity = finalized_quantity * v_quantity_scale
  WHERE tenant_id = v_tenant_id
    AND ingredient_id = v_ingredient_id
    AND created_at < v_incident_at;

  UPDATE public.inventory_origin_balances AS balance
  SET quantity = balance.quantity * v_quantity_scale,
      updated_at = now()
  FROM public.inventory_cost_origins AS origin
  WHERE origin.id = balance.origin_id
    AND origin.tenant_id = v_tenant_id
    AND origin.ingredient_id = v_ingredient_id
    AND origin.created_at < v_incident_at
    AND balance.tenant_id = v_tenant_id;

  UPDATE public.inventory_origin_balances AS balance
  SET quantity = (
        plan.opening_quantity
        - COALESCE(consumed.allocated_quantity, 0)
      )::numeric(20,3),
      book_value = greatest(
        0,
        plan.opening_book - COALESCE(consumed.allocated_value, 0)
      )::numeric(20,2),
      updated_at = now()
  FROM incident_origin_plan AS plan
  LEFT JOIN LATERAL (
    SELECT
      COALESCE(sum(allocation.allocated_quantity), 0) AS allocated_quantity,
      COALESCE(sum(allocation.allocated_value), 0) AS allocated_value
    FROM incident_new_allocations AS allocation
    WHERE allocation.origin_id = plan.origin_id
      AND allocation.account_id = plan.account_id
  ) AS consumed ON TRUE
  WHERE balance.id = plan.balance_id
    AND balance.tenant_id = v_tenant_id;

  INSERT INTO public.inventory_value_allocations (
    tenant_id,
    valuation_event_id,
    source_origin_id,
    from_balance_id,
    allocation_bucket,
    allocated_quantity,
    allocated_value
  )
  SELECT
    v_tenant_id,
    allocation.event_id,
    allocation.origin_id,
    allocation.balance_id,
    'food_cost',
    allocation.allocated_quantity,
    allocation.allocated_value
  FROM incident_new_allocations AS allocation;

  UPDATE public.inventory_valuation_accounts AS account
  SET quantity = incident.corrected_quantity,
      book_value = COALESCE(balance.book_value, 0),
      valuation_version = account.valuation_version + 1,
      updated_at = now()
  FROM incident_accounts AS incident
  LEFT JOIN LATERAL (
    SELECT COALESCE(sum(origin_balance.book_value), 0) AS book_value
    FROM public.inventory_origin_balances AS origin_balance
    WHERE origin_balance.tenant_id = v_tenant_id
      AND origin_balance.valuation_account_id = incident.account_id
      AND origin_balance.holder_kind = 'stock_pool'
  ) AS balance ON TRUE
  WHERE account.id = incident.account_id
    AND account.tenant_id = v_tenant_id;

  UPDATE public.stock_levels AS stock
  SET current_quantity = incident.corrected_quantity,
      avg_unit_cost = v_correct_wac,
      updated_at = now()
  FROM incident_accounts AS incident
  WHERE stock.id = incident.stock_level_id
    AND stock.tenant_id = v_tenant_id;

  IF EXISTS (
    SELECT 1
    FROM incident_accounts AS incident
    JOIN public.stock_levels AS stock ON stock.id = incident.stock_level_id
    JOIN public.inventory_valuation_accounts AS account
      ON account.id = incident.account_id
    LEFT JOIN LATERAL (
      SELECT
        COALESCE(sum(balance.quantity), 0) AS quantity,
        COALESCE(sum(balance.book_value), 0) AS book_value
      FROM public.inventory_origin_balances AS balance
      WHERE balance.tenant_id = v_tenant_id
        AND balance.valuation_account_id = account.id
        AND balance.holder_kind = 'stock_pool'
    ) AS origin_total ON TRUE
    WHERE stock.current_quantity IS DISTINCT FROM account.quantity
       OR account.quantity IS DISTINCT FROM origin_total.quantity
       OR account.book_value IS DISTINCT FROM origin_total.book_value
  ) OR EXISTS (
    SELECT 1
    FROM incident_issue_events AS event
    LEFT JOIN LATERAL (
      SELECT
        COALESCE(sum(allocation.allocated_quantity), 0) AS quantity,
        COALESCE(sum(allocation.allocated_value), 0) AS value
      FROM public.inventory_value_allocations AS allocation
      WHERE allocation.tenant_id = v_tenant_id
        AND allocation.valuation_event_id = event.id
        AND allocation.allocation_bucket = 'food_cost'
    ) AS allocation ON TRUE
    WHERE event.quantity_delta IS DISTINCT FROM allocation.quantity
       OR round(event.quantity_delta * v_correct_wac, 2)
          IS DISTINCT FROM allocation.value
  ) OR EXISTS (
    SELECT 1
    FROM public.inventory_cost_origins
    WHERE tenant_id = v_tenant_id
      AND ingredient_id = v_ingredient_id
      AND source_kind = 'pos_sale_shortfall'
      AND created_at >= v_incident_at
  ) THEN
    RAISE EXCEPTION 'inventory_unit_rebase_post_repair_reconciliation_failed';
  END IF;

  SELECT COALESCE(sum(current_quantity * avg_unit_cost), 0)
  INTO v_after_stock_value
  FROM public.stock_levels
  WHERE tenant_id = v_tenant_id
    AND ingredient_id = v_ingredient_id;
  SELECT COALESCE(sum(allocation.allocated_value), 0)
  INTO v_after_food_cost
  FROM public.inventory_value_allocations AS allocation
  JOIN incident_issue_events AS event
    ON event.id = allocation.valuation_event_id
  WHERE allocation.tenant_id = v_tenant_id
    AND allocation.allocation_bucket = 'food_cost';

  INSERT INTO public.audit_logs (
    tenant_id,
    user_id,
    action,
    entity_type,
    entity_id,
    old_data,
    new_data
  ) VALUES (
    v_tenant_id,
    NULL,
    'inventory.unit_rebase_incident_repaired',
    'ingredient',
    v_ingredient_id,
    jsonb_build_object(
      'incident_at', v_incident_at,
      'movement_count', v_movement_count,
      'stock_value', v_before_stock_value,
      'food_cost', v_before_food_cost
    ),
    jsonb_build_object(
      'quantity_scale', v_quantity_scale,
      'company_wac', v_correct_wac,
      'stock_value', v_after_stock_value,
      'food_cost', v_after_food_cost,
      'synthetic_origins_removed', v_synthetic_count,
      'repaired_at', now()
    )
  );
END;
$repair$;

-- Retry legacy count-slip waste only after the unit-rebase repair. Each issue
-- posts atomically. Expected data-readiness failures remain pending and are
-- audited instead of being approved without stock movements or forcing stock
-- negative.
DO $waste_recovery$
DECLARE
  v_row record;
  v_post_error text;
BEGIN
  FOR v_row IN
    SELECT si.id, si.tenant_id, si.created_by
    FROM public.stock_issues AS si
    JOIN public.inventory_count_slips AS cs
      ON cs.tenant_id = si.tenant_id
     AND cs.id = CASE
       WHEN coalesce(
         si.source_ref ->> 'count_slip_id',
         si.source_ref ->> 'countSlipId',
         ''
       ) ~ '^[1-9][0-9]*$'
         THEN coalesce(
           si.source_ref ->> 'count_slip_id',
           si.source_ref ->> 'countSlipId'
         )::bigint
       ELSE NULL
     END
    WHERE si.issue_type = 'writeoff'
      AND si.status = 'draft'
      AND si.approval_status = 'pending'
      AND si.source_type = 'count_slip_auto_waste'
      AND cs.status = 'approved'
    ORDER BY si.id
    FOR UPDATE OF si
  LOOP
    IF v_row.created_by IS NULL OR NOT EXISTS (
      SELECT 1
      FROM public.profiles AS profile
      WHERE profile.id = v_row.created_by
        AND profile.tenant_id = v_row.tenant_id
        AND coalesce(profile.is_active, true)
    ) THEN
      RAISE EXCEPTION 'count_slip_auto_waste_creator_invalid'
        USING ERRCODE = '23514';
    END IF;

    PERFORM pg_catalog.set_config(
      'request.jwt.claims',
      pg_catalog.jsonb_build_object(
        'sub', v_row.created_by,
        'role', 'authenticated'
      )::text,
      true
    );

    BEGIN
      UPDATE public.stock_issues
      SET approval_status = 'approved',
          approved_at = now(),
          notes = coalesce(notes, '')
            || E'\n[auto-recovered count slip waste]'
      WHERE id = v_row.id
        AND tenant_id = v_row.tenant_id
        AND status = 'draft'
        AND approval_status = 'pending';

      PERFORM public._post_writeoff_movements(v_row.id);
    EXCEPTION
      WHEN SQLSTATE '22023'
        OR SQLSTATE '23502'
        OR SQLSTATE '23503' THEN
        GET STACKED DIAGNOSTICS v_post_error = MESSAGE_TEXT;

        UPDATE public.stock_issues
        SET notes = coalesce(notes, '')
          || E'\n[auto-recovery deferred: unsafe to post]'
        WHERE id = v_row.id
          AND tenant_id = v_row.tenant_id
          AND status = 'draft'
          AND approval_status = 'pending';

        INSERT INTO public.audit_logs (
          tenant_id,
          user_id,
          action,
          entity_type,
          entity_id,
          old_data,
          new_data
        ) VALUES (
          v_row.tenant_id,
          NULL,
          'inventory.count_slip_auto_waste_recovery_deferred',
          'stock_issue',
          v_row.id,
          pg_catalog.jsonb_build_object(
            'status', 'draft',
            'approval_status', 'pending'
          ),
          pg_catalog.jsonb_build_object(
            'reason', v_post_error,
            'deferred_at', now()
          )
        );
    END;
  END LOOP;
END;
$waste_recovery$;
