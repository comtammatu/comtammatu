-- =============================================================
-- S3 — Waste Q1 full: 2-tier gate, anti-splitting, POS/KDS auto-gen
--
-- Sections:
--   (A) stock_issues / stock_issue_items schema extensions
--   (B) BEFORE INSERT/UPDATE trigger on stock_issue_items:
--       compute tier, photo_required, approval_required
--   (C) BEFORE UPDATE guard on stock_issue_items: reason_code immutable
--   (D) AFTER INSERT sync: set stock_issues.approval_status from items
--   (E) enforce_period_close trigger wrapper for stock_issues
--   (F) RPC create_waste_entry (canonical entrypoint)
--   (G) RPC approve_waste (QLV)
--   (H) RPC create_waste_from_order (POS/KDS adapter)
--   (I) Weekly cron: waste top report
--
-- Tier semantics (from docs/plan/inventory-redesign.md §Q1 §B4):
--   tier 0 = no-gate
--   tier 1 = photo required (value >= 150k, qty_ratio >= 50%,
--            risky reason, rolling-15min same-user-same-sku >= 150k)
--   tier 2 = photo + QLV approval (value >= 500k, shift_cap >= 1.5tr,
--            branch_daily_cap exceeded, reason in {found_missing,
--            theft_suspected}, ingredient requires_manual_review)
--
-- Photo EXIF validation is DEFERRED to S3-b Edge Function.
-- =============================================================


-- =============================================================
-- (A) Schema extensions
-- =============================================================

ALTER TABLE public.stock_issues
  ADD COLUMN IF NOT EXISTS approval_status TEXT NOT NULL DEFAULT 'not_required'
    CHECK (approval_status IN ('not_required','pending','approved','rejected')),
  ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS shift_key   TEXT,
  ADD COLUMN IF NOT EXISTS source_type TEXT NOT NULL DEFAULT 'manual'
    CHECK (source_type IN ('manual','pos_return','kds_cancel_before_cook','kds_cancel_mid_cook','kds_cancel_after_cook')),
  ADD COLUMN IF NOT EXISTS source_ref  JSONB;

COMMENT ON COLUMN public.stock_issues.shift_key IS
  'Canonical shift key (inventory_shift_key) snapshotted at header creation. Used by anti-splitting shift_cap enforcement.';
COMMENT ON COLUMN public.stock_issues.source_type IS
  'manual = UI entry; pos_return = customer return via POS void; kds_cancel_* = chef cancelled mid/after cook (before_cook reserved, should not produce waste rows).';
COMMENT ON COLUMN public.stock_issues.source_ref IS
  'JSONB ref to source row: {order_id, order_item_id} for POS/KDS.';

ALTER TABLE public.stock_issue_items
  ADD COLUMN IF NOT EXISTS reason_code TEXT CHECK (reason_code IS NULL OR reason_code IN (
    'spoiled','expired','dropped','overcook','burned','contaminated',
    'quality_fail','found_missing','theft_suspected','customer_return',
    'kds_cancel_mid_cook','kds_cancel_after_cook','other'
  )),
  ADD COLUMN IF NOT EXISTS photo_urls        TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS photo_required    BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS approval_required BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS waste_tier        SMALLINT CHECK (waste_tier BETWEEN 0 AND 2),
  ADD COLUMN IF NOT EXISTS qty_ratio         NUMERIC(5,4),
  ADD COLUMN IF NOT EXISTS rolling_15min_sum NUMERIC(15,2);

CREATE INDEX IF NOT EXISTS idx_stock_issues_shift_cap
  ON public.stock_issues (branch_id, created_by, shift_key)
  WHERE issue_type = 'writeoff';
CREATE INDEX IF NOT EXISTS idx_stock_issues_branch_day
  ON public.stock_issues (branch_id, issued_at DESC)
  WHERE issue_type = 'writeoff';


-- =============================================================
-- (B) BEFORE INSERT/UPDATE trigger on stock_issue_items
-- =============================================================

