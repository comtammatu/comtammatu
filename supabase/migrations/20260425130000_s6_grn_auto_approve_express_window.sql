-- =============================================================
-- S6 — Q4a GRN deterministic auto-approve + Express window
--
-- Sections:
--   (A) branch_express_window table + seeded defaults
--   (B) grn_express_extend_audit table
--   (C) RPC configure_express_window (QLV/Admin)
--   (D) RPC extend_express_window (QL CN, +60min, 3/week)
--   (E) RPC grn_is_auto_approvable (evaluator JSONB)
--   (F) RPC try_auto_approve_grn (wrapper → confirm + express_approved)
--
-- Evaluator 7 conditions:
--   1. GRN has PO
--   2. All lines variance_tier <= 1 (< 30%)       [soft — express bypass]
--   3. Total diff <= 3% & line qty <= 10% & price <= 15%
--   4. No line with quality issue (rejected/partial/short-delivery)
--   5. GRN total value <= 10.000.000 VND
--   6. Supplier has >= 3 confirmed GRN in 90d     [soft — express bypass]
--   7. No line ingredient requires manual review
--
-- approved := hard_ok AND (soft_ok OR in_window)
--   hard_ok = cond 1,3,4,5,7
--   soft_ok = cond 2,6
--
-- Current docs: docs/ref/inventory.md + docs/ref/inventory-sop.md
-- =============================================================


-- =============================================================
-- (A) branch_express_window
-- =============================================================

CREATE TABLE IF NOT EXISTS public.branch_express_window (
  branch_id  BIGINT PRIMARY KEY REFERENCES public.branches(id) ON DELETE CASCADE,
  enabled    BOOLEAN NOT NULL DEFAULT true,
  start_time TIME    NOT NULL DEFAULT '06:00',
  end_time   TIME    NOT NULL DEFAULT '09:00',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id),
  CHECK (start_time < end_time)
);

COMMENT ON TABLE public.branch_express_window IS
  'Daily express auto-approve window per branch, local to branches.timezone. Default 06:00-09:00. Only bypasses soft conditions (2 variance, 6 supplier history) — never hard conditions.';

ALTER TABLE public.branch_express_window ENABLE ROW LEVEL SECURITY;

CREATE POLICY "express_window_read" ON public.branch_express_window
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.branches b WHERE b.id = branch_express_window.branch_id AND b.tenant_id = public.auth_tenant_id())
  );

CREATE POLICY "express_window_rpc_only_write" ON public.branch_express_window
  FOR ALL TO authenticated USING (false) WITH CHECK (false);

-- Seed defaults for existing active branches (idempotent)
INSERT INTO public.branch_express_window (branch_id)
SELECT id FROM public.branches WHERE is_active = true
ON CONFLICT (branch_id) DO NOTHING;


-- =============================================================
-- (B) grn_express_extend_audit
-- =============================================================

CREATE TABLE IF NOT EXISTS public.grn_express_extend_audit (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id       BIGINT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id       BIGINT NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  user_id         UUID   NOT NULL REFERENCES auth.users(id),
  extended_until  TIMESTAMPTZ NOT NULL,   -- effective absolute end of extended window
  extend_minutes  INT    NOT NULL CHECK (extend_minutes > 0 AND extend_minutes <= 60),
  note            TEXT   NOT NULL CHECK (length(note) >= 10),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_grn_extend_rate
  ON public.grn_express_extend_audit (user_id, created_at DESC);

COMMENT ON TABLE public.grn_express_extend_audit IS
  'Append-only log of QL CN extends. Rate limit 3/week/user enforced at RPC; +60 min max per extend.';

ALTER TABLE public.grn_express_extend_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY "extend_audit_read_branch" ON public.grn_express_extend_audit
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND (
      public.has_permission(branch_id, 'inventory:grn_express_extend')
      OR public.has_permission(NULL, 'reports:view_branch')
      OR public.has_permission(NULL, 'reports:view_tenant')
    )
  );
CREATE POLICY "extend_audit_rpc_only_write" ON public.grn_express_extend_audit
  FOR ALL TO authenticated USING (false) WITH CHECK (false);


-- =============================================================
-- (C) configure_express_window
-- =============================================================

