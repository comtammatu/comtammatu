-- =============================================================
-- Inventory rename pass 2: 'warehouse' → 'central_warehouse',
-- retire is_headquarters flag + related HQ lexicon.
--
-- Model after this migration:
--   NCC → GRN → Kho Tổng (central_warehouse) OR Bếp Trung Tâm (central_kitchen)
--   Transfers allowed: CW→CK, CW→Branch, CK→Branch, intra-branch (same id)
--   Transfers rejected: CK→CW, CW↔CW, CK↔CK, Branch→*
--
-- Dev data only — big-bang rename approved by project owner.
-- =============================================================

-- ─── 1. Drop triggers/functions that still reference is_headquarters ───
-- Must run before column drop to avoid function-body invalidation.

DROP TRIGGER IF EXISTS trg_branches_sync_kind_and_hq ON public.branches;
DROP FUNCTION IF EXISTS public.sync_branch_kind_and_hq() CASCADE;

-- set_headquarters compat wrappers (both old signatures from 20260414081707 & 20260416200001)
DROP FUNCTION IF EXISTS public.set_headquarters(BIGINT) CASCADE;

-- Old PO/GRN branch enforcement function + its triggers (rebuilt below)
DROP TRIGGER IF EXISTS trg_po_hq_only ON public.purchase_orders;
DROP TRIGGER IF EXISTS trg_grn_hq_only ON public.goods_received_notes;
DROP FUNCTION IF EXISTS public.enforce_po_branch_is_headquarters() CASCADE;

-- Old transfer direction validator was already dropped in 20260416200001, but
-- drop again defensively in case local DB is ahead/behind.
DROP TRIGGER IF EXISTS trg_transfer_hq_to_branch ON public.stock_transfers;
DROP FUNCTION IF EXISTS public.enforce_transfer_from_hq() CASCADE;

-- ─── 2. Rename branch_kind literal 'warehouse' → 'central_warehouse' ───

ALTER TABLE public.branches DROP CONSTRAINT IF EXISTS branches_branch_kind_check;

UPDATE public.branches
SET branch_kind = 'central_warehouse'
WHERE branch_kind = 'warehouse';

-- Safety: anything residual (e.g. stale 'headquarters' in an old dev DB) also maps to central_warehouse.
UPDATE public.branches
SET branch_kind = 'central_warehouse'
WHERE branch_kind = 'headquarters';

ALTER TABLE public.branches
  ADD CONSTRAINT branches_branch_kind_check
  CHECK (branch_kind IN ('central_warehouse', 'central_kitchen', 'branch'));

-- ─── 3. Drop is_headquarters column ───
-- Column is unused after this point; all policies/functions now key on branch_kind.
ALTER TABLE public.branches DROP COLUMN IF EXISTS is_headquarters CASCADE;

-- ─── 4. Rebuild set_branch_kind with new enum literals ───