CREATE OR REPLACE FUNCTION public.stock_issue_items_compute_waste_tier()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_parent         RECORD;
  v_item_value     NUMERIC(15,2);
  v_stock          RECORD;
  v_qty_ratio      NUMERIC(5,4);
  v_rolling_sum    NUMERIC(15,2);
  v_shift_sum      NUMERIC(15,2);
  v_branch_cap     RECORD;
  v_branch_today   NUMERIC(15,2);
  v_manual_review  BOOLEAN;
  v_photo          BOOLEAN := false;
  v_approve        BOOLEAN := false;
  v_tier           SMALLINT := 0;
  v_risky_reasons  CONSTANT TEXT[] := ARRAY['dropped','quality_fail','contaminated','found_missing','theft_suspected'];
  v_always_tier2   CONSTANT TEXT[] := ARRAY['found_missing','theft_suspected'];
  v_v1_thr         CONSTANT NUMERIC := 150000;
  v_v2_thr         CONSTANT NUMERIC := 500000;
  v_shift_cap      CONSTANT NUMERIC := 1500000;
BEGIN
  SELECT tenant_id, branch_id, source_location_id, created_by, issue_type,
         shift_key, issued_at
    INTO v_parent
  FROM public.stock_issues
  WHERE id = NEW.issue_id;
  IF NOT FOUND OR v_parent.issue_type <> 'writeoff' THEN
    RETURN NEW;
  END IF;

  -- Determine line value. unit_cost may be null → fall back to stock_levels.avg_unit_cost.
  IF NEW.unit_cost IS NOT NULL AND NEW.unit_cost > 0 THEN
    v_item_value := NEW.quantity * NEW.unit_cost;
  ELSE
    SELECT current_quantity, avg_unit_cost
      INTO v_stock
    FROM public.stock_levels
    WHERE branch_id = v_parent.branch_id
      AND ingredient_id = NEW.ingredient_id
      AND (v_parent.source_location_id IS NULL OR location_id = v_parent.source_location_id)
    ORDER BY location_id NULLS LAST
    LIMIT 1;
    IF v_stock.avg_unit_cost IS NOT NULL THEN
      v_item_value := NEW.quantity * v_stock.avg_unit_cost;
    ELSE
      v_item_value := 0;
    END IF;
  END IF;

  -- Qty ratio vs location stock
  SELECT current_quantity INTO v_stock
  FROM public.stock_levels
  WHERE branch_id = v_parent.branch_id
    AND ingredient_id = NEW.ingredient_id
    AND (v_parent.source_location_id IS NULL OR location_id = v_parent.source_location_id)
  ORDER BY location_id NULLS LAST
  LIMIT 1;
  IF v_stock.current_quantity IS NOT NULL AND v_stock.current_quantity > 0 THEN
    v_qty_ratio := LEAST(NEW.quantity / v_stock.current_quantity, 9.9999)::NUMERIC(5,4);
  ELSE
    v_qty_ratio := NULL;
  END IF;

  -- Rolling 15 min, same user, same ingredient (sum of existing submitted lines)
  SELECT COALESCE(SUM(sii.total_cost), 0) INTO v_rolling_sum
  FROM public.stock_issue_items sii
  JOIN public.stock_issues si ON si.id = sii.issue_id
  WHERE si.issue_type = 'writeoff'
    AND si.created_by = v_parent.created_by
    AND si.branch_id = v_parent.branch_id
    AND sii.ingredient_id = NEW.ingredient_id
    AND si.created_at > now() - INTERVAL '15 minutes'
    AND sii.id <> COALESCE(NEW.id, -1);

  -- Shift total so far (same user, same shift_key)
  IF v_parent.shift_key IS NOT NULL THEN
    SELECT COALESCE(SUM(sii.total_cost), 0) INTO v_shift_sum
    FROM public.stock_issue_items sii
    JOIN public.stock_issues si ON si.id = sii.issue_id
    WHERE si.issue_type = 'writeoff'
      AND si.created_by = v_parent.created_by
      AND si.branch_id = v_parent.branch_id
      AND si.shift_key = v_parent.shift_key
      AND sii.id <> COALESCE(NEW.id, -1);
  ELSE
    v_shift_sum := 0;
  END IF;

  -- Branch daily cap
  SELECT cap_vnd, avg_revenue_7d INTO v_branch_cap
  FROM public.branch_daily_waste_cap
  WHERE branch_id = v_parent.branch_id;

  SELECT COALESCE(SUM(sii.total_cost), 0) INTO v_branch_today
  FROM public.stock_issue_items sii
  JOIN public.stock_issues si ON si.id = sii.issue_id
  WHERE si.issue_type = 'writeoff'
    AND si.branch_id = v_parent.branch_id
    AND si.issued_at >= date_trunc('day', now() AT TIME ZONE COALESCE(
        (SELECT timezone FROM public.branches WHERE id = v_parent.branch_id),
        'Asia/Ho_Chi_Minh'))
    AND sii.id <> COALESCE(NEW.id, -1);

  -- Manual review flag
  v_manual_review := public.inventory_requires_manual_review(NEW.ingredient_id);

  -- Tier 1 triggers (photo)
  v_photo := v_item_value >= v_v1_thr
          OR (v_qty_ratio IS NOT NULL AND v_qty_ratio >= 0.5)
          OR (NEW.reason_code IS NOT NULL AND NEW.reason_code = ANY(v_risky_reasons))
          OR (v_rolling_sum + v_item_value) >= v_v1_thr;

  -- Tier 2 triggers (approval)
  v_approve := v_item_value >= v_v2_thr
            OR (v_shift_sum + v_item_value) >= v_shift_cap
            OR (NEW.reason_code IS NOT NULL AND NEW.reason_code = ANY(v_always_tier2))
            OR (v_branch_cap.cap_vnd IS NOT NULL AND (v_branch_today + v_item_value) > v_branch_cap.cap_vnd)
            OR v_manual_review;

  IF v_approve THEN v_tier := 2;
  ELSIF v_photo THEN v_tier := 1;
  ELSE v_tier := 0; END IF;

  NEW.waste_tier        := v_tier;
  NEW.photo_required    := v_photo;
  NEW.approval_required := v_approve;
  NEW.qty_ratio         := v_qty_ratio;
  NEW.rolling_15min_sum := v_rolling_sum;

  -- Photo enforcement (unless bypass permission held)
  IF v_photo
     AND COALESCE(array_length(NEW.photo_urls, 1), 0) = 0
     AND NOT public.has_permission(v_parent.branch_id, 'inventory:waste_bypass_photo') THEN
    RAISE EXCEPTION 'waste photo required for tier >= 1 (reason=%, value=%, qty_ratio=%)',
      NEW.reason_code, v_item_value, v_qty_ratio USING ERRCODE = '22023';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_stock_issue_items_waste_tier ON public.stock_issue_items;
