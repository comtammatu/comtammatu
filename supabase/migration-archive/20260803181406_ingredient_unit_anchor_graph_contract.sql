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
  v_tenant                 bigint := public.auth_tenant_id();
  v_base_dimension         text;
  v_base_is_standard       boolean;
  v_unit_dimension         text;
  v_unit_is_standard       boolean;
  v_unit_std_factor        numeric;
  v_base_std_factor        numeric;
  v_seen                   bigint[] := ARRAY[]::bigint[];
  v_current_unit           bigint;
  v_current_anchor         bigint;
  v_current_factor         numeric;
  v_hop_dimension          text;
  v_hop_is_standard        boolean;
  v_hop_std_factor         numeric;
  v_chain_dimension        text;
  v_selected_anchor_count  integer;
  v_selected_base_count    integer;
  v_next_anchor            bigint;
  v_next_factor            numeric;
  v_acc_factor             numeric := 1;
BEGIN
  IF p_is_base THEN
    IF p_anchor_unit_id IS NOT NULL OR p_anchor_factor IS NOT NULL THEN
      RAISE EXCEPTION 'unit_anchor_cycle' USING ERRCODE = '23514';
    END IF;

    IF p_unit_id IS DISTINCT FROM p_base_unit_id THEN
      RAISE EXCEPTION 'base_unit_identity_mismatch' USING ERRCODE = '23514';
    END IF;

    PERFORM 1
    FROM public.units
    WHERE id = p_base_unit_id
      AND tenant_id = v_tenant;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'base_unit_not_found' USING ERRCODE = '23503';
    END IF;

    SELECT count(*)
    INTO v_selected_base_count
    FROM jsonb_array_elements(p_all_units) AS selected
    WHERE (selected->>'unit_id')::bigint = p_base_unit_id
      AND COALESCE((selected->>'is_base')::boolean, false);

    IF v_selected_base_count <> 1 THEN
      RAISE EXCEPTION 'exactly_one_standard_unit_required' USING ERRCODE = '23514';
    END IF;

    RETURN 1;
  END IF;

  SELECT dimension, is_standard, standard_factor
  INTO v_base_dimension, v_base_is_standard, v_base_std_factor
  FROM public.units
  WHERE id = p_base_unit_id
    AND tenant_id = v_tenant;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'base_unit_not_found' USING ERRCODE = '23503';
  END IF;

  SELECT dimension, is_standard, standard_factor
  INTO v_unit_dimension, v_unit_is_standard, v_unit_std_factor
  FROM public.units
  WHERE id = p_unit_id
    AND tenant_id = v_tenant;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'unit_not_found' USING ERRCODE = '23503';
  END IF;

  IF v_unit_is_standard THEN
    v_chain_dimension := v_unit_dimension;
  END IF;

  IF p_anchor_unit_id IS NULL THEN
    IF NOT v_unit_is_standard
       OR NOT v_base_is_standard
       OR v_base_dimension IS DISTINCT FROM v_unit_dimension THEN
      RAISE EXCEPTION 'standard_unit_dimension_mismatch' USING ERRCODE = '23514';
    END IF;
    v_acc_factor := v_unit_std_factor / v_base_std_factor;
    IF v_acc_factor::text IN ('NaN', 'Infinity', '-Infinity') THEN
      RAISE EXCEPTION 'effective_factor_not_representable' USING ERRCODE = '23514';
    END IF;
    IF v_acc_factor <= 0
       OR v_acc_factor >= 1000000
       OR pg_catalog.round(v_acc_factor, 12) IS DISTINCT FROM v_acc_factor THEN
      RAISE EXCEPTION 'effective_factor_not_representable' USING ERRCODE = '23514';
    END IF;
    RETURN v_acc_factor;
  END IF;

  IF p_anchor_factor IS NULL THEN
    RAISE EXCEPTION 'packaging_unit_requires_anchor' USING ERRCODE = '23514';
  END IF;

  v_current_unit := p_unit_id;
  v_current_anchor := p_anchor_unit_id;
  v_current_factor := p_anchor_factor;

  LOOP
    IF v_current_unit = ANY (v_seen) THEN
      RAISE EXCEPTION 'unit_anchor_cycle' USING ERRCODE = '23514';
    END IF;
    v_seen := v_seen || v_current_unit;

    IF v_current_factor::text IN ('NaN', 'Infinity', '-Infinity') THEN
      RAISE EXCEPTION 'anchor_factor_not_representable' USING ERRCODE = '23514';
    END IF;
    IF v_current_factor <= 0
       OR v_current_factor >= 1000000000
       OR pg_catalog.round(v_current_factor, 9) IS DISTINCT FROM v_current_factor THEN
      RAISE EXCEPTION 'anchor_factor_not_representable' USING ERRCODE = '23514';
    END IF;

    v_acc_factor := v_acc_factor * v_current_factor;

    SELECT count(*), max(nullif(selected->>'anchor_unit_id', '')::bigint),
           max(nullif(selected->>'anchor_factor', '')::numeric)
    INTO v_selected_anchor_count, v_next_anchor, v_next_factor
    FROM jsonb_array_elements(p_all_units) AS selected
    WHERE (selected->>'unit_id')::bigint = v_current_anchor;

    IF v_selected_anchor_count <> 1 THEN
      RAISE EXCEPTION 'anchor_unit_not_selected' USING ERRCODE = '23514';
    END IF;

    SELECT dimension, is_standard, standard_factor
    INTO v_hop_dimension, v_hop_is_standard, v_hop_std_factor
    FROM public.units
    WHERE id = v_current_anchor
      AND tenant_id = v_tenant;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'anchor_unit_not_found' USING ERRCODE = '23503';
    END IF;

    IF v_hop_is_standard THEN
      IF v_chain_dimension IS NOT NULL
         AND v_chain_dimension IS DISTINCT FROM v_hop_dimension THEN
        RAISE EXCEPTION 'standard_unit_dimension_mismatch' USING ERRCODE = '23514';
      END IF;
      v_chain_dimension := v_hop_dimension;
    END IF;

    IF v_current_anchor = p_base_unit_id THEN
      IF v_acc_factor::text IN ('NaN', 'Infinity', '-Infinity') THEN
        RAISE EXCEPTION 'effective_factor_not_representable' USING ERRCODE = '23514';
      END IF;
      IF v_acc_factor <= 0
         OR v_acc_factor >= 1000000
         OR pg_catalog.round(v_acc_factor, 12) IS DISTINCT FROM v_acc_factor THEN
        RAISE EXCEPTION 'effective_factor_not_representable' USING ERRCODE = '23514';
      END IF;
      RETURN v_acc_factor;
    END IF;

    IF v_next_anchor IS NOT NULL THEN
      IF v_next_factor IS NULL THEN
        RAISE EXCEPTION 'packaging_unit_requires_anchor' USING ERRCODE = '23514';
      END IF;
      v_current_unit := v_current_anchor;
      v_current_anchor := v_next_anchor;
      v_current_factor := v_next_factor;
      CONTINUE;
    END IF;

    IF v_hop_is_standard THEN
      IF NOT v_base_is_standard
         OR v_base_dimension IS DISTINCT FROM v_hop_dimension THEN
        RAISE EXCEPTION 'standard_unit_dimension_mismatch' USING ERRCODE = '23514';
      END IF;
      v_acc_factor := v_acc_factor * (v_hop_std_factor / v_base_std_factor);
      IF v_acc_factor::text IN ('NaN', 'Infinity', '-Infinity') THEN
        RAISE EXCEPTION 'effective_factor_not_representable' USING ERRCODE = '23514';
      END IF;
      IF v_acc_factor <= 0
         OR v_acc_factor >= 1000000
         OR pg_catalog.round(v_acc_factor, 12) IS DISTINCT FROM v_acc_factor THEN
        RAISE EXCEPTION 'effective_factor_not_representable' USING ERRCODE = '23514';
      END IF;
      RETURN v_acc_factor;
    END IF;

    RAISE EXCEPTION 'unit_anchor_cycle' USING ERRCODE = '23514';
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.inv_catalog_unit_to_base(
  p_base_unit_id bigint,
  p_unit jsonb,
  p_all_units jsonb
) RETURNS numeric
LANGUAGE plpgsql STABLE
SET search_path TO ''
AS $$
DECLARE
  v_anchor_unit bigint := nullif(p_unit->>'anchor_unit_id', '')::bigint;
  v_anchor_factor numeric := nullif(p_unit->>'anchor_factor', '')::numeric;
  v_unit_id bigint := (p_unit->>'unit_id')::bigint;
  v_unit_is_standard boolean;
  v_selected_anchor_count integer;
