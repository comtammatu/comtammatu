-- =============================================================
-- M5-Ext: Phiếu xuất kho (stock_issues + stock_issue_items)
-- Stock issue vouchers for internal consumption, write-offs, kitchen use.
-- Unlike stock_transfers (inter-branch), issues record goods leaving a
-- branch warehouse for internal use.
-- =============================================================

-- ─── 1. stock_issues ───

CREATE TABLE public.stock_issues (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id     BIGINT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id     BIGINT NOT NULL REFERENCES public.branches(id) ON DELETE RESTRICT,
  issue_number  TEXT NOT NULL,
  issue_type    TEXT NOT NULL DEFAULT 'consumption'
                CHECK (issue_type IN ('consumption', 'writeoff', 'kitchen_use', 'other')),
  status        TEXT NOT NULL DEFAULT 'draft'
                CHECK (status IN ('draft', 'confirmed', 'cancelled')),
  notes         TEXT,
  issued_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (issue_number, tenant_id)
);

CREATE TRIGGER trg_stock_issues_updated_at
  BEFORE UPDATE ON public.stock_issues
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE INDEX idx_stock_issues_tenant  ON public.stock_issues(tenant_id);
CREATE INDEX idx_stock_issues_branch  ON public.stock_issues(branch_id);
CREATE INDEX idx_stock_issues_status  ON public.stock_issues(tenant_id, status);

ALTER TABLE public.stock_issues ENABLE ROW LEVEL SECURITY;

-- SELECT: tenant-scoped; branch_manager sees own branch only
CREATE POLICY "stock_issues_select" ON public.stock_issues
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND (
      public.auth_branch_id() IS NULL
      OR branch_id = public.auth_branch_id()
    )
  );

-- INSERT: INVENTORY_OPS_ROLES + branch scope
CREATE POLICY "stock_issues_insert" ON public.stock_issues
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND public.auth_role() IN ('owner', 'super_manager', 'area_manager', 'branch_manager')
    AND (
      public.auth_branch_id() IS NULL
      OR branch_id = public.auth_branch_id()
    )
  );

-- UPDATE: same as INSERT (status changes allowed here too)
CREATE POLICY "stock_issues_update" ON public.stock_issues
  FOR UPDATE TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.auth_role() IN ('owner', 'super_manager', 'area_manager', 'branch_manager')
    AND (
      public.auth_branch_id() IS NULL
      OR branch_id = public.auth_branch_id()
    )
  )
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND public.auth_role() IN ('owner', 'super_manager', 'area_manager', 'branch_manager')
    AND (
      public.auth_branch_id() IS NULL
      OR branch_id = public.auth_branch_id()
    )
  );

GRANT SELECT, INSERT, UPDATE ON TABLE public.stock_issues TO authenticated;

-- ─── 2. stock_issue_items ───

CREATE TABLE public.stock_issue_items (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id     BIGINT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  issue_id      BIGINT NOT NULL REFERENCES public.stock_issues(id) ON DELETE CASCADE,
  ingredient_id BIGINT NOT NULL REFERENCES public.ingredients(id) ON DELETE RESTRICT,
  quantity      NUMERIC(15,3) NOT NULL CHECK (quantity > 0),
  unit          TEXT NOT NULL,
  unit_cost     NUMERIC(15,2) NOT NULL DEFAULT 0,
  total_cost    NUMERIC(15,2) GENERATED ALWAYS AS (quantity * unit_cost) STORED,
  reason        TEXT,

  UNIQUE (issue_id, ingredient_id, tenant_id)
);

CREATE INDEX idx_stock_issue_items_issue  ON public.stock_issue_items(issue_id);
CREATE INDEX idx_stock_issue_items_tenant ON public.stock_issue_items(tenant_id);

ALTER TABLE public.stock_issue_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "stock_issue_items_select" ON public.stock_issue_items
  FOR SELECT TO authenticated
  USING (tenant_id = public.auth_tenant_id());

CREATE POLICY "stock_issue_items_insert" ON public.stock_issue_items
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND public.auth_role() IN ('owner', 'super_manager', 'area_manager', 'branch_manager')
    AND EXISTS (
      SELECT 1 FROM public.stock_issues si
      WHERE si.id = issue_id
        AND si.tenant_id = public.auth_tenant_id()
        AND si.status = 'draft'
        AND (public.auth_branch_id() IS NULL OR si.branch_id = public.auth_branch_id())
    )
  );

