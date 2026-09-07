-- Price unpriced positive count/adjustment surplus at company WAC.
-- Historical stocktake_found lots posted at 0 VND become last-lot rounding
-- blockers; new surplus must fail closed when no WAC exists.

BEGIN;

CREATE OR REPLACE FUNCTION private.price_stocktake_gain_movement() RETURNS trigger
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_unit_cost numeric(24,8);
BEGIN
  IF NEW.type IN ('count_adjustment', 'adjustment')
     AND NEW.quantity_change > 0
     AND coalesce(NEW.unit_cost, 0) <= 0 THEN
    v_unit_cost := private.ingredient_provisional_unit_cost(
      NEW.tenant_id,
      NEW.ingredient_id
    );

    IF v_unit_cost IS NULL OR v_unit_cost <= 0 THEN
      RAISE EXCEPTION 'stocktake_gain_unit_cost_missing'
        USING ERRCODE = '23514';
    END IF;

    NEW.unit_cost := v_unit_cost;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.price_stocktake_gain_movement()
  FROM PUBLIC, anon, authenticated, service_role;

DO $repair$
DECLARE
  v_row record;
  v_unit numeric(24,8);
  v_value numeric(20,2);
  v_ingredient record;
BEGIN
  CREATE TEMP TABLE repaired_stocktake_surplus (
    tenant_id bigint NOT NULL,
    ingredient_id bigint NOT NULL,
    PRIMARY KEY (tenant_id, ingredient_id)
  ) ON COMMIT DROP;

  FOR v_row IN
    SELECT
      balance.id AS balance_id,
      balance.tenant_id,
      balance.quantity,
      balance.valuation_account_id,
      origin.id AS origin_id,
      origin.ingredient_id,
      account.branch_id,
      account.location_id
    FROM public.inventory_origin_balances AS balance
    JOIN public.inventory_cost_origins AS origin
      ON origin.id = balance.origin_id
     AND origin.tenant_id = balance.tenant_id
    JOIN public.inventory_valuation_accounts AS account
      ON account.id = balance.valuation_account_id
     AND account.tenant_id = balance.tenant_id
    WHERE balance.holder_kind = 'stock_pool'
      AND balance.quantity > 0
      AND balance.book_value = 0
      AND origin.source_kind = 'stocktake_found'
    ORDER BY balance.tenant_id, origin.ingredient_id, balance.id
    FOR UPDATE OF balance
  LOOP
    PERFORM private.lock_inventory_valuation_pool(
      v_row.tenant_id,
      v_row.branch_id,
      v_row.location_id,
      v_row.ingredient_id
    );

    v_unit := private.ingredient_provisional_unit_cost(
      v_row.tenant_id,
      v_row.ingredient_id
    );
    IF v_unit IS NULL OR v_unit <= 0 THEN
      CONTINUE;
    END IF;

    v_value := pg_catalog.round(v_row.quantity * v_unit, 2);
    IF v_value <= 0 THEN
      CONTINUE;
    END IF;

    UPDATE public.inventory_origin_balances
    SET book_value = v_value,
        updated_at = pg_catalog.now()
    WHERE id = v_row.balance_id;

    UPDATE public.inventory_cost_origins
    SET provisional_value = GREATEST(provisional_value, v_value),
        cost_status = CASE
          WHEN cost_status = 'pending' THEN 'provisional'
          ELSE cost_status
        END
    WHERE id = v_row.origin_id;

    UPDATE public.inventory_valuation_accounts
    SET book_value = book_value + v_value,
        valuation_version = valuation_version + 1,
        updated_at = pg_catalog.now()
    WHERE id = v_row.valuation_account_id;

    INSERT INTO repaired_stocktake_surplus (tenant_id, ingredient_id)
    VALUES (v_row.tenant_id, v_row.ingredient_id)
    ON CONFLICT DO NOTHING;
  END LOOP;

  FOR v_ingredient IN
    SELECT tenant_id, ingredient_id
    FROM repaired_stocktake_surplus
    ORDER BY tenant_id, ingredient_id
  LOOP
    PERFORM private.project_company_wac(
      v_ingredient.tenant_id,
      v_ingredient.ingredient_id
    );
  END LOOP;
END;
$repair$;

COMMIT;
