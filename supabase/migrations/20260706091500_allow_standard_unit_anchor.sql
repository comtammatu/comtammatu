-- Migration to allow standard units to be anchored manually when they have an anchor unit defined.

CREATE OR REPLACE FUNCTION public.inv_derive_to_base_factor(
  p_base_unit_id bigint,
  p_unit_id bigint,
  p_is_base boolean,
  p_anchor_unit_id bigint,
  p_anchor_factor numeric,
  p_all_units jsonb
) RETURNS numeric
    LANGUAGE plpgsql STABLE
    SET search_path TO ''
    AS $$
DECLARE
  v_tenant            bigint := public.auth_tenant_id();
  v_base_dimension    text;
  v_base_is_standard  boolean;
  v_unit_dimension    text;
  v_unit_is_standard  boolean;
  v_unit_std_factor   numeric;
  v_base_std_factor   numeric;
  v_seen              bigint[] := ARRAY[]::bigint[];
  v_current_unit      bigint;
  v_current_anchor    bigint;
  v_current_factor    numeric;
  v_hop_dimension     text;
  v_hop_is_standard   boolean;
  v_hop_std_factor    numeric;
  v_acc_factor        numeric := 1;
BEGIN
  IF p_is_base THEN
    RETURN 1;
  END IF;

  SELECT dimension, is_standard, standard_factor
  INTO v_base_dimension, v_base_is_standard, v_base_std_factor
  FROM public.units
  WHERE id = p_base_unit_id AND tenant_id = v_tenant;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'base_unit_not_found' USING ERRCODE = '23503';
  END IF;

  SELECT dimension, is_standard, standard_factor
  INTO v_unit_dimension, v_unit_is_standard, v_unit_std_factor
  FROM public.units
  WHERE id = p_unit_id AND tenant_id = v_tenant;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'unit_not_found' USING ERRCODE = '23503';
  END IF;

  -- Case 1: this unit is itself a standard unit. Only valid when the
  -- ingredient's base is a standard unit of the SAME dimension; the ratio
  -- is then a pure system constant (never user-entered).
  -- MODIFICATION: skip this if an anchor unit is explicitly specified,
  -- allowing standard units to be anchored manually when base is non-standard.
  IF v_unit_is_standard AND p_anchor_unit_id IS NULL THEN
    IF NOT v_base_is_standard OR v_base_dimension IS DISTINCT FROM v_unit_dimension THEN
      RAISE EXCEPTION 'standard_unit_dimension_mismatch' USING ERRCODE = '23514';
    END IF;
    RETURN v_unit_std_factor / v_base_std_factor;
  END IF;

  -- Case 2: packaging unit (or manually-anchored standard unit). Walk the anchor chain until it reaches either
  -- the base unit or a standard unit, multiplying anchor_factor at each hop.
  -- Fail-closed on a missing anchor, a cycle, or a cross-dimension anchor
  -- once the chain reaches a standard unit.
  IF p_anchor_unit_id IS NULL OR p_anchor_factor IS NULL THEN
    RAISE EXCEPTION 'packaging_unit_requires_anchor' USING ERRCODE = '23514';
  END IF;

  v_current_unit := p_unit_id;
  v_current_anchor := p_anchor_unit_id;
  v_current_factor := p_anchor_factor;
  v_acc_factor := 1;

  LOOP
    IF v_current_unit = ANY (v_seen) THEN
      RAISE EXCEPTION 'unit_anchor_cycle' USING ERRCODE = '23514';
    END IF;
    v_seen := v_seen || v_current_unit;

    v_acc_factor := v_acc_factor * v_current_factor;

    IF v_current_anchor = p_base_unit_id THEN
      RETURN v_acc_factor;
    END IF;

    SELECT dimension, is_standard, standard_factor
    INTO v_hop_dimension, v_hop_is_standard, v_hop_std_factor
    FROM public.units
    WHERE id = v_current_anchor AND tenant_id = v_tenant;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'anchor_unit_not_found' USING ERRCODE = '23503';
    END IF;

    IF v_hop_is_standard THEN
      IF NOT v_base_is_standard OR v_base_dimension IS DISTINCT FROM v_hop_dimension THEN
        RAISE EXCEPTION 'standard_unit_dimension_mismatch' USING ERRCODE = '23514';
      END IF;
      RETURN v_acc_factor * (v_hop_std_factor / v_base_std_factor);
    END IF;

    -- Next hop: the anchor must itself be a packaging row on this
    -- ingredient (present in p_all_units), anchored further down the chain.
    v_current_unit := v_current_anchor;

    SELECT (e->>'anchor_unit_id')::bigint, (e->>'anchor_factor')::numeric
    INTO v_current_anchor, v_current_factor
    FROM jsonb_array_elements(p_all_units) e
    WHERE (e->>'unit_id')::bigint = v_current_unit;

    IF v_current_anchor IS NULL OR v_current_factor IS NULL THEN
      RAISE EXCEPTION 'unit_anchor_cycle' USING ERRCODE = '23514';
    END IF;
  END LOOP;
END;
$$;
