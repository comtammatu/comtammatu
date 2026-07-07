-- Create production_runs table mapping to 1-to-1 recipe model
CREATE TABLE public.production_runs (
    id bigint generated always as identity primary key,
    tenant_id bigint not null references public.tenants(id) on delete cascade,
    production_number text not null,
    branch_id bigint not null references public.branches(id) on delete restrict,
    finished_good_id bigint not null references public.ingredients(id) on delete restrict,
    planned_quantity numeric(15,3) not null check (planned_quantity > 0),
    actual_quantity numeric(15,3) check (actual_quantity is null or actual_quantity >= 0),
    entry_unit_id bigint references public.units(id) on delete restrict,
    status text not null default 'draft' check (status = any (array['draft', 'in_progress', 'completed', 'cancelled'])),
    notes text,
    created_by uuid references public.profiles(id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    started_at timestamptz,
    completed_at timestamptz,
    unique (tenant_id, production_number)
);

CREATE INDEX idx_production_runs_tenant_branch_status ON public.production_runs(tenant_id, branch_id, status);
CREATE INDEX idx_production_runs_status ON public.production_runs(status);

-- Updated_at trigger
CREATE TRIGGER trg_production_runs_updated_at BEFORE UPDATE ON public.production_runs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- RLS
ALTER TABLE public.production_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY production_runs_select ON public.production_runs FOR SELECT TO authenticated USING (tenant_id = public.auth_tenant_id());
CREATE POLICY production_runs_write ON public.production_runs TO authenticated USING (
    tenant_id = public.auth_tenant_id()
    AND public.is_inventory_production_operator()
    AND (public.has_permission(branch_id, 'inventory:production_create') OR public.has_permission(branch_id, 'inventory:production_confirm'))
);

-- Update stock_movements
ALTER TABLE public.stock_movements ADD COLUMN production_run_id bigint references public.production_runs(id) on delete set null;

-- RPC: create_production_run
CREATE OR REPLACE FUNCTION public.create_production_run(
    p_branch_id bigint,
    p_finished_good_id bigint,
    p_planned_quantity numeric,
    p_entry_unit_id bigint,
    p_notes text DEFAULT NULL
) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
    v_uid UUID := auth.uid();
    v_tenant BIGINT := public.auth_tenant_id();
    v_new_id BIGINT;
    v_number TEXT;
BEGIN
    IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000'; END IF;
    IF NOT public.is_inventory_production_operator() THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
    IF NOT public.has_permission(p_branch_id, 'inventory:production_create') THEN
        RAISE EXCEPTION 'branch_scope_violation' USING ERRCODE = '42501';
    END IF;

    -- Generate sequence number
    v_number := 'LSX' || to_char(now() AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYMMDD') || '-' ||
        lpad((COALESCE((
            SELECT count(*) + 1 FROM public.production_runs
            WHERE tenant_id = v_tenant AND (created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date = (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
        ), 1))::text, 3, '0');

    INSERT INTO public.production_runs (
        tenant_id, production_number, branch_id, finished_good_id,
        planned_quantity, entry_unit_id, notes, created_by, status
    ) VALUES (
        v_tenant, v_number, p_branch_id, p_finished_good_id,
        p_planned_quantity, p_entry_unit_id, p_notes, v_uid, 'draft'
    ) RETURNING id INTO v_new_id;

    RETURN jsonb_build_object('production_run_id', v_new_id, 'production_number', v_number);
END;
$$;

-- RPC: confirm_production_run
CREATE OR REPLACE FUNCTION public.confirm_production_run(p_run_id bigint, p_actual_quantity numeric DEFAULT NULL) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
    v_uid UUID := auth.uid();
    v_tenant BIGINT := public.auth_tenant_id();
    v_run RECORD; v_recipe RECORD;
    v_raw_need_measure NUMERIC(15,3); v_raw_need_purchase NUMERIC(15,3);
    v_conversion_factor NUMERIC(18,6); v_output_cost NUMERIC(15,2);
    v_old_q NUMERIC(15,3); v_old_wac NUMERIC(15,2);
    v_new_q NUMERIC(15,3); v_new_wac NUMERIC(15,2);
    v_need_map JSONB := '{}'::JSONB; v_cost_map JSONB := '{}'::JSONB;
    v_key TEXT; v_need_qty NUMERIC(15,3); v_cost_total NUMERIC(15,2); v_has_recipe BOOLEAN;
    v_location_id BIGINT;
    v_shortages JSONB := '[]'::JSONB;
    v_out_base NUMERIC(15,3); v_batch_cost NUMERIC(15,2); v_out_unit_cost NUMERIC(15,2);
    v_actual_quantity NUMERIC(15,3);
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

    SELECT il.id INTO v_location_id
    FROM public.inventory_locations il
    WHERE il.branch_id = v_run.branch_id AND il.tenant_id = v_tenant AND il.is_default_receive = TRUE AND il.is_active = TRUE
    LIMIT 1;

    IF v_location_id IS NULL THEN RAISE EXCEPTION 'production_location_missing:%', v_run.branch_id USING ERRCODE = 'P0002'; END IF;

    v_actual_quantity := COALESCE(p_actual_quantity, v_run.planned_quantity);

    v_output_cost := 0; v_has_recipe := FALSE;
    FOR v_recipe IN
        SELECT pr.ingredient_id, pr.quantity, pr.yield_factor, pr.entry_unit_id,
               ing.purchase_to_measure_factor,
               COALESCE(sl.avg_unit_cost, ing.unit_cost, 0) AS raw_unit_cost
        FROM public.production_recipes pr
        JOIN public.ingredients ing ON ing.id = pr.ingredient_id
        LEFT JOIN public.stock_levels sl ON sl.tenant_id = v_tenant AND sl.branch_id = v_run.branch_id AND sl.location_id = v_location_id AND sl.ingredient_id = pr.ingredient_id
        WHERE pr.tenant_id = v_tenant AND pr.finished_good_id = v_run.finished_good_id
    LOOP
        v_has_recipe := TRUE;
        -- Consumption is based on planned_quantity, not actual_quantity, consistent with old behavior
        v_raw_need_measure := (v_run.planned_quantity * v_recipe.quantity) / COALESCE(v_recipe.yield_factor, 1.0);
        IF v_recipe.entry_unit_id IS NOT NULL THEN
            v_raw_need_purchase := ROUND(public.inv_to_base(v_recipe.ingredient_id, v_recipe.entry_unit_id, v_raw_need_measure), 3);
        ELSE
            v_conversion_factor := COALESCE(v_recipe.purchase_to_measure_factor, 1);
            v_raw_need_purchase := ROUND((v_raw_need_measure / v_conversion_factor)::NUMERIC, 3);
        END IF;
        
        v_key := v_recipe.ingredient_id::text;
        v_need_map := jsonb_set(v_need_map, ARRAY[v_key], to_jsonb(COALESCE((v_need_map ->> v_key)::numeric, 0) + v_raw_need_purchase), TRUE);
        v_output_cost := v_output_cost + (v_raw_need_purchase * COALESCE(v_recipe.raw_unit_cost, 0));
    END LOOP;

    IF NOT v_has_recipe THEN RAISE EXCEPTION 'production_recipe_missing' USING ERRCODE = 'P0001'; END IF;

    WITH shortages AS (
        SELECT (need.ingredient_id)::BIGINT AS ingredient_id, ing.name AS ingredient_name,
               COALESCE(ing.purchase_unit, ing.unit) AS unit,
               ROUND((need.need_qty)::NUMERIC, 3) AS needed,
               ROUND(COALESCE(sl.current_quantity, 0)::NUMERIC, 3) AS on_hand
        FROM jsonb_each_text(v_need_map) AS need(ingredient_id, need_qty)
        JOIN public.ingredients ing ON ing.id = (need.ingredient_id)::BIGINT
        LEFT JOIN public.stock_levels sl ON sl.tenant_id = v_tenant AND sl.branch_id = v_run.branch_id AND sl.location_id = v_location_id AND sl.ingredient_id = (need.ingredient_id)::BIGINT
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
        WHERE sl.tenant_id = v_tenant AND sl.branch_id = v_run.branch_id AND sl.location_id = v_location_id AND sl.ingredient_id = v_key::BIGINT;
        IF NOT FOUND THEN v_old_q := 0; v_old_wac := 0; END IF;

        INSERT INTO public.stock_movements (
            tenant_id, branch_id, ingredient_id, type, quantity_change,
            reason, created_by, production_run_id, unit_cost, location_id
        ) VALUES (
            v_tenant, v_run.branch_id, v_key::BIGINT, 'production_consumption', -v_need_qty,
            'Production ' || v_run.production_number, v_uid, p_run_id, COALESCE(v_old_wac, 0), v_location_id
        );
    END LOOP;

    -- Output Finished Good
    v_out_base := public.inv_to_base(v_run.finished_good_id, v_run.entry_unit_id, v_actual_quantity);
    v_out_unit_cost := CASE WHEN v_out_base <> 0 THEN ROUND(v_cost_total / v_out_base, 2) ELSE 0 END;

    SELECT sl.current_quantity, sl.avg_unit_cost INTO v_old_q, v_old_wac
    FROM public.stock_levels sl
    WHERE sl.tenant_id = v_tenant AND sl.branch_id = v_run.branch_id AND sl.location_id = v_location_id AND sl.ingredient_id = v_run.finished_good_id;
    IF NOT FOUND THEN v_old_q := 0; v_old_wac := 0; END IF;

    INSERT INTO public.stock_movements (
        tenant_id, branch_id, ingredient_id, type, quantity_change,
        reason, created_by, production_run_id, unit_cost, location_id,
        entry_unit_id, entry_quantity
    ) VALUES (
        v_tenant, v_run.branch_id, v_run.finished_good_id, 'production_output', v_out_base,
        'Production ' || v_run.production_number, v_uid, p_run_id, v_out_unit_cost, v_location_id,
        v_run.entry_unit_id, v_actual_quantity
    );

    v_new_q := COALESCE(v_old_q, 0) + v_out_base;
    v_new_wac := CASE WHEN v_new_q > 0 THEN (COALESCE(v_old_q, 0) * COALESCE(v_old_wac, 0) + v_cost_total) / v_new_q ELSE v_out_unit_cost END;

    UPDATE public.stock_levels sl SET avg_unit_cost = v_new_wac, updated_at = now()
    WHERE sl.tenant_id = v_tenant AND sl.branch_id = v_run.branch_id AND sl.location_id = v_location_id AND sl.ingredient_id = v_run.finished_good_id;
    
    UPDATE public.ingredients SET unit_cost = v_out_unit_cost, updated_at = now()
    WHERE id = v_run.finished_good_id AND tenant_id = v_tenant;

    UPDATE public.production_runs SET status = 'completed', actual_quantity = v_actual_quantity, completed_at = now(), updated_at = now()
    WHERE id = p_run_id AND tenant_id = v_tenant;

    RETURN jsonb_build_object('production_run_id', p_run_id, 'status', 'completed');
END;
$$;

-- RPC: cancel_production_run
CREATE OR REPLACE FUNCTION public.cancel_production_run(p_run_id bigint) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
    v_tenant BIGINT := public.auth_tenant_id();
    v_run RECORD;
BEGIN
    SELECT * INTO v_run FROM public.production_runs
    WHERE id = p_run_id AND tenant_id = v_tenant FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'production_run_not_found'; END IF;
    
    IF v_run.status <> 'draft' AND v_run.status <> 'in_progress' THEN
        RAISE EXCEPTION 'production_run_not_cancellable';
    END IF;

    UPDATE public.production_runs SET status = 'cancelled', updated_at = now()
    WHERE id = p_run_id;

    RETURN jsonb_build_object('production_run_id', p_run_id, 'status', 'cancelled');
END;
$$;

-- RPC: start_production_run (to support "in_progress" state from matu-platform)
CREATE OR REPLACE FUNCTION public.start_production_run(p_run_id bigint) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
    v_tenant BIGINT := public.auth_tenant_id();
    v_run RECORD;
BEGIN
    SELECT * INTO v_run FROM public.production_runs
    WHERE id = p_run_id AND tenant_id = v_tenant FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'production_run_not_found'; END IF;
    
    IF v_run.status <> 'draft' THEN
        RAISE EXCEPTION 'production_run_not_draft';
    END IF;

    UPDATE public.production_runs SET status = 'in_progress', started_at = now(), updated_at = now()
    WHERE id = p_run_id;

    RETURN jsonb_build_object('production_run_id', p_run_id, 'status', 'in_progress');
END;
$$;
