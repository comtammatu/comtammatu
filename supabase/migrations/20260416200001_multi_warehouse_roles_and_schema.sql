-- =============================================================
-- Multi-Warehouse Step 1: Rename headquarters → warehouse,
-- relax constraints, update triggers & RPCs for multi-warehouse.
-- =============================================================

-- ─── 1. Rename branch_kind 'headquarters' → 'warehouse' ───

ALTER TABLE public.branches
  DROP CONSTRAINT IF EXISTS branches_branch_kind_check;

UPDATE public.branches
SET branch_kind = 'warehouse'
WHERE branch_kind = 'headquarters';

ALTER TABLE public.branches
  ADD CONSTRAINT branches_branch_kind_check
  CHECK (branch_kind IN ('warehouse', 'branch', 'central_kitchen'));

-- ─── 2. Allow multiple central_kitchen branches ───

DROP INDEX IF EXISTS idx_one_active_central_kitchen_per_tenant;

-- ─── 3. Update sync trigger: warehouse ↔ is_headquarters ───

CREATE OR REPLACE FUNCTION public.sync_branch_kind_and_hq()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- is_headquarters is a backward-compat flag: true for ALL warehouse branches
  IF NEW.branch_kind = 'warehouse' THEN
    NEW.is_headquarters := true;
  ELSIF COALESCE(NEW.is_headquarters, false) = true THEN
    -- Legacy path: setting is_headquarters = true → treat as warehouse
    NEW.branch_kind := 'warehouse';
  ELSE
    NEW.is_headquarters := false;
  END IF;

  IF NEW.branch_kind IS NULL OR NEW.branch_kind = '' THEN
    NEW.branch_kind := 'branch';
  END IF;

  RETURN NEW;
END;
$$;

-- Trigger already exists, CREATE OR REPLACE above is sufficient

-- ─── 4. PO/GRN: allow warehouse + central_kitchen ───

CREATE OR REPLACE FUNCTION public.enforce_po_branch_is_headquarters()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.branches b
    WHERE b.id = NEW.branch_id
      AND b.tenant_id = NEW.tenant_id
      AND b.branch_kind IN ('warehouse', 'central_kitchen')
  ) THEN
    RAISE EXCEPTION 'branch must be warehouse or central_kitchen' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

-- Triggers trg_po_hq_only (purchase_orders) and trg_grn_hq_only (goods_received_notes)
-- already call this function — no need to recreate them.

-- ─── 5. Drop transfer direction enforcement (all directions open) ───

DROP TRIGGER IF EXISTS trg_transfer_hq_to_branch ON public.stock_transfers;
DROP FUNCTION IF EXISTS public.enforce_transfer_from_hq();

-- ─── 6. Drop from_branch ≠ to_branch CHECK (intra-branch transfers) ───

ALTER TABLE public.stock_transfers
  DROP CONSTRAINT IF EXISTS stock_transfers_from_branch_id_to_branch_id_check;
-- Supabase auto-names CHECK: stock_transfers_check
ALTER TABLE public.stock_transfers
  DROP CONSTRAINT IF EXISTS stock_transfers_check;

-- For intra-branch, we rely on app-level validation: same branch requires different locations.

-- ─── 7. Relax area_id constraint for new roles ───

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS chk_area_id_for_area_manager;

ALTER TABLE public.profiles
  ADD CONSTRAINT chk_area_id_scope CHECK (
    role IN ('area_manager', 'warehouse_manager', 'production_manager')
    OR area_id IS NULL
  );

-- ─── 8. admin_update_profile: support new roles + warehouse/CK assignment ───

