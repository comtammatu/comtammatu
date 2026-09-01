-- Migration: company_wac_origin_residual_reconciliation

-- Keep account and source-origin values identical when a negative company-WAC
-- adjustment meets zero-value origins. The previous proportional delta path
-- clamped those origins at zero but still set the account to the full target,
-- leaving the unapplied reduction behind in the positive origin balances.

BEGIN;

DROP TRIGGER IF EXISTS inventory_allocate_company_wac_equalization
  ON public.inventory_valuation_events;
DROP FUNCTION IF EXISTS private.allocate_company_wac_equalization();

CREATE OR REPLACE FUNCTION private.project_company_wac(
  p_tenant_id bigint,
  p_ingredient_id bigint
) RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_total_qty numeric(20,3);
  v_total_value numeric(20,2);
  v_wac numeric(24,8);
  v_account record;
  v_account_count integer;
  v_position integer := 0;
  v_assigned numeric(20,2) := 0;
  v_target numeric(20,2);
  v_delta numeric(20,2);
  v_event_id bigint;
  v_year integer;
  v_month integer;
  v_now timestamptz := pg_catalog.now();
  v_balance record;
  v_balance_count integer;
  v_balance_position integer;
  v_balance_assigned numeric(20,2);
  v_share numeric(20,2);
  v_new_book_value numeric(20,2);
  v_actual_delta numeric(20,2);
  v_origin_quantity numeric(20,3);
  v_origin_value numeric(20,2);
  v_residual numeric(20,2);
  v_reduction_remaining numeric(20,2);
  v_reduce numeric(20,2);