CREATE POLICY "stock_issue_items_update" ON public.stock_issue_items
  FOR UPDATE TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.auth_role() IN ('owner', 'super_manager', 'area_manager', 'branch_manager')
    AND EXISTS (
      SELECT 1 FROM public.stock_issues si
      WHERE si.id = issue_id AND si.status = 'draft'
        AND (public.auth_branch_id() IS NULL OR si.branch_id = public.auth_branch_id())
    )
  )
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND public.auth_role() IN ('owner', 'super_manager', 'area_manager', 'branch_manager')
  );

CREATE POLICY "stock_issue_items_delete" ON public.stock_issue_items
  FOR DELETE TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.auth_role() IN ('owner', 'super_manager', 'area_manager', 'branch_manager')
    AND EXISTS (
      SELECT 1 FROM public.stock_issues si
      WHERE si.id = issue_id AND si.status = 'draft'
        AND (public.auth_branch_id() IS NULL OR si.branch_id = public.auth_branch_id())
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.stock_issue_items TO authenticated;

-- ─── 3. Add issue_id traceability to stock_movements ───

ALTER TABLE public.stock_movements
  ADD COLUMN IF NOT EXISTS issue_id BIGINT REFERENCES public.stock_issues(id);

CREATE INDEX IF NOT EXISTS idx_stock_movements_issue
  ON public.stock_movements(issue_id)
  WHERE issue_id IS NOT NULL;

-- ─── 4. confirm_stock_issue RPC ───
-- Atomically:
--   1. Validate issue is draft + tenant owns it
--   2. For each item: check stock, decrement stock_levels, insert stock_movements
--   3. Mark issue confirmed

CREATE OR REPLACE FUNCTION public.confirm_stock_issue(p_issue_id BIGINT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid     UUID   := auth.uid();
  v_tenant  BIGINT := public.auth_tenant_id();
  v_issue   RECORD;
  v_item    RECORD;
  v_sl      NUMERIC(15,3);
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO v_issue
  FROM public.stock_issues
  WHERE id = p_issue_id AND tenant_id = v_tenant
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'issue_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_issue.status <> 'draft' THEN
    RAISE EXCEPTION 'issue_not_draft' USING ERRCODE = '22023';
  END IF;

  FOR v_item IN
    SELECT * FROM public.stock_issue_items
    WHERE issue_id = p_issue_id AND tenant_id = v_tenant
  LOOP
    -- Check available stock
    SELECT sl.current_quantity INTO v_sl
    FROM public.stock_levels sl
    WHERE sl.tenant_id = v_tenant
      AND sl.branch_id = v_issue.branch_id
      AND sl.ingredient_id = v_item.ingredient_id;

    IF NOT FOUND THEN
      v_sl := 0;
    END IF;

    IF v_sl < v_item.quantity THEN
      RAISE EXCEPTION 'insufficient_stock_for_%', v_item.ingredient_id
        USING ERRCODE = '22023';
    END IF;

    -- Decrement stock
    UPDATE public.stock_levels
    SET current_quantity = current_quantity - v_item.quantity
    WHERE tenant_id = v_tenant
      AND branch_id = v_issue.branch_id
      AND ingredient_id = v_item.ingredient_id;

    -- Record consumption movement
    INSERT INTO public.stock_movements (
      tenant_id, branch_id, ingredient_id, type,
      quantity_change, unit_cost, reason, created_by, issue_id
    ) VALUES (
      v_tenant,
      v_issue.branch_id,
      v_item.ingredient_id,
      'consumption',
      -v_item.quantity,
      v_item.unit_cost,
      COALESCE(v_item.reason, v_issue.notes),
      v_uid,
      p_issue_id
    );
  END LOOP;

  -- Mark confirmed
  UPDATE public.stock_issues
  SET status = 'confirmed'
  WHERE id = p_issue_id AND tenant_id = v_tenant;

  RETURN jsonb_build_object('ok', true, 'issue_id', p_issue_id);
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_stock_issue(BIGINT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.confirm_stock_issue(BIGINT) TO authenticated;
