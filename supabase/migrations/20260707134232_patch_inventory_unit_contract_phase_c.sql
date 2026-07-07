CREATE OR REPLACE FUNCTION public.get_production_recipe_context(
    p_finished_good_id bigint,
    p_branch_id bigint
) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
    v_tenant BIGINT := public.auth_tenant_id();
    v_location_id BIGINT;
    v_res JSONB;
BEGIN
    IF NOT public.has_permission_any('inventory:production_create')
       AND NOT public.has_permission_any('inventory:production_confirm') THEN
        RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
    END IF;

    SELECT il.id INTO v_location_id
    FROM public.inventory_locations il
    WHERE il.branch_id = p_branch_id
      AND il.tenant_id = v_tenant
      AND il.is_default_receive = TRUE
      AND il.is_active = TRUE
    LIMIT 1;

    WITH base AS (
        SELECT
            pr.ingredient_id,
            ing.name AS ingredient_name,
            COALESCE(entry_u.name, entry_u.code, base_u.name, base_u.code, '') AS unit_name,
            pr.entry_unit_id,
            pr.quantity AS recipe_quantity,
            COALESCE(pr.yield_factor, 1.0) AS yield_factor,
            COALESCE(sl.current_quantity, 0) AS current_quantity_base,
            entry_iu.to_base_factor
        FROM public.production_recipes pr
        JOIN public.ingredients ing ON ing.id = pr.ingredient_id
        LEFT JOIN public.units entry_u ON entry_u.id = pr.entry_unit_id
        LEFT JOIN public.ingredient_units entry_iu
          ON entry_iu.tenant_id = v_tenant
         AND entry_iu.ingredient_id = pr.ingredient_id
         AND entry_iu.unit_id = pr.entry_unit_id
         AND entry_iu.is_active = TRUE
        LEFT JOIN public.ingredient_units base_iu
          ON base_iu.tenant_id = v_tenant
         AND base_iu.ingredient_id = pr.ingredient_id
         AND base_iu.is_base = TRUE
         AND base_iu.is_active = TRUE
        LEFT JOIN public.units base_u ON base_u.id = base_iu.unit_id
        LEFT JOIN public.stock_levels sl
          ON sl.tenant_id = v_tenant
         AND sl.branch_id = p_branch_id
         AND sl.location_id = v_location_id
         AND sl.ingredient_id = pr.ingredient_id
        WHERE pr.tenant_id = v_tenant
          AND pr.finished_good_id = p_finished_good_id
    ),
    calculated AS (
        SELECT
            *,
            CASE
                WHEN entry_unit_id IS NOT NULL
                    THEN ((1.0 * recipe_quantity) / yield_factor) * COALESCE(to_base_factor, 1.0)
                ELSE ((1.0 * recipe_quantity) / yield_factor)
            END AS required_base_per_fg,
            CASE
                WHEN entry_unit_id IS NOT NULL
                    THEN current_quantity_base / COALESCE(to_base_factor, 1.0)
                ELSE current_quantity_base
            END AS max_ingredient_qty
        FROM base
    )
    SELECT COALESCE(jsonb_agg(to_jsonb(calculated)), '[]'::jsonb)
    INTO v_res
    FROM calculated;

    RETURN v_res;
END;
$$;
