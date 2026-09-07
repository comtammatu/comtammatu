-- Migration: has_permission_batch
-- One HTTP round-trip for N UI/action permission probes. Each element reuses
-- public.has_permission / has_permission_any so revoke stays immediate.

CREATE OR REPLACE FUNCTION public.has_permission_batch(p_items jsonb)
RETURNS boolean[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_result boolean[] := ARRAY[]::boolean[];
  v_item jsonb;
  v_key text;
  v_branch_raw text;
  v_branch_id bigint;
  v_allowed boolean;
BEGIN
  IF p_items IS NULL OR jsonb_typeof(p_items) IS DISTINCT FROM 'array' THEN
    RETURN ARRAY[]::boolean[];
  END IF;

  FOR v_item IN
    SELECT value
    FROM jsonb_array_elements(p_items)
  LOOP
    v_key := btrim(COALESCE(v_item ->> 'key', ''));
    IF v_key = '' THEN
      v_result := array_append(v_result, false);
      CONTINUE;
    END IF;

    v_branch_raw := v_item ->> 'branch_id';
    IF v_branch_raw IS NULL OR v_branch_raw = '' THEN
      v_allowed := public.has_permission_any(v_key);
    ELSE
      BEGIN
        v_branch_id := v_branch_raw::bigint;
      EXCEPTION
        WHEN invalid_text_representation THEN
          RAISE EXCEPTION 'has_permission_batch: invalid branch_id %', v_branch_raw
            USING ERRCODE = '22P02';
      END;
      v_allowed := public.has_permission(v_branch_id, v_key);
    END IF;

    v_result := array_append(v_result, COALESCE(v_allowed, false));
  END LOOP;

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.has_permission_batch(jsonb) IS
  'Batch UI permission probes. Null branch_id uses has_permission_any; non-null uses has_permission. Returns booleans in input order.';

REVOKE ALL ON FUNCTION public.has_permission_batch(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.has_permission_batch(jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.has_permission_batch(jsonb) TO authenticated;
