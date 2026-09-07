-- Correct posted count entry mistakes without replacing current physical stock.

CREATE TABLE private.count_slip_corrections (
  idempotency_key uuid PRIMARY KEY,
  tenant_id bigint NOT NULL REFERENCES public.tenants(id),
  line_id bigint NOT NULL REFERENCES public.inventory_count_slip_lines(id),
  source_movement_id bigint NOT NULL REFERENCES public.stock_movements(id),
  branch_id bigint NOT NULL REFERENCES public.branches(id),
  location_id bigint NOT NULL REFERENCES public.inventory_locations(id),
  ingredient_id bigint NOT NULL REFERENCES public.ingredients(id),
  old_quantity numeric NOT NULL,
  old_unit_id bigint,
  old_factor numeric NOT NULL,
  old_base_quantity numeric NOT NULL,
  new_quantity numeric NOT NULL,
  new_unit_id bigint NOT NULL REFERENCES public.units(id),
  new_factor numeric NOT NULL,
  new_base_quantity numeric NOT NULL,
  quantity_delta numeric NOT NULL,
  stock_before numeric NOT NULL,
  stock_after numeric NOT NULL,
  reason text NOT NULL,
  created_by uuid NOT NULL REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, source_movement_id),
  CHECK (new_base_quantity - old_base_quantity = quantity_delta),
  CHECK (stock_after - stock_before = quantity_delta)
);
REVOKE ALL ON private.count_slip_corrections FROM PUBLIC, anon, authenticated, service_role;

-- Route only audited count corrections through reconciliation. Ordinary stock
-- posting remains unchanged, and corrections never become POS cost or waste.
DO $migration$
DECLARE
  v_definition text := pg_get_functiondef('private.post_stock_movement_valuation()'::regprocedure);
  v_anchor text := '  IF COALESCE(NEW.quantity_change, 0) = 0 THEN';
  v_route text := $route$
  IF NEW.type = 'adjustment' AND EXISTS (
    SELECT 1 FROM private.count_slip_corrections AS correction
    WHERE correction.idempotency_key = NEW.correction_idempotency_key
      AND correction.tenant_id = NEW.tenant_id
      AND correction.branch_id = NEW.branch_id
      AND correction.location_id = NEW.location_id
      AND correction.ingredient_id = NEW.ingredient_id
      AND correction.quantity_delta = NEW.quantity_change
  ) THEN
    PERFORM private.reconcile_inventory_valuation_account_to_stock(
      NEW.tenant_id, NEW.branch_id, NEW.location_id, NEW.ingredient_id,
      NEW.created_at, NEW.id,
      'count-entry-correction:' || NEW.correction_idempotency_key::text,
      NEW.created_by
    );
    IF v_mode = 'active' THEN
      PERFORM private.project_company_wac(NEW.tenant_id, NEW.ingredient_id);
    END IF;
    RETURN NEW;
  END IF;

$route$;
BEGIN
  IF (length(v_definition) - length(replace(v_definition, v_anchor, '')))
      / length(v_anchor) <> 1 THEN
    RAISE EXCEPTION 'count_correction_posting_anchor_changed';
  END IF;
  EXECUTE replace(v_definition, v_anchor, v_route || v_anchor);
END;
$migration$;

CREATE FUNCTION private.correct_posted_count_line(
  p_line_id bigint, p_source_movement_id bigint, p_expected_base_quantity numeric,
  p_quantity numeric, p_unit_id bigint, p_reason text, p_idempotency_key uuid,
  p_actor uuid
) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_line public.inventory_count_slip_lines%ROWTYPE;
  v_slip public.inventory_count_slips%ROWTYPE;
  v_source public.stock_movements%ROWTYPE;
  v_prior private.count_slip_corrections%ROWTYPE;
  v_stock public.stock_levels%ROWTYPE;
  v_factor numeric;
  v_new_base numeric;
  v_delta numeric;
  v_base_unit bigint;
  v_movement_id bigint;
  v_after numeric;
  v_count integer;