CREATE TRIGGER trg_stock_issue_items_waste_tier
  BEFORE INSERT OR UPDATE OF quantity, unit_cost, ingredient_id, reason_code, photo_urls
  ON public.stock_issue_items
  FOR EACH ROW EXECUTE FUNCTION public.stock_issue_items_compute_waste_tier();


-- =============================================================
-- (C) BEFORE UPDATE — reason_code immutability
-- =============================================================

CREATE OR REPLACE FUNCTION public.stock_issue_items_reason_immutable()
RETURNS TRIGGER LANGUAGE plpgsql AS $function$
BEGIN
  IF OLD.reason_code IS NOT NULL AND NEW.reason_code IS DISTINCT FROM OLD.reason_code THEN
    RAISE EXCEPTION 'reason_code is immutable once set (got % -> %). Cancel and re-file instead.',
      OLD.reason_code, NEW.reason_code USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END; $function$;

DROP TRIGGER IF EXISTS trg_stock_issue_items_reason_immutable ON public.stock_issue_items;
CREATE TRIGGER trg_stock_issue_items_reason_immutable
  BEFORE UPDATE OF reason_code ON public.stock_issue_items
  FOR EACH ROW EXECUTE FUNCTION public.stock_issue_items_reason_immutable();


-- =============================================================
-- (D) AFTER INSERT sync: set stock_issues.approval_status
-- =============================================================