BEGIN
  IF v_anchor_unit IS NOT NULL THEN
    SELECT count(*)
    INTO v_selected_anchor_count
    FROM jsonb_array_elements(p_all_units) AS selected
    WHERE (selected->>'unit_id')::bigint = v_anchor_unit;

    IF v_selected_anchor_count <> 1 THEN
      RAISE EXCEPTION 'anchor_unit_not_selected' USING ERRCODE = '23514';
    END IF;
  END IF;

  IF coalesce((p_unit->>'is_base')::boolean, false) THEN
    IF v_anchor_unit IS NOT NULL OR v_anchor_factor IS NOT NULL THEN
      RAISE EXCEPTION 'unit_anchor_cycle' USING ERRCODE = '23514';
    END IF;
    RETURN public.inv_derive_to_base_factor(
      p_base_unit_id,
      v_unit_id,
      true,
      NULL,
      NULL,
      p_all_units
    );
  END IF;

  IF v_anchor_unit IS NOT NULL THEN
    RETURN public.inv_derive_to_base_factor(
      p_base_unit_id,
      v_unit_id,
      false,
      v_anchor_unit,
      v_anchor_factor,
      p_all_units
    );
  END IF;

  SELECT is_standard
  INTO v_unit_is_standard
  FROM public.units
  WHERE id = v_unit_id
    AND tenant_id = public.auth_tenant_id();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'unit_not_found' USING ERRCODE = '23503';
  END IF;

  IF v_unit_is_standard THEN
    RETURN public.inv_derive_to_base_factor(
      p_base_unit_id,
      v_unit_id,
      false,
      NULL,
      NULL,
      p_all_units
    );
  END IF;

  RAISE EXCEPTION 'packaging_unit_requires_anchor' USING ERRCODE = '23514';
END;
$$;

REVOKE ALL ON FUNCTION public.inv_derive_to_base_factor(
  bigint, bigint, boolean, bigint, numeric, jsonb
) FROM PUBLIC;
GRANT ALL ON FUNCTION public.inv_derive_to_base_factor(
  bigint, bigint, boolean, bigint, numeric, jsonb
) TO authenticated;
GRANT ALL ON FUNCTION public.inv_derive_to_base_factor(
  bigint, bigint, boolean, bigint, numeric, jsonb
) TO service_role;

REVOKE ALL ON FUNCTION public.inv_catalog_unit_to_base(bigint, jsonb, jsonb)
FROM PUBLIC;
GRANT ALL ON FUNCTION public.inv_catalog_unit_to_base(bigint, jsonb, jsonb)
TO authenticated;
GRANT ALL ON FUNCTION public.inv_catalog_unit_to_base(bigint, jsonb, jsonb)
TO service_role;
