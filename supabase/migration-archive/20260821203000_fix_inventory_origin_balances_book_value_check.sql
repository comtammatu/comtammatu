-- Fix: Clamp inventory origin balance allocations to non-negative available balances.
-- Prevents 23514 (inventory_origin_balances_book_value_check) on complete_production_run
-- and transfer operations when zero-cost or fractional rounding variances occur.

DO $fix_origin_balance_book_value$
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

  -- 1. Patch issue / production_consumption origin balance allocation
  v_updated := regexp_replace(
    v_def,
    'IF v_position = v_balance_count THEN\s+v_alloc_quantity := v_remaining_quantity;\s+v_alloc_value := v_remaining_value;\s+ELSE\s+v_alloc_quantity := (?:pg_catalog\.)?least\(\s*v_remaining_quantity,\s*(?:pg_catalog\.)?round\(v_balance\.quantity \* v_fraction, 3\)\s*\);\s+v_alloc_value := (?:pg_catalog\.)?least\(\s*v_remaining_value,\s*(?:pg_catalog\.)?round\(v_balance\.book_value \* v_fraction, 2\)\s*\);\s+END IF;\s+UPDATE public\.inventory_origin_balances\s+SET quantity = quantity - v_alloc_quantity,\s+book_value = book_value - v_alloc_value,\s+updated_at = pg_catalog\.now\(\)\s+WHERE id = v_balance\.id;',
    $new$IF v_position = v_balance_count THEN
        v_alloc_quantity := greatest(0::numeric, least(v_remaining_quantity, v_balance.quantity));
        v_alloc_value := greatest(0::numeric, least(v_remaining_value, v_balance.book_value));
      ELSE
        v_alloc_quantity := greatest(
          0::numeric,
          least(
            v_remaining_quantity,
            least(
              v_balance.quantity,
              pg_catalog.round(v_balance.quantity * v_fraction, 3)
            )
          )
        );
        v_alloc_value := greatest(
          0::numeric,
          least(
            v_remaining_value,
            least(
              v_balance.book_value,
              pg_catalog.round(v_balance.book_value * v_fraction, 2)
            )
          )
        );
      END IF;

      UPDATE public.inventory_origin_balances
      SET quantity = greatest(0::numeric, quantity - v_alloc_quantity),
          book_value = greatest(0::numeric, book_value - v_alloc_value),
          updated_at = pg_catalog.now()
      WHERE id = v_balance.id;$new$
  );
  IF v_updated = v_def THEN
    RAISE EXCEPTION 'post_stock_movement_valuation issue origin allocation pattern missing';
  END IF;
  v_def := v_updated;

  -- 2. Patch transfer_in origin balance allocation
  v_updated := regexp_replace(
    v_def,
    'IF v_position = v_balance_count THEN\s+v_alloc_quantity := v_remaining_quantity;\s+v_alloc_value := v_remaining_value;\s+ELSE\s+v_alloc_quantity := (?:pg_catalog\.)?least\(\s*v_remaining_quantity,\s*(?:pg_catalog\.)?round\(v_balance\.quantity \* v_fraction, 3\)\s*\);\s+v_alloc_value := (?:pg_catalog\.)?least\(\s*v_remaining_value,\s*(?:pg_catalog\.)?round\(v_balance\.book_value \* v_fraction, 2\)\s*\);\s+END IF;\s+UPDATE public\.inventory_origin_balances\s+SET quantity = quantity - v_alloc_quantity,\s+book_value = book_value - v_alloc_value,\s+updated_at = pg_catalog\.now\(\)\s+WHERE id = v_balance\.id;',
    $new$IF v_position = v_balance_count THEN
        v_alloc_quantity := greatest(0::numeric, least(v_remaining_quantity, v_balance.quantity));
        v_alloc_value := greatest(0::numeric, least(v_remaining_value, v_balance.book_value));
      ELSE
        v_alloc_quantity := greatest(
          0::numeric,
          least(
            v_remaining_quantity,
            least(
              v_balance.quantity,
              pg_catalog.round(v_balance.quantity * v_fraction, 3)
            )
          )
        );
        v_alloc_value := greatest(
          0::numeric,
          least(
            v_remaining_value,
            least(
              v_balance.book_value,
              pg_catalog.round(v_balance.book_value * v_fraction, 2)
            )
          )
        );
      END IF;

      UPDATE public.inventory_origin_balances
      SET quantity = greatest(0::numeric, quantity - v_alloc_quantity),
          book_value = greatest(0::numeric, book_value - v_alloc_value),
          updated_at = pg_catalog.now()
      WHERE id = v_balance.id;$new$
  );
  v_def := v_updated;

  -- 3. Patch drift check to absorb sub-cent rounding and pool value ceiling safely
  v_updated := regexp_replace(
    v_def,
    'IF v_remaining_quantity <> 0 OR v_remaining_value <> 0 THEN\s+RAISE EXCEPTION ''inventory_valuation_allocation_drift''\s+USING ERRCODE = ''23514'';\s+END IF;',
    $new$IF v_remaining_value <> 0 AND v_position = v_balance_count THEN
      v_value := v_value - v_remaining_value;
      v_remaining_value := 0;
    END IF;

    IF v_remaining_quantity <> 0 THEN
      IF pg_catalog.abs(v_remaining_quantity) <= 0.005 THEN
        v_quantity := v_quantity - v_remaining_quantity;
        v_remaining_quantity := 0;
      ELSE
        RAISE EXCEPTION 'inventory_valuation_allocation_drift'
          USING ERRCODE = '23514';
      END IF;
    END IF;

    IF v_remaining_value <> 0 THEN
      RAISE EXCEPTION 'inventory_valuation_allocation_drift'
        USING ERRCODE = '23514';
    END IF;$new$
  );
  IF v_updated = v_def THEN
    RAISE EXCEPTION 'post_stock_movement_valuation drift check pattern missing';
  END IF;

  EXECUTE v_updated;

  IF pg_get_functiondef(
    'private.post_stock_movement_valuation()'::regprocedure
  ) !~ 'greatest\(0::numeric, least\(v_remaining_value, v_balance\.book_value\)\)' THEN
    RAISE EXCEPTION 'post_stock_movement_valuation patch verification failed';
  END IF;
END
$fix_origin_balance_book_value$;