CREATE OR REPLACE FUNCTION public.stock_issue_items_bubble_approval()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.approval_required THEN
    UPDATE public.stock_issues
       SET approval_status = 'pending'
     WHERE id = NEW.issue_id
       AND approval_status = 'not_required';
  END IF;
  RETURN NEW;
END; $function$;

DROP TRIGGER IF EXISTS trg_stock_issue_items_bubble_approval ON public.stock_issue_items;
CREATE TRIGGER trg_stock_issue_items_bubble_approval
  AFTER INSERT OR UPDATE OF approval_required ON public.stock_issue_items
  FOR EACH ROW EXECUTE FUNCTION public.stock_issue_items_bubble_approval();


-- =============================================================
-- (E) enforce_period_close for stock_issues
-- =============================================================

CREATE OR REPLACE FUNCTION public.enforce_period_close_stock_issues()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_status TEXT;
BEGIN
  IF NEW.issued_at IS NULL OR NEW.tenant_id IS NULL THEN RETURN NEW; END IF;
  v_status := public.period_status_at(NEW.tenant_id, NEW.issued_at);
  IF v_status = 'hard_closed'
     AND NOT public.has_permission(NULL, 'accounting:period_reopen') THEN
    RAISE EXCEPTION 'target accounting period is hard-closed; accounting:period_reopen required'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END; $function$;

DROP TRIGGER IF EXISTS trg_enforce_period_close_stock_issues ON public.stock_issues;
CREATE TRIGGER trg_enforce_period_close_stock_issues
  BEFORE INSERT OR UPDATE OF issued_at ON public.stock_issues
  FOR EACH ROW EXECUTE FUNCTION public.enforce_period_close_stock_issues();


-- =============================================================
-- (F) RPC create_waste_entry — canonical UI entrypoint
-- =============================================================

