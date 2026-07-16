-- Remove legacy unit fields from confirm_production_run
CREATE OR REPLACE FUNCTION public.confirm_production_run(p_run_id bigint, p_actual_quantity numeric DEFAULT NULL, p_actual_ingredients jsonb DEFAULT NULL) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
    v_uid UUID := auth.uid();
    v_tenant BIGINT := public.auth_tenant_id();
    v_run RECORD; v_recipe RECORD;
    v_raw_need_measure NUMERIC(15,3); v_raw_need_purchase NUMERIC(15,3);
    v_output_cost NUMERIC(15,2);
    v_old_q NUMERIC(15,3); v_old_wac NUMERIC(15,2);
    v_new_q NUMERIC(15,3); v_new_wac NUMERIC(15,2);
    v_need_map JSONB := '{}'::JSONB; v_cost_map JSONB := '{}'::JSONB;
    v_key TEXT; v_need_qty NUMERIC(15,3); v_cost_total NUMERIC(15,2); v_has_recipe BOOLEAN;
    v_source_location_id BIGINT;
    v_target_location_id BIGINT;
    v_shortages JSONB := '[]'::JSONB;
    v_out_base NUMERIC(15,3); v_batch_cost NUMERIC(15,2); v_out_unit_cost NUMERIC(15,2);
    v_actual_quantity NUMERIC(15,3);
    v_actual_usage NUMERIC(15,3);
    v_effective_ingredients jsonb;