BEGIN
  IF p_actor IS NULL OR p_line_id IS NULL OR p_source_movement_id IS NULL OR p_unit_id IS NULL
     OR p_idempotency_key IS NULL OR p_expected_base_quantity IS NULL
     OR p_quantity IS NULL OR p_quantity < 0
     OR p_quantity IN ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)
     OR p_quantity <> round(p_quantity, 3)
     OR length(btrim(coalesce(p_reason, ''))) NOT BETWEEN 10 AND 500 THEN
    RAISE EXCEPTION 'count_correction_invalid' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO STRICT v_line FROM public.inventory_count_slip_lines
    WHERE id = p_line_id FOR UPDATE;
  SELECT * INTO STRICT v_slip FROM public.inventory_count_slips
    WHERE id = v_line.slip_id AND tenant_id = v_line.tenant_id FOR UPDATE;
  SELECT * INTO STRICT v_source FROM public.stock_movements
    WHERE id = p_source_movement_id AND tenant_id = v_line.tenant_id;
  IF NOT EXISTS (SELECT 1 FROM public.profiles
      WHERE id = p_actor AND tenant_id = v_line.tenant_id AND is_active) THEN
    RAISE EXCEPTION 'count_correction_actor_invalid' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_prior FROM private.count_slip_corrections
    WHERE idempotency_key = p_idempotency_key;
  IF FOUND THEN
    IF v_prior.line_id <> p_line_id OR v_prior.source_movement_id <> p_source_movement_id
       OR v_prior.new_quantity <> p_quantity OR v_prior.new_unit_id <> p_unit_id
       OR v_prior.old_base_quantity <> p_expected_base_quantity
       OR v_prior.reason <> btrim(p_reason) THEN
      RAISE EXCEPTION 'count_correction_retry_mismatch' USING ERRCODE = '23514';
    END IF;
    SELECT id INTO STRICT v_movement_id FROM public.stock_movements
      WHERE tenant_id = v_prior.tenant_id AND correction_idempotency_key = p_idempotency_key;
    RETURN v_movement_id;
  END IF;

  IF v_slip.status <> 'approved'
     OR v_line.counted_base_quantity IS DISTINCT FROM p_expected_base_quantity
     OR v_line.entry_to_base_factor IS NULL
     OR v_source.type <> 'count_adjustment' OR v_source.quantity_change <= 0
     OR v_source.branch_id <> v_slip.branch_id
     OR v_source.location_id IS DISTINCT FROM v_slip.location_id
     OR v_source.ingredient_id <> v_line.ingredient_id
     OR v_source.quantity_change <> v_line.counted_base_quantity - v_line.system_quantity
     OR v_source.reason IS NULL
     OR v_source.reason NOT LIKE 'Điều chỉnh tồn dương phiếu đếm #' || v_slip.slip_number || ' (%)' THEN
    RAISE EXCEPTION 'count_correction_source_mismatch' USING ERRCODE = '23514';
  END IF;

  SELECT count(*), min(iu.to_base_factor) INTO v_count, v_factor
    FROM public.ingredient_units iu JOIN public.units u ON u.id = iu.unit_id
    WHERE iu.tenant_id = v_line.tenant_id AND iu.ingredient_id = v_line.ingredient_id
      AND iu.unit_id = p_unit_id AND iu.is_active AND u.is_active;
  IF v_count <> 1 OR v_factor IS NULL OR v_factor <= 0
     OR v_factor IN ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric) THEN
    RAISE EXCEPTION 'count_correction_unit_invalid' USING ERRCODE = '23514';
  END IF;
  SELECT count(*), min(unit_id) INTO v_count, v_base_unit FROM public.ingredient_units
    WHERE tenant_id = v_line.tenant_id AND ingredient_id = v_line.ingredient_id
      AND is_base AND is_active;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'count_correction_base_unit_ambiguous' USING ERRCODE = '23514';
  END IF;
  IF v_source.entry_unit_id IS DISTINCT FROM v_base_unit
     OR v_source.entry_to_base_factor IS DISTINCT FROM 1::numeric THEN
    RAISE EXCEPTION 'count_correction_base_unit_changed' USING ERRCODE = '23514';
  END IF;

  v_new_base := round(p_quantity * v_factor, 3);
  v_delta := v_new_base - v_line.counted_base_quantity;
  IF v_delta = 0 THEN
    RAISE EXCEPTION 'count_correction_quantity_unchanged' USING ERRCODE = '22023';
  END IF;

  -- Use the valuation lock before taking the physical stock row lock.
  PERFORM private.lock_inventory_valuation_pool(
    v_line.tenant_id, v_slip.branch_id, v_slip.location_id, v_line.ingredient_id
  );
  SELECT * INTO STRICT v_stock FROM public.stock_levels
    WHERE tenant_id = v_line.tenant_id AND branch_id = v_slip.branch_id
      AND location_id = v_slip.location_id AND ingredient_id = v_line.ingredient_id
    FOR UPDATE;

  INSERT INTO private.count_slip_corrections (
    idempotency_key, tenant_id, line_id, source_movement_id, branch_id, location_id,
    ingredient_id, old_quantity, old_unit_id, old_factor, old_base_quantity,
    new_quantity, new_unit_id, new_factor, new_base_quantity, quantity_delta,
    stock_before, stock_after, reason, created_by
  ) VALUES (
    p_idempotency_key, v_line.tenant_id, v_line.id, v_source.id,
    v_slip.branch_id, v_slip.location_id, v_line.ingredient_id,
    v_line.counted_quantity, v_line.entry_unit_id, v_line.entry_to_base_factor,
    v_line.counted_base_quantity, p_quantity, p_unit_id, v_factor, v_new_base, v_delta,
    v_stock.current_quantity, v_stock.current_quantity + v_delta, btrim(p_reason), p_actor
  );

  INSERT INTO public.stock_movements (
    tenant_id, branch_id, location_id, ingredient_id, type, quantity_change,
    entry_unit_id, entry_quantity, unit_cost, reason, created_by, correction_idempotency_key
  ) VALUES (
    v_line.tenant_id, v_slip.branch_id, v_slip.location_id, v_line.ingredient_id,
    'adjustment', v_delta, v_base_unit, abs(v_delta),
    coalesce(v_stock.avg_unit_cost, v_source.unit_cost),
    'Sửa đơn vị phiếu đếm #' || v_slip.slip_number || ': ' || btrim(p_reason),
    p_actor, p_idempotency_key
  ) RETURNING id INTO v_movement_id;

  UPDATE public.inventory_count_slip_lines SET counted_quantity = p_quantity,
    entry_unit_id = p_unit_id, entry_to_base_factor = v_factor, counted_base_quantity = v_new_base
    WHERE id = v_line.id AND tenant_id = v_line.tenant_id;

  SELECT current_quantity INTO STRICT v_after FROM public.stock_levels WHERE id = v_stock.id;
  IF v_after IS DISTINCT FROM v_stock.current_quantity + v_delta THEN
    RAISE EXCEPTION 'count_correction_stock_mismatch' USING ERRCODE = '23514';
  END IF;
  IF EXISTS (SELECT 1 FROM public.inventory_valuation_cutovers
      WHERE tenant_id = v_line.tenant_id AND status = 'active')
     AND NOT EXISTS (
       SELECT 1 FROM public.inventory_valuation_accounts a
       WHERE a.tenant_id = v_line.tenant_id AND a.branch_id = v_slip.branch_id
         AND a.location_id = v_slip.location_id AND a.ingredient_id = v_line.ingredient_id
         AND a.quantity = greatest(v_after, 0)
         AND a.quantity = (SELECT coalesce(sum(b.quantity),0) FROM public.inventory_origin_balances b
           WHERE b.valuation_account_id = a.id AND b.holder_kind = 'stock_pool')
         AND a.book_value = (SELECT coalesce(sum(b.book_value),0) FROM public.inventory_origin_balances b
           WHERE b.valuation_account_id = a.id AND b.holder_kind = 'stock_pool')
     ) THEN
    RAISE EXCEPTION 'count_correction_valuation_mismatch' USING ERRCODE = '23514';
  END IF;
  RETURN v_movement_id;
