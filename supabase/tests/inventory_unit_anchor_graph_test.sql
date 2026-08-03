\set ON_ERROR_STOP on

BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.capture_catalog_save_check(
  p_name text,
  p_units jsonb,
  p_receipt_unit_id bigint,
  p_issue_unit_id bigint,
  p_production_unit_id bigint
) RETURNS text
LANGUAGE plpgsql
SET search_path TO ''
AS $$
BEGIN
  PERFORM public.save_ingredient_catalog(
    NULL, p_name, NULL, NULL, 'raw_material', 'ambient', 0,
    NULL, NULL, NULL, p_units, NULL, p_receipt_unit_id,
    p_issue_unit_id, p_production_unit_id
  );
  RETURN NULL;
EXCEPTION WHEN check_violation THEN
  RETURN SQLERRM;
END;
$$;

DO $$
DECLARE
  v_tenant bigint;
  v_owner uuid;
  v_suffix text := pg_catalog.substr(pg_catalog.gen_random_uuid()::text, 1, 8);
  v_thung bigint;
  v_chai bigint;
  v_custom_ml bigint;
  v_outside bigint;
  v_mass_standard bigint;
  v_volume_standard bigint;
  v_ingredient bigint;
  v_factor numeric;
  v_rejected boolean;
BEGIN
  SELECT profile.tenant_id, profile.id
  INTO v_tenant, v_owner
  FROM public.profiles AS profile
  JOIN public.positions AS position
    ON position.id = profile.position_id
   AND position.tenant_id = profile.tenant_id
  WHERE position.code = 'owner'
    AND coalesce(profile.is_active, TRUE)
  ORDER BY profile.id
  LIMIT 1;

  IF v_tenant IS NULL OR v_owner IS NULL THEN
    RAISE EXCEPTION 'INGREDIENT UNIT GRAPH: owner fixture required';
  END IF;

  INSERT INTO public.units (tenant_id, code, name)
  VALUES (v_tenant, '__graph_thung_' || v_suffix, 'Thùng')
  RETURNING id INTO v_thung;
  INSERT INTO public.units (tenant_id, code, name)
  VALUES (v_tenant, '__graph_chai_' || v_suffix, 'Chai')
  RETURNING id INTO v_chai;
  INSERT INTO public.units (tenant_id, code, name)
  VALUES (v_tenant, '__graph_ml_' || v_suffix, 'ml custom')
  RETURNING id INTO v_custom_ml;
  INSERT INTO public.units (tenant_id, code, name)
  VALUES (v_tenant, '__graph_out_' || v_suffix, 'Outside')
  RETURNING id INTO v_outside;
  INSERT INTO public.units (
    tenant_id, code, name, dimension, is_standard, standard_factor
  ) VALUES (
    v_tenant, '__graph_g_' || v_suffix, 'g graph', 'mass', TRUE, 1
  ) RETURNING id INTO v_mass_standard;
  INSERT INTO public.units (
    tenant_id, code, name, dimension, is_standard, standard_factor
  ) VALUES (
    v_tenant, '__graph_std_ml_' || v_suffix, 'ml graph', 'volume', TRUE, 1
  ) RETURNING id INTO v_volume_standard;

  PERFORM pg_catalog.set_config(
    'request.jwt.claims',
    jsonb_build_object(
      'sub', v_owner::text,
      'role', 'authenticated',
      'app_metadata', jsonb_build_object(
        'tenant_id', v_tenant,
        'user_role', 'owner',
        'position_code', 'owner'
      )
    )::text,
    TRUE
  );

  v_ingredient := public.save_ingredient_catalog(
    NULL,
    '__ingredient_unit_graph_' || v_suffix,
    NULL,
    NULL,
    'raw_material',
    'ambient',
    0,
    NULL,
    NULL,
    NULL,
    jsonb_build_array(
      jsonb_build_object(
        'unit_id', v_thung,
        'to_base_factor', 6000,
        'is_base', FALSE,
        'anchor_unit_id', v_chai,
        'anchor_factor', 24
      ),
      jsonb_build_object(
        'unit_id', v_chai,
        'to_base_factor', 250,
        'is_base', FALSE,
        'anchor_unit_id', v_custom_ml,
        'anchor_factor', 250
      ),
      jsonb_build_object(
        'unit_id', v_custom_ml,
        'to_base_factor', 1,
        'is_base', TRUE,
        'anchor_unit_id', NULL,
        'anchor_factor', NULL
      )
    ),
    NULL,
    v_thung,
    v_custom_ml,
    v_chai
  );

  IF NOT EXISTS (
    SELECT 1
    FROM public.ingredient_units AS ingredient_unit
    WHERE ingredient_unit.tenant_id = v_tenant
      AND ingredient_unit.ingredient_id = v_ingredient
    GROUP BY ingredient_unit.ingredient_id
    HAVING count(*) = 3
       AND max(ingredient_unit.to_base_factor)
         FILTER (WHERE ingredient_unit.unit_id = v_thung) = 6000
       AND max(ingredient_unit.to_base_factor)
         FILTER (WHERE ingredient_unit.unit_id = v_chai) = 250
       AND max(ingredient_unit.anchor_unit_id)
         FILTER (WHERE ingredient_unit.unit_id = v_thung) = v_chai
       AND max(ingredient_unit.anchor_unit_id)
         FILTER (WHERE ingredient_unit.unit_id = v_chai) = v_custom_ml
  ) THEN
    RAISE EXCEPTION 'INGREDIENT UNIT GRAPH: Thùng -> Chai -> ml did not persist derived factors';
  END IF;

  v_factor := public.inv_derive_to_base_factor(
    v_custom_ml,
    v_thung,
    FALSE,
    v_mass_standard,
    2,
    jsonb_build_array(
      jsonb_build_object('unit_id', v_thung, 'anchor_unit_id', v_mass_standard, 'anchor_factor', 2),
      jsonb_build_object('unit_id', v_mass_standard, 'anchor_unit_id', v_custom_ml, 'anchor_factor', 7),
      jsonb_build_object('unit_id', v_custom_ml, 'is_base', TRUE)
    )
  );
  IF v_factor IS DISTINCT FROM 14 THEN
    RAISE EXCEPTION 'INGREDIENT UNIT GRAPH: selected standard outgoing edge was not followed: %', v_factor;
  END IF;

  v_rejected := FALSE;
  BEGIN
    PERFORM public.inv_derive_to_base_factor(
      v_custom_ml,
      v_thung,
      FALSE,
      v_outside,
      1,
      jsonb_build_array(
        jsonb_build_object('unit_id', v_thung, 'anchor_unit_id', v_outside, 'anchor_factor', 1),
        jsonb_build_object('unit_id', v_custom_ml, 'is_base', TRUE)
      )
    );
  EXCEPTION WHEN check_violation THEN
    v_rejected := SQLERRM = 'anchor_unit_not_selected';
  END;
  IF NOT v_rejected THEN
    RAISE EXCEPTION 'INGREDIENT UNIT GRAPH: unselected registry anchor accepted';
  END IF;

  v_rejected := FALSE;
  BEGIN
    PERFORM public.inv_derive_to_base_factor(
      v_custom_ml,
      v_thung,
      FALSE,
      v_chai,
      1,
      jsonb_build_array(
        jsonb_build_object('unit_id', v_thung, 'anchor_unit_id', v_chai, 'anchor_factor', 1),
        jsonb_build_object('unit_id', v_chai, 'anchor_unit_id', v_custom_ml, 'anchor_factor', 1),
        jsonb_build_object('unit_id', v_chai, 'anchor_unit_id', v_custom_ml, 'anchor_factor', 1),
        jsonb_build_object('unit_id', v_custom_ml, 'is_base', TRUE)
      )
    );
  EXCEPTION WHEN check_violation THEN
    v_rejected := SQLERRM = 'anchor_unit_not_selected';
  END;
  IF NOT v_rejected THEN
    RAISE EXCEPTION 'INGREDIENT UNIT GRAPH: duplicate selected anchor accepted';
  END IF;

  v_rejected := FALSE;
  BEGIN
    PERFORM public.inv_catalog_unit_to_base(
      v_custom_ml,
      jsonb_build_object(
        'unit_id', v_custom_ml,
        'is_base', TRUE,
        'anchor_unit_id', v_custom_ml,
        'anchor_factor', 1
      ),
      jsonb_build_array(
        jsonb_build_object(
          'unit_id', v_custom_ml,
          'is_base', TRUE,
          'anchor_unit_id', v_custom_ml,
          'anchor_factor', 1
        )
      )
    );
  EXCEPTION WHEN check_violation THEN
    v_rejected := SQLERRM = 'unit_anchor_cycle';
  END;
  IF NOT v_rejected THEN
    RAISE EXCEPTION 'INGREDIENT UNIT GRAPH: anchored base row accepted';
  END IF;

  v_rejected := FALSE;
  BEGIN
    PERFORM public.inv_derive_to_base_factor(
      v_custom_ml,
      v_custom_ml,
      TRUE,
      v_custom_ml,
      1,
      jsonb_build_array(
        jsonb_build_object('unit_id', v_custom_ml, 'is_base', TRUE)
      )
    );
  EXCEPTION WHEN check_violation THEN
    v_rejected := SQLERRM = 'unit_anchor_cycle';
  END;
  IF NOT v_rejected THEN
    RAISE EXCEPTION 'INGREDIENT UNIT GRAPH: direct helper accepted malformed base arguments';
  END IF;

  v_rejected := FALSE;
  BEGIN
    PERFORM public.inv_derive_to_base_factor(
      v_volume_standard,
      v_mass_standard,
      FALSE,
      v_volume_standard,
      1,
      jsonb_build_array(
        jsonb_build_object('unit_id', v_mass_standard, 'anchor_unit_id', v_volume_standard, 'anchor_factor', 1),
        jsonb_build_object('unit_id', v_volume_standard, 'is_base', TRUE)
      )
    );
  EXCEPTION WHEN check_violation THEN
    v_rejected := SQLERRM = 'standard_unit_dimension_mismatch';
  END;
  IF NOT v_rejected THEN
    RAISE EXCEPTION 'INGREDIENT UNIT GRAPH: direct cross-dimension standards accepted';
  END IF;

  v_rejected := FALSE;
  BEGIN
    PERFORM public.inv_catalog_unit_to_base(
      v_volume_standard,
      jsonb_build_object(
        'unit_id', v_mass_standard,
        'to_base_factor', 1,
        'is_base', FALSE,
        'anchor_unit_id', NULL,
        'anchor_factor', NULL
      ),
      jsonb_build_array(
        jsonb_build_object('unit_id', v_mass_standard, 'to_base_factor', 1, 'is_base', FALSE),
        jsonb_build_object('unit_id', v_volume_standard, 'to_base_factor', 1, 'is_base', TRUE)
      )
    );
  EXCEPTION WHEN check_violation THEN
    v_rejected := SQLERRM = 'standard_unit_dimension_mismatch';
  END;
  IF NOT v_rejected THEN
    RAISE EXCEPTION 'INGREDIENT UNIT GRAPH: anchorless cross-dimension standard accepted';
  END IF;

  v_rejected := FALSE;
  BEGIN
    PERFORM public.inv_derive_to_base_factor(
      v_volume_standard,
      v_mass_standard,
      FALSE,
      v_chai,
      2,
      jsonb_build_array(
        jsonb_build_object('unit_id', v_mass_standard, 'anchor_unit_id', v_chai, 'anchor_factor', 2),
        jsonb_build_object('unit_id', v_chai, 'anchor_unit_id', v_volume_standard, 'anchor_factor', 3),
        jsonb_build_object('unit_id', v_volume_standard, 'is_base', TRUE)
      )
    );
  EXCEPTION WHEN check_violation THEN
    v_rejected := SQLERRM = 'standard_unit_dimension_mismatch';
  END;
  IF NOT v_rejected THEN
    RAISE EXCEPTION 'INGREDIENT UNIT GRAPH: multi-hop cross-dimension standards accepted';
  END IF;

  v_rejected := FALSE;
  BEGIN
    PERFORM public.inv_derive_to_base_factor(
      v_custom_ml,
      v_thung,
      FALSE,
      v_thung,
      1,
      jsonb_build_array(
        jsonb_build_object('unit_id', v_thung, 'anchor_unit_id', v_thung, 'anchor_factor', 1),
        jsonb_build_object('unit_id', v_custom_ml, 'is_base', TRUE)
      )
    );
  EXCEPTION WHEN check_violation THEN
    v_rejected := SQLERRM = 'unit_anchor_cycle';
  END;
  IF NOT v_rejected THEN
    RAISE EXCEPTION 'INGREDIENT UNIT GRAPH: self link accepted';
  END IF;

  v_rejected := FALSE;
  BEGIN
    PERFORM public.inv_derive_to_base_factor(
      v_custom_ml,
      v_thung,
      FALSE,
      v_chai,
      1,
      jsonb_build_array(
        jsonb_build_object('unit_id', v_thung, 'anchor_unit_id', v_chai, 'anchor_factor', 1),
        jsonb_build_object('unit_id', v_chai, 'anchor_unit_id', v_thung, 'anchor_factor', 1),
        jsonb_build_object('unit_id', v_custom_ml, 'is_base', TRUE)
      )
    );
  EXCEPTION WHEN check_violation THEN
    v_rejected := SQLERRM = 'unit_anchor_cycle';
  END;
  IF NOT v_rejected THEN
    RAISE EXCEPTION 'INGREDIENT UNIT GRAPH: multi-hop cycle accepted';
  END IF;

  PERFORM pg_catalog.set_config('test.unit_graph.tenant', v_tenant::text, TRUE);
  PERFORM pg_catalog.set_config('test.unit_graph.suffix', v_suffix, TRUE);
  PERFORM pg_catalog.set_config('test.unit_graph.thung', v_thung::text, TRUE);
  PERFORM pg_catalog.set_config('test.unit_graph.chai', v_chai::text, TRUE);
  PERFORM pg_catalog.set_config('test.unit_graph.custom_ml', v_custom_ml::text, TRUE);
  PERFORM pg_catalog.set_config('test.unit_graph.outside', v_outside::text, TRUE);