BEGIN
  FOR v_account IN
    SELECT account.*
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

  -- A WAC projection is not allowed to hide an existing subledger mismatch.
  FOR v_account IN
    SELECT account.*
    FROM public.inventory_valuation_accounts AS account
    WHERE account.tenant_id = p_tenant_id
      AND account.ingredient_id = p_ingredient_id
    ORDER BY account.branch_id, account.location_id, account.id
    FOR UPDATE
  LOOP
    SELECT
      coalesce(sum(balance.quantity), 0),
      coalesce(sum(balance.book_value), 0)
    INTO v_origin_quantity, v_origin_value
    FROM public.inventory_origin_balances AS balance
    WHERE balance.tenant_id = p_tenant_id
      AND balance.valuation_account_id = v_account.id
      AND balance.holder_kind = 'stock_pool';

    IF v_origin_quantity IS DISTINCT FROM v_account.quantity
       OR v_origin_value IS DISTINCT FROM v_account.book_value THEN
      RAISE EXCEPTION 'inventory_origin_account_reconciliation_required'
        USING ERRCODE = '23514',
              DETAIL = format(
                'account=%s account_qty=%s origin_qty=%s account_value=%s origin_value=%s',
                v_account.id,
                v_account.quantity,
                v_origin_quantity,
                v_account.book_value,
                v_origin_value
              );
    END IF;
  END LOOP;

  SELECT
    coalesce(sum(account.quantity) FILTER (
      WHERE account.quantity > 0
    ), 0),
    coalesce(sum(account.book_value) FILTER (
      WHERE account.quantity > 0
    ), 0)
  INTO v_total_qty, v_total_value
  FROM public.inventory_valuation_accounts AS account
  WHERE account.tenant_id = p_tenant_id
    AND account.ingredient_id = p_ingredient_id;

  IF v_total_qty > 0 AND v_total_value > 0 THEN
    v_wac := round(v_total_value / v_total_qty, 8);
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

  SELECT count(*)
  INTO v_account_count
  FROM public.inventory_valuation_accounts AS account
  WHERE account.tenant_id = p_tenant_id
    AND account.ingredient_id = p_ingredient_id
    AND account.quantity > 0;

  v_year := extract(
    YEAR FROM v_now AT TIME ZONE 'Asia/Ho_Chi_Minh'
  )::integer;
  v_month := extract(
    MONTH FROM v_now AT TIME ZONE 'Asia/Ho_Chi_Minh'
  )::integer;

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
      v_target := round(v_account.quantity * v_wac, 2);
    END IF;
    v_assigned := v_assigned + v_target;
    v_delta := v_target - v_account.book_value;
    IF v_delta = 0 THEN
      CONTINUE;
    END IF;

    v_event_id := NULL;
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
      md5(
        'company-wac-equalize:'
          || p_tenant_id::text || ':'
          || p_ingredient_id::text || ':'
          || v_account.id::text || ':'
          || v_account.valuation_version::text || ':'
          || v_delta::text
      )::uuid,
      jsonb_build_object(
        'company_wac', v_wac,
        'target_book_value', v_target
      )
    )
    ON CONFLICT (tenant_id, idempotency_key) DO NOTHING
    RETURNING id INTO v_event_id;

    IF v_event_id IS NULL THEN
      RAISE EXCEPTION 'company_wac_equalization_event_conflict'
        USING ERRCODE = '23505';
    END IF;

    UPDATE public.inventory_valuation_accounts
    SET book_value = v_target,
        valuation_version = valuation_version + 1,
        updated_at = v_now
    WHERE id = v_account.id
      AND tenant_id = p_tenant_id;

    SELECT count(*)
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
        v_share := round(
          v_delta * v_balance.quantity / v_account.quantity,
          2
        );
      END IF;
      v_balance_assigned := v_balance_assigned + v_share;
      v_new_book_value := greatest(0::numeric, v_balance.book_value + v_share);
      v_actual_delta := v_new_book_value - v_balance.book_value;

      UPDATE public.inventory_origin_balances
      SET book_value = v_new_book_value,
          updated_at = v_now
      WHERE id = v_balance.id;

      IF v_actual_delta <> 0 THEN
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
          v_event_id,
          v_balance.origin_id,
          CASE WHEN v_actual_delta < 0 THEN v_balance.id END,
          CASE WHEN v_actual_delta > 0 THEN v_balance.id END,
          'inventory',
          0,
          abs(v_actual_delta),
          0
        );
      END IF;
    END LOOP;

    SELECT coalesce(sum(balance.book_value), 0)
    INTO v_origin_value
    FROM public.inventory_origin_balances AS balance
    WHERE balance.tenant_id = p_tenant_id
      AND balance.valuation_account_id = v_account.id
      AND balance.holder_kind = 'stock_pool';

    v_residual := v_target - v_origin_value;
    IF v_residual > 0 THEN
      SELECT balance.*
      INTO v_balance
      FROM public.inventory_origin_balances AS balance
      WHERE balance.tenant_id = p_tenant_id
        AND balance.valuation_account_id = v_account.id
        AND balance.holder_kind = 'stock_pool'
        AND balance.quantity > 0
      ORDER BY balance.id DESC
      LIMIT 1
      FOR UPDATE;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'company_wac_residual_balance_missing'
          USING ERRCODE = '23514';
      END IF;

      UPDATE public.inventory_origin_balances
      SET book_value = book_value + v_residual,
          updated_at = v_now
      WHERE id = v_balance.id;

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
        v_balance.origin_id,
        v_balance.id,
        'inventory',
        0,
        v_residual,
        0
      );
    ELSIF v_residual < 0 THEN
      v_reduction_remaining := -v_residual;
      FOR v_balance IN
        SELECT balance.*
        FROM public.inventory_origin_balances AS balance
        WHERE balance.tenant_id = p_tenant_id
          AND balance.valuation_account_id = v_account.id
          AND balance.holder_kind = 'stock_pool'
          AND balance.book_value > 0
        ORDER BY balance.id DESC
        FOR UPDATE
      LOOP
        EXIT WHEN v_reduction_remaining = 0;
        v_reduce := least(v_balance.book_value, v_reduction_remaining);

        UPDATE public.inventory_origin_balances
        SET book_value = book_value - v_reduce,
            updated_at = v_now
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
          'inventory',
          0,
          v_reduce,
          0
        );

        v_reduction_remaining := v_reduction_remaining - v_reduce;
      END LOOP;

      IF v_reduction_remaining <> 0 THEN
        RAISE EXCEPTION 'company_wac_residual_unallocated'
          USING ERRCODE = '23514';
      END IF;
    END IF;

    SELECT
      coalesce(sum(balance.quantity), 0),
      coalesce(sum(balance.book_value), 0)
    INTO v_origin_quantity, v_origin_value
    FROM public.inventory_origin_balances AS balance
    WHERE balance.tenant_id = p_tenant_id
      AND balance.valuation_account_id = v_account.id
      AND balance.holder_kind = 'stock_pool';

    IF v_origin_quantity IS DISTINCT FROM v_account.quantity
       OR v_origin_value IS DISTINCT FROM v_target THEN
      RAISE EXCEPTION 'company_wac_origin_postcondition_failed'
        USING ERRCODE = '23514';
    END IF;
  END LOOP;

  RETURN v_wac;
END;
$$;

REVOKE ALL ON FUNCTION private.project_company_wac(bigint, bigint)
  FROM PUBLIC;

-- Repair existing value-only residuals without changing account, quantity,
-- physical stock, period inventory value, or terminal cost buckets.
LOCK TABLE
  public.inventory_valuation_accounts,
  public.inventory_origin_balances,
  public.inventory_valuation_events,
  public.inventory_value_allocations
IN SHARE ROW EXCLUSIVE MODE;

DO $$
DECLARE
  v_account record;
  v_balance record;
  v_event_id bigint;
  v_origin_quantity numeric(20,3);
  v_origin_value numeric(20,2);
  v_delta numeric(20,2);
  v_remaining numeric(20,2);
  v_adjustment numeric(20,2);
  v_now timestamptz := pg_catalog.now();
  v_year integer := extract(
    YEAR FROM pg_catalog.now() AT TIME ZONE 'Asia/Ho_Chi_Minh'
  )::integer;
  v_month integer := extract(
    MONTH FROM pg_catalog.now() AT TIME ZONE 'Asia/Ho_Chi_Minh'
  )::integer;
