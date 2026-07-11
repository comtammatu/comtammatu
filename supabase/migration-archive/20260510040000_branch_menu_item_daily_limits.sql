-- =============================================================
-- Daily sales limit per (branch, menu item, date)
-- =============================================================
-- Use case: "today max 30 portions of Sườn cốt lết" per branch.
--   - is_disabled = TRUE → item OFF for the day, regardless of count.
--   - limit_quantity NULL → no quantity cap (still respects is_disabled).
--   - limit_quantity = N → POS can only sell up to N today.
--
-- Atomicity: a trigger on order_items locks the limit row
--   (FOR UPDATE) on each insert, increments sold_today, and raises
--   if the cap is exceeded or the item is disabled. A second trigger
--   decrements on cancel so freed quotas can be re-sold.
--
-- Scope: cashier (POS), chef (KDS) and branch_manager can adjust their
--   OWN branch's row; tenant roles (owner, super_manager, area_manager) can
--   adjust any branch in their tenant.
-- =============================================================

CREATE TABLE public.branch_menu_item_daily_limits (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id       BIGINT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id       BIGINT NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  menu_item_id    BIGINT NOT NULL REFERENCES public.menu_items(id) ON DELETE CASCADE,
  limit_date      DATE   NOT NULL DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh')::date,
  limit_quantity  INT    CHECK (limit_quantity IS NULL OR limit_quantity > 0),
  is_disabled     BOOLEAN NOT NULL DEFAULT FALSE,
  sold_today      INT    NOT NULL DEFAULT 0 CHECK (sold_today >= 0),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (branch_id, menu_item_id, limit_date)
);

CREATE INDEX idx_bmidl_tenant     ON public.branch_menu_item_daily_limits(tenant_id);
CREATE INDEX idx_bmidl_branch     ON public.branch_menu_item_daily_limits(branch_id, limit_date);
CREATE INDEX idx_bmidl_lookup_pos ON public.branch_menu_item_daily_limits(branch_id, limit_date, menu_item_id);

CREATE TRIGGER trg_bmidl_updated_at
  BEFORE UPDATE ON public.branch_menu_item_daily_limits
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.branch_menu_item_daily_limits ENABLE ROW LEVEL SECURITY;

-- One PERMISSIVE policy avoids the multi-policy OR trap (regression
-- RLS-PERMISSIVE-POLICIES-OR). tenant roles bypass branch_id check; branch
-- staff (manager/cashier/chef) must be on the same branch as the row.
CREATE POLICY bmidl_select ON public.branch_menu_item_daily_limits
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND (
      public.auth_role() IN ('owner', 'super_manager', 'area_manager')
      OR public.auth_branch_id() = branch_id
    )
  );