CREATE OR REPLACE FUNCTION public.configure_express_window(
  p_branch_id  BIGINT,
  p_enabled    BOOLEAN,
  p_start_time TIME DEFAULT '06:00',
  p_end_time   TIME DEFAULT '09:00'
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000'; END IF;
  IF NOT public.has_permission(p_branch_id, 'inventory:grn_express_configure') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_start_time >= p_end_time THEN
    RAISE EXCEPTION 'start_time must be before end_time' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.branch_express_window (branch_id, enabled, start_time, end_time, updated_at, updated_by)
  VALUES (p_branch_id, p_enabled, p_start_time, p_end_time, now(), v_uid)
  ON CONFLICT (branch_id) DO UPDATE
    SET enabled    = EXCLUDED.enabled,
        start_time = EXCLUDED.start_time,
        end_time   = EXCLUDED.end_time,
        updated_at = EXCLUDED.updated_at,
        updated_by = EXCLUDED.updated_by;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.configure_express_window(BIGINT, BOOLEAN, TIME, TIME) TO authenticated;


-- =============================================================
-- (D) extend_express_window (QL CN, rate 3/week)
-- =============================================================

CREATE OR REPLACE FUNCTION public.extend_express_window(
  p_branch_id BIGINT,
  p_minutes   INT,
  p_note      TEXT
)
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid    UUID := auth.uid();
  v_tz     TEXT;
  v_recent INT;
  v_until  TIMESTAMPTZ;
  v_win    RECORD;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000'; END IF;
  IF NOT public.has_permission(p_branch_id, 'inventory:grn_express_extend') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_minutes IS NULL OR p_minutes <= 0 OR p_minutes > 60 THEN
    RAISE EXCEPTION 'minutes must be in (0, 60]' USING ERRCODE = '22023';
  END IF;
  IF length(COALESCE(p_note, '')) < 10 THEN
    RAISE EXCEPTION 'note must be at least 10 characters' USING ERRCODE = '22023';
  END IF;

  SELECT COUNT(*) INTO v_recent FROM public.grn_express_extend_audit
   WHERE user_id = v_uid AND created_at > now() - INTERVAL '7 days';
  IF v_recent >= 3 THEN
    RAISE EXCEPTION 'express-extend rate-limit (3/week) exceeded' USING ERRCODE = '54000';
  END IF;

  SELECT timezone INTO v_tz FROM public.branches WHERE id = p_branch_id;
  IF v_tz IS NULL THEN v_tz := 'Asia/Ho_Chi_Minh'; END IF;

  SELECT enabled, start_time, end_time INTO v_win
    FROM public.branch_express_window WHERE branch_id = p_branch_id;
  IF NOT FOUND OR NOT v_win.enabled THEN
    RAISE EXCEPTION 'express window not enabled for branch %', p_branch_id USING ERRCODE = '22023';
  END IF;

  -- Compute absolute end: today's date (branch-local) + end_time, at branch timezone, + extend
  v_until := (((now() AT TIME ZONE v_tz)::DATE + v_win.end_time) AT TIME ZONE v_tz) + make_interval(mins => p_minutes);

  INSERT INTO public.grn_express_extend_audit (tenant_id, branch_id, user_id, extended_until, extend_minutes, note)
  SELECT b.tenant_id, p_branch_id, v_uid, v_until, p_minutes, p_note
    FROM public.branches b WHERE b.id = p_branch_id;

  RETURN v_until;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.extend_express_window(BIGINT, INT, TEXT) TO authenticated;


-- =============================================================
-- (E) grn_is_auto_approvable — 7-condition evaluator
-- =============================================================

CREATE OR REPLACE FUNCTION public.grn_is_auto_approvable(p_grn_id BIGINT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_tenant     BIGINT := public.auth_tenant_id();
  v_grn        RECORD;
  v_tz         TEXT;
  v_local_time TIMESTAMP;
  v_win        RECORD;
  v_in_base    BOOLEAN := false;
  v_in_ext     BOOLEAN := false;
  v_in_window  BOOLEAN;
  v_total_grn  NUMERIC;
  v_total_po   NUMERIC;
  v_line_qty_max NUMERIC;
  v_line_prc_max NUMERIC;
  v_bad_qc     INT;
  v_bad_review INT;
  v_bad_var    INT;
  v_sup_hist   INT;
  v_cap        NUMERIC := 10000000;
  v_c1 BOOLEAN; v_c2 BOOLEAN; v_c3 BOOLEAN; v_c4 BOOLEAN;
  v_c5 BOOLEAN; v_c6 BOOLEAN; v_c7 BOOLEAN;
  v_hard_ok BOOLEAN; v_soft_ok BOOLEAN; v_approved BOOLEAN;
  v_reasons TEXT[] := ARRAY[]::TEXT[];
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000'; END IF;

  SELECT * INTO v_grn FROM public.goods_received_notes WHERE id = p_grn_id AND tenant_id = v_tenant;
  IF NOT FOUND THEN RAISE EXCEPTION 'grn not found' USING ERRCODE = 'P0002'; END IF;
  IF NOT public.has_permission(v_grn.branch_id, 'inventory:read') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  -- Window check (base + extends)
  SELECT timezone INTO v_tz FROM public.branches WHERE id = v_grn.branch_id;
  IF v_tz IS NULL THEN v_tz := 'Asia/Ho_Chi_Minh'; END IF;
  v_local_time := now() AT TIME ZONE v_tz;

  SELECT enabled, start_time, end_time INTO v_win
    FROM public.branch_express_window WHERE branch_id = v_grn.branch_id;
  IF FOUND AND v_win.enabled THEN
    v_in_base := (v_local_time::TIME >= v_win.start_time AND v_local_time::TIME < v_win.end_time);
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.grn_express_extend_audit
     WHERE branch_id = v_grn.branch_id AND extended_until > now()
       AND created_at > now() - INTERVAL '1 day'
  ) INTO v_in_ext;

  v_in_window := v_in_base OR v_in_ext;

  -- Condition 1: has PO
  v_c1 := v_grn.po_id IS NOT NULL;
  IF NOT v_c1 THEN v_reasons := v_reasons || 'no_po'; END IF;

  -- Condition 2: all lines variance_tier <= 1
  SELECT COUNT(*) INTO v_bad_var FROM public.grn_items
   WHERE grn_id = p_grn_id AND (variance_tier IS NULL OR variance_tier > 1);
  v_c2 := v_bad_var = 0;
  IF NOT v_c2 THEN v_reasons := v_reasons || 'variance_tier_gt1'; END IF;

  -- Condition 3: totals + per-line
  IF v_c1 THEN
    SELECT COALESCE(SUM(received_quantity * unit_cost), 0) INTO v_total_grn
      FROM public.grn_items WHERE grn_id = p_grn_id;
    SELECT COALESCE(SUM(line_total), 0) INTO v_total_po
      FROM public.purchase_order_items WHERE po_id = v_grn.po_id;
    SELECT COALESCE(MAX(ABS(gi.received_quantity - gi.po_quantity) / NULLIF(gi.po_quantity, 0)), 0)
      INTO v_line_qty_max FROM public.grn_items gi WHERE gi.grn_id = p_grn_id;
    SELECT COALESCE(MAX(ABS(gi.unit_cost - gi.po_unit_price) / NULLIF(gi.po_unit_price, 0)), 0)
      INTO v_line_prc_max FROM public.grn_items gi WHERE gi.grn_id = p_grn_id;

    v_c3 := (v_total_po > 0 AND ABS(v_total_grn - v_total_po) / v_total_po <= 0.03)
         AND v_line_qty_max <= 0.10
         AND v_line_prc_max <= 0.15;
  ELSE
    v_c3 := false;
  END IF;
  IF NOT v_c3 THEN v_reasons := v_reasons || 'line_totals_diff'; END IF;

  -- Condition 4: no quality issue
  SELECT COUNT(*) INTO v_bad_qc FROM public.grn_items
   WHERE grn_id = p_grn_id
     AND (quality_status IN ('rejected','partial')
          OR rejected_quantity > 0
          OR short_delivery_action IS NOT NULL);
  v_c4 := v_bad_qc = 0;
  IF NOT v_c4 THEN v_reasons := v_reasons || 'quality_issue'; END IF;

  -- Condition 5: value cap
  IF v_total_grn IS NULL THEN
    SELECT COALESCE(SUM(received_quantity * unit_cost), 0) INTO v_total_grn
      FROM public.grn_items WHERE grn_id = p_grn_id;
  END IF;
  v_c5 := v_total_grn <= v_cap;
  IF NOT v_c5 THEN v_reasons := v_reasons || 'value_cap'; END IF;

  -- Condition 6: supplier history >= 3 confirmed in 90d
  SELECT COUNT(*) INTO v_sup_hist FROM public.goods_received_notes
   WHERE supplier_id = v_grn.supplier_id AND status = 'confirmed'
     AND received_date > now() - INTERVAL '90 days'
     AND id <> p_grn_id;
  v_c6 := v_sup_hist >= 3;
  IF NOT v_c6 THEN v_reasons := v_reasons || 'supplier_history_lt3'; END IF;

  -- Condition 7: no manual-review ingredient
  SELECT COUNT(*) INTO v_bad_review FROM public.grn_items gi
   WHERE gi.grn_id = p_grn_id
     AND public.inventory_requires_manual_review(gi.ingredient_id) = true;
  v_c7 := v_bad_review = 0;
  IF NOT v_c7 THEN v_reasons := v_reasons || 'ingredient_manual_review'; END IF;

  v_hard_ok := v_c1 AND v_c3 AND v_c4 AND v_c5 AND v_c7;
  v_soft_ok := v_c2 AND v_c6;
  v_approved := v_hard_ok AND (v_soft_ok OR v_in_window);

  RETURN jsonb_build_object(
    'grn_id', p_grn_id,
    'approved', v_approved,
    'hard_ok',  v_hard_ok,
    'soft_ok',  v_soft_ok,
    'in_window', v_in_window,
    'in_base_window', v_in_base,
    'in_extended_window', v_in_ext,
    'total_grn_value', v_total_grn,
    'total_po_value',  v_total_po,
    'supplier_grn_count_90d', v_sup_hist,
    'conditions', jsonb_build_object(
      'c1_has_po',              v_c1,
      'c2_variance_ok',         v_c2,
      'c3_line_totals_diff',    v_c3,
      'c4_no_quality_issue',    v_c4,
      'c5_value_cap',           v_c5,
      'c6_supplier_history',    v_c6,
      'c7_no_manual_review',    v_c7
    ),
    'failed_reasons', to_jsonb(v_reasons),
    'evaluated_at', now()
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.grn_is_auto_approvable(BIGINT) TO authenticated;


-- =============================================================
-- (F) try_auto_approve_grn — wrapper
-- =============================================================

CREATE OR REPLACE FUNCTION public.try_auto_approve_grn(p_grn_id BIGINT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid   UUID := auth.uid();
  v_eval  JSONB;
  v_grn   RECORD;
  v_confirm_result JSONB;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000'; END IF;

  SELECT id, branch_id, status INTO v_grn FROM public.goods_received_notes WHERE id = p_grn_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'grn not found' USING ERRCODE = 'P0002'; END IF;
  IF NOT public.has_permission(v_grn.branch_id, 'procurement:grn_confirm') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF v_grn.status <> 'draft' THEN
    RETURN jsonb_build_object('approved', false, 'reason', 'grn not in draft', 'status', v_grn.status);
  END IF;

  v_eval := public.grn_is_auto_approvable(p_grn_id);
  IF NOT (v_eval->>'approved')::BOOLEAN THEN
    RETURN jsonb_build_object(
      'approved', false,
      'evaluation', v_eval,
      'status', v_grn.status
    );
  END IF;

  -- Mark express_approved BEFORE calling confirm so the grn_last trigger skips upsert
  UPDATE public.goods_received_notes
     SET express_approved = true
   WHERE id = p_grn_id;

  -- Delegate to existing confirm RPC (handles PO status + stock movements)
  v_confirm_result := public.confirm_goods_receipt_note(p_grn_id);

  RETURN jsonb_build_object(
    'approved',   true,
    'evaluation', v_eval,
    'confirm',    v_confirm_result
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.try_auto_approve_grn(BIGINT) TO authenticated;