BEGIN
  FOR v_account IN
    SELECT account.*
    FROM public.inventory_valuation_accounts AS account
    JOIN public.inventory_valuation_cutovers AS cutover
      ON cutover.tenant_id = account.tenant_id
     AND cutover.status = 'active'
    ORDER BY account.tenant_id, account.id
    FOR UPDATE OF account
  LOOP
    SELECT
      coalesce(sum(balance.quantity), 0),
      coalesce(sum(balance.book_value), 0)
    INTO v_origin_quantity, v_origin_value
    FROM public.inventory_origin_balances AS balance
    WHERE balance.tenant_id = v_account.tenant_id
      AND balance.valuation_account_id = v_account.id
      AND balance.holder_kind = 'stock_pool';

    IF v_origin_quantity IS DISTINCT FROM v_account.quantity THEN
      RAISE EXCEPTION 'inventory_origin_quantity_reconciliation_required'
        USING ERRCODE = '23514',
              DETAIL = format('account=%s', v_account.id);
    END IF;

    v_delta := v_account.book_value - v_origin_value;
    IF v_delta = 0 THEN
      CONTINUE;
    END IF;

    INSERT INTO public.inventory_valuation_events (
      tenant_id,
      ingredient_id,
      event_type,
      terminal_bucket,
      quantity_delta,
      value_delta,
      effective_at,
      posting_year,
      posting_month,
      idempotency_key,
      metadata
    )
    VALUES (
      v_account.tenant_id,
      v_account.ingredient_id,
      'rounding',
      'rounding',
      0,
      0,
      v_now,
      v_year,
      v_month,
      md5(
        'company-wac-origin-residual:'
          || v_account.tenant_id::text || ':'
          || v_account.id::text || ':'
          || v_account.book_value::text || ':'
          || v_origin_value::text
      )::uuid,
      jsonb_build_object(
        'repair', 'company_wac_origin_residual',
        'account_id', v_account.id,
        'account_book_value', v_account.book_value,
        'origin_value_before_repair', v_origin_value,
        'origin_value_delta', v_delta
      )
    )
    RETURNING id INTO v_event_id;

    IF v_delta > 0 THEN
      SELECT balance.*
      INTO v_balance
      FROM public.inventory_origin_balances AS balance
      WHERE balance.tenant_id = v_account.tenant_id
        AND balance.valuation_account_id = v_account.id
        AND balance.holder_kind = 'stock_pool'
        AND balance.quantity > 0
      ORDER BY balance.id DESC
      LIMIT 1
      FOR UPDATE;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'inventory_origin_value_balance_missing'
          USING ERRCODE = '23514';
      END IF;

      UPDATE public.inventory_origin_balances
      SET book_value = book_value + v_delta,
          updated_at = v_now
      WHERE id = v_balance.id;

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
        v_account.tenant_id,
        v_event_id,
        v_balance.origin_id,
        v_balance.id,
        'rounding',
        0,
        v_delta,
        0
      );
    ELSE
      v_remaining := -v_delta;
      FOR v_balance IN
        SELECT balance.*
        FROM public.inventory_origin_balances AS balance
        WHERE balance.tenant_id = v_account.tenant_id
          AND balance.valuation_account_id = v_account.id
          AND balance.holder_kind = 'stock_pool'
          AND balance.book_value > 0
        ORDER BY balance.id DESC
        FOR UPDATE
      LOOP
        EXIT WHEN v_remaining = 0;
        v_adjustment := least(v_balance.book_value, v_remaining);

        UPDATE public.inventory_origin_balances
        SET book_value = book_value - v_adjustment,
            updated_at = v_now
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
          v_account.tenant_id,
          v_event_id,
          v_balance.origin_id,
          v_balance.id,
          'rounding',
          0,
          v_adjustment,
          0
        );

        v_remaining := v_remaining - v_adjustment;
      END LOOP;

      IF v_remaining <> 0 THEN
        RAISE EXCEPTION 'inventory_origin_value_residual_unallocated'
          USING ERRCODE = '23514';
      END IF;
    END IF;
  END LOOP;

  IF EXISTS (
    SELECT 1
    FROM public.inventory_valuation_accounts AS account
    JOIN public.inventory_valuation_cutovers AS cutover
      ON cutover.tenant_id = account.tenant_id
     AND cutover.status = 'active'
    LEFT JOIN public.inventory_origin_balances AS balance
      ON balance.tenant_id = account.tenant_id
     AND balance.valuation_account_id = account.id
     AND balance.holder_kind = 'stock_pool'
    GROUP BY account.id, account.quantity, account.book_value
    HAVING account.quantity IS DISTINCT FROM coalesce(sum(balance.quantity), 0)
      OR account.book_value IS DISTINCT FROM coalesce(sum(balance.book_value), 0)
  ) THEN
    RAISE EXCEPTION 'inventory_origin_reconciliation_postcondition_failed'
      USING ERRCODE = '23514';
  END IF;
END;
$$;

COMMIT;
