-- Company WAC per purchased SKU, GRN provisional from last invoice/WAC.
-- Finished goods never GRN: provisional is last production_output only.
-- Production output = consumed input value. Append-only restatement.
-- ADR 0040. Does not rewrite stock_movements.unit_cost.

ALTER TABLE public.inventory_valuation_events
  DROP CONSTRAINT inventory_valuation_events_event_type_check;

ALTER TABLE public.inventory_valuation_events
  ADD CONSTRAINT inventory_valuation_events_event_type_check
  CHECK (event_type = ANY (ARRAY[
    'opening'::text,
    'receipt'::text,
    'issue'::text,
    'issue_restore'::text,
    'transfer_out'::text,
    'transfer_in'::text,
    'transfer_loss'::text,
    'production_input'::text,
    'production_output'::text,
    'stocktake_gain'::text,
    'stocktake_loss'::text,
    'supplier_return'::text,
    'invoice_reprice'::text,
    'credit_reprice'::text,
    'rounding'::text,
    'company_wac_equalize'::text,
    'provisional_reprice'::text
  ]));

CREATE OR REPLACE FUNCTION private.ingredient_provisional_unit_cost(
  p_tenant_id bigint,
  p_ingredient_id bigint
) RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_kind text;
  v_unit numeric(24, 8);
BEGIN
  SELECT ingredient.item_kind
  INTO v_kind
  FROM public.ingredients AS ingredient
  WHERE ingredient.tenant_id = p_tenant_id
    AND ingredient.id = p_ingredient_id;

  -- FG never has a supplier invoice. A stray grn_receipt origin must not
  -- become the unit cost; transfer is custody-only.
  IF v_kind = 'finished_good' THEN
    SELECT pg_catalog.round(
      CASE
        WHEN origin.cost_status = 'finalized'
             AND origin.finalized_value > 0
          THEN origin.finalized_value / origin.original_quantity
        ELSE origin.provisional_value / origin.original_quantity
      END,
      8
    )
    INTO v_unit
    FROM public.inventory_cost_origins AS origin
    WHERE origin.tenant_id = p_tenant_id
      AND origin.ingredient_id = p_ingredient_id
      AND origin.source_kind = 'production_output'
      AND origin.original_quantity > 0
      AND (
        (origin.cost_status = 'finalized' AND origin.finalized_value > 0)
        OR coalesce(origin.provisional_value, 0) > 0
      )
    ORDER BY origin.effective_at DESC, origin.id DESC
    LIMIT 1;

    IF v_unit IS NOT NULL AND v_unit > 0 THEN
      RETURN v_unit;
    END IF;

    SELECT CASE
      WHEN pg_catalog.sum(account.quantity)
        FILTER (WHERE account.quantity > 0 AND account.book_value > 0) > 0
      THEN pg_catalog.round(
        pg_catalog.sum(account.book_value)
          FILTER (WHERE account.quantity > 0 AND account.book_value > 0)
        / pg_catalog.sum(account.quantity)
          FILTER (WHERE account.quantity > 0 AND account.book_value > 0),
        8
      )
      ELSE NULL
    END
    INTO v_unit
    FROM public.inventory_valuation_accounts AS account
    WHERE account.tenant_id = p_tenant_id
      AND account.ingredient_id = p_ingredient_id;

    IF v_unit IS NOT NULL AND v_unit > 0 THEN
      RETURN v_unit;
    END IF;

    SELECT movement.unit_cost
    INTO v_unit
    FROM public.stock_movements AS movement
    WHERE movement.tenant_id = p_tenant_id
      AND movement.ingredient_id = p_ingredient_id
      AND movement.type = 'production_output'
      AND movement.unit_cost IS NOT NULL
      AND movement.unit_cost > 0
    ORDER BY movement.created_at DESC
    LIMIT 1;

    IF v_unit IS NOT NULL AND v_unit > 0 THEN
      RETURN v_unit;
    END IF;

    RETURN NULL;
  END IF;

  SELECT pg_catalog.round(
    origin.finalized_value / origin.original_quantity,
    8
  )
  INTO v_unit
  FROM public.inventory_cost_origins AS origin
  WHERE origin.tenant_id = p_tenant_id
    AND origin.ingredient_id = p_ingredient_id
    AND origin.source_kind = 'grn_receipt'
    AND origin.cost_status = 'finalized'
    AND origin.finalized_value > 0
    AND origin.original_quantity > 0
  ORDER BY origin.effective_at DESC, origin.id DESC
  LIMIT 1;

  IF v_unit IS NOT NULL AND v_unit > 0 THEN
    RETURN v_unit;
  END IF;

  SELECT CASE
    WHEN pg_catalog.sum(account.quantity)
      FILTER (WHERE account.quantity > 0 AND account.book_value > 0) > 0
    THEN pg_catalog.round(
      pg_catalog.sum(account.book_value)
        FILTER (WHERE account.quantity > 0 AND account.book_value > 0)
      / pg_catalog.sum(account.quantity)
        FILTER (WHERE account.quantity > 0 AND account.book_value > 0),
      8
    )
    ELSE NULL
  END
  INTO v_unit
  FROM public.inventory_valuation_accounts AS account
  WHERE account.tenant_id = p_tenant_id
    AND account.ingredient_id = p_ingredient_id;

  IF v_unit IS NOT NULL AND v_unit > 0 THEN
    RETURN v_unit;
  END IF;

  SELECT stock.avg_unit_cost
  INTO v_unit
  FROM public.stock_levels AS stock
  WHERE stock.tenant_id = p_tenant_id
    AND stock.ingredient_id = p_ingredient_id
    AND stock.avg_unit_cost IS NOT NULL
    AND stock.avg_unit_cost > 0
  ORDER BY stock.updated_at DESC NULLS LAST, stock.id DESC
  LIMIT 1;

  IF v_unit IS NOT NULL AND v_unit > 0 THEN
    RETURN v_unit;
  END IF;

  SELECT movement.unit_cost
  INTO v_unit
  FROM public.stock_movements AS movement
  WHERE movement.tenant_id = p_tenant_id
    AND movement.ingredient_id = p_ingredient_id
    AND movement.unit_cost IS NOT NULL
    AND movement.unit_cost > 0
  ORDER BY
    CASE
      WHEN movement.type = 'production_output' THEN 0
      WHEN movement.type IN ('grn_receipt', 'transfer_in') THEN 1
      ELSE 2
    END,
    movement.created_at DESC
  LIMIT 1;

  IF v_unit IS NOT NULL AND v_unit > 0 THEN
    RETURN v_unit;
  END IF;

  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION private.ingredient_company_wac(
  p_tenant_id bigint,
  p_ingredient_id bigint
) RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_qty numeric(20, 3);
  v_value numeric(20, 2);
