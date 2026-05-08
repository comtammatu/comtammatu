-- =========================================================================
-- update_ingredient_thresholds_bulk: atomic bulk write for the
-- /inventory/settings/thresholds page (Sprint 2 Fix C / PP3-A).
--
-- Per CLAUDE.md "multi-item atomic writes → Postgres RPC", N×UPDATE
-- from the client violates atomicity (RLS rejects + partial-failure
-- silently). This RPC accepts a JSONB array, validates each row,
-- updates `ingredients` in a single transaction under invoker RLS
-- (super_manager-only by existing policy), and writes one bulk
-- audit_log row capturing the full delta.
--
-- Validation rules (mirrored in Zod schema client-side):
--   - id required, references ingredients.id within caller's tenant
--   - min/max/reorder ≥ 0 when present
--   - min ≤ reorder ≤ max  (skip side if NULL)
--
-- Hard rule check (CLAUDE.md):
--   - SECURITY INVOKER so RLS gates writes
--   - Forces tenant_id via existing RLS scoping; the RPC only sees
--     `claims.tenant_id` rows
--   - GRANT EXECUTE TO authenticated, REVOKE from anon
-- =========================================================================

CREATE OR REPLACE FUNCTION public.update_ingredient_thresholds_bulk(
  p_payload JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tenant_id      BIGINT := public.auth_tenant_id();
  v_user_id        UUID   := auth.uid();
  v_count          INTEGER := 0;
  v_request_count  INTEGER := 0;
  v_delta          JSONB := '[]'::jsonb;
  v_row            RECORD;
  v_payload_item   JSONB;
  v_id             BIGINT;
  v_min            NUMERIC(15,3);
  v_max            NUMERIC(15,3);
  v_reorder        NUMERIC(15,3);
  v_before         JSONB;
  v_after          JSONB;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'thresholds.bulk: anonymous caller'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'thresholds.bulk: missing tenant_id claim'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF jsonb_typeof(p_payload) <> 'array' THEN
    RAISE EXCEPTION 'thresholds.bulk: payload must be array'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  v_request_count := jsonb_array_length(p_payload);
  IF v_request_count = 0 THEN
    RETURN jsonb_build_object('updated', 0);
  END IF;
  IF v_request_count > 500 THEN
    RAISE EXCEPTION 'thresholds.bulk: max 500 items per call (got %)',
      v_request_count
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- Validate + update each row, accumulating delta. Whole transaction
  -- rolls back on any RAISE.
  FOR v_payload_item IN
    SELECT * FROM jsonb_array_elements(p_payload)
  LOOP
    v_id := (v_payload_item->>'id')::BIGINT;
    IF v_id IS NULL OR v_id <= 0 THEN
      RAISE EXCEPTION 'thresholds.bulk: invalid id %', v_id
        USING ERRCODE = 'invalid_parameter_value';
    END IF;

    v_min := NULLIF(v_payload_item->>'min_stock_level', '')::NUMERIC(15,3);
    v_max := NULLIF(v_payload_item->>'max_stock_level', '')::NUMERIC(15,3);
    v_reorder := NULLIF(v_payload_item->>'reorder_point', '')::NUMERIC(15,3);

    IF v_min IS NOT NULL AND v_min < 0 THEN
      RAISE EXCEPTION 'thresholds.bulk: min < 0 for id %', v_id
        USING ERRCODE = 'invalid_parameter_value';
    END IF;
    IF v_max IS NOT NULL AND v_max < 0 THEN
      RAISE EXCEPTION 'thresholds.bulk: max < 0 for id %', v_id
        USING ERRCODE = 'invalid_parameter_value';
    END IF;
    IF v_reorder IS NOT NULL AND v_reorder < 0 THEN
      RAISE EXCEPTION 'thresholds.bulk: reorder < 0 for id %', v_id
        USING ERRCODE = 'invalid_parameter_value';
    END IF;
    IF v_min IS NOT NULL AND v_reorder IS NOT NULL AND v_min > v_reorder THEN
      RAISE EXCEPTION 'thresholds.bulk: min > reorder for id %', v_id
        USING ERRCODE = 'invalid_parameter_value';
    END IF;
    IF v_reorder IS NOT NULL AND v_max IS NOT NULL AND v_reorder > v_max THEN
      RAISE EXCEPTION 'thresholds.bulk: reorder > max for id %', v_id
        USING ERRCODE = 'invalid_parameter_value';
    END IF;
    IF v_min IS NOT NULL AND v_max IS NOT NULL AND v_min > v_max THEN
      RAISE EXCEPTION 'thresholds.bulk: min > max for id %', v_id
        USING ERRCODE = 'invalid_parameter_value';
    END IF;

    -- Capture before-state. RLS limits the query to caller's tenant.
    SELECT id, min_stock_level, max_stock_level, reorder_point
      INTO v_row
      FROM public.ingredients
     WHERE id = v_id
       AND tenant_id = v_tenant_id;

    IF NOT FOUND THEN
      -- RLS-blocked or wrong tenant; surface clearly instead of silent
      -- partial success.
      RAISE EXCEPTION 'thresholds.bulk: ingredient % not in tenant scope', v_id
        USING ERRCODE = 'no_data_found';
    END IF;

    v_before := jsonb_build_object(
      'min_stock_level', v_row.min_stock_level,
      'max_stock_level', v_row.max_stock_level,
      'reorder_point',   v_row.reorder_point
    );
    v_after := jsonb_build_object(
      'min_stock_level', COALESCE(v_min, v_row.min_stock_level),
      'max_stock_level', CASE
        WHEN v_payload_item ? 'max_stock_level' THEN v_max
        ELSE v_row.max_stock_level
      END,
      'reorder_point', CASE
        WHEN v_payload_item ? 'reorder_point' THEN v_reorder
        ELSE v_row.reorder_point
      END
    );

    -- Skip writes that would no-op.
    IF v_before = v_after THEN
      CONTINUE;
    END IF;

    UPDATE public.ingredients
       SET min_stock_level = (v_after->>'min_stock_level')::NUMERIC(15,3),
           max_stock_level = NULLIF(v_after->>'max_stock_level', '')::NUMERIC(15,3),
           reorder_point   = NULLIF(v_after->>'reorder_point', '')::NUMERIC(15,3),
           updated_at      = now()
     WHERE id = v_id
       AND tenant_id = v_tenant_id;

    IF NOT FOUND THEN
      -- RLS UPDATE rejected silently (matches CLAUDE.md
      -- "Things That Will Bite You" — RLS blocked writes return no error).
      RAISE EXCEPTION 'thresholds.bulk: write blocked for id % (RLS or revoked)', v_id
        USING ERRCODE = 'insufficient_privilege';
    END IF;

    v_count := v_count + 1;
    v_delta := v_delta || jsonb_build_object(
      'id',     v_id,
      'before', v_before,
      'after',  v_after
    );
  END LOOP;

  -- One bulk audit row per CLAUDE.md "multi-item atomic" pattern.
  IF v_count > 0 THEN
    PERFORM public.log_audit(
      'inventory.thresholds.bulk_update',
      'ingredient',
      NULL,
      NULL,
      jsonb_build_object('updated', v_count, 'items', v_delta)
    );
  END IF;

  RETURN jsonb_build_object(
    'updated', v_count,
    'requested', v_request_count
  );
END;
$$;

COMMENT ON FUNCTION public.update_ingredient_thresholds_bulk(JSONB) IS
  'Bulk-update min/max/reorder on ingredients within the caller''s tenant. Validates min ≤ reorder ≤ max per row, skips no-ops, raises on RLS denial, and writes one audit_logs row capturing the full delta. Sprint 2 PP3-A.';

GRANT EXECUTE ON FUNCTION public.update_ingredient_thresholds_bulk(JSONB) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.update_ingredient_thresholds_bulk(JSONB) FROM anon, public;
