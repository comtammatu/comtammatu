-- ISS-06 / OD-3 B: Owner overwrites company WAC (Giá vốn) via append-only
-- restatement. Does not patch confirmed GRN Đơn giá, rewrite movements, or
-- treat catalog ingredients.unit_cost as book cost. Types: corepack pnpm
-- db:types waits until this file is applied on Production.

CREATE OR REPLACE FUNCTION public.owner_set_company_wac(
  p_ingredient_id bigint,
  p_unit_cost numeric,
  p_reason text,
  p_idempotency_key uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_tenant bigint := public.auth_tenant_id();
  v_kind text;
  v_catalog_cost numeric;
  v_base_unit_id bigint;
  v_reason text := btrim(COALESCE(p_reason, ''));
  v_new_wac numeric(24, 8);
  v_now timestamptz := pg_catalog.now();
  v_year integer;
  v_month integer;
  v_account record;
  v_origin public.inventory_cost_origins%ROWTYPE;
  v_origin_ids bigint[];
  v_origin_id bigint;
  v_origin_count integer;
  v_origin_index integer := 0;
  v_remaining_qty numeric(20, 3);
  v_remaining_value numeric(20, 2);
  v_origin_qty numeric(20, 3);
  v_origin_value numeric(20, 2);
  v_target numeric(20, 2);
  v_assigned numeric(20, 2) := 0;
  v_origin_target numeric(20, 2);
  v_origin_delta numeric(20, 2);
  v_propagate_delta numeric(20, 2);
  v_value_delta numeric(20, 2);
  v_on_hand numeric(20, 3);
  v_on_hand_after numeric(20, 3);
  v_event_id bigint;
  v_idempotency uuid;
  v_wac numeric;
  v_source_id bigint;
  v_account_count integer;
  v_account_index integer := 0;
  v_share numeric(20, 2);
BEGIN
  IF v_actor IS NULL
     OR v_tenant IS NULL
     OR NOT public.auth_is_owner(v_actor)
     OR p_idempotency_key IS NULL THEN
    RAISE EXCEPTION 'forbidden_owner_only' USING ERRCODE = '42501';
  END IF;

  IF v_reason IS NULL OR pg_catalog.char_length(v_reason) < 10 THEN
    RAISE EXCEPTION 'reason_required' USING ERRCODE = '23514';
  END IF;
  IF pg_catalog.char_length(v_reason) > 500 THEN
    RAISE EXCEPTION 'reason_too_long' USING ERRCODE = '23514';
  END IF;
  IF p_ingredient_id IS NULL THEN
    RAISE EXCEPTION 'ingredient_required' USING ERRCODE = '22023';
  END IF;
  IF p_unit_cost IS NULL OR p_unit_cost <= 0 THEN
    RAISE EXCEPTION 'company_wac_invalid' USING ERRCODE = '23514';
  END IF;

  SELECT ingredient.item_kind, ingredient.unit_cost
  INTO v_kind, v_catalog_cost
  FROM public.ingredients AS ingredient
  WHERE ingredient.id = p_ingredient_id
    AND ingredient.tenant_id = v_tenant
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ingredient_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_kind IS DISTINCT FROM 'raw_material' THEN
    RAISE EXCEPTION 'finished_good_wac_overwrite_forbidden' USING ERRCODE = '23514';
  END IF;

  SELECT ingredient_unit.unit_id
  INTO v_base_unit_id
  FROM public.ingredient_units AS ingredient_unit
  WHERE ingredient_unit.tenant_id = v_tenant
    AND ingredient_unit.ingredient_id = p_ingredient_id
    AND ingredient_unit.is_base
    AND ingredient_unit.is_active
  ORDER BY ingredient_unit.id
  LIMIT 1;

  IF v_base_unit_id IS NULL THEN
    RAISE EXCEPTION 'base_unit_required' USING ERRCODE = '23514';
  END IF;

  v_new_wac := pg_catalog.round(p_unit_cost, 8);
  v_year := extract(YEAR FROM v_now AT TIME ZONE 'Asia/Ho_Chi_Minh')::integer;
  v_month := extract(MONTH FROM v_now AT TIME ZONE 'Asia/Ho_Chi_Minh')::integer;

  INSERT INTO public.inventory_valuation_accounts (
    tenant_id,
    branch_id,
    location_id,
    ingredient_id,
    quantity,
    book_value
  )
  SELECT
    stock.tenant_id,
    stock.branch_id,
    stock.location_id,
    stock.ingredient_id,
    stock.current_quantity,
    0
  FROM public.stock_levels AS stock
  WHERE stock.tenant_id = v_tenant
    AND stock.ingredient_id = p_ingredient_id
    AND stock.current_quantity > 0
  ON CONFLICT (tenant_id, branch_id, location_id, ingredient_id)
  DO NOTHING;

  FOR v_account IN
    SELECT account.branch_id, account.location_id
    FROM public.inventory_valuation_accounts AS account
    WHERE account.tenant_id = v_tenant
      AND account.ingredient_id = p_ingredient_id
    ORDER BY account.branch_id, account.location_id, account.id
  LOOP
    PERFORM private.lock_inventory_valuation_pool(
      v_tenant,
      v_account.branch_id,
      v_account.location_id,
      p_ingredient_id
    );
  END LOOP;

  SELECT coalesce(pg_catalog.sum(stock.current_quantity), 0)
  INTO v_on_hand
  FROM public.stock_levels AS stock
  WHERE stock.tenant_id = v_tenant
    AND stock.ingredient_id = p_ingredient_id;

  SELECT
    coalesce(pg_catalog.array_agg(origin_row.origin_id ORDER BY origin_row.origin_id), '{}')
  INTO v_origin_ids
  FROM (
    SELECT origin.id AS origin_id
    FROM public.inventory_cost_origins AS origin
    WHERE origin.tenant_id = v_tenant
      AND origin.ingredient_id = p_ingredient_id
      AND origin.original_quantity > 0
      AND EXISTS (
        SELECT 1
        FROM public.inventory_origin_balances AS balance
        WHERE balance.tenant_id = origin.tenant_id
          AND balance.origin_id = origin.id
          AND balance.quantity > 0
      )
  ) AS origin_row;

  v_origin_count := coalesce(pg_catalog.array_length(v_origin_ids, 1), 0);

  IF v_origin_count > 0 THEN
    SELECT
      coalesce(pg_catalog.sum(balance.quantity), 0),
      coalesce(pg_catalog.sum(balance.book_value), 0)
    INTO v_remaining_qty, v_remaining_value
    FROM public.inventory_origin_balances AS balance
    WHERE balance.tenant_id = v_tenant
      AND balance.origin_id = ANY (v_origin_ids)
      AND balance.quantity > 0;
  ELSE
    SELECT
      coalesce(pg_catalog.sum(account.quantity) FILTER (
        WHERE account.quantity > 0
      ), 0),
      coalesce(pg_catalog.sum(account.book_value) FILTER (
        WHERE account.quantity > 0
      ), 0)
    INTO v_remaining_qty, v_remaining_value
    FROM public.inventory_valuation_accounts AS account
    WHERE account.tenant_id = v_tenant
      AND account.ingredient_id = p_ingredient_id;
  END IF;

  IF v_remaining_qty > 0 THEN
    v_target := pg_catalog.round(v_remaining_qty * v_new_wac, 2);
  ELSE
    v_target := 0;
  END IF;
  v_value_delta := v_target - coalesce(v_remaining_value, 0);

  v_idempotency := pg_catalog.md5(
    'owner-set-company-wac:'
      || v_tenant::text || ':'
      || p_ingredient_id::text || ':'
      || p_idempotency_key::text || ':'
      || v_new_wac::text
  )::uuid;

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
    v_tenant,
    p_ingredient_id,
    'provisional_reprice',
    0,
    v_value_delta,
    v_now,
    v_year,
    v_month,
    v_idempotency,
    pg_catalog.jsonb_build_object(
      'owner_set_company_wac', TRUE,
      'reason', v_reason,
      'unit_cost', v_new_wac,
      'base_unit_id', v_base_unit_id,
      'actor_id', v_actor,
      'on_hand_quantity', v_on_hand
    )
  )
  ON CONFLICT (tenant_id, idempotency_key) DO NOTHING
  RETURNING id INTO v_event_id;

  IF v_event_id IS NULL THEN
    SELECT event.id
    INTO v_event_id
    FROM public.inventory_valuation_events AS event
    WHERE event.tenant_id = v_tenant
      AND event.idempotency_key = v_idempotency;
    v_wac := private.project_company_wac(v_tenant, p_ingredient_id);
    RETURN pg_catalog.jsonb_build_object(
      'ingredient_id', p_ingredient_id,
      'company_wac', coalesce(v_wac, v_new_wac),
      'quantity_delta', 0,
      'value_delta', v_value_delta,
      'on_hand_quantity', v_on_hand,
      'event_id', v_event_id,
      'base_unit_id', v_base_unit_id,
      'idempotent', TRUE
    );
  END IF;

  IF v_origin_count > 0 AND v_remaining_qty > 0 THEN
    FOREACH v_origin_id IN ARRAY v_origin_ids
    LOOP
      v_origin_index := v_origin_index + 1;

      SELECT origin.*
      INTO v_origin
      FROM public.inventory_cost_origins AS origin
      WHERE origin.id = v_origin_id
        AND origin.tenant_id = v_tenant
      FOR UPDATE;

      SELECT
        coalesce(pg_catalog.sum(balance.quantity), 0),
        coalesce(pg_catalog.sum(balance.book_value), 0)
      INTO v_origin_qty, v_origin_value
      FROM public.inventory_origin_balances AS balance
      WHERE balance.tenant_id = v_tenant
        AND balance.origin_id = v_origin.id
        AND balance.quantity > 0;

      IF v_origin_qty <= 0 THEN
        CONTINUE;
      END IF;

      IF v_origin_index = v_origin_count THEN
        v_origin_target := v_target - v_assigned;
      ELSE
        v_origin_target := pg_catalog.round(v_origin_qty * v_new_wac, 2);
      END IF;
      v_assigned := v_assigned + v_origin_target;
      v_origin_delta := v_origin_target - v_origin_value;
      IF v_origin_delta = 0 THEN
        CONTINUE;
      END IF;

      v_propagate_delta := pg_catalog.round(
        v_origin_delta * v_origin.original_quantity / v_origin_qty,
        2
      );

      PERFORM private.propagate_inventory_origin_reprice(
        v_tenant,
        v_event_id,
        v_origin.id,
        v_propagate_delta
      );

      UPDATE public.inventory_cost_origins
      SET provisional_value = CASE
            WHEN cost_status = 'finalized' THEN provisional_value
            ELSE GREATEST(0, provisional_value + v_propagate_delta)
          END,
          finalized_value = CASE
            WHEN cost_status = 'finalized'
              THEN GREATEST(0, finalized_value + v_propagate_delta)
            ELSE finalized_value
          END
      WHERE id = v_origin.id
        AND tenant_id = v_tenant;
    END LOOP;
  ELSIF v_remaining_qty > 0 THEN
    v_source_id := pg_catalog.hashtextextended(
      'owner_set_company_wac:' || v_tenant::text || ':' || p_ingredient_id::text,
      0
    );
    IF v_source_id = 0 THEN
      v_source_id := -p_ingredient_id;
    END IF;

    INSERT INTO public.inventory_cost_origins (
      tenant_id,
      ingredient_id,
      source_kind,
      source_id,
      original_quantity,
      provisional_value,
      cost_status,
      effective_at
    )
    VALUES (
      v_tenant,
      p_ingredient_id,
      'opening',
      v_source_id,
      v_remaining_qty,
      v_target,
      'provisional',
      v_now
    )
    ON CONFLICT (tenant_id, source_kind, source_id)
    DO UPDATE SET
      original_quantity = EXCLUDED.original_quantity,
      provisional_value = EXCLUDED.provisional_value,
      cost_status = 'provisional',
      effective_at = EXCLUDED.effective_at
    RETURNING * INTO v_origin;

    SELECT pg_catalog.count(*)
    INTO v_account_count
    FROM public.inventory_valuation_accounts AS account
    WHERE account.tenant_id = v_tenant
      AND account.ingredient_id = p_ingredient_id
      AND account.quantity > 0;

    FOR v_account IN
      SELECT account.*
      FROM public.inventory_valuation_accounts AS account
      WHERE account.tenant_id = v_tenant
        AND account.ingredient_id = p_ingredient_id
        AND account.quantity > 0
      ORDER BY account.branch_id, account.location_id, account.id
      FOR UPDATE
    LOOP
      v_account_index := v_account_index + 1;
      IF v_account_index = v_account_count THEN
        v_share := v_target - v_assigned;
      ELSE
        v_share := pg_catalog.round(v_account.quantity * v_new_wac, 2);
      END IF;
      v_assigned := v_assigned + v_share;

      UPDATE public.inventory_valuation_accounts
      SET book_value = v_share,
          valuation_version = valuation_version + 1,
          updated_at = v_now
      WHERE id = v_account.id
        AND tenant_id = v_tenant;

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
        v_origin.id,
        'stock_pool',
        v_account.id,
        v_account.quantity,
        v_share
      )
      ON CONFLICT (
        tenant_id,
        origin_id,
        valuation_account_id
      ) WHERE holder_kind = 'stock_pool'
      DO UPDATE SET
        quantity = EXCLUDED.quantity,
        book_value = EXCLUDED.book_value,
        updated_at = v_now;
    END LOOP;
  ELSE
    UPDATE public.stock_levels
    SET avg_unit_cost = v_new_wac,
        updated_at = v_now
    WHERE tenant_id = v_tenant
      AND ingredient_id = p_ingredient_id;
  END IF;

  v_wac := private.project_company_wac(v_tenant, p_ingredient_id);

  SELECT coalesce(pg_catalog.sum(stock.current_quantity), 0)
  INTO v_on_hand_after
  FROM public.stock_levels AS stock
  WHERE stock.tenant_id = v_tenant
    AND stock.ingredient_id = p_ingredient_id;

  IF v_on_hand_after IS DISTINCT FROM v_on_hand THEN
    RAISE EXCEPTION 'owner_wac_quantity_changed' USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.ingredients AS ingredient
    WHERE ingredient.id = p_ingredient_id
      AND ingredient.tenant_id = v_tenant
      AND ingredient.unit_cost IS DISTINCT FROM v_catalog_cost
  ) THEN
    RAISE EXCEPTION 'owner_wac_catalog_cost_changed' USING ERRCODE = '23514';
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'ingredient_id', p_ingredient_id,
    'company_wac', coalesce(v_wac, v_new_wac),
    'quantity_delta', 0,
    'value_delta', v_value_delta,
    'on_hand_quantity', v_on_hand_after,
    'event_id', v_event_id,
    'base_unit_id', v_base_unit_id,
    'idempotent', FALSE
  );
END;
$$;

REVOKE ALL ON FUNCTION public.owner_set_company_wac(
  bigint, numeric, text, uuid
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.owner_set_company_wac(
  bigint, numeric, text, uuid
) TO authenticated, service_role;

COMMENT ON FUNCTION public.owner_set_company_wac(
  bigint, numeric, text, uuid
) IS
  'Owner-only ISS-06: set company WAC per base unit via append-only restatement (quantity_delta=0). Raw materials only; does not patch GRN lines or catalog Giá tham chiếu.';
