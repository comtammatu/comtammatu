\set ON_ERROR_STOP on

BEGIN;

\ir fixtures/effective_stock_threshold_cases.sql

DO $$
DECLARE
  v_case jsonb;
  v_actual jsonb;
  v_error text;
  v_count integer := 0;
  v_special numeric;
  v_arguments numeric[];
  v_index integer;
  v_role text;
  v_denied boolean;
  v_signature regprocedure :=
    'private.resolve_effective_stock_thresholds(numeric,numeric,numeric,numeric,numeric,numeric)'::regprocedure;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_proc AS proc
    WHERE proc.oid = v_signature
      AND NOT proc.prosecdef
      AND NOT proc.proisstrict
      AND proc.provolatile = 'i'
      AND proc.proparallel = 's'
      AND proc.proconfig @> ARRAY['search_path=""']
  ) THEN
    RAISE EXCEPTION 'THRESHOLDS: resolver must be immutable, invoker, null-aware, parallel safe, with an empty search path';
  END IF;

  FOR v_case IN SELECT case_data FROM effective_stock_threshold_cases LOOP
    v_actual := NULL;
    v_error := NULL;
    BEGIN
      SELECT pg_catalog.jsonb_build_object(
        'minStockLevel', threshold.min_stock_level,
        'targetStockLevel', threshold.target_stock_level,
        'capacityLimit', threshold.capacity_limit
      ) INTO STRICT v_actual
      FROM private.resolve_effective_stock_thresholds(
        (v_case #>> '{ingredient,minStockLevel}')::numeric,
        (v_case #>> '{ingredient,targetStockLevel}')::numeric,
        (v_case #>> '{ingredient,capacityLimit}')::numeric,
        (v_case #>> '{location,minStockLevel}')::numeric,
        (v_case #>> '{location,targetStockLevel}')::numeric,
        (v_case #>> '{location,capacityLimit}')::numeric
      ) AS threshold;
    EXCEPTION WHEN SQLSTATE '22023' THEN
      v_error := SQLERRM;
    END;

    IF v_case ? 'error' THEN
      IF v_error IS DISTINCT FROM v_case ->> 'error' THEN
        RAISE EXCEPTION 'THRESHOLDS: % expected error %, got %',
          v_case ->> 'name', v_case ->> 'error', v_error;
      END IF;
    ELSIF v_error IS NOT NULL OR v_actual IS DISTINCT FROM v_case -> 'expected' THEN
      RAISE EXCEPTION 'THRESHOLDS: % expected %, got % (error %)',
        v_case ->> 'name', v_case -> 'expected', v_actual, v_error;
    END IF;
    v_count := v_count + 1;
  END LOOP;
  IF v_count = 0 THEN
    RAISE EXCEPTION 'THRESHOLDS: shared corpus must not be empty';
  END IF;

  -- JSON cannot represent nonfinite numerics; exercise each native SQL input.
  FOREACH v_special IN ARRAY ARRAY['NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric] LOOP
    FOR v_index IN 1..6 LOOP
      v_arguments := ARRAY[0, 0, 0, 0, 0, 0]::numeric[];
      v_arguments[v_index] := v_special;
      v_error := NULL;
      BEGIN
        PERFORM * FROM private.resolve_effective_stock_thresholds(
          v_arguments[1], v_arguments[2], v_arguments[3],
          v_arguments[4], v_arguments[5], v_arguments[6]
        );
      EXCEPTION WHEN SQLSTATE '22023' THEN
        v_error := SQLERRM;
      END;
      IF v_error IS DISTINCT FROM 'stock_threshold_quantity_invalid' THEN
        RAISE EXCEPTION 'THRESHOLDS: nonfinite input % in position % was accepted', v_special, v_index;
      END IF;
    END LOOP;
  END LOOP;

  IF NOT EXISTS (
    SELECT 1 FROM private.resolve_effective_stock_thresholds(
      0.1000, 0.2000, 0.3000, NULL, NULL, NULL
    ) AS threshold
    WHERE threshold.min_stock_level = 0.1
      AND threshold.target_stock_level = 0.2
      AND threshold.capacity_limit = 0.3
  ) THEN
    RAISE EXCEPTION 'THRESHOLDS: insignificant trailing zeroes must be accepted';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc AS proc
    CROSS JOIN LATERAL pg_catalog.aclexplode(
      COALESCE(proc.proacl, pg_catalog.acldefault('f', proc.proowner))
    ) AS privilege
    WHERE proc.oid = v_signature AND privilege.grantee = 0
  ) THEN
    RAISE EXCEPTION 'THRESHOLDS: PUBLIC must not have function privileges';
  END IF;

  FOREACH v_role IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
    IF pg_catalog.has_function_privilege(v_role, v_signature, 'EXECUTE') THEN
      RAISE EXCEPTION 'THRESHOLDS: % must not have direct EXECUTE', v_role;
    END IF;
    EXECUTE pg_catalog.format('SET LOCAL ROLE %I', v_role);
    v_denied := FALSE;
    BEGIN
      PERFORM * FROM private.resolve_effective_stock_thresholds(
        NULL, NULL, NULL, NULL, NULL, NULL
      );
    EXCEPTION WHEN insufficient_privilege THEN
      v_denied := TRUE;
    END;
    RESET ROLE;
    IF NOT v_denied THEN
      RAISE EXCEPTION 'THRESHOLDS: direct call by % was not denied', v_role;
    END IF;
  END LOOP;

  RAISE NOTICE 'THRESHOLDS: % shared cases, 18 nonfinite inputs, trailing zeroes and direct-execution denial passed', v_count;
END;
$$;

ROLLBACK;