END;
$$;

SET LOCAL ROLE authenticated;

DO $$
DECLARE
  v_tenant bigint := pg_catalog.current_setting('test.unit_graph.tenant')::bigint;
  v_suffix text := pg_catalog.current_setting('test.unit_graph.suffix');
  v_thung bigint := pg_catalog.current_setting('test.unit_graph.thung')::bigint;
  v_chai bigint := pg_catalog.current_setting('test.unit_graph.chai')::bigint;
  v_custom_ml bigint := pg_catalog.current_setting('test.unit_graph.custom_ml')::bigint;
  v_outside bigint := pg_catalog.current_setting('test.unit_graph.outside')::bigint;
  v_error text;
  v_cross_ingredient bigint;
  v_rejected boolean;
BEGIN
  v_cross_ingredient := public.save_ingredient_catalog(
    NULL,
    '__graph_cross_boundary_' || v_suffix,
    NULL,
    NULL,
    'raw_material',
    'ambient',
    0,
    NULL,
    NULL,
    NULL,
    jsonb_build_array(
      jsonb_build_object('unit_id', v_thung, 'to_base_factor', 200000, 'is_base', FALSE, 'anchor_unit_id', v_chai, 'anchor_factor', 2000000),
      jsonb_build_object('unit_id', v_chai, 'to_base_factor', 0.1, 'is_base', FALSE, 'anchor_unit_id', v_custom_ml, 'anchor_factor', 0.1),
      jsonb_build_object('unit_id', v_custom_ml, 'to_base_factor', 1, 'is_base', TRUE)
    ),
    NULL,
    v_custom_ml,
    v_custom_ml,
    NULL
  );
  IF NOT EXISTS (
    SELECT 1
    FROM public.ingredient_units AS ingredient_unit
    WHERE ingredient_unit.tenant_id = v_tenant
      AND ingredient_unit.ingredient_id = v_cross_ingredient
    GROUP BY ingredient_unit.ingredient_id
    HAVING max(ingredient_unit.to_base_factor)
      FILTER (WHERE ingredient_unit.unit_id = v_thung) = 200000
      AND max(ingredient_unit.to_base_factor)
        FILTER (WHERE ingredient_unit.unit_id = v_chai) = 0.1
  ) THEN
    RAISE EXCEPTION 'INGREDIENT UNIT GRAPH: cross-boundary graph did not persist 200000 and 0.1';
  END IF;

  v_rejected := FALSE;
  BEGIN
    PERFORM public.inv_derive_to_base_factor(
      v_custom_ml, v_thung, TRUE, NULL, NULL,
      jsonb_build_array(
        jsonb_build_object('unit_id', v_custom_ml, 'is_base', TRUE)
      )
    );
  EXCEPTION WHEN check_violation THEN
    v_rejected := TRUE;
  END;
  IF NOT v_rejected THEN
    RAISE EXCEPTION 'INGREDIENT UNIT GRAPH: direct base helper accepted mismatched ids';
  END IF;

  v_rejected := FALSE;
  BEGIN
    PERFORM public.inv_derive_to_base_factor(
      9223372036854775807, 9223372036854775807, TRUE, NULL, NULL,
      jsonb_build_array(
        jsonb_build_object('unit_id', 9223372036854775807, 'is_base', TRUE)
      )
    );
  EXCEPTION WHEN foreign_key_violation THEN
    v_rejected := TRUE;
  END;
  IF NOT v_rejected THEN
    RAISE EXCEPTION 'INGREDIENT UNIT GRAPH: direct base helper accepted nonexistent unit';
  END IF;

  v_rejected := FALSE;
  BEGIN
    PERFORM public.inv_derive_to_base_factor(
      v_custom_ml, v_custom_ml, TRUE, NULL, NULL,
      jsonb_build_array(
        jsonb_build_object('unit_id', v_custom_ml, 'is_base', FALSE)
      )
    );
  EXCEPTION WHEN check_violation THEN
    v_rejected := TRUE;
  END;
  IF NOT v_rejected THEN
    RAISE EXCEPTION 'INGREDIENT UNIT GRAPH: direct base helper accepted unselected base';
  END IF;

  v_rejected := FALSE;
  BEGIN
    PERFORM public.inv_catalog_unit_to_base(
      v_custom_ml,
      jsonb_build_object(
        'unit_id', v_custom_ml,
        'is_base', TRUE,
        'anchor_unit_id', NULL,
        'anchor_factor', 1
      ),
      jsonb_build_array(
        jsonb_build_object('unit_id', v_custom_ml, 'is_base', TRUE)
      )
    );
  EXCEPTION WHEN check_violation THEN
    v_rejected := TRUE;
  END;
  IF NOT v_rejected THEN
    RAISE EXCEPTION 'INGREDIENT UNIT GRAPH: catalog helper accepted base anchor_factor without anchor id';
  END IF;

  v_error := pg_temp.capture_catalog_save_check(
    '__graph_rejected_unselected_' || v_suffix,
    jsonb_build_array(
      jsonb_build_object('unit_id', v_thung, 'to_base_factor', 1, 'is_base', FALSE, 'anchor_unit_id', v_outside, 'anchor_factor', 1),
      jsonb_build_object('unit_id', v_custom_ml, 'to_base_factor', 1, 'is_base', TRUE)
    ),
    v_custom_ml, v_custom_ml, NULL
  );
  IF v_error IS DISTINCT FROM 'anchor_unit_not_selected' THEN
    RAISE EXCEPTION 'INGREDIENT UNIT GRAPH: save RPC accepted an unselected anchor: %', v_error;
  END IF;

  v_error := pg_temp.capture_catalog_save_check(
    '__graph_rejected_duplicate_' || v_suffix,
    jsonb_build_array(
      jsonb_build_object('unit_id', v_thung, 'to_base_factor', 1, 'is_base', FALSE, 'anchor_unit_id', v_chai, 'anchor_factor', 1),
      jsonb_build_object('unit_id', v_chai, 'to_base_factor', 1, 'is_base', FALSE, 'anchor_unit_id', v_custom_ml, 'anchor_factor', 1),
      jsonb_build_object('unit_id', v_chai, 'to_base_factor', 1, 'is_base', FALSE, 'anchor_unit_id', v_custom_ml, 'anchor_factor', 1),
      jsonb_build_object('unit_id', v_custom_ml, 'to_base_factor', 1, 'is_base', TRUE)
    ),
    v_custom_ml, v_custom_ml, NULL
  );
  IF v_error IS DISTINCT FROM 'inventory_unit_roles_invalid' THEN
    RAISE EXCEPTION 'INGREDIENT UNIT GRAPH: save RPC accepted a duplicate anchor: %', v_error;
  END IF;

  v_error := pg_temp.capture_catalog_save_check(
    '__graph_rejected_anchored_base_' || v_suffix,
    jsonb_build_array(
      jsonb_build_object('unit_id', v_thung, 'to_base_factor', 1, 'is_base', FALSE, 'anchor_unit_id', v_custom_ml, 'anchor_factor', 1),
      jsonb_build_object('unit_id', v_custom_ml, 'to_base_factor', 1, 'is_base', TRUE, 'anchor_unit_id', v_thung, 'anchor_factor', 1)
    ),
    v_custom_ml, v_custom_ml, NULL
  );
  IF v_error IS DISTINCT FROM 'unit_anchor_cycle' THEN
    RAISE EXCEPTION 'INGREDIENT UNIT GRAPH: save RPC accepted an anchored base: %', v_error;
  END IF;

  v_error := pg_temp.capture_catalog_save_check(
    '__graph_rejected_cycle_' || v_suffix,
    jsonb_build_array(
      jsonb_build_object('unit_id', v_thung, 'to_base_factor', 1, 'is_base', FALSE, 'anchor_unit_id', v_chai, 'anchor_factor', 1),
      jsonb_build_object('unit_id', v_chai, 'to_base_factor', 1, 'is_base', FALSE, 'anchor_unit_id', v_thung, 'anchor_factor', 1),
      jsonb_build_object('unit_id', v_custom_ml, 'to_base_factor', 1, 'is_base', TRUE)
    ),
    v_custom_ml, v_custom_ml, NULL
  );
  IF v_error IS DISTINCT FROM 'unit_anchor_cycle' THEN
    RAISE EXCEPTION 'INGREDIENT UNIT GRAPH: save RPC accepted an anchor cycle: %', v_error;
  END IF;

  v_error := pg_temp.capture_catalog_save_check(
    '__graph_rejected_anchorless_' || v_suffix,
    jsonb_build_array(
      jsonb_build_object('unit_id', v_thung, 'to_base_factor', 24, 'is_base', FALSE),
      jsonb_build_object('unit_id', v_custom_ml, 'to_base_factor', 1, 'is_base', TRUE)
    ),
    v_custom_ml, v_custom_ml, NULL
  );
  IF v_error IS DISTINCT FROM 'packaging_unit_requires_anchor' THEN
    RAISE EXCEPTION 'INGREDIENT UNIT GRAPH: save RPC accepted anchorless packaging: %', v_error;
  END IF;

  v_error := pg_temp.capture_catalog_save_check(
    '__graph_rejected_nan_' || v_suffix,
    jsonb_build_array(
      jsonb_build_object('unit_id', v_thung, 'to_base_factor', 1, 'is_base', FALSE, 'anchor_unit_id', v_custom_ml, 'anchor_factor', 'NaN'::numeric),
      jsonb_build_object('unit_id', v_custom_ml, 'to_base_factor', 1, 'is_base', TRUE)
    ),
    v_custom_ml, v_custom_ml, NULL
  );
  IF v_error IS DISTINCT FROM 'anchor_factor_not_representable' THEN
    RAISE EXCEPTION 'INGREDIENT UNIT GRAPH: save RPC accepted NaN: %', v_error;
  END IF;

  v_error := pg_temp.capture_catalog_save_check(
    '__graph_rejected_inf_' || v_suffix,
    jsonb_build_array(
      jsonb_build_object('unit_id', v_thung, 'to_base_factor', 1, 'is_base', FALSE, 'anchor_unit_id', v_custom_ml, 'anchor_factor', 'Infinity'::numeric),
      jsonb_build_object('unit_id', v_custom_ml, 'to_base_factor', 1, 'is_base', TRUE)
    ),
    v_custom_ml, v_custom_ml, NULL
  );
  IF v_error IS DISTINCT FROM 'anchor_factor_not_representable' THEN
    RAISE EXCEPTION 'INGREDIENT UNIT GRAPH: save RPC accepted Infinity: %', v_error;
  END IF;

  v_error := pg_temp.capture_catalog_save_check(
    '__graph_rejected_ninf_' || v_suffix,
    jsonb_build_array(
      jsonb_build_object('unit_id', v_thung, 'to_base_factor', 1, 'is_base', FALSE, 'anchor_unit_id', v_custom_ml, 'anchor_factor', '-Infinity'::numeric),
      jsonb_build_object('unit_id', v_custom_ml, 'to_base_factor', 1, 'is_base', TRUE)
    ),
    v_custom_ml, v_custom_ml, NULL
  );
  IF v_error IS DISTINCT FROM 'anchor_factor_not_representable' THEN
    RAISE EXCEPTION 'INGREDIENT UNIT GRAPH: save RPC accepted -Infinity: %', v_error;
  END IF;

  v_error := pg_temp.capture_catalog_save_check(
    '__graph_rejected_zero_' || v_suffix,
    jsonb_build_array(
      jsonb_build_object('unit_id', v_thung, 'to_base_factor', 1, 'is_base', FALSE, 'anchor_unit_id', v_custom_ml, 'anchor_factor', 0),
      jsonb_build_object('unit_id', v_custom_ml, 'to_base_factor', 1, 'is_base', TRUE)
    ),
    v_custom_ml, v_custom_ml, NULL
  );
  IF v_error IS DISTINCT FROM 'anchor_factor_not_representable' THEN
    RAISE EXCEPTION 'INGREDIENT UNIT GRAPH: save RPC accepted zero anchor factor: %', v_error;
  END IF;

  v_error := pg_temp.capture_catalog_save_check(
    '__graph_rejected_anchor_scale_' || v_suffix,
    jsonb_build_array(
      jsonb_build_object('unit_id', v_thung, 'to_base_factor', 1, 'is_base', FALSE, 'anchor_unit_id', v_custom_ml, 'anchor_factor', 1.0000000001),
      jsonb_build_object('unit_id', v_custom_ml, 'to_base_factor', 1, 'is_base', TRUE)
    ),
    v_custom_ml, v_custom_ml, NULL
  );
  IF v_error IS DISTINCT FROM 'anchor_factor_not_representable' THEN
    RAISE EXCEPTION 'INGREDIENT UNIT GRAPH: save RPC accepted excess anchor scale: %', v_error;
  END IF;

  v_error := pg_temp.capture_catalog_save_check(
    '__graph_rejected_anchor_overflow_' || v_suffix,
    jsonb_build_array(
      jsonb_build_object('unit_id', v_thung, 'to_base_factor', 1, 'is_base', FALSE, 'anchor_unit_id', v_custom_ml, 'anchor_factor', 1000000000),
      jsonb_build_object('unit_id', v_custom_ml, 'to_base_factor', 1, 'is_base', TRUE)
    ),
    v_custom_ml, v_custom_ml, NULL
  );
  IF v_error IS DISTINCT FROM 'anchor_factor_not_representable' THEN
    RAISE EXCEPTION 'INGREDIENT UNIT GRAPH: save RPC accepted anchor overflow: %', v_error;
  END IF;

  v_error := pg_temp.capture_catalog_save_check(
    '__graph_rejected_effective_scale_' || v_suffix,
    jsonb_build_array(
      jsonb_build_object('unit_id', v_thung, 'to_base_factor', 1, 'is_base', FALSE, 'anchor_unit_id', v_chai, 'anchor_factor', 0.123456789),
      jsonb_build_object('unit_id', v_chai, 'to_base_factor', 1, 'is_base', FALSE, 'anchor_unit_id', v_custom_ml, 'anchor_factor', 0.123456789),
      jsonb_build_object('unit_id', v_custom_ml, 'to_base_factor', 1, 'is_base', TRUE)
    ),
    v_custom_ml, v_custom_ml, NULL
  );
  IF v_error IS DISTINCT FROM 'effective_factor_not_representable' THEN
    RAISE EXCEPTION 'INGREDIENT UNIT GRAPH: save RPC accepted excess effective scale: %', v_error;
  END IF;

  v_error := pg_temp.capture_catalog_save_check(
    '__graph_rejected_effective_overflow_' || v_suffix,
    jsonb_build_array(
      jsonb_build_object('unit_id', v_thung, 'to_base_factor', 1, 'is_base', FALSE, 'anchor_unit_id', v_custom_ml, 'anchor_factor', 1000000),
      jsonb_build_object('unit_id', v_custom_ml, 'to_base_factor', 1, 'is_base', TRUE)
    ),
    v_custom_ml, v_custom_ml, NULL
  );
  IF v_error IS DISTINCT FROM 'effective_factor_not_representable' THEN
    RAISE EXCEPTION 'INGREDIENT UNIT GRAPH: save RPC accepted effective overflow: %', v_error;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.ingredients AS ingredient
    WHERE ingredient.tenant_id = v_tenant
      AND pg_catalog.left(ingredient.name, 17) = '__graph_rejected_'
  ) THEN
    RAISE EXCEPTION 'INGREDIENT UNIT GRAPH: failed save RPC left partial ingredient data';
  END IF;

  RAISE NOTICE 'INGREDIENT UNIT GRAPH: ok';
END;
$$;

RESET ROLE;

ROLLBACK;
