-- Migration: inventory_origin_value_only_allocation

BEGIN;

-- A value-only origin is valid after quantity/value rounding or company-WAC
-- restatement. It must follow the same lineage as quantity-bearing value so a
-- full issue cannot debit the account while leaving origin value behind.
DO $patch_inventory_origin_allocation$
DECLARE
  v_def text;
  v_updated text;
  v_match_count integer;
BEGIN
  SELECT pg_get_functiondef(
    'private.post_stock_movement_valuation()'::pg_catalog.regprocedure
  )
  INTO v_def;

  IF v_def IS NULL THEN
    RAISE EXCEPTION 'post_stock_movement_valuation missing';
  END IF;

  v_def := pg_catalog.replace(v_def, chr(13) || chr(10), chr(10));
  v_def := pg_catalog.regexp_replace(
    v_def,
    '^CREATE (OR REPLACE )?FUNCTION',
    'CREATE OR REPLACE FUNCTION'
  );

  SELECT pg_catalog.count(*)
  INTO v_match_count
  FROM pg_catalog.regexp_matches(
    v_def,
    'AND balance\.quantity > 0',
    'g'
  );

  IF v_match_count <> 7 THEN
    RAISE EXCEPTION
      'post_stock_movement_valuation value-only predicate count changed: %',
      v_match_count;
  END IF;

  v_def := pg_catalog.replace(
    v_def,
    'AND balance.quantity > 0',
    'AND (balance.quantity > 0 OR balance.book_value > 0)'
  );

  v_updated := pg_catalog.replace(
    v_def,
    $old$        AND (balance.quantity > 0 OR balance.book_value > 0)
      ORDER BY balance.origin_id
      FOR UPDATE OF balance
    LOOP$old$,
    $new$        AND (balance.quantity > 0 OR balance.book_value > 0)
      ORDER BY (balance.quantity > 0), balance.origin_id
      FOR UPDATE OF balance
    LOOP$new$
  );
  IF v_updated = v_def THEN
    RAISE EXCEPTION
      'post_stock_movement_valuation transfer receive order pattern missing';
  END IF;
  v_def := v_updated;

  v_updated := pg_catalog.replace(
    v_def,
    $old$        AND balance.holder_kind = 'stock_pool'
        AND (balance.quantity > 0 OR balance.book_value > 0)
      ORDER BY balance.id
      FOR UPDATE
    LOOP$old$,
    $new$        AND balance.holder_kind = 'stock_pool'
        AND (balance.quantity > 0 OR balance.book_value > 0)
      ORDER BY (balance.quantity > 0), balance.id
      FOR UPDATE
    LOOP$new$
  );
  IF v_updated = v_def THEN
    RAISE EXCEPTION
      'post_stock_movement_valuation stock pool order pattern missing';
  END IF;
  v_def := v_updated;

  v_updated := pg_catalog.regexp_replace(
    v_def,
    $pattern$      v_remaining_quantity := v_remaining_quantity - v_alloc_quantity;
      v_remaining_value := v_remaining_value - v_alloc_value;
    END LOOP;

    UPDATE public\.inventory_valuation_accounts
    SET quantity = quantity \+ v_quantity,$pattern$,
    $replacement$      v_remaining_quantity := v_remaining_quantity - v_alloc_quantity;
      v_remaining_value := v_remaining_value - v_alloc_value;
    END LOOP;

    IF v_remaining_quantity <> 0 OR v_remaining_value <> 0 THEN
      RAISE EXCEPTION 'inventory_origin_allocation_incomplete'
        USING ERRCODE = '23514',
          DETAIL = pg_catalog.jsonb_build_object(
            'movement_id', NEW.id,
            'movement_type', NEW.type,
            'remaining_quantity', v_remaining_quantity,
            'remaining_value', v_remaining_value
          )::text;
    END IF;

    UPDATE public.inventory_valuation_accounts
    SET quantity = quantity + v_quantity,$replacement$
  );
  IF v_updated = v_def THEN
    RAISE EXCEPTION
      'post_stock_movement_valuation transfer receive guard pattern missing';
  END IF;
  v_def := v_updated;

  v_updated := pg_catalog.replace(
    v_def,
    $old$      v_remaining_quantity := v_remaining_quantity - v_alloc_quantity;
      v_remaining_value := v_remaining_value - v_alloc_value;
    END LOOP;

    UPDATE public.inventory_valuation_accounts
    SET quantity = greatest(0::numeric, quantity - v_quantity),$old$,
    $new$      v_remaining_quantity := v_remaining_quantity - v_alloc_quantity;
      v_remaining_value := v_remaining_value - v_alloc_value;
    END LOOP;

    IF v_remaining_quantity <> 0 OR v_remaining_value <> 0 THEN
      RAISE EXCEPTION 'inventory_origin_allocation_incomplete'
        USING ERRCODE = '23514',
          DETAIL = pg_catalog.jsonb_build_object(
            'movement_id', NEW.id,
            'movement_type', NEW.type,
            'remaining_quantity', v_remaining_quantity,
            'remaining_value', v_remaining_value
          )::text;
    END IF;

    UPDATE public.inventory_valuation_accounts
    SET quantity = greatest(0::numeric, quantity - v_quantity),$new$
  );
  IF v_updated = v_def THEN
    RAISE EXCEPTION
      'post_stock_movement_valuation issue guard pattern missing';
  END IF;

  EXECUTE v_updated;

  SELECT pg_catalog.count(*)
  INTO v_match_count
  FROM pg_catalog.regexp_matches(
    pg_get_functiondef(
      'private.post_stock_movement_valuation()'::pg_catalog.regprocedure
    ),
    'balance\.quantity > 0 OR balance\.book_value > 0',
    'g'
  );

  IF v_match_count <> 7
     OR pg_get_functiondef(
       'private.post_stock_movement_valuation()'::pg_catalog.regprocedure
     ) !~ 'ORDER BY \(balance\.quantity > 0\), balance\.origin_id'
     OR pg_get_functiondef(
       'private.post_stock_movement_valuation()'::pg_catalog.regprocedure
     ) !~ 'ORDER BY \(balance\.quantity > 0\), balance\.id'
     OR pg_get_functiondef(
       'private.post_stock_movement_valuation()'::pg_catalog.regprocedure
     ) !~ 'inventory_origin_allocation_incomplete' THEN
    RAISE EXCEPTION
      'post_stock_movement_valuation value-only allocation verification failed';
  END IF;
END
$patch_inventory_origin_allocation$;

COMMENT ON FUNCTION private.post_stock_movement_valuation() IS
  'ADR 0026, ADR 0040 & ADR 0044: Resilient valuation posting. Value-only origins remain in transfer and production lineage until their book value is fully allocated.';

COMMIT;