BEGIN
  SELECT
    coalesce(pg_catalog.sum(account.quantity) FILTER (
      WHERE account.quantity > 0
    ), 0),
    coalesce(pg_catalog.sum(account.book_value) FILTER (
      WHERE account.quantity > 0
    ), 0)
  INTO v_qty, v_value
  FROM public.inventory_valuation_accounts AS account
  WHERE account.tenant_id = p_tenant_id
    AND account.ingredient_id = p_ingredient_id;

  IF v_qty > 0 AND v_value > 0 THEN
    RETURN pg_catalog.round(v_value / v_qty, 8);
  END IF;

  RETURN private.ingredient_provisional_unit_cost(
    p_tenant_id,
    p_ingredient_id
  );
END;
$$;

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
      v_target := v_total_value - v_assigned;
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
      SET book_value = book_value + v_share,
          updated_at = v_now
      WHERE id = v_balance.id;
    END LOOP;
  END LOOP;

  RETURN v_wac;
END;
$$;

CREATE OR REPLACE FUNCTION private.reprice_zero_value_origins(
  p_tenant_id bigint,
  p_ingredient_id bigint
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_origin public.inventory_cost_origins%ROWTYPE;
  v_unit numeric(24, 8);
  v_new numeric(20, 2);
  v_delta numeric(20, 2);
  v_event_id bigint;
  v_now timestamptz := pg_catalog.now();
  v_year integer;
  v_month integer;
  v_count integer := 0;
BEGIN
  v_year := extract(YEAR FROM v_now AT TIME ZONE 'Asia/Ho_Chi_Minh')::integer;
  v_month := extract(MONTH FROM v_now AT TIME ZONE 'Asia/Ho_Chi_Minh')::integer;

  FOR v_origin IN
    SELECT origin.*
    FROM public.inventory_cost_origins AS origin
    WHERE origin.tenant_id = p_tenant_id
      AND origin.ingredient_id = p_ingredient_id
      AND origin.source_kind IN ('grn_receipt', 'pos_sale_shortfall')
      AND origin.cost_status IN ('pending', 'provisional')
      AND coalesce(origin.provisional_value, 0) = 0
      AND origin.original_quantity > 0
    ORDER BY origin.id
    FOR UPDATE
  LOOP
    v_unit := private.ingredient_provisional_unit_cost(
      p_tenant_id,
      p_ingredient_id
    );
    IF v_unit IS NULL OR v_unit <= 0 THEN
      CONTINUE;
    END IF;

    v_new := pg_catalog.round(v_origin.original_quantity * v_unit, 2);
    v_delta := v_new - coalesce(v_origin.provisional_value, 0);
    IF v_delta = 0 THEN
      CONTINUE;
    END IF;

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
      metadata
    )
    VALUES (
      p_tenant_id,
      p_ingredient_id,
      'provisional_reprice',
      0,
      v_delta,
      v_now,
      v_year,
      v_month,
      pg_catalog.md5(
        'provisional-reprice:'
          || p_tenant_id::text || ':'
          || v_origin.id::text || ':'
          || v_new::text
      )::uuid,
      pg_catalog.jsonb_build_object(
        'origin_id', v_origin.id,
        'source_kind', v_origin.source_kind,
        'provisional_unit_cost', v_unit
      )
    )
    ON CONFLICT (tenant_id, idempotency_key) DO NOTHING
    RETURNING id INTO v_event_id;

    IF v_event_id IS NULL THEN
      SELECT event.id
      INTO v_event_id
      FROM public.inventory_valuation_events AS event
      WHERE event.tenant_id = p_tenant_id
        AND event.idempotency_key = pg_catalog.md5(
          'provisional-reprice:'
            || p_tenant_id::text || ':'
            || v_origin.id::text || ':'
            || v_new::text
        )::uuid;
    END IF;

    PERFORM private.propagate_inventory_origin_reprice(
      p_tenant_id,
      v_event_id,
      v_origin.id,
      v_delta
    );

    UPDATE public.inventory_cost_origins
    SET provisional_value = v_new,
        cost_status = 'provisional'
    WHERE id = v_origin.id
      AND tenant_id = p_tenant_id;

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION private.require_ingredient_cost_for_issue(
  p_tenant_id bigint,
  p_ingredient_id bigint
) RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_unit numeric(24, 8);
BEGIN
  PERFORM private.reprice_zero_value_origins(p_tenant_id, p_ingredient_id);
  PERFORM private.project_company_wac(p_tenant_id, p_ingredient_id);

  v_unit := private.ingredient_provisional_unit_cost(
    p_tenant_id,
    p_ingredient_id
  );
  IF v_unit IS NULL OR v_unit <= 0 THEN
    RAISE EXCEPTION 'missing_provisional_unit_cost:%', p_ingredient_id
      USING ERRCODE = 'P0001';
  END IF;
  RETURN v_unit;