END;
$$;
REVOKE ALL ON FUNCTION private.correct_posted_count_line(bigint,bigint,numeric,numeric,bigint,text,uuid,uuid)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.correct_posted_count_lines(p_corrections jsonb, p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_tenant bigint := public.auth_tenant_id();
  v_item jsonb;
  v_branch bigint;
  v_result jsonb := '[]'::jsonb;
  v_movement bigint;
BEGIN
  IF v_actor IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;
  IF jsonb_typeof(p_corrections) IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_corrections) NOT BETWEEN 1 AND 50 THEN
    RAISE EXCEPTION 'count_correction_payload_invalid' USING ERRCODE = '22023';
  END IF;
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_corrections)
    ORDER BY (value ->> 'line_id')::bigint
  LOOP
    SELECT s.branch_id INTO v_branch FROM public.inventory_count_slip_lines l
      JOIN public.inventory_count_slips s ON s.id = l.slip_id AND s.tenant_id = l.tenant_id
      WHERE l.id = (v_item ->> 'line_id')::bigint AND l.tenant_id = v_tenant;
    IF v_branch IS NULL OR NOT public.has_permission(v_branch, 'inventory:adjust_approve') THEN
      RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
    END IF;
    v_movement := private.correct_posted_count_line(
      (v_item ->> 'line_id')::bigint, (v_item ->> 'source_movement_id')::bigint,
      (v_item ->> 'expected_base_quantity')::numeric, (v_item ->> 'quantity')::numeric,
      (v_item ->> 'unit_id')::bigint, p_reason, (v_item ->> 'idempotency_key')::uuid, v_actor
    );
    v_result := v_result || jsonb_build_array(v_movement);
  END LOOP;
  RETURN jsonb_build_object('movement_ids', v_result);
END;
$$;
REVOKE ALL ON FUNCTION public.correct_posted_count_lines(jsonb,text) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.correct_posted_count_lines(jsonb,text) TO authenticated;