CREATE OR REPLACE FUNCTION public.set_branch_kind(
  p_branch_id BIGINT,
  p_kind      TEXT DEFAULT 'central_warehouse'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant BIGINT := public.auth_tenant_id();
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF public.auth_role() NOT IN ('owner', 'super_manager') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF p_kind NOT IN ('central_warehouse', 'central_kitchen', 'branch') THEN
    RAISE EXCEPTION 'invalid branch_kind: %', p_kind USING ERRCODE = '22023';
  END IF;

  UPDATE public.branches
  SET branch_kind = p_kind,
      updated_at  = now()
  WHERE id = p_branch_id
    AND tenant_id = v_tenant
    AND is_active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'branch_not_found' USING ERRCODE = 'P0002';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.set_branch_kind(BIGINT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_branch_kind(BIGINT, TEXT) TO authenticated;

-- ─── 5. PO/GRN: enforce branch is CW or CK ───

CREATE OR REPLACE FUNCTION public.enforce_po_grn_branch_is_procurement()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.branches b
    WHERE b.id = NEW.branch_id
      AND b.tenant_id = NEW.tenant_id
      AND b.branch_kind IN ('central_warehouse', 'central_kitchen')
  ) THEN
    RAISE EXCEPTION 'branch must be central_warehouse or central_kitchen' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_po_procurement_branch ON public.purchase_orders;
CREATE TRIGGER trg_po_procurement_branch
  BEFORE INSERT OR UPDATE OF branch_id ON public.purchase_orders
  FOR EACH ROW EXECUTE FUNCTION public.enforce_po_grn_branch_is_procurement();

DROP TRIGGER IF EXISTS trg_grn_procurement_branch ON public.goods_received_notes;
CREATE TRIGGER trg_grn_procurement_branch
  BEFORE INSERT OR UPDATE OF branch_id ON public.goods_received_notes
  FOR EACH ROW EXECUTE FUNCTION public.enforce_po_grn_branch_is_procurement();

-- ─── 6. confirm_goods_receipt_note: accept CW + CK, no is_headquarters ───
-- Rewrites 20260419040000 which regressed to is_headquarters check.

CREATE OR REPLACE FUNCTION public.confirm_goods_receipt_note(p_grn_id BIGINT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid             UUID := auth.uid();
  v_tenant          BIGINT := public.auth_tenant_id();
  v_grn             RECORD;
  v_item            RECORD;
  v_branch          RECORD;
  v_old_q           NUMERIC(15,3);
  v_old_wac         NUMERIC(15,2);
  v_recv            NUMERIC(15,3);
  v_cost            NUMERIC(15,2);
  v_new_q           NUMERIC(15,3);
  v_new_wac         NUMERIC(15,2);
  v_location_id     BIGINT;
  v_inventory_total NUMERIC(15,2) := 0;
  v_journal_id      BIGINT;
  v_lines           JSONB;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT g.* INTO v_grn
  FROM public.goods_received_notes g
  WHERE g.id = p_grn_id AND g.tenant_id = v_tenant
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'grn_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_grn.status <> 'draft' THEN
    RAISE EXCEPTION 'grn_not_draft' USING ERRCODE = '22023';
  END IF;

  SELECT b.id, b.branch_kind INTO v_branch
  FROM public.branches b
  WHERE b.id = v_grn.branch_id
    AND b.tenant_id = v_tenant
    AND b.branch_kind IN ('central_warehouse', 'central_kitchen');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'grn_branch_must_be_procurement' USING ERRCODE = '23514';
  END IF;

  SELECT il.id INTO v_location_id
  FROM public.inventory_locations il
  WHERE il.branch_id = v_grn.branch_id
    AND il.tenant_id = v_tenant
    AND il.is_default_receive = true
    AND il.is_active = true
  LIMIT 1;

  FOR v_item IN
    SELECT * FROM public.grn_items gi
    WHERE gi.grn_id = p_grn_id AND gi.tenant_id = v_tenant
  LOOP
    IF v_item.quality_status = 'rejected' OR v_item.received_quantity <= 0 THEN
      CONTINUE;
    END IF;

    v_recv := v_item.received_quantity;
    v_cost := v_item.unit_cost;

    SELECT sl.current_quantity, sl.avg_unit_cost
    INTO v_old_q, v_old_wac
    FROM public.stock_levels sl
    WHERE sl.tenant_id = v_tenant
      AND sl.branch_id = v_grn.branch_id
      AND sl.ingredient_id = v_item.ingredient_id;

    IF NOT FOUND THEN
      v_old_q := 0;
      v_old_wac := NULL;
    END IF;

    INSERT INTO public.stock_movements (
      tenant_id, branch_id, ingredient_id, type, quantity_change,
      reason, created_by, grn_id, unit_cost, location_id
    ) VALUES (
      v_tenant, v_grn.branch_id, v_item.ingredient_id, 'grn_receipt', v_recv,
      'GRN ' || v_grn.grn_number, v_uid, p_grn_id, v_cost, v_location_id
    );

    v_new_q := COALESCE(v_old_q, 0) + v_recv;
    IF v_new_q > 0 THEN
      v_new_wac := (
        COALESCE(v_old_q, 0) * COALESCE(v_old_wac, 0) + v_recv * v_cost
      ) / v_new_q;
    ELSE
      v_new_wac := v_cost;
    END IF;

    UPDATE public.stock_levels sl
    SET avg_unit_cost = v_new_wac, updated_at = now()
    WHERE sl.tenant_id = v_tenant
      AND sl.branch_id = v_grn.branch_id
      AND sl.ingredient_id = v_item.ingredient_id;

    UPDATE public.ingredients i
    SET unit_cost = v_cost, updated_at = now()
    WHERE i.id = v_item.ingredient_id AND i.tenant_id = v_tenant;

    v_inventory_total := v_inventory_total + (v_recv * v_cost);
  END LOOP;

  UPDATE public.goods_received_notes
  SET status = 'confirmed', updated_at = now()
  WHERE id = p_grn_id;

  IF v_inventory_total > 0 THEN
    v_lines := jsonb_build_array(
      jsonb_build_object(
        'rule_code', 'GRN_INVENTORY',
        'amount', v_inventory_total,
        'line_description', 'Nhập kho GRN #' || v_grn.grn_number
      )
    );

    v_journal_id := public.auto_post_journal(
      v_tenant,
      v_grn.branch_id,
      'purchase',
      p_grn_id,
      'Nhập kho phiếu ' || v_grn.grn_number,
      v_lines,
      now(),
      v_uid
    );

    IF v_journal_id IS NOT NULL THEN
      UPDATE public.goods_received_notes
      SET journal_entry_id = v_journal_id
      WHERE id = p_grn_id;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'grn_id', p_grn_id,
    'status', 'confirmed',
    'journal_entry_id', v_journal_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_goods_receipt_note(BIGINT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.confirm_goods_receipt_note(BIGINT) TO authenticated;

-- ─── 7. Transfer direction matrix ───
-- Allowed: CW→CK, CW→Branch, CK→Branch, intra-branch (same id, enforced at app layer)
-- Rejected: CK→CW, CW↔CW (different CWs), CK↔CK (different CKs), Branch→*

CREATE OR REPLACE FUNCTION public.enforce_stock_transfer_direction()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_from_kind TEXT;
  v_to_kind   TEXT;
BEGIN
  -- Intra-branch (same id): allowed; rely on app layer for location semantics.
  IF NEW.from_branch_id = NEW.to_branch_id THEN
    RETURN NEW;
  END IF;

  SELECT b.branch_kind INTO v_from_kind
  FROM public.branches b
  WHERE b.id = NEW.from_branch_id AND b.tenant_id = NEW.tenant_id;

  SELECT b.branch_kind INTO v_to_kind
  FROM public.branches b
  WHERE b.id = NEW.to_branch_id AND b.tenant_id = NEW.tenant_id;

  IF v_from_kind IS NULL OR v_to_kind IS NULL THEN
    RAISE EXCEPTION 'stock_transfers: invalid branch reference' USING ERRCODE = '23514';
  END IF;

  -- Whitelist valid inter-branch directions.
  IF (v_from_kind = 'central_warehouse' AND v_to_kind = 'central_kitchen')
  OR (v_from_kind = 'central_warehouse' AND v_to_kind = 'branch')
  OR (v_from_kind = 'central_kitchen'   AND v_to_kind = 'branch')
  THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'stock_transfers: invalid direction % -> %', v_from_kind, v_to_kind
    USING ERRCODE = '23514';
END;
$$;

DROP TRIGGER IF EXISTS trg_stock_transfer_direction ON public.stock_transfers;
CREATE TRIGGER trg_stock_transfer_direction
  BEFORE INSERT OR UPDATE OF from_branch_id, to_branch_id ON public.stock_transfers
  FOR EACH ROW EXECUTE FUNCTION public.enforce_stock_transfer_direction();

COMMENT ON FUNCTION public.enforce_stock_transfer_direction() IS
  'Allowed transfers: CW→CK, CW→Branch, CK→Branch, intra-branch. Reject all others.';

-- ─── 8. stock_issues: issue_type='kitchen_use' only valid at branch (not CW/CK) ───

CREATE OR REPLACE FUNCTION public.enforce_stock_issue_kitchen_use_scope()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_kind TEXT;
BEGIN
  IF NEW.issue_type IS DISTINCT FROM 'kitchen_use' THEN
    RETURN NEW;
  END IF;

  SELECT b.branch_kind INTO v_kind
  FROM public.branches b
  WHERE b.id = NEW.branch_id AND b.tenant_id = NEW.tenant_id;

  IF v_kind IS DISTINCT FROM 'branch' THEN
    RAISE EXCEPTION 'stock_issues: kitchen_use only allowed at operational branch' USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_stock_issue_kitchen_use_scope ON public.stock_issues;

CREATE TRIGGER trg_stock_issue_kitchen_use_scope
  BEFORE INSERT OR UPDATE OF issue_type, branch_id ON public.stock_issues
  FOR EACH ROW EXECUTE FUNCTION public.enforce_stock_issue_kitchen_use_scope();

-- ─── 9. admin_update_profile: rename 'warehouse' → 'central_warehouse' ───
-- Keeps auth_v2 position-based body; only branch_kind literal strings change.

CREATE OR REPLACE FUNCTION public.admin_update_profile(
  p_target_id UUID,
  p_full_name TEXT    DEFAULT NULL,
  p_phone     TEXT    DEFAULT NULL,
  p_role      TEXT    DEFAULT NULL,
  p_branch_id BIGINT  DEFAULT NULL,
  p_is_active BOOLEAN DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_tenant    BIGINT := public.auth_tenant_id();
  v_actor_role_text TEXT   := public.auth_role();
  v_actor_branch    BIGINT := public.auth_branch_id();
  v_actor_area      BIGINT := public.auth_area_id();
  v_target          RECORD;
  v_target_role     TEXT;
  v_final_role      TEXT;
  v_final_branch    BIGINT;
  v_final_position  BIGINT;
  v_branch_kind     TEXT;
BEGIN
  IF p_role IS NOT NULL AND p_role NOT IN (
    'owner','super_manager','area_manager','branch_manager',
    'warehouse_manager','production_manager','cashier','waiter','chef','office'
  ) THEN
    RAISE EXCEPTION 'invalid_role: %', p_role USING ERRCODE = '22023';
  END IF;

  SELECT
    p.id, p.branch_id, p.full_name, p.phone, p.tenant_id, p.position_id,
    COALESCE(po.legacy_role_code, 'unassigned') AS role_text
  INTO v_target
  FROM public.profiles p
  LEFT JOIN public.positions po ON po.id = p.position_id
  WHERE p.id = p_target_id AND p.tenant_id = v_actor_tenant;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'target profile not found in tenant';
  END IF;

  v_target_role  := v_target.role_text;
  v_final_role   := COALESCE(p_role, v_target_role);
  v_final_branch := COALESCE(p_branch_id, v_target.branch_id);

  IF v_final_role IN ('cashier','waiter','chef','branch_manager','warehouse_manager','production_manager')
     AND v_final_branch IS NULL THEN
    RAISE EXCEPTION 'branch_required_for_operational_role' USING ERRCODE = 'P0001';
  END IF;

  IF v_final_branch IS NOT NULL THEN
    SELECT branch_kind INTO v_branch_kind
    FROM public.branches WHERE id = v_final_branch AND tenant_id = v_actor_tenant;
    IF v_final_role IN ('cashier','waiter','chef','branch_manager')
       AND v_branch_kind IN ('central_warehouse','central_kitchen') THEN
      RAISE EXCEPTION 'operational roles cannot be assigned to central_warehouse/central_kitchen branch' USING ERRCODE = 'P0001';
    END IF;
    IF v_final_role = 'warehouse_manager' AND v_branch_kind <> 'central_warehouse' THEN
      RAISE EXCEPTION 'warehouse_manager must be assigned to central_warehouse branch' USING ERRCODE = 'P0001';
    END IF;
    IF v_final_role = 'production_manager' AND v_branch_kind <> 'central_kitchen' THEN
      RAISE EXCEPTION 'production_manager must be assigned to central_kitchen branch' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  IF v_actor_role_text = 'owner' THEN
    NULL;
  ELSIF v_actor_role_text = 'super_manager' THEN
    IF v_target_role = 'owner' OR v_final_role = 'owner' THEN
      RAISE EXCEPTION 'super_manager cannot modify owner';
    END IF;
  ELSIF v_actor_role_text = 'area_manager' THEN
    IF v_target_role IN ('owner','super_manager','area_manager') THEN
      RAISE EXCEPTION 'area_manager cannot modify owner/super_manager/peer area_manager';
    END IF;
    IF v_final_role IN ('owner','super_manager','area_manager') THEN
      RAISE EXCEPTION 'area_manager cannot set role above branch_manager';
    END IF;
    IF v_target.branch_id IS NOT NULL THEN
      PERFORM 1 FROM public.area_branches
      WHERE area_id = v_actor_area AND branch_id = v_target.branch_id AND tenant_id = v_actor_tenant;
      IF NOT FOUND THEN RAISE EXCEPTION 'area_manager: target not in your area branches'; END IF;
    END IF;
    IF v_final_branch IS NOT NULL THEN
      PERFORM 1 FROM public.area_branches
      WHERE area_id = v_actor_area AND branch_id = v_final_branch AND tenant_id = v_actor_tenant;
      IF NOT FOUND THEN RAISE EXCEPTION 'area_manager: target branch not in your area'; END IF;
    END IF;
  ELSIF v_actor_role_text = 'branch_manager' THEN
    IF v_target.branch_id IS DISTINCT FROM v_actor_branch THEN
      RAISE EXCEPTION 'branch_manager: target not in your branch';
    END IF;
    IF v_target_role = 'branch_manager' THEN
      RAISE EXCEPTION 'branch_manager cannot modify peer branch_manager';
    END IF;
    IF v_final_role NOT IN ('cashier','waiter','chef') THEN
      RAISE EXCEPTION 'branch_manager can only assign cashier/waiter/chef';
    END IF;
    IF v_final_branch IS DISTINCT FROM v_actor_branch THEN
      RAISE EXCEPTION 'branch_manager cannot reassign to other branch';
    END IF;
  ELSE
    RAISE EXCEPTION 'insufficient privileges for profile management';
  END IF;

  v_final_position := public._auth_v2_position_id_from_role(v_final_role, v_actor_tenant);

  UPDATE public.profiles SET
    full_name   = COALESCE(p_full_name, full_name),
    phone       = COALESCE(p_phone,     phone),
    position_id = v_final_position,
    branch_id   = v_final_branch,
    is_active   = COALESCE(p_is_active, is_active),
    updated_at  = now()
  WHERE id = p_target_id AND tenant_id = v_actor_tenant;

  IF p_role IS NOT NULL AND p_role <> v_target_role THEN
    UPDATE auth.users
    SET raw_app_meta_data = raw_app_meta_data || jsonb_build_object('user_role', v_final_role, 'role', v_final_role)
    WHERE id = p_target_id;
  END IF;
  IF p_branch_id IS NOT NULL AND p_branch_id IS DISTINCT FROM v_target.branch_id THEN
    UPDATE auth.users
    SET raw_app_meta_data = raw_app_meta_data || jsonb_build_object('branch_id', v_final_branch)
    WHERE id = p_target_id;
  END IF;
END;
$$;

-- handle_new_user: left as-is (auth_v2 manages it; doesn't reference is_headquarters / 'warehouse').

-- ─── 10. stock_transfer_list_branches: drop is_headquarters from signature ───

DROP FUNCTION IF EXISTS public.stock_transfer_list_branches();

CREATE FUNCTION public.stock_transfer_list_branches()
RETURNS TABLE (
  id          bigint,
  name        text,
  branch_kind text,
  is_active   boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT b.id, b.name, b.branch_kind, b.is_active
  FROM public.branches b
  WHERE b.tenant_id = public.auth_tenant_id()
    AND b.is_active = true
    AND public.auth_role() IN (
      'owner',
      'super_manager',
      'area_manager',
      'branch_manager',
      'warehouse_manager',
      'production_manager'
    )
  ORDER BY b.name;
$$;

GRANT EXECUTE ON FUNCTION public.stock_transfer_list_branches() TO authenticated;