CREATE OR REPLACE FUNCTION public.create_waste_entry(
  p_branch_id    BIGINT,
  p_location_id  BIGINT,
  p_items        JSONB,   -- [{ingredient_id, quantity, unit, unit_cost?, reason_code, photo_urls?, note?}]
  p_source_type  TEXT DEFAULT 'manual',
  p_source_ref   JSONB DEFAULT NULL,
  p_notes        TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid        UUID := auth.uid();
  v_tenant     BIGINT;
  v_shift_key  TEXT;
  v_issue_id   BIGINT;
  v_issue_no   TEXT;
  v_item       JSONB;
  v_photos     TEXT[];
  v_created    INT := 0;
  v_needs_appr BOOLEAN := false;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000'; END IF;
  IF NOT public.has_permission(p_branch_id, 'inventory:writeoff') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT tenant_id INTO v_tenant FROM public.branches WHERE id = p_branch_id;
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'branch not found' USING ERRCODE = 'P0002'; END IF;

  v_shift_key := public.inventory_shift_key(p_branch_id, now());
  v_issue_no  := 'WO-' || to_char(now(), 'YYMMDDHH24MISS') || '-' || substr(gen_random_uuid()::TEXT, 1, 4);

  INSERT INTO public.stock_issues (
    tenant_id, branch_id, issue_number, issue_type, status, notes,
    issued_at, created_by, source_location_id, approval_status,
    shift_key, source_type, source_ref
  ) VALUES (
    v_tenant, p_branch_id, v_issue_no, 'writeoff', 'draft', p_notes,
    now(), v_uid, p_location_id, 'not_required',
    v_shift_key, COALESCE(p_source_type, 'manual'), p_source_ref
  ) RETURNING id INTO v_issue_id;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items)
  LOOP
    v_photos := CASE WHEN v_item ? 'photo_urls'
                     THEN ARRAY(SELECT jsonb_array_elements_text(v_item->'photo_urls'))
                     ELSE ARRAY[]::TEXT[] END;

    INSERT INTO public.stock_issue_items (
      tenant_id, issue_id, ingredient_id, quantity, unit, unit_cost,
      reason_code, photo_urls, reason
    ) VALUES (
      v_tenant,
      v_issue_id,
      (v_item->>'ingredient_id')::BIGINT,
      (v_item->>'quantity')::NUMERIC,
      COALESCE(v_item->>'unit', 'kg'),
      NULLIF(v_item->>'unit_cost','')::NUMERIC,
      v_item->>'reason_code',
      v_photos,
      v_item->>'note'
    );
    v_created := v_created + 1;
  END LOOP;

  SELECT bool_or(approval_required) INTO v_needs_appr
  FROM public.stock_issue_items WHERE issue_id = v_issue_id;

  IF v_needs_appr THEN
    -- Leave status=draft, approval_status=pending (set by bubble trigger)
    NULL;
  ELSE
    -- No approval required: confirm immediately. Existing downstream
    -- stock_movement machinery handles stock level debit on confirm.
    UPDATE public.stock_issues SET status = 'confirmed' WHERE id = v_issue_id;
  END IF;

  RETURN jsonb_build_object(
    'issue_id', v_issue_id,
    'issue_number', v_issue_no,
    'shift_key', v_shift_key,
    'items_created', v_created,
    'requires_approval', v_needs_appr
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.create_waste_entry(BIGINT, BIGINT, JSONB, TEXT, JSONB, TEXT)
  TO authenticated;


-- =============================================================
-- (G) RPC approve_waste — QLV approval
-- =============================================================

CREATE OR REPLACE FUNCTION public.approve_waste(
  p_issue_id  BIGINT,
  p_decision  TEXT,  -- 'approved' | 'rejected'
  p_note      TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid   UUID := auth.uid();
  v_issue RECORD;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000'; END IF;
  IF p_decision NOT IN ('approved','rejected') THEN
    RAISE EXCEPTION 'decision must be approved or rejected' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_issue FROM public.stock_issues WHERE id = p_issue_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'issue not found' USING ERRCODE = 'P0002'; END IF;
  IF v_issue.issue_type <> 'writeoff' THEN
    RAISE EXCEPTION 'issue is not a writeoff' USING ERRCODE = '22023';
  END IF;
  IF NOT public.has_permission(v_issue.branch_id, 'inventory:waste_approve') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF v_issue.approval_status <> 'pending' THEN
    RAISE EXCEPTION 'issue is not pending approval (status=%)', v_issue.approval_status USING ERRCODE = '22023';
  END IF;

  UPDATE public.stock_issues
     SET approval_status = p_decision,
         approved_by     = v_uid,
         approved_at     = now(),
         status          = CASE WHEN p_decision = 'approved' THEN 'confirmed' ELSE 'cancelled' END,
         notes           = COALESCE(notes, '') ||
                           CASE WHEN p_note IS NOT NULL
                                THEN E'\n[' || p_decision || ' by ' || v_uid::TEXT || '] ' || p_note
                                ELSE '' END
   WHERE id = p_issue_id;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.approve_waste(BIGINT, TEXT, TEXT) TO authenticated;


-- =============================================================
-- (H) RPC create_waste_from_order — POS/KDS adapter
-- =============================================================

CREATE OR REPLACE FUNCTION public.create_waste_from_order(
  p_order_id    BIGINT,
  p_location_id BIGINT,
  p_source_type TEXT,    -- 'pos_return' | 'kds_cancel_mid_cook' | 'kds_cancel_after_cook'
  p_items       JSONB,   -- pre-expanded ingredients from POS/KDS: [{ingredient_id, quantity, unit, reason_code?}]
  p_note        TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_order         RECORD;
  v_default_reason TEXT;
  v_items_norm    JSONB;
BEGIN
  IF p_source_type NOT IN ('pos_return','kds_cancel_mid_cook','kds_cancel_after_cook') THEN
    RAISE EXCEPTION 'source_type must be pos_return / kds_cancel_mid_cook / kds_cancel_after_cook' USING ERRCODE = '22023';
  END IF;
  IF p_source_type = 'pos_return' THEN v_default_reason := 'customer_return';
  ELSE                                  v_default_reason := p_source_type; END IF;

  SELECT id, branch_id INTO v_order FROM public.orders WHERE id = p_order_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'order not found' USING ERRCODE = 'P0002'; END IF;

  -- Backfill reason_code default when caller omitted
  SELECT jsonb_agg(
           CASE WHEN item ? 'reason_code' THEN item
                ELSE item || jsonb_build_object('reason_code', v_default_reason) END
         )
    INTO v_items_norm
  FROM jsonb_array_elements(p_items) AS item;

  RETURN public.create_waste_entry(
    p_branch_id   := v_order.branch_id,
    p_location_id := p_location_id,
    p_items       := v_items_norm,
    p_source_type := p_source_type,
    p_source_ref  := jsonb_build_object('order_id', p_order_id),
    p_notes       := COALESCE(p_note, 'Auto from order #' || p_order_id::TEXT)
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.create_waste_from_order(BIGINT, BIGINT, TEXT, JSONB, TEXT)
  TO authenticated;


-- =============================================================
-- (I) Weekly cron: waste top report
-- =============================================================

CREATE OR REPLACE FUNCTION public.weekly_waste_report()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_row RECORD; v_count INT := 0;
BEGIN
  FOR v_row IN
    SELECT
      si.tenant_id,
      si.branch_id,
      COUNT(*) AS waste_count,
      COUNT(*) FILTER (WHERE si.approval_status = 'pending')  AS pending_count,
      COUNT(*) FILTER (WHERE si.approval_status = 'approved') AS approved_count,
      COUNT(*) FILTER (WHERE si.approval_status = 'rejected') AS rejected_count,
      COALESCE(SUM(sii.total_cost), 0)                         AS total_value
    FROM public.stock_issues si
    JOIN public.stock_issue_items sii ON sii.issue_id = si.id
    WHERE si.issue_type = 'writeoff'
      AND si.issued_at > now() - INTERVAL '7 days'
    GROUP BY si.tenant_id, si.branch_id
  LOOP
    INSERT INTO public.notifications (
      tenant_id, target_branch_id, target_roles, kind, severity, title, body, meta, dedup_key
    ) VALUES (
      v_row.tenant_id, v_row.branch_id,
      ARRAY['owner','super_manager','quan_ly_vung','quan_ly_CN']::TEXT[],
      'inventory.waste.weekly_report',
      CASE WHEN v_row.pending_count >= 5 THEN 'warning' ELSE 'info' END,
      'Báo cáo waste — tuần vừa qua',
      format('Chi nhánh có %s phiếu waste tuần qua (pending: %s, approved: %s, rejected: %s). Tổng giá trị: %s VND',
             v_row.waste_count, v_row.pending_count, v_row.approved_count, v_row.rejected_count, v_row.total_value),
      jsonb_build_object(
        'waste_count',    v_row.waste_count,
        'pending_count',  v_row.pending_count,
        'approved_count', v_row.approved_count,
        'rejected_count', v_row.rejected_count,
        'total_value',    v_row.total_value
      ),
      format('waste_report:%s:%s', v_row.branch_id, to_char(now(), 'IYYY-IW'))
    );
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END; $function$;

DO $sched$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'weekly_waste_report') THEN
    PERFORM cron.schedule('weekly_waste_report', '0 2 * * 1', 'SELECT public.weekly_waste_report();');
  END IF;
END $sched$;