CREATE OR REPLACE FUNCTION public.admin_update_profile(
  p_target_id UUID,
  p_full_name TEXT    DEFAULT NULL,
  p_phone     TEXT    DEFAULT NULL,
  p_role      TEXT    DEFAULT NULL,
  p_branch_id BIGINT  DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id     UUID;
  v_actor_role   TEXT;
  v_actor_tenant BIGINT;
  v_actor_branch BIGINT;
  v_actor_area   BIGINT;
  v_target       RECORD;
  v_final_role   TEXT;
  v_final_branch BIGINT;
  v_branch_kind  TEXT;
BEGIN
  v_actor_id     := auth.uid();
  v_actor_role   := public.auth_role();
  v_actor_tenant := public.auth_tenant_id();
  v_actor_branch := public.auth_branch_id();
  v_actor_area   := public.auth_area_id();

  IF p_role IS NOT NULL AND p_role NOT IN (
      'owner', 'super_manager', 'area_manager',
      'branch_manager', 'warehouse_manager', 'production_manager',
      'cashier', 'waiter', 'chef', 'office'
  ) THEN
    RAISE EXCEPTION 'invalid_role: %', p_role USING ERRCODE = '22023';
  END IF;

  SELECT id, role, branch_id, full_name, phone, tenant_id
    INTO v_target
    FROM public.profiles
    WHERE id = p_target_id AND tenant_id = v_actor_tenant;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'target profile not found in tenant';
  END IF;

  v_final_role   := COALESCE(p_role,      v_target.role::TEXT);
  v_final_branch := COALESCE(p_branch_id, v_target.branch_id);

  -- Operational floor roles need a branch
  IF v_final_role IN ('cashier', 'waiter', 'chef', 'branch_manager')
     AND v_final_branch IS NULL
  THEN
    RAISE EXCEPTION 'branch_required_for_operational_role' USING ERRCODE = 'P0001';
  END IF;

  -- warehouse_manager and production_manager also need a branch
  IF v_final_role IN ('warehouse_manager', 'production_manager')
     AND v_final_branch IS NULL
  THEN
    RAISE EXCEPTION 'branch_required_for_warehouse_or_production_role' USING ERRCODE = 'P0001';
  END IF;

  -- Validate role ↔ branch_kind compatibility
  IF v_final_branch IS NOT NULL THEN
    SELECT branch_kind INTO v_branch_kind
    FROM public.branches
    WHERE id = v_final_branch AND tenant_id = v_actor_tenant;

    -- POS/KDS floor roles cannot work at warehouse or central_kitchen
    IF v_final_role IN ('cashier', 'waiter', 'chef', 'branch_manager')
       AND v_branch_kind IN ('warehouse', 'central_kitchen')
    THEN
      RAISE EXCEPTION 'operational roles cannot be assigned to warehouse/central_kitchen branch'
        USING ERRCODE = 'P0001';
    END IF;

    -- warehouse_manager must be at a warehouse branch
    IF v_final_role = 'warehouse_manager' AND v_branch_kind <> 'warehouse' THEN
      RAISE EXCEPTION 'warehouse_manager must be assigned to warehouse branch'
        USING ERRCODE = 'P0001';
    END IF;

    -- production_manager must be at a central_kitchen branch
    IF v_final_role = 'production_manager' AND v_branch_kind <> 'central_kitchen' THEN
      RAISE EXCEPTION 'production_manager must be assigned to central_kitchen branch'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- Actor privilege checks (unchanged logic, extended role list)
  IF v_actor_role = 'owner' THEN
    NULL;

  ELSIF v_actor_role = 'super_manager' THEN
    IF v_target.role = 'owner' OR v_final_role = 'owner' THEN
      RAISE EXCEPTION 'super_manager cannot modify owner';
    END IF;

  ELSIF v_actor_role = 'area_manager' THEN
    IF v_target.role::TEXT IN ('owner', 'super_manager', 'area_manager') THEN
      RAISE EXCEPTION 'area_manager cannot modify owner/super_manager/peer area_manager';
    END IF;
    IF v_final_role IN ('owner', 'super_manager', 'area_manager') THEN
      RAISE EXCEPTION 'area_manager cannot set role above branch_manager';
    END IF;
    IF v_target.branch_id IS NOT NULL THEN
      PERFORM 1 FROM public.area_branches
      WHERE area_id = v_actor_area
        AND branch_id = v_target.branch_id
        AND tenant_id = v_actor_tenant;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'area_manager: target not in your area branches';
      END IF;
    END IF;
    IF v_final_branch IS NOT NULL THEN
      PERFORM 1 FROM public.area_branches
      WHERE area_id = v_actor_area
        AND branch_id = v_final_branch
        AND tenant_id = v_actor_tenant;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'area_manager: target branch not in your area';
      END IF;
    END IF;

  ELSIF v_actor_role = 'branch_manager' THEN
    IF v_target.branch_id IS DISTINCT FROM v_actor_branch THEN
      RAISE EXCEPTION 'branch_manager: target not in your branch';
    END IF;
    IF v_target.role::TEXT = 'branch_manager' THEN
      RAISE EXCEPTION 'branch_manager cannot modify peer branch_manager';
    END IF;
    IF v_final_role NOT IN ('cashier', 'waiter', 'chef') THEN
      RAISE EXCEPTION 'branch_manager can only assign cashier/waiter/chef';
    END IF;
    IF v_final_branch IS DISTINCT FROM v_actor_branch THEN
      RAISE EXCEPTION 'branch_manager cannot reassign to other branch';
    END IF;

  ELSE
    RAISE EXCEPTION 'insufficient privileges for profile management';
  END IF;

  UPDATE public.profiles
  SET
    full_name  = COALESCE(p_full_name, full_name),
    phone      = COALESCE(p_phone, phone),
    role       = v_final_role::public.staff_role,
    branch_id  = v_final_branch,
    updated_at = now()
  WHERE id = p_target_id AND tenant_id = v_actor_tenant;

  IF p_role IS NOT NULL AND p_role <> v_target.role::TEXT THEN
    UPDATE auth.users
    SET raw_app_meta_data = raw_app_meta_data
      || jsonb_build_object('user_role', v_final_role)
    WHERE id = p_target_id;
  END IF;

  IF p_branch_id IS NOT NULL AND p_branch_id IS DISTINCT FROM v_target.branch_id THEN
    UPDATE auth.users
    SET raw_app_meta_data = raw_app_meta_data
      || jsonb_build_object('branch_id', v_final_branch)
    WHERE id = p_target_id;
  END IF;
END;
$$;

-- ─── 9. handle_new_user: support new roles ───

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_tenant_id  BIGINT;
  v_branch_id  BIGINT;
  v_role       public.staff_role;
  v_branch_kind TEXT;
BEGIN
  IF NEW.raw_app_meta_data ->> 'tenant_id' IS NULL THEN
    RAISE EXCEPTION 'tenant_id required in app_metadata — use admin invite flow';
  END IF;

  v_tenant_id := (NEW.raw_app_meta_data ->> 'tenant_id')::bigint;
  v_branch_id := NULLIF(NEW.raw_app_meta_data ->> 'branch_id', '')::bigint;
  v_role := COALESCE((NEW.raw_app_meta_data ->> 'role')::public.staff_role, 'waiter');

  IF v_branch_id IS NOT NULL THEN
    SELECT branch_kind INTO v_branch_kind
    FROM public.branches
    WHERE id = v_branch_id AND tenant_id = v_tenant_id;

    -- POS/KDS floor roles cannot work at warehouse or central_kitchen
    IF v_role IN ('cashier', 'waiter', 'chef', 'branch_manager')
       AND v_branch_kind IN ('warehouse', 'central_kitchen')
    THEN
      RAISE EXCEPTION 'operational roles cannot be assigned to warehouse/central_kitchen branch'
        USING ERRCODE = 'P0001';
    END IF;

    -- warehouse_manager must be at warehouse
    IF v_role = 'warehouse_manager' AND v_branch_kind <> 'warehouse' THEN
      RAISE EXCEPTION 'warehouse_manager must be assigned to warehouse branch'
        USING ERRCODE = 'P0001';
    END IF;

    -- production_manager must be at central_kitchen
    IF v_role = 'production_manager' AND v_branch_kind <> 'central_kitchen' THEN
      RAISE EXCEPTION 'production_manager must be assigned to central_kitchen branch'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  INSERT INTO public.profiles (id, tenant_id, branch_id, role, full_name)
  VALUES (
    NEW.id,
    v_tenant_id,
    v_branch_id,
    v_role,
    COALESCE(NEW.raw_app_meta_data ->> 'full_name', NEW.raw_user_meta_data ->> 'full_name', '')
  );
  RETURN NEW;
END;
$$;

-- ─── 10. Production RPCs: add production_manager role ───

CREATE OR REPLACE FUNCTION public.create_production_order(
  p_branch_id BIGINT,
  p_production_number TEXT,
  p_notes TEXT DEFAULT NULL,
  p_items JSONB DEFAULT '[]'::JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid          UUID := auth.uid();
  v_tenant       BIGINT := public.auth_tenant_id();
  v_role         TEXT := public.auth_role();
  v_branch_claim BIGINT := public.auth_branch_id();
  v_branch       RECORD;
  v_order_id     BIGINT;
  v_item         RECORD;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF v_role NOT IN ('owner', 'super_manager', 'area_manager', 'branch_manager', 'production_manager') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF p_production_number IS NULL OR btrim(p_production_number) = '' THEN
    RAISE EXCEPTION 'production_number_required' USING ERRCODE = '22023';
  END IF;

  SELECT id, branch_kind INTO v_branch
  FROM public.branches
  WHERE id = p_branch_id
    AND tenant_id = v_tenant
    AND is_active = true
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'branch_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_branch.branch_kind <> 'central_kitchen' THEN
    RAISE EXCEPTION 'branch_must_be_central_kitchen' USING ERRCODE = '23514';
  END IF;

  -- Branch-scoped roles must be at the target CK
  IF v_role IN ('branch_manager', 'production_manager')
     AND (v_branch_claim IS NULL OR v_branch_claim <> p_branch_id) THEN
    RAISE EXCEPTION 'branch_scope_violation' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.production_orders (
    tenant_id, branch_id, production_number, status, notes, created_by
  ) VALUES (
    v_tenant, p_branch_id, p_production_number, 'draft', p_notes, v_uid
  )
  RETURNING id INTO v_order_id;

  IF p_items IS NOT NULL AND jsonb_typeof(p_items) = 'array' THEN
    INSERT INTO public.production_order_items (
      tenant_id,
      production_order_id,
      finished_good_id,
      quantity,
      unit
    )
    SELECT
      v_tenant,
      v_order_id,
      (line->>'finishedGoodId')::BIGINT,
      (line->>'quantity')::NUMERIC(15,3),
      NULLIF(btrim(line->>'unit'), '')
    FROM jsonb_array_elements(p_items) AS line
    WHERE line ? 'finishedGoodId'
      AND line ? 'quantity'
      AND line ? 'unit'
    ON CONFLICT (production_order_id, finished_good_id, tenant_id)
    DO UPDATE SET
      quantity = EXCLUDED.quantity,
      unit = EXCLUDED.unit;
  END IF;

  RETURN jsonb_build_object('id', v_order_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.confirm_production_order(p_order_id BIGINT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid           UUID := auth.uid();
  v_tenant        BIGINT := public.auth_tenant_id();
  v_order         RECORD;
  v_item          RECORD;
  v_recipe        RECORD;
  v_raw_cost      NUMERIC(15,2);
  v_raw_need      NUMERIC(15,3);
  v_output_cost   NUMERIC(15,2);
  v_old_q         NUMERIC(15,3);
  v_old_wac       NUMERIC(15,2);
  v_new_q         NUMERIC(15,3);
  v_new_wac       NUMERIC(15,2);
  v_need_map      JSONB := '{}'::JSONB;
  v_cost_map      JSONB := '{}'::JSONB;
  v_key           TEXT;
  v_need_qty      NUMERIC(15,3);
  v_cost_total    NUMERIC(15,2);
  v_has_recipe    BOOLEAN;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF public.auth_role() NOT IN ('owner', 'super_manager', 'area_manager', 'branch_manager', 'production_manager') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT po.*, b.branch_kind
  INTO v_order
  FROM public.production_orders po
  JOIN public.branches b ON b.id = po.branch_id
  WHERE po.id = p_order_id
    AND po.tenant_id = v_tenant
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'production_order_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_order.status <> 'draft' THEN
    RAISE EXCEPTION 'production_order_not_draft' USING ERRCODE = '22023';
  END IF;

  IF v_order.branch_kind <> 'central_kitchen' THEN
    RAISE EXCEPTION 'branch_must_be_central_kitchen' USING ERRCODE = '23514';
  END IF;

  IF public.auth_role() IN ('branch_manager', 'production_manager')
     AND (public.auth_branch_id() IS NULL OR public.auth_branch_id() <> v_order.branch_id) THEN
    RAISE EXCEPTION 'branch_scope_violation' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.production_order_items poi
    WHERE poi.production_order_id = p_order_id
      AND poi.tenant_id = v_tenant
  ) THEN
    RAISE EXCEPTION 'production_order_empty' USING ERRCODE = '22023';
  END IF;

  FOR v_item IN
    SELECT poi.*, fg.item_kind
    FROM public.production_order_items poi
    JOIN public.ingredients fg ON fg.id = poi.finished_good_id
    WHERE poi.production_order_id = p_order_id
      AND poi.tenant_id = v_tenant
  LOOP
    IF v_item.item_kind <> 'finished_good' THEN
      RAISE EXCEPTION 'production_item_must_be_finished_good' USING ERRCODE = '23514';
    END IF;

    v_output_cost := 0;
    v_has_recipe := false;

    FOR v_recipe IN
      SELECT
        pr.ingredient_id,
        pr.quantity,
        pr.yield_factor,
        COALESCE(sl.avg_unit_cost, ing.unit_cost, 0) AS raw_unit_cost
      FROM public.production_recipes pr
      JOIN public.ingredients ing ON ing.id = pr.ingredient_id
      LEFT JOIN public.stock_levels sl
        ON sl.tenant_id = v_tenant
       AND sl.branch_id = v_order.branch_id
       AND sl.ingredient_id = pr.ingredient_id
      WHERE pr.tenant_id = v_tenant
        AND pr.finished_good_id = v_item.finished_good_id
    LOOP
      v_has_recipe := true;
      v_raw_need := (v_item.quantity * v_recipe.quantity) / COALESCE(v_recipe.yield_factor, 1.0);
      v_key := v_recipe.ingredient_id::text;
      v_need_map := jsonb_set(
        v_need_map,
        ARRAY[v_key],
        to_jsonb(COALESCE((v_need_map ->> v_key)::numeric, 0) + v_raw_need),
        true
      );
      v_cost_map := jsonb_set(
        v_cost_map,
        ARRAY[v_key],
        to_jsonb(COALESCE((v_cost_map ->> v_key)::numeric, 0) + (v_raw_need * COALESCE(v_recipe.raw_unit_cost, 0))),
        true
      );
      v_output_cost := v_output_cost + (v_raw_need * COALESCE(v_recipe.raw_unit_cost, 0));
    END LOOP;

    IF NOT v_has_recipe THEN
      RAISE EXCEPTION 'production_recipe_missing' USING ERRCODE = 'P0001';
    END IF;

    IF v_output_cost < 0 THEN
      RAISE EXCEPTION 'production_cost_invalid' USING ERRCODE = '22023';
    END IF;

    v_cost_total := v_output_cost;
    UPDATE public.production_order_items
    SET unit_cost_at_production = CASE
      WHEN v_item.quantity > 0 THEN ROUND(v_cost_total / v_item.quantity, 2)
      ELSE 0
    END
    WHERE id = v_item.id;
  END LOOP;

  IF EXISTS (
    SELECT 1
    FROM jsonb_each_text(v_need_map) AS need(ingredient_id, need_qty)
    LEFT JOIN public.stock_levels sl
      ON sl.tenant_id = v_tenant
     AND sl.branch_id = v_order.branch_id
     AND sl.ingredient_id = need.ingredient_id::BIGINT
    WHERE COALESCE(sl.current_quantity, 0) < need.need_qty::NUMERIC
  ) THEN
    RAISE EXCEPTION 'insufficient_stock_for_production' USING ERRCODE = 'P0001';
  END IF;

  FOR v_key, v_need_qty IN
    SELECT key, value::NUMERIC(15,3)
    FROM jsonb_each_text(v_need_map)
  LOOP
    SELECT sl.current_quantity, sl.avg_unit_cost
    INTO v_old_q, v_old_wac
    FROM public.stock_levels sl
    WHERE sl.tenant_id = v_tenant
      AND sl.branch_id = v_order.branch_id
      AND sl.ingredient_id = v_key::BIGINT;

    IF NOT FOUND THEN
      v_old_q := 0;
      v_old_wac := 0;
    END IF;

    INSERT INTO public.stock_movements (
      tenant_id, branch_id, ingredient_id, type, quantity_change,
      reason, created_by, production_order_id, unit_cost
    ) VALUES (
      v_tenant,
      v_order.branch_id,
      v_key::BIGINT,
      'production_consumption',
      -v_need_qty,
      'Production ' || v_order.production_number,
      v_uid,
      p_order_id,
      COALESCE(v_old_wac, 0)
    );
  END LOOP;

  FOR v_item IN
    SELECT poi.*, fg.item_kind
    FROM public.production_order_items poi
    JOIN public.ingredients fg ON fg.id = poi.finished_good_id
    WHERE poi.production_order_id = p_order_id
      AND poi.tenant_id = v_tenant
  LOOP
    v_cost_total := COALESCE(v_item.unit_cost_at_production, 0);

    SELECT sl.current_quantity, sl.avg_unit_cost
    INTO v_old_q, v_old_wac
    FROM public.stock_levels sl
    WHERE sl.tenant_id = v_tenant
      AND sl.branch_id = v_order.branch_id
      AND sl.ingredient_id = v_item.finished_good_id;

    IF NOT FOUND THEN
      v_old_q := 0;
      v_old_wac := 0;
    END IF;

    INSERT INTO public.stock_movements (
      tenant_id, branch_id, ingredient_id, type, quantity_change,
      reason, created_by, production_order_id, unit_cost
    ) VALUES (
      v_tenant,
      v_order.branch_id,
      v_item.finished_good_id,
      'production_output',
      v_item.quantity,
      'Production ' || v_order.production_number,
      v_uid,
      p_order_id,
      v_cost_total
    );

    v_new_q := COALESCE(v_old_q, 0) + v_item.quantity;
    IF v_new_q > 0 THEN
      v_new_wac := (
        COALESCE(v_old_q, 0) * COALESCE(v_old_wac, 0) + v_item.quantity * v_cost_total
      ) / v_new_q;
    ELSE
      v_new_wac := v_cost_total;
    END IF;

    UPDATE public.stock_levels sl
    SET avg_unit_cost = v_new_wac, updated_at = now()
    WHERE sl.tenant_id = v_tenant
      AND sl.branch_id = v_order.branch_id
      AND sl.ingredient_id = v_item.finished_good_id;

    UPDATE public.ingredients
    SET unit_cost = v_cost_total, updated_at = now()
    WHERE id = v_item.finished_good_id
      AND tenant_id = v_tenant;
  END LOOP;

  UPDATE public.production_orders
  SET status = 'completed',
      completed_at = now(),
      updated_at = now()
  WHERE id = p_order_id
    AND tenant_id = v_tenant;

  RETURN jsonb_build_object('production_order_id', p_order_id, 'status', 'completed');
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_production_order(p_order_id BIGINT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant BIGINT := public.auth_tenant_id();
  v_order  RECORD;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF public.auth_role() NOT IN ('owner', 'super_manager', 'area_manager', 'branch_manager', 'production_manager') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT *
  INTO v_order
  FROM public.production_orders
  WHERE id = p_order_id
    AND tenant_id = v_tenant
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'production_order_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF public.auth_role() IN ('branch_manager', 'production_manager')
     AND (public.auth_branch_id() IS NULL OR public.auth_branch_id() <> v_order.branch_id) THEN
    RAISE EXCEPTION 'branch_scope_violation' USING ERRCODE = '42501';
  END IF;

  IF v_order.status <> 'draft' THEN
    RAISE EXCEPTION 'production_order_not_draft' USING ERRCODE = '22023';
  END IF;

  UPDATE public.production_orders
  SET status = 'cancelled',
      updated_at = now()
  WHERE id = p_order_id
    AND tenant_id = v_tenant;

  RETURN jsonb_build_object('production_order_id', p_order_id, 'status', 'cancelled');
END;
$$;

-- ─── 11. Production RLS: add production_manager ───

DROP POLICY IF EXISTS "production_recipes_manage" ON public.production_recipes;

CREATE POLICY "production_recipes_manage" ON public.production_recipes
  FOR ALL TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND (
      public.auth_role() IN ('owner', 'super_manager', 'area_manager')
      OR (
        public.auth_role() IN ('branch_manager', 'production_manager')
        AND public.auth_branch_id() IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM public.branches b
          WHERE b.id = public.auth_branch_id()
            AND b.tenant_id = public.auth_tenant_id()
            AND b.branch_kind = 'central_kitchen'
        )
      )
    )
  )
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND (
      public.auth_role() IN ('owner', 'super_manager', 'area_manager')
      OR (
        public.auth_role() IN ('branch_manager', 'production_manager')
        AND public.auth_branch_id() IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM public.branches b
          WHERE b.id = public.auth_branch_id()
            AND b.tenant_id = public.auth_tenant_id()
            AND b.branch_kind = 'central_kitchen'
        )
      )
    )
  );