CREATE POLICY bmidl_write ON public.branch_menu_item_daily_limits
  FOR ALL TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND (
      public.auth_role() IN ('owner', 'super_manager', 'area_manager')
      OR (
        public.auth_role() IN ('branch_manager', 'cashier', 'chef')
        AND public.auth_branch_id() = branch_id
      )
    )
  )
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND (
      public.auth_role() IN ('owner', 'super_manager', 'area_manager')
      OR (
        public.auth_role() IN ('branch_manager', 'cashier', 'chef')
        AND public.auth_branch_id() = branch_id
      )
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.branch_menu_item_daily_limits TO authenticated;

-- =============================================================
-- ENFORCEMENT TRIGGER on order_items INSERT
-- =============================================================
-- A trigger keeps enforcement atomic — the SELECT FOR UPDATE on the
-- limit row serializes concurrent inserts of the same (branch, item,
-- day), so two cashiers cannot both pass the check at sold_today=29
-- and end up at 31.
--
-- Runs SECURITY DEFINER so it can lock the limit row even when the
-- caller's RLS is read-only (e.g. POS RPC chains via create_order).
-- =============================================================
CREATE OR REPLACE FUNCTION public.enforce_branch_menu_daily_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_branch_id  BIGINT;
  v_order_date DATE;
  v_limit      RECORD;
BEGIN
  SELECT o.branch_id,
         (o.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
  INTO v_branch_id, v_order_date
  FROM public.orders o
  WHERE o.id = NEW.order_id;

  IF v_branch_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Lock the limit row to serialize concurrent inserts of the same item.
  SELECT * INTO v_limit
  FROM public.branch_menu_item_daily_limits
  WHERE branch_id = v_branch_id
    AND menu_item_id = NEW.menu_item_id
    AND limit_date = v_order_date
  FOR UPDATE;

  -- No limit configured → nothing to enforce.
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  IF v_limit.is_disabled THEN
    RAISE EXCEPTION 'daily_limit_item_disabled: %', NEW.menu_item_id
      USING ERRCODE = 'P0001';
  END IF;

  IF v_limit.limit_quantity IS NOT NULL
     AND v_limit.sold_today + NEW.quantity > v_limit.limit_quantity THEN
    RAISE EXCEPTION 'daily_limit_exceeded: item %, limit %, sold %, requested %',
      NEW.menu_item_id, v_limit.limit_quantity, v_limit.sold_today, NEW.quantity
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.branch_menu_item_daily_limits
  SET sold_today = sold_today + NEW.quantity
  WHERE id = v_limit.id;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_enforce_branch_menu_daily_limit
  AFTER INSERT ON public.order_items
  FOR EACH ROW EXECUTE FUNCTION public.enforce_branch_menu_daily_limit();

-- =============================================================
-- DECREMENT TRIGGER on order_items status → cancelled
-- =============================================================
-- When an item is voided or its parent order is cancelled (which
-- propagates to items), free the quota so the kitchen can re-sell it.
-- Uses the parent order's date (not CURRENT_DATE) so a void at 00:05
-- decrements yesterday's row, not today's.
-- =============================================================
CREATE OR REPLACE FUNCTION public.decrement_branch_menu_daily_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_branch_id  BIGINT;
  v_order_date DATE;
BEGIN
  IF OLD.status = 'cancelled' OR NEW.status <> 'cancelled' THEN
    RETURN NEW;
  END IF;

  SELECT o.branch_id,
         (o.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
  INTO v_branch_id, v_order_date
  FROM public.orders o
  WHERE o.id = NEW.order_id;

  IF v_branch_id IS NULL THEN
    RETURN NEW;
  END IF;

  UPDATE public.branch_menu_item_daily_limits
  SET sold_today = GREATEST(0, sold_today - OLD.quantity)
  WHERE branch_id = v_branch_id
    AND menu_item_id = NEW.menu_item_id
    AND limit_date = v_order_date;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_decrement_branch_menu_daily_limit
  AFTER UPDATE OF status ON public.order_items
  FOR EACH ROW EXECUTE FUNCTION public.decrement_branch_menu_daily_limit();

-- =============================================================
-- RPC: list_branch_menu_daily_limits
-- =============================================================
-- Returns one row per active menu item for the given branch + date,
-- LEFT-joined with the configured limit (NULL when unset). The
-- branch-settings page binds directly to this output.
-- =============================================================
CREATE OR REPLACE FUNCTION public.list_branch_menu_daily_limits(
  p_branch_id BIGINT,
  p_limit_date DATE DEFAULT NULL
)
RETURNS TABLE (
  menu_item_id    BIGINT,
  item_name       TEXT,
  category_id     BIGINT,
  category_name   TEXT,
  base_price      NUMERIC(15,2),
  limit_id        BIGINT,
  limit_date      DATE,
  limit_quantity  INT,
  is_disabled     BOOLEAN,
  sold_today      INT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_tenant_id BIGINT := public.auth_tenant_id();
  v_role      TEXT   := public.auth_role();
  v_branch    BIGINT := public.auth_branch_id();
  v_date      DATE   := COALESCE(
    p_limit_date,
    (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
  );
BEGIN
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;

  -- Branch-staff users can only read their own branch.
  IF v_role NOT IN ('owner', 'super_manager', 'area_manager')
     AND (v_branch IS NULL OR v_branch <> p_branch_id) THEN
    RAISE EXCEPTION 'branch scope mismatch' USING ERRCODE = '42501';
  END IF;

  PERFORM 1 FROM public.branches b
   WHERE b.id = p_branch_id AND b.tenant_id = v_tenant_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'branch not found' USING ERRCODE = 'P0002';
  END IF;

  RETURN QUERY
  SELECT
    mi.id,
    mi.name,
    mc.id,
    mc.name,
    mi.base_price,
    bl.id,
    bl.limit_date,
    bl.limit_quantity,
    COALESCE(bl.is_disabled, FALSE),
    COALESCE(bl.sold_today, 0)
  FROM public.menu_items mi
  JOIN public.menu_categories mc ON mc.id = mi.category_id
  LEFT JOIN public.branch_menu_item_daily_limits bl
    ON bl.menu_item_id = mi.id
   AND bl.branch_id = p_branch_id
   AND bl.limit_date = v_date
  WHERE mi.tenant_id = v_tenant_id
    AND mi.is_active = TRUE
  ORDER BY mc.sort_order, mi.sort_order, mi.name;
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_branch_menu_daily_limits(BIGINT, DATE) TO authenticated;

-- =============================================================
-- RPC: get_branch_menu_daily_limits_for_pos
-- =============================================================
-- Lean lookup keyed by menu_item_id. POS uses this alongside its
-- existing menu fetch to disable / annotate sold-out items.
-- =============================================================
CREATE OR REPLACE FUNCTION public.get_branch_menu_daily_limits_for_pos(
  p_branch_id BIGINT
)
RETURNS TABLE (
  menu_item_id    BIGINT,
  limit_quantity  INT,
  is_disabled     BOOLEAN,
  sold_today      INT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    bl.menu_item_id,
    bl.limit_quantity,
    bl.is_disabled,
    bl.sold_today
  FROM public.branch_menu_item_daily_limits bl
  WHERE bl.tenant_id = public.auth_tenant_id()
    AND bl.branch_id = p_branch_id
    AND bl.limit_date = (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
    AND (
      public.auth_role() IN ('owner', 'super_manager', 'area_manager')
      OR public.auth_branch_id() = p_branch_id
    );
$$;

GRANT EXECUTE ON FUNCTION public.get_branch_menu_daily_limits_for_pos(BIGINT) TO authenticated;

-- =============================================================
-- RPC: set_branch_menu_daily_limit
-- =============================================================
-- Upsert (branch, item, today) with the given limit + disabled flag.
-- limit_quantity = NULL clears the quantity cap. To remove enforcement
-- entirely use clear_branch_menu_daily_limit.
-- =============================================================
CREATE OR REPLACE FUNCTION public.set_branch_menu_daily_limit(
  p_branch_id    BIGINT,
  p_menu_item_id BIGINT,
  p_limit_quantity INT,
  p_is_disabled  BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_tenant_id BIGINT := public.auth_tenant_id();
  v_role      TEXT   := public.auth_role();
  v_branch    BIGINT := public.auth_branch_id();
  v_today     DATE   := (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh')::date;
  v_row       public.branch_menu_item_daily_limits;
BEGIN
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;

  IF v_role NOT IN ('owner', 'super_manager', 'area_manager',
                    'branch_manager', 'cashier', 'chef') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF v_role IN ('branch_manager', 'cashier', 'chef')
     AND (v_branch IS NULL OR v_branch <> p_branch_id) THEN
    RAISE EXCEPTION 'branch scope mismatch' USING ERRCODE = '42501';
  END IF;

  IF p_limit_quantity IS NOT NULL AND p_limit_quantity <= 0 THEN
    RAISE EXCEPTION 'limit_quantity must be positive or null' USING ERRCODE = '22023';
  END IF;

  PERFORM 1 FROM public.menu_items mi
    WHERE mi.id = p_menu_item_id
      AND mi.tenant_id = v_tenant_id
      AND mi.is_active = TRUE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'menu item not found' USING ERRCODE = 'P0002';
  END IF;

  PERFORM 1 FROM public.branches b
    WHERE b.id = p_branch_id AND b.tenant_id = v_tenant_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'branch not found' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.branch_menu_item_daily_limits
    (tenant_id, branch_id, menu_item_id, limit_date, limit_quantity, is_disabled, sold_today)
  VALUES
    (v_tenant_id, p_branch_id, p_menu_item_id, v_today, p_limit_quantity, p_is_disabled, 0)
  ON CONFLICT (branch_id, menu_item_id, limit_date)
  DO UPDATE SET
    limit_quantity = EXCLUDED.limit_quantity,
    is_disabled    = EXCLUDED.is_disabled,
    updated_at     = now()
  RETURNING * INTO v_row;

  RETURN jsonb_build_object(
    'id', v_row.id,
    'branch_id', v_row.branch_id,
    'menu_item_id', v_row.menu_item_id,
    'limit_date', v_row.limit_date,
    'limit_quantity', v_row.limit_quantity,
    'is_disabled', v_row.is_disabled,
    'sold_today', v_row.sold_today
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_branch_menu_daily_limit(BIGINT, BIGINT, INT, BOOLEAN) TO authenticated;

-- =============================================================
-- RPC: clear_branch_menu_daily_limit
-- =============================================================
-- Removes today's limit row → no enforcement, item sells uncapped.
-- =============================================================
CREATE OR REPLACE FUNCTION public.clear_branch_menu_daily_limit(
  p_branch_id    BIGINT,
  p_menu_item_id BIGINT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_tenant_id BIGINT := public.auth_tenant_id();
  v_role      TEXT   := public.auth_role();
  v_branch    BIGINT := public.auth_branch_id();
  v_today     DATE   := (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh')::date;
  v_deleted   INT;
BEGIN
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;

  IF v_role NOT IN ('owner', 'super_manager', 'area_manager',
                    'branch_manager', 'cashier', 'chef') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF v_role IN ('branch_manager', 'cashier', 'chef')
     AND (v_branch IS NULL OR v_branch <> p_branch_id) THEN
    RAISE EXCEPTION 'branch scope mismatch' USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.branch_menu_item_daily_limits
   WHERE tenant_id = v_tenant_id
     AND branch_id = p_branch_id
     AND menu_item_id = p_menu_item_id
     AND limit_date = v_today;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN jsonb_build_object('deleted', v_deleted);
END;
$$;

GRANT EXECUTE ON FUNCTION public.clear_branch_menu_daily_limit(BIGINT, BIGINT) TO authenticated;

COMMENT ON TABLE public.branch_menu_item_daily_limits IS
  'Per-(branch, menu item, day) sales caps and disable flags. Trigger on order_items keeps sold_today atomic.';
