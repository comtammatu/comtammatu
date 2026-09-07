-- Absorb leftover origin quantity/value after proportional lot shares.
-- A zero-value last lot cannot take a 1-dong rounding residual, which blocked
-- production_consumption (and transfer_in) with inventory_origin_allocation_incomplete.

BEGIN;

CREATE OR REPLACE FUNCTION private.absorb_origin_allocation_residual(
  p_tenant_id bigint,
  p_movement_id bigint,
  p_movement_type text,
  p_ingredient_id bigint,
  p_account_id bigint,
  p_event_id bigint,
  p_holder_id bigint,
  p_terminal_bucket text,
  p_remaining_quantity numeric,
  p_remaining_value numeric
) RETURNS TABLE(remaining_quantity numeric, remaining_value numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $absorb$
DECLARE
  v_balance record;
  v_alloc_quantity numeric(20,3);
  v_alloc_value numeric(20,2);
  v_to_balance_id bigint;
  v_bucket text;
BEGIN
  remaining_quantity := coalesce(p_remaining_quantity, 0);
  remaining_value := coalesce(p_remaining_value, 0);
  IF remaining_quantity = 0 AND remaining_value = 0 THEN
    RETURN NEXT;
    RETURN;
  END IF;
  IF p_event_id IS NULL
     OR p_tenant_id IS NULL
     OR p_movement_id IS NULL
     OR p_movement_type IS NULL THEN
    RETURN NEXT;
    RETURN;
  END IF;

  v_bucket := CASE p_movement_type
    WHEN 'transfer_in' THEN 'inventory'
    WHEN 'transfer_out' THEN 'transfer_holder'
    WHEN 'production_consumption' THEN 'production_inventory'
    ELSE coalesce(p_terminal_bucket, 'food_cost')
  END;

  FOR v_balance IN
    SELECT
      balance.id,
      balance.origin_id,
      balance.quantity,
      balance.book_value
    FROM public.inventory_origin_balances AS balance
    LEFT JOIN public.inventory_cost_origins AS origin
      ON origin.id = balance.origin_id
     AND origin.tenant_id = balance.tenant_id
    WHERE balance.tenant_id = p_tenant_id
      AND (balance.quantity > 0 OR balance.book_value > 0)
      AND (
        (
          p_movement_type = 'transfer_in'
          AND balance.holder_kind = 'transfer_item'
          AND balance.holder_id = p_holder_id
          AND origin.ingredient_id = p_ingredient_id
        )
        OR (
          p_movement_type IS DISTINCT FROM 'transfer_in'
          AND balance.holder_kind = 'stock_pool'
          AND balance.valuation_account_id = p_account_id
        )
      )
    ORDER BY (balance.book_value > 0) DESC, (balance.quantity > 0) DESC, balance.id
    FOR UPDATE OF balance
  LOOP
    EXIT WHEN remaining_quantity = 0 AND remaining_value = 0;

    v_alloc_quantity := greatest(
      0::numeric,
      least(remaining_quantity, v_balance.quantity)
    );
    v_alloc_value := greatest(
      0::numeric,
      least(remaining_value, v_balance.book_value)
    );
    IF v_alloc_quantity = 0 AND v_alloc_value = 0 THEN
      CONTINUE;
    END IF;

    UPDATE public.inventory_origin_balances
    SET quantity = greatest(0::numeric, quantity - v_alloc_quantity),
        book_value = greatest(0::numeric, book_value - v_alloc_value),
        updated_at = pg_catalog.now()
    WHERE id = v_balance.id;

    IF p_movement_type = 'transfer_in' THEN
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
        v_balance.origin_id,
        'stock_pool',
        p_account_id,
        v_alloc_quantity,
        v_alloc_value
      )
      ON CONFLICT (
        tenant_id,
        origin_id,
        valuation_account_id
      ) WHERE holder_kind = 'stock_pool'
      DO UPDATE SET
        quantity = public.inventory_origin_balances.quantity
          + EXCLUDED.quantity,
        book_value = public.inventory_origin_balances.book_value
          + EXCLUDED.book_value,
        updated_at = pg_catalog.now()
      RETURNING id INTO v_to_balance_id;
    ELSIF p_movement_type IN ('transfer_out', 'production_consumption') THEN
      INSERT INTO public.inventory_origin_balances (
        tenant_id,
        origin_id,
        holder_kind,
        holder_id,
        quantity,
        book_value
      )
      VALUES (
        p_tenant_id,
        v_balance.origin_id,
        CASE
          WHEN p_movement_type = 'transfer_out' THEN 'transfer_item'
          ELSE 'production_run'
        END,
        p_holder_id,
        v_alloc_quantity,
        v_alloc_value
      )
      ON CONFLICT (
        tenant_id,
        origin_id,
        holder_kind,
        holder_id
      ) WHERE holder_kind IN ('transfer_item', 'production_run')
      DO UPDATE SET
        quantity = public.inventory_origin_balances.quantity
          + EXCLUDED.quantity,
        book_value = public.inventory_origin_balances.book_value
          + EXCLUDED.book_value,
        updated_at = pg_catalog.now()
      RETURNING id INTO v_to_balance_id;
    ELSE
      v_to_balance_id := NULL;
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
      p_event_id,
      v_balance.origin_id,
      v_to_balance_id,
      v_bucket,
      v_alloc_quantity,
      v_alloc_value,
      CASE
        WHEN v_balance.quantity > 0 THEN v_alloc_quantity / v_balance.quantity
        ELSE 1
      END
    );

    remaining_quantity := remaining_quantity - v_alloc_quantity;
    remaining_value := remaining_value - v_alloc_value;
  END LOOP;

  RETURN NEXT;
END;
$absorb$;

REVOKE ALL ON FUNCTION private.absorb_origin_allocation_residual(
  bigint, bigint, text, bigint, bigint, bigint, bigint, text, numeric, numeric
) FROM PUBLIC, anon, authenticated, service_role;

DO $patch$
DECLARE
  v_definition text := pg_get_functiondef(
    'private.post_stock_movement_valuation()'::regprocedure
  );
  v_anchor text := $anchor$    IF v_remaining_quantity <> 0 OR v_remaining_value <> 0 THEN
      RAISE EXCEPTION 'inventory_origin_allocation_incomplete'$anchor$;
  v_inject text := $inject$    SELECT residual.remaining_quantity, residual.remaining_value
    INTO v_remaining_quantity, v_remaining_value
    FROM private.absorb_origin_allocation_residual(
      NEW.tenant_id,
      NEW.id,
      NEW.type,
      NEW.ingredient_id,
      v_account.id,
      v_event_id,
      v_holder_id,
      v_terminal_bucket,
      v_remaining_quantity,
      v_remaining_value
    ) AS residual;

    IF v_remaining_quantity <> 0 OR v_remaining_value <> 0 THEN
      RAISE EXCEPTION 'inventory_origin_allocation_incomplete'$inject$;
BEGIN
  IF (length(v_definition) - length(replace(v_definition, v_anchor, '')))
      / length(v_anchor) <> 2 THEN
    RAISE EXCEPTION 'origin_allocation_residual_anchor_changed';
  END IF;
  EXECUTE replace(v_definition, v_anchor, v_inject);
END;
$patch$;

COMMIT;