DROP POLICY IF EXISTS "production_orders_manage" ON public.production_orders;

CREATE POLICY "production_orders_manage" ON public.production_orders
  FOR ALL TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND (
      public.auth_role() IN ('owner', 'super_manager', 'area_manager')
      OR (
        public.auth_role() IN ('branch_manager', 'production_manager')
        AND public.auth_branch_id() IS NOT NULL
        AND branch_id = public.auth_branch_id()
        AND EXISTS (
          SELECT 1
          FROM public.branches b
          WHERE b.id = branch_id
            AND b.tenant_id = public.auth_tenant_id()
            AND b.branch_kind = 'central_kitchen'
        )
      )
    )
  )
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND (
      public.auth_role() IN ('owner', 'super_manager', 'area_manager')
      OR (
        public.auth_role() IN ('branch_manager', 'production_manager')
        AND public.auth_branch_id() IS NOT NULL
        AND branch_id = public.auth_branch_id()
        AND EXISTS (
          SELECT 1
          FROM public.branches b
          WHERE b.id = branch_id
            AND b.tenant_id = public.auth_tenant_id()
            AND b.branch_kind = 'central_kitchen'
        )
      )
    )
  );

DROP POLICY IF EXISTS "production_order_items_manage" ON public.production_order_items;