BEGIN
    IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000'; END IF;
    IF NOT public.is_inventory_production_operator() THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
    IF NOT public.has_permission_any('inventory:production_confirm') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;

    SELECT pr.*, b.branch_kind INTO v_run
    FROM public.production_runs pr JOIN public.branches b ON b.id = pr.branch_id
    WHERE pr.id = p_run_id AND pr.tenant_id = v_tenant FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'production_run_not_found' USING ERRCODE = 'P0002'; END IF;
    IF v_run.status NOT IN ('draft', 'in_progress') THEN RAISE EXCEPTION 'production_run_not_draft' USING ERRCODE = '22023'; END IF;
    
    IF NOT public.has_permission(v_run.branch_id, 'inventory:production_confirm') THEN
        RAISE EXCEPTION 'branch_scope_violation' USING ERRCODE = '42501';
    END IF;

    -- Source Location (for raw materials)
    SELECT il.id INTO v_source_location_id
    FROM public.inventory_locations il
    WHERE il.branch_id = v_run.branch_id AND il.tenant_id = v_tenant AND il.is_default_receive = TRUE AND il.is_active = TRUE
    LIMIT 1;
    IF v_source_location_id IS NULL THEN RAISE EXCEPTION 'production_location_missing:%', v_run.branch_id USING ERRCODE = 'P0002'; END IF;

    -- Target Location (for finished goods)
    SELECT il.id INTO v_target_location_id
    FROM public.inventory_locations il
    WHERE il.branch_id = v_run.target_branch_id AND il.tenant_id = v_tenant AND il.is_default_receive = TRUE AND il.is_active = TRUE
    LIMIT 1;
    IF v_target_location_id IS NULL THEN RAISE EXCEPTION 'production_location_missing:%', v_run.target_branch_id USING ERRCODE = 'P0002'; END IF;

    v_actual_quantity := COALESCE(p_actual_quantity, v_run.planned_quantity);
    
    -- Prefer p_actual_ingredients, fallback to v_run.ingredients_override
    v_effective_ingredients := COALESCE(p_actual_ingredients, v_run.ingredients_override);

    v_output_cost := 0; v_has_recipe := FALSE;
    FOR v_recipe IN
        SELECT pr.ingredient_id, pr.quantity, pr.yield_factor, pr.entry_unit_id,
               COALESCE(sl.avg_unit_cost, ing.unit_cost, 0) AS raw_unit_cost
        FROM public.production_recipes pr
        JOIN public.ingredients ing ON ing.id = pr.ingredient_id
        LEFT JOIN public.stock_levels sl ON sl.tenant_id = v_tenant AND sl.branch_id = v_run.branch_id AND sl.location_id = v_source_location_id AND sl.ingredient_id = pr.ingredient_id
        WHERE pr.tenant_id = v_tenant AND pr.finished_good_id = v_run.finished_good_id
    LOOP
        v_has_recipe := TRUE;
        
        -- Default to consumption based on planned_quantity
        v_raw_need_measure := (v_run.planned_quantity * v_recipe.quantity) / COALESCE(v_recipe.yield_factor, 1.0);
        
        -- Override if provided in v_effective_ingredients
        IF v_effective_ingredients IS NOT NULL THEN
            v_actual_usage := NULL;
            SELECT (elem->>'actual_quantity')::NUMERIC(15,3) INTO v_actual_usage
            FROM jsonb_array_elements(v_effective_ingredients) elem
            WHERE (elem->>'ingredient_id')::BIGINT = v_recipe.ingredient_id;
            
            IF v_actual_usage IS NOT NULL THEN
                v_raw_need_measure := v_actual_usage;
            END IF;
        END IF;

        IF v_recipe.entry_unit_id IS NOT NULL THEN
            v_raw_need_purchase := ROUND(public.inv_to_base(v_recipe.ingredient_id, v_recipe.entry_unit_id, v_raw_need_measure), 3);
        ELSE
            -- In phase C, if entry_unit_id is somehow NULL, assume it is already the base unit
            v_raw_need_purchase := ROUND(v_raw_need_measure, 3);
        END IF;
        
        v_key := v_recipe.ingredient_id::text;
        v_need_map := jsonb_set(v_need_map, ARRAY[v_key], to_jsonb(COALESCE((v_need_map ->> v_key)::numeric, 0) + v_raw_need_purchase), TRUE);
        v_output_cost := v_output_cost + (v_raw_need_purchase * COALESCE(v_recipe.raw_unit_cost, 0));
    END LOOP;

    IF NOT v_has_recipe THEN RAISE EXCEPTION 'production_recipe_missing' USING ERRCODE = 'P0001'; END IF;

    WITH shortages AS (
        SELECT (need.ingredient_id)::BIGINT AS ingredient_id, ing.name AS ingredient_name,
               (
                   SELECT u.name 
                   FROM public.ingredient_units iu 
                   JOIN public.units u ON u.id = iu.unit_id 
                   WHERE iu.ingredient_id = ing.id AND iu.is_base = true 
                   LIMIT 1
               ) AS unit,
               ROUND((need.need_qty)::NUMERIC, 3) AS needed,
               ROUND(COALESCE(sl.current_quantity, 0)::NUMERIC, 3) AS on_hand
        FROM jsonb_each_text(v_need_map) AS need(ingredient_id, need_qty)
        JOIN public.ingredients ing ON ing.id = (need.ingredient_id)::BIGINT
        LEFT JOIN public.stock_levels sl ON sl.tenant_id = v_tenant AND sl.branch_id = v_run.branch_id AND sl.location_id = v_source_location_id AND sl.ingredient_id = (need.ingredient_id)::BIGINT
        WHERE COALESCE(sl.current_quantity, 0) < (need.need_qty)::NUMERIC
    )
    SELECT COALESCE(jsonb_agg(to_jsonb(s)), '[]'::JSONB) INTO v_shortages FROM shortages s;

    IF jsonb_array_length(v_shortages) > 0 THEN
        RAISE EXCEPTION 'insufficient_stock_for_production' USING ERRCODE = 'P0001', DETAIL = v_shortages::TEXT;
    END IF;

    -- Output Cost Calculation
    v_cost_total := v_output_cost;
    
    FOR v_key, v_need_qty IN SELECT key, value::NUMERIC(15,3) FROM jsonb_each_text(v_need_map) LOOP
        SELECT sl.current_quantity, sl.avg_unit_cost INTO v_old_q, v_old_wac
        FROM public.stock_levels sl
        WHERE sl.tenant_id = v_tenant AND sl.branch_id = v_run.branch_id AND sl.location_id = v_source_location_id AND sl.ingredient_id = v_key::BIGINT;
        IF NOT FOUND THEN v_old_q := 0; v_old_wac := 0; END IF;

        INSERT INTO public.stock_movements (
            tenant_id, branch_id, ingredient_id, type, quantity_change,
            reason, created_by, production_run_id, unit_cost, location_id
        ) VALUES (
            v_tenant, v_run.branch_id, v_key::BIGINT, 'production_consumption', -v_need_qty,
            'Production ' || v_run.production_number, v_uid, p_run_id, COALESCE(v_old_wac, 0), v_source_location_id
        );
    END LOOP;

    -- Output Finished Good to TARGET branch
    IF v_run.entry_unit_id IS NOT NULL THEN
        v_out_base := public.inv_to_base(v_run.finished_good_id, v_run.entry_unit_id, v_actual_quantity);
    ELSE
        v_out_base := v_actual_quantity;
    END IF;

    v_out_unit_cost := CASE WHEN v_out_base <> 0 THEN ROUND(v_cost_total / v_out_base, 2) ELSE 0 END;

    SELECT sl.current_quantity, sl.avg_unit_cost INTO v_old_q, v_old_wac
    FROM public.stock_levels sl
    WHERE sl.tenant_id = v_tenant AND sl.branch_id = v_run.target_branch_id AND sl.location_id = v_target_location_id AND sl.ingredient_id = v_run.finished_good_id;
    IF NOT FOUND THEN v_old_q := 0; v_old_wac := 0; END IF;

    INSERT INTO public.stock_movements (
        tenant_id, branch_id, ingredient_id, type, quantity_change,
        reason, created_by, production_run_id, unit_cost, location_id,
        entry_unit_id, entry_quantity
    ) VALUES (
        v_tenant, v_run.target_branch_id, v_run.finished_good_id, 'production_output', v_out_base,
        'Production ' || v_run.production_number, v_uid, p_run_id, v_out_unit_cost, v_target_location_id,
        v_run.entry_unit_id, v_actual_quantity
    );

    v_new_q := COALESCE(v_old_q, 0) + v_out_base;
    v_new_wac := CASE WHEN v_new_q > 0 THEN (COALESCE(v_old_q, 0) * COALESCE(v_old_wac, 0) + v_cost_total) / v_new_q ELSE v_out_unit_cost END;

    UPDATE public.stock_levels sl SET avg_unit_cost = v_new_wac, updated_at = now()
    WHERE sl.tenant_id = v_tenant AND sl.branch_id = v_run.target_branch_id AND sl.location_id = v_target_location_id AND sl.ingredient_id = v_run.finished_good_id;
    
    UPDATE public.ingredients SET unit_cost = v_out_unit_cost, updated_at = now()
    WHERE id = v_run.finished_good_id AND tenant_id = v_tenant;

    UPDATE public.production_runs SET status = 'completed', actual_quantity = v_actual_quantity, completed_at = now(), updated_at = now()
    WHERE id = p_run_id AND tenant_id = v_tenant;

    RETURN jsonb_build_object('production_run_id', p_run_id, 'status', 'completed');
END;
$$;