END;
$$;

CREATE OR REPLACE FUNCTION public.repair_company_wac_valuation(
  p_idempotency_key uuid,
  p_dry_run boolean DEFAULT true
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_tenant bigint := public.auth_tenant_id();
  v_ingredient_id bigint;
  v_repriced integer := 0;
  v_equalized integer := 0;
  v_pending integer := 0;
  v_shortfall integer := 0;
BEGIN
  IF v_actor IS NULL
     OR v_tenant IS NULL
     OR NOT public.auth_is_owner(v_actor)
     OR p_idempotency_key IS NULL THEN
    RAISE EXCEPTION 'forbidden_owner_only' USING ERRCODE = '42501';
  END IF;

  SELECT pg_catalog.count(*)
  INTO v_pending
  FROM public.inventory_cost_origins AS origin
  WHERE origin.tenant_id = v_tenant
    AND origin.source_kind = 'grn_receipt'
    AND origin.cost_status IN ('pending', 'provisional')
    AND coalesce(origin.provisional_value, 0) = 0
    AND origin.original_quantity > 0;

  SELECT pg_catalog.count(*)
  INTO v_shortfall
  FROM public.inventory_cost_origins AS origin
  WHERE origin.tenant_id = v_tenant
    AND origin.source_kind = 'pos_sale_shortfall'
    AND coalesce(origin.provisional_value, 0) = 0
    AND origin.original_quantity > 0;

  IF p_dry_run THEN
    RETURN pg_catalog.jsonb_build_object(
      'dry_run', true,
      'idempotency_key', p_idempotency_key,
      'zero_provisional_grn_origins', v_pending,
      'zero_pos_sale_shortfall_origins', v_shortfall
    );
  END IF;

  FOR v_ingredient_id IN
    SELECT DISTINCT origin.ingredient_id
    FROM public.inventory_cost_origins AS origin
    WHERE origin.tenant_id = v_tenant
      AND origin.source_kind IN ('grn_receipt', 'pos_sale_shortfall')
      AND origin.cost_status IN ('pending', 'provisional')
      AND coalesce(origin.provisional_value, 0) = 0
      AND origin.original_quantity > 0
    ORDER BY origin.ingredient_id
  LOOP
    v_repriced := v_repriced + private.reprice_zero_value_origins(
      v_tenant,
      v_ingredient_id
    );
  END LOOP;

  FOR v_ingredient_id IN
    SELECT DISTINCT account.ingredient_id
    FROM public.inventory_valuation_accounts AS account
    WHERE account.tenant_id = v_tenant
    ORDER BY account.ingredient_id
  LOOP
    IF private.project_company_wac(v_tenant, v_ingredient_id) IS NOT NULL THEN
      v_equalized := v_equalized + 1;
    END IF;
  END LOOP;

  RETURN pg_catalog.jsonb_build_object(
    'dry_run', false,
    'idempotency_key', p_idempotency_key,
    'origins_repriced', v_repriced,
    'ingredients_equalized', v_equalized,
    'zero_provisional_grn_origins', v_pending,
    'zero_pos_sale_shortfall_origins', v_shortfall
  );
END;
$$;

REVOKE ALL ON FUNCTION public.repair_company_wac_valuation(uuid, boolean)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.repair_company_wac_valuation(uuid, boolean)
  TO authenticated, service_role;

DO $patch_poster$
DECLARE
  v_def text;
  v_updated text;
BEGIN
  SELECT pg_get_functiondef(p.oid)
  INTO v_def
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'private'
    AND p.proname = 'post_stock_movement_valuation';

  IF v_def IS NULL THEN
    RAISE EXCEPTION 'post_stock_movement_valuation missing';
  END IF;

  v_def := regexp_replace(
    v_def,
    '^CREATE (OR REPLACE )?FUNCTION',
    'CREATE OR REPLACE FUNCTION'
  );

  v_updated := regexp_replace(
    v_def,
    'ELSIF NEW\.quantity_change > 0 THEN\s+v_value := pg_catalog\.round\(v_quantity \* coalesce\(NEW\.unit_cost, 0\), 2\);',
    $new$ELSIF NEW.quantity_change > 0 THEN
    IF NEW.type = 'grn_receipt' AND coalesce(NEW.unit_cost, 0) = 0 THEN
      v_value := pg_catalog.round(
        v_quantity * coalesce(
          private.ingredient_provisional_unit_cost(
            NEW.tenant_id,
            NEW.ingredient_id
          ),
          0
        ),
        2
      );
    ELSE
      v_value := pg_catalog.round(v_quantity * coalesce(NEW.unit_cost, 0), 2);
    END IF;$new$
  );
  IF v_updated = v_def THEN
    RAISE EXCEPTION 'post_stock_movement_valuation GRN provisional pattern missing';
  END IF;
  v_def := v_updated;

  v_updated := regexp_replace(
    v_def,
    'IF v_account\.quantity < v_quantity OR v_account\.quantity <= 0 THEN\s+RAISE EXCEPTION ''inventory_valuation_insufficient_quantity''',
    $new$IF NEW.type IN ('transfer_out', 'production_consumption') THEN
      PERFORM private.require_ingredient_cost_for_issue(
        NEW.tenant_id,
        NEW.ingredient_id
      );
      SELECT *
      INTO v_account
      FROM public.inventory_valuation_accounts
      WHERE id = v_account.id;
    END IF;

    IF v_account.quantity < v_quantity OR v_account.quantity <= 0 THEN
      RAISE EXCEPTION 'inventory_valuation_insufficient_quantity'$new$
  );
  IF v_updated = v_def THEN
    RAISE EXCEPTION 'post_stock_movement_valuation issue-cost gate pattern missing';
  END IF;
  v_def := v_updated;

  v_updated := regexp_replace(
    v_def,
    'IF v_mode = ''active'' THEN\s+UPDATE public\.stock_levels AS stock\s+SET avg_unit_cost = CASE\s+WHEN account\.quantity > 0\s+THEN pg_catalog\.round\(\s*account\.book_value / account\.quantity,\s*8\s*\)\s+(WHEN stock\.avg_unit_cost IS NOT NULL AND stock\.avg_unit_cost > 0\s+THEN stock\.avg_unit_cost\s+)?ELSE 0\s+END,\s+updated_at = pg_catalog\.now\(\)\s+FROM public\.inventory_valuation_accounts AS account\s+WHERE account\.id = v_account\.id\s+AND stock\.tenant_id = account\.tenant_id\s+AND stock\.branch_id = account\.branch_id\s+AND stock\.location_id = account\.location_id\s+AND stock\.ingredient_id = account\.ingredient_id;\s+END IF;',
    $new$IF v_mode = 'active' THEN
    PERFORM private.project_company_wac(NEW.tenant_id, NEW.ingredient_id);
  END IF;$new$
  );
  IF v_updated = v_def THEN
    RAISE EXCEPTION 'post_stock_movement_valuation company WAC pattern missing';
  END IF;

  EXECUTE v_updated;

  IF pg_get_functiondef(
    'private.post_stock_movement_valuation()'::regprocedure
  ) !~ 'ingredient_provisional_unit_cost'
     OR pg_get_functiondef(
       'private.post_stock_movement_valuation()'::regprocedure
     ) !~ 'project_company_wac' THEN
    RAISE EXCEPTION 'post_stock_movement_valuation company WAC patch failed';
  END IF;
END
$patch_poster$;

COMMENT ON FUNCTION private.post_stock_movement_valuation() IS
  'ADR 0040: GRN receipts use last-invoice/WAC provisional value; after each event, project company WAC. Transfer/production issues require a provisional unit cost. Empty pools keep last positive company WAC. ADR 0026 shortfall receive is unchanged.';

DO $patch_settle$
DECLARE
  v_def text;
  v_updated text;
BEGIN
  SELECT pg_get_functiondef(p.oid)
  INTO v_def
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'private'
    AND p.proname = 'settle_supplier_invoice_valuation';

  IF v_def IS NULL THEN
    RAISE EXCEPTION 'settle_supplier_invoice_valuation missing';
  END IF;

  v_def := regexp_replace(
    v_def,
    '^CREATE (OR REPLACE )?FUNCTION',
    'CREATE OR REPLACE FUNCTION'
  );

  v_updated := regexp_replace(
    v_def,
    'IF v_mode = ''active'' THEN\s+UPDATE public\.stock_levels AS stock\s+SET avg_unit_cost = CASE\s+WHEN account\.quantity > 0\s+THEN pg_catalog\.round\(\s*account\.book_value / account\.quantity,\s*8\s*\)\s+ELSE 0\s+END,\s+updated_at = pg_catalog\.now\(\)\s+FROM public\.inventory_valuation_accounts AS account\s+WHERE account\.tenant_id = v_invoice\.tenant_id\s+AND stock\.tenant_id = account\.tenant_id\s+AND stock\.branch_id = account\.branch_id\s+AND stock\.location_id = account\.location_id\s+AND stock\.ingredient_id = account\.ingredient_id;\s+END IF;',
    $new$IF v_mode = 'active' THEN
    PERFORM private.project_company_wac(
      v_invoice.tenant_id,
      distinct_ingredient.ingredient_id
    )
    FROM (
      SELECT DISTINCT account.ingredient_id
      FROM public.inventory_valuation_accounts AS account
      WHERE account.tenant_id = v_invoice.tenant_id
    ) AS distinct_ingredient;
  END IF;$new$
  );
  IF v_updated = v_def THEN
    RAISE EXCEPTION 'settle_supplier_invoice_valuation company WAC pattern missing';
  END IF;

  EXECUTE v_updated;
END
$patch_settle$;

DO $patch_production$
DECLARE
  v_def text;
  v_updated text;
BEGIN
  SELECT pg_get_functiondef(p.oid)
  INTO v_def
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'private'
    AND p.proname = 'execute_confirm_production_run';

  IF v_def IS NULL THEN
    RAISE EXCEPTION 'execute_confirm_production_run missing';
  END IF;

  v_def := regexp_replace(
    v_def,
    '^CREATE (OR REPLACE )?FUNCTION',
    'CREATE OR REPLACE FUNCTION'
  );

  v_updated := replace(
    v_def,
    'v_output_cost := v_output_cost + (v_raw_need_purchase * COALESCE(v_recipe.raw_unit_cost, 0));',
    'v_output_cost := v_output_cost;'
  );
  IF v_updated = v_def THEN
    v_updated := replace(
      v_def,
      'v_output_cost := v_output_cost +
      (v_raw_need_purchase * COALESCE(v_recipe.raw_unit_cost, 0));',
      'v_output_cost := v_output_cost;'
    );
  END IF;
  IF v_updated = v_def THEN
    v_updated := regexp_replace(
      v_def,
      'v_output_cost := v_output_cost \+\s*\(v_raw_need_purchase \* COALESCE\(v_recipe\.raw_unit_cost, 0\)\);',
      'v_output_cost := v_output_cost;',
      'i'
    );
  END IF;
  IF v_updated = v_def THEN
    RAISE EXCEPTION 'execute_confirm_production_run recipe snapshot cost pattern missing';
  END IF;
  v_def := v_updated;

  v_updated := regexp_replace(
    v_def,
    'v_cost_total := v_output_cost;\s+FOR v_key, v_need_qty IN',
    $new$v_output_cost := 0;

  FOR v_key, v_need_qty IN$new$
  );
  IF v_updated = v_def THEN
    RAISE EXCEPTION 'execute_confirm_production_run cost_total defer pattern missing';
  END IF;
  v_def := v_updated;

  v_updated := regexp_replace(
    v_def,
    'IF NOT FOUND THEN\s+v_old_q := 0;\s+v_old_wac := 0;\s+END IF;\s+SELECT\s+ingredient\.production_unit_id',
    $new$IF NOT FOUND THEN
      v_old_q := 0;
      v_old_wac := 0;
    END IF;

    v_old_wac := private.require_ingredient_cost_for_issue(
      v_tenant,
      v_key::bigint
    );
    IF coalesce(v_old_wac, 0) <= 0 THEN
      SELECT sl.avg_unit_cost
      INTO v_old_wac
      FROM public.stock_levels sl
      WHERE sl.tenant_id = v_tenant
        AND sl.branch_id = v_run.branch_id
        AND sl.location_id = v_source_location_id
        AND sl.ingredient_id = v_key::bigint;
    END IF;

    SELECT
      ingredient.production_unit_id$new$
  );
  IF v_updated = v_def THEN
    RAISE EXCEPTION 'execute_confirm_production_run issue-cost gate pattern missing';
  END IF;
  v_def := v_updated;

  v_updated := regexp_replace(
    v_def,
    'v_raw_entry_unit_code\s+\);\s+END LOOP;\s+IF v_run\.entry_unit_id IS NOT NULL THEN',
    $new$v_raw_entry_unit_code
    );
    v_output_cost := v_output_cost
      + ROUND(v_need_qty * COALESCE(v_old_wac, 0), 2);
  END LOOP;

  v_cost_total := v_output_cost;

  IF v_run.entry_unit_id IS NOT NULL THEN$new$
  );
  IF v_updated = v_def THEN
    RAISE EXCEPTION 'execute_confirm_production_run consumed-value output pattern missing';
  END IF;

  EXECUTE v_updated;