CREATE POLICY "production_order_items_manage" ON public.production_order_items
  FOR ALL TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND (
      public.auth_role() IN ('owner', 'super_manager', 'area_manager')
      OR (
        public.auth_role() IN ('branch_manager', 'production_manager')
        AND public.auth_branch_id() IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM public.production_orders po
          JOIN public.branches b ON b.id = po.branch_id
          WHERE po.id = production_order_id
            AND po.tenant_id = public.auth_tenant_id()
            AND b.branch_kind = 'central_kitchen'
            AND po.branch_id = public.auth_branch_id()
        )
      )
    )
  )
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND (
      public.auth_role() IN ('owner', 'super_manager', 'area_manager')
      OR (
        public.auth_role() IN ('branch_manager', 'production_manager')
        AND public.auth_branch_id() IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM public.production_orders po
          JOIN public.branches b ON b.id = po.branch_id
          WHERE po.id = production_order_id
            AND po.tenant_id = public.auth_tenant_id()
            AND b.branch_kind = 'central_kitchen'
            AND po.branch_id = public.auth_branch_id()
        )
      )
    )
  );

-- ─── 12. Deprecate set_headquarters → set_branch_kind ───

CREATE OR REPLACE FUNCTION public.set_branch_kind(
  p_branch_id BIGINT,
  p_kind TEXT DEFAULT 'warehouse'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant BIGINT := public.auth_tenant_id();
  v_branch RECORD;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF public.auth_role() NOT IN ('owner', 'super_manager') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF p_kind NOT IN ('warehouse', 'branch', 'central_kitchen') THEN
    RAISE EXCEPTION 'invalid branch_kind: %', p_kind USING ERRCODE = '22023';
  END IF;

  SELECT id, branch_kind INTO v_branch
  FROM public.branches
  WHERE id = p_branch_id
    AND tenant_id = v_tenant
    AND is_active = true
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'branch_not_found' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.branches
  SET branch_kind = p_kind,
      updated_at = now()
  WHERE id = p_branch_id
    AND tenant_id = v_tenant;
END;
$$;

REVOKE ALL ON FUNCTION public.set_branch_kind(BIGINT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_branch_kind(BIGINT, TEXT) TO authenticated;

-- Keep old set_headquarters as compat wrapper
CREATE OR REPLACE FUNCTION public.set_headquarters(p_branch_id BIGINT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.set_branch_kind(p_branch_id, 'warehouse');
END;
$$;
