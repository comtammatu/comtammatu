-- =============================================================
-- M5-Ext Stocktake: stocktake sessions + lines, complete_stocktake RPC,
-- GRN temperature column, expiry index.
-- =============================================================

-- ─── 1. stocktake_sessions ───

CREATE TABLE public.stocktake_sessions (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id       BIGINT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id       BIGINT NOT NULL REFERENCES public.branches(id) ON DELETE RESTRICT,
  started_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at    TIMESTAMPTZ,
  status          TEXT NOT NULL DEFAULT 'in_progress'
                  CHECK (status IN ('in_progress', 'completed', 'cancelled')),
  notes           TEXT,
  created_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Partial unique: only one active stocktake per branch
CREATE UNIQUE INDEX idx_one_active_stocktake_per_branch
  ON public.stocktake_sessions(branch_id, tenant_id)
  WHERE status = 'in_progress';

CREATE INDEX idx_stocktake_sessions_tenant ON public.stocktake_sessions(tenant_id);
CREATE INDEX idx_stocktake_sessions_branch ON public.stocktake_sessions(branch_id);

ALTER TABLE public.stocktake_sessions ENABLE ROW LEVEL SECURITY;

-- SELECT: tenant match
CREATE POLICY "stocktake_sessions_select" ON public.stocktake_sessions
  FOR SELECT TO authenticated
  USING (tenant_id = public.auth_tenant_id());

-- INSERT: tenant match + INVENTORY_OPS_ROLES
-- branch_manager can only create for own branch
CREATE POLICY "stocktake_sessions_insert" ON public.stocktake_sessions
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND public.auth_role() IN ('owner', 'super_manager', 'area_manager', 'branch_manager')
    AND (
      public.auth_branch_id() IS NULL  -- tenant-wide roles (owner, super_manager, area_manager)
      OR branch_id = public.auth_branch_id()  -- branch_manager: own branch only
    )
  );

-- UPDATE: same as INSERT
CREATE POLICY "stocktake_sessions_update" ON public.stocktake_sessions
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

-- No DELETE policy (never delete stocktake records)

GRANT SELECT, INSERT, UPDATE ON TABLE public.stocktake_sessions TO authenticated;

-- ─── 2. stocktake_lines ───

CREATE TABLE public.stocktake_lines (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id       BIGINT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  session_id      BIGINT NOT NULL REFERENCES public.stocktake_sessions(id) ON DELETE CASCADE,
  ingredient_id   BIGINT NOT NULL REFERENCES public.ingredients(id) ON DELETE RESTRICT,
  system_quantity NUMERIC(15,3) NOT NULL,
  counted_quantity NUMERIC(15,3),
  variance        NUMERIC(15,3) GENERATED ALWAYS AS (counted_quantity - system_quantity) STORED,
  variance_reason TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (session_id, ingredient_id, tenant_id)
);

CREATE INDEX idx_stocktake_lines_session ON public.stocktake_lines(session_id);

ALTER TABLE public.stocktake_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "stocktake_lines_select" ON public.stocktake_lines
  FOR SELECT TO authenticated
  USING (tenant_id = public.auth_tenant_id());

CREATE POLICY "stocktake_lines_insert" ON public.stocktake_lines
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND public.auth_role() IN ('owner', 'super_manager', 'area_manager', 'branch_manager')
  );

CREATE POLICY "stocktake_lines_update" ON public.stocktake_lines
  FOR UPDATE TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.auth_role() IN ('owner', 'super_manager', 'area_manager', 'branch_manager')
  )
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND public.auth_role() IN ('owner', 'super_manager', 'area_manager', 'branch_manager')
  );

GRANT SELECT, INSERT, UPDATE ON TABLE public.stocktake_lines TO authenticated;

-- ─── 3. RPC: complete_stocktake ───

CREATE OR REPLACE FUNCTION public.complete_stocktake(p_session_id BIGINT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid           UUID := auth.uid();
  v_tenant        BIGINT := public.auth_tenant_id();
  v_session       RECORD;
  v_line          RECORD;
  v_fresh_qty     NUMERIC(15,3);
  v_adjustment    NUMERIC(15,3);
  v_total_lines   INT := 0;
  v_adjusted      INT := 0;
  v_total_var_abs NUMERIC(15,3) := 0;
BEGIN
  -- Auth check
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  -- Lock session
  SELECT s.* INTO v_session
  FROM public.stocktake_sessions s
  WHERE s.id = p_session_id AND s.tenant_id = v_tenant
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'session_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_session.status <> 'in_progress' THEN
    RAISE EXCEPTION 'session_not_in_progress' USING ERRCODE = '22023';
  END IF;

  -- Verify ALL lines have counted_quantity
  IF EXISTS (
    SELECT 1 FROM public.stocktake_lines sl
    WHERE sl.session_id = p_session_id
      AND sl.tenant_id = v_tenant
      AND sl.counted_quantity IS NULL
  ) THEN
    RAISE EXCEPTION 'uncounted_lines_exist' USING ERRCODE = '22023';
  END IF;

  -- Process each line
  FOR v_line IN
    SELECT * FROM public.stocktake_lines sl
    WHERE sl.session_id = p_session_id AND sl.tenant_id = v_tenant
  LOOP
    v_total_lines := v_total_lines + 1;

    -- Re-snapshot: read FRESH stock_levels.current_quantity
    SELECT COALESCE(stl.current_quantity, 0) INTO v_fresh_qty
    FROM public.stock_levels stl
    WHERE stl.tenant_id = v_tenant
      AND stl.branch_id = v_session.branch_id
      AND stl.ingredient_id = v_line.ingredient_id;

    IF NOT FOUND THEN
      v_fresh_qty := 0;
    END IF;

    -- Compute adjustment against FRESH quantity (not stale snapshot)
    v_adjustment := v_line.counted_quantity - v_fresh_qty;

    IF v_adjustment <> 0 THEN
      v_adjusted := v_adjusted + 1;
      v_total_var_abs := v_total_var_abs + abs(v_adjustment);

      -- Insert stock_movement — existing trigger handles stock_levels update + last_counted_at
      INSERT INTO public.stock_movements (
        tenant_id, branch_id, ingredient_id, type, quantity_change,
        reason, created_by
      ) VALUES (
        v_tenant,
        v_session.branch_id,
        v_line.ingredient_id,
        'count_adjustment',
        v_adjustment,
        COALESCE(v_line.variance_reason, 'Stocktake #' || p_session_id::text),
        v_uid
      );
    END IF;
  END LOOP;

  -- Mark session completed
  UPDATE public.stocktake_sessions
  SET status = 'completed', completed_at = now()
  WHERE id = p_session_id;

  RETURN jsonb_build_object(
    'success', true,
    'session_id', p_session_id,
    'total_lines', v_total_lines,
    'adjusted_lines', v_adjusted,
    'total_variance_abs', v_total_var_abs
  );
END;
$$;

REVOKE ALL ON FUNCTION public.complete_stocktake(BIGINT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_stocktake(BIGINT) TO authenticated;

-- ─── 4. ALTER grn_items: receiving_temperature ───

ALTER TABLE public.grn_items
  ADD COLUMN IF NOT EXISTS receiving_temperature NUMERIC(5,1);

COMMENT ON COLUMN public.grn_items.receiving_temperature IS 'Receiving temperature in °C — applicable for cold/frozen items.';

-- ─── 5. Index for expiry queries ───

CREATE INDEX IF NOT EXISTS idx_grn_items_expiry
  ON public.grn_items(expiry_date)
  WHERE expiry_date IS NOT NULL;