END
$patch_production$;

DO $patch_transfer$
DECLARE
  v_def text;
  v_updated text;
BEGIN
  SELECT pg_get_functiondef(p.oid)
  INTO v_def
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'stock_transfer_confirm_ship';

  IF v_def IS NULL THEN
    RAISE EXCEPTION 'stock_transfer_confirm_ship missing';
  END IF;

  v_def := regexp_replace(
    v_def,
    '^CREATE (OR REPLACE )?FUNCTION',
    'CREATE OR REPLACE FUNCTION'
  );

  v_updated := regexp_replace(
    v_def,
    'IF NOT FOUND\s+OR coalesce\(v_source_quantity, 0\) < v_quantity_base THEN\s+RAISE EXCEPTION ''insufficient_stock:%'',\s+v_line\.ingredient_id\s+USING ERRCODE = ''P0001'';\s+END IF;',
    $new$IF NOT FOUND
       OR coalesce(v_source_quantity, 0) < v_quantity_base THEN
      RAISE EXCEPTION 'insufficient_stock:%',
        v_line.ingredient_id
        USING ERRCODE = 'P0001';
    END IF;

    v_source_wac := private.require_ingredient_cost_for_issue(
      v_tenant,
      v_line.ingredient_id
    );$new$
  );
  IF v_updated = v_def THEN
    RAISE EXCEPTION 'stock_transfer_confirm_ship cost gate pattern missing';
  END IF;

  EXECUTE v_updated;
END
$patch_transfer$;

DO $patch_pos$
DECLARE
  v_def text;
  v_updated text;
BEGIN
  SELECT pg_get_functiondef(p.oid)
  INTO v_def
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'post_pos_sale_consumption_if_ready';

  IF v_def IS NULL THEN
    RAISE EXCEPTION 'post_pos_sale_consumption_if_ready missing';
  END IF;

  v_def := regexp_replace(
    v_def,
    '^CREATE (OR REPLACE )?FUNCTION',
    'CREATE OR REPLACE FUNCTION'
  );

  v_updated := regexp_replace(
    v_def,
    '-- Cost ladder \(ADR 0026 Decision 4\)\s+v_cost_rung := NULL;\s+IF v_unit_cost IS NOT NULL AND v_unit_cost > 0 THEN\s+v_cost_rung := ''location_wac'';\s+ELSE\s+SELECT sl\.avg_unit_cost\s+INTO v_unit_cost\s+FROM public\.stock_levels sl\s+WHERE sl\.tenant_id = v_order\.tenant_id\s+AND sl\.ingredient_id = v_need\.ingredient_id\s+AND sl\.avg_unit_cost IS NOT NULL\s+AND sl\.avg_unit_cost > 0\s+ORDER BY\s+CASE WHEN sl\.branch_id = v_order\.branch_id THEN 0 ELSE 1 END,\s+sl\.updated_at DESC NULLS LAST\s+LIMIT 1;\s+IF v_unit_cost IS NOT NULL AND v_unit_cost > 0 THEN\s+v_cost_rung := ''tenant_wac'';\s+v_cost_fallback := array_append\(v_cost_fallback, v_need\.ingredient_id\);\s+v_followup_needed := true;\s+END IF;\s+END IF;',
    $new$-- Cost ladder (ADR 0026 Decision 4, ADR 0040 company WAC)
    v_cost_rung := NULL;
    IF v_unit_cost IS NOT NULL AND v_unit_cost > 0 THEN
      v_cost_rung := 'company_wac';
    ELSE
      v_unit_cost := private.ingredient_company_wac(
        v_order.tenant_id,
        v_need.ingredient_id
      );
      IF v_unit_cost IS NULL OR v_unit_cost <= 0 THEN
        v_unit_cost := private.ingredient_provisional_unit_cost(
          v_order.tenant_id,
          v_need.ingredient_id
        );
      END IF;
      IF v_unit_cost IS NOT NULL AND v_unit_cost > 0 THEN
        v_cost_rung := 'company_wac';
        v_cost_fallback := array_append(v_cost_fallback, v_need.ingredient_id);
        v_followup_needed := true;
      END IF;
    END IF;$new$
  );
  IF v_updated = v_def THEN
    RAISE EXCEPTION 'post_pos_sale_consumption_if_ready company WAC pattern missing';
  END IF;

  EXECUTE v_updated;
END
$patch_pos$;

COMMENT ON FUNCTION public.post_pos_sale_consumption_if_ready(bigint, uuid) IS
  'ADR 0026/0040: posts per-ingredient sale consumption; cost ladder is company WAC, latest purchase, last-known movement, then zero.';

COMMENT ON FUNCTION public.repair_company_wac_valuation(uuid, boolean) IS
  'Owner-only ADR 0040 restatement: dry-run counts zero-value origins; apply reprices them, propagates, and equalizes company WAC. Never updates stock_movements.unit_cost.';
