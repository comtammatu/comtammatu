-- =============================================================
-- S2 — Q3 full: GRN variance tier trigger, hardblock override,
-- baseline pause, auto-upsert grn_last.
--
-- Sections:
--   (A) grn_items columns for variance tier + is_hard_blocked
--   (B) goods_received_notes.express_approved flag (mock for S6)
--   (C) grn_baseline_pause table (30-day suppression post-override)
--   (D) grn_hardblock_overrides table
--   (E) Storage bucket grn-evidence + policies
--   (F) Refactor baseline compute: _internal + public wrapper
--   (G) BEFORE trigger: compute variance on grn_items
--   (H) AFTER trigger: upsert grn_last on GRN confirmed
--   (I) RPC override_grn_hardblock with 2/week rate-limit
--   (J) Weekly cron: top-override notification report
--
-- Tier thresholds (hardcoded for MVP; external config in S9+):
--   [0,  15)%  -> tier 0 (ok / hint)
--   [15, 30)%  -> tier 1 (confirm)
--   [30, 100)% -> tier 2 (note + override code)
--   [100,inf)% -> tier 3 (hard block)
--
-- Spec:       docs/plan/inventory-redesign.md §Q3 + §Q6
-- Regression: tasks/regressions.md BASELINE-SAMPLE-MIN
-- =============================================================


-- =============================================================
-- (A) grn_items — variance tier columns
-- =============================================================

ALTER TABLE public.grn_items
  ADD COLUMN IF NOT EXISTS variance_tier     SMALLINT CHECK (variance_tier BETWEEN 0 AND 3),
  ADD COLUMN IF NOT EXISTS baseline_source   TEXT CHECK (baseline_source IN ('same_supplier','any_supplier','none','paused')),
  ADD COLUMN IF NOT EXISTS baseline_sample_n INT,
  ADD COLUMN IF NOT EXISTS is_hard_blocked   BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.grn_items.variance_tier IS
  '0=ok (<15%), 1=confirm (15-30%), 2=note (30-100%), 3=hardblock (>=100%). Populated by grn_items_compute_variance() trigger. Do NOT set from app code — overwritten.';
COMMENT ON COLUMN public.grn_items.baseline_source IS
  'Source of baseline used: same_supplier / any_supplier / none / paused (after recent hardblock override).';
COMMENT ON COLUMN public.grn_items.is_hard_blocked IS
  'True when variance_tier=3 AND no valid override row in grn_hardblock_overrides. Read-only, trigger-maintained.';


-- =============================================================
-- (B) goods_received_notes.express_approved (mock for S6)
-- =============================================================

ALTER TABLE public.goods_received_notes
  ADD COLUMN IF NOT EXISTS express_approved BOOLEAN;

COMMENT ON COLUMN public.goods_received_notes.express_approved IS
  'NULL default. TRUE when Q4a express auto-approved (S6). Used by grn_last upsert trigger to skip baseline poisoning.';


-- =============================================================
-- (C) grn_baseline_pause
-- =============================================================

CREATE TABLE IF NOT EXISTS public.grn_baseline_pause (
  id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id      BIGINT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  supplier_id    BIGINT NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  ingredient_id  BIGINT NOT NULL REFERENCES public.ingredients(id) ON DELETE CASCADE,
  uom            TEXT   NOT NULL,
  paused_until   DATE   NOT NULL,
  reason         TEXT   NOT NULL DEFAULT 'hardblock_override',
  source_ref     JSONB,                              -- {hardblock_override_id, grn_id}
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by     UUID REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS idx_baseline_pause_lookup
  ON public.grn_baseline_pause (tenant_id, supplier_id, ingredient_id, uom, paused_until DESC);

COMMENT ON TABLE public.grn_baseline_pause IS
  'Suppresses MV baseline lookup for 30 days after hardblock override so outlier prices do not poison avg_30d. Variance trigger treats paused rows as baseline_source=''paused'', variance NULL.';

ALTER TABLE public.grn_baseline_pause ENABLE ROW LEVEL SECURITY;
CREATE POLICY "baseline_pause_read" ON public.grn_baseline_pause
  FOR SELECT TO authenticated
  USING (tenant_id = public.auth_tenant_id() AND public.has_permission(NULL, 'procurement:price_list_read'));
-- Write is trigger-only via RPC (no direct INSERT for authenticated)
CREATE POLICY "baseline_pause_no_client_write" ON public.grn_baseline_pause
  FOR ALL TO authenticated USING (false) WITH CHECK (false);


-- =============================================================
-- (D) grn_hardblock_overrides
-- =============================================================

CREATE TABLE IF NOT EXISTS public.grn_hardblock_overrides (
  id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id      BIGINT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id      BIGINT NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  grn_item_id    BIGINT NOT NULL REFERENCES public.grn_items(id) ON DELETE CASCADE,
  supplier_id    BIGINT NOT NULL REFERENCES public.suppliers(id),
  ingredient_id  BIGINT NOT NULL REFERENCES public.ingredients(id),
  uom            TEXT   NOT NULL,
  submitted_price     NUMERIC(15,2) NOT NULL,
  baseline_avg_30d    NUMERIC(15,2),
  variance_pct        NUMERIC(7,3) NOT NULL,
  evidence_url        TEXT NOT NULL,
  reason_code         TEXT NOT NULL CHECK (reason_code IN ('market_spike','contract_new','quality_upgrade','fx_jump','emergency_supply','other')),
  note                TEXT NOT NULL CHECK (length(note) >= 50),
  overridden_by       UUID NOT NULL REFERENCES auth.users(id),
  overridden_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hardblock_overrides_rate
  ON public.grn_hardblock_overrides (tenant_id, overridden_by, overridden_at DESC);
CREATE INDEX IF NOT EXISTS idx_hardblock_overrides_item
  ON public.grn_hardblock_overrides (grn_item_id);

COMMENT ON TABLE public.grn_hardblock_overrides IS
  'Append-only log of QLV-approved hardblock overrides. Rate-limit 2/week/user enforced at RPC. Each override auto-creates 30-day baseline pause.';

ALTER TABLE public.grn_hardblock_overrides ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hardblock_read_branch" ON public.grn_hardblock_overrides
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND (public.has_permission(branch_id, 'inventory:grn_hardblock_override')
         OR public.has_permission(NULL, 'reports:view_branch')
         OR public.has_permission(NULL, 'reports:view_tenant'))
  );
CREATE POLICY "hardblock_rpc_only_write" ON public.grn_hardblock_overrides
  FOR ALL TO authenticated USING (false) WITH CHECK (false);


-- =============================================================
-- (E) Storage bucket grn-evidence + policies
-- =============================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('grn-evidence', 'grn-evidence', false)
ON CONFLICT (id) DO NOTHING;

-- Upload: must have grn_hardblock_override perm for this branch
CREATE POLICY "grn_evidence_upload" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'grn-evidence'
    AND public.has_permission(NULL, 'inventory:grn_hardblock_override')
  );

-- Read: override holders + report viewers
CREATE POLICY "grn_evidence_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'grn-evidence'
    AND (
      public.has_permission(NULL, 'inventory:grn_hardblock_override')
      OR public.has_permission(NULL, 'reports:view_branch')
      OR public.has_permission(NULL, 'reports:view_tenant')
    )
  );

-- No delete — evidence is audit-grade
CREATE POLICY "grn_evidence_no_delete" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id <> 'grn-evidence');


-- =============================================================
-- (F) Refactor baseline compute: _internal + perm-gated wrapper
-- =============================================================

-- Internal helper — callable only by SECURITY DEFINER parents.
-- No perm check; caller provides tenant_id.
CREATE OR REPLACE FUNCTION public._compute_grn_price_baseline(
  p_tenant_id     BIGINT,
  p_supplier_id   BIGINT,
  p_ingredient_id BIGINT,
  p_uom           TEXT DEFAULT NULL
)
RETURNS TABLE (
  avg_30d         NUMERIC(15,2),
  sample_n        INT,
  last_seen_at    DATE,
  baseline_source TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_pause_until DATE;
  v_primary     RECORD;
  v_fallback    RECORD;
BEGIN
  -- Baseline pause (post hardblock override)
  SELECT MAX(paused_until) INTO v_pause_until
  FROM public.grn_baseline_pause
  WHERE tenant_id     = p_tenant_id
    AND supplier_id   = p_supplier_id
    AND ingredient_id = p_ingredient_id
    AND (p_uom IS NULL OR uom = p_uom)
    AND paused_until >= CURRENT_DATE;

  IF v_pause_until IS NOT NULL THEN
    RETURN QUERY SELECT NULL::NUMERIC(15,2), 0, NULL::DATE, 'paused'::TEXT;
    RETURN;
  END IF;

  -- Primary: same supplier
  SELECT b.avg_30d, b.sample_n, b.last_seen_at
    INTO v_primary
  FROM public.mv_grn_price_baseline b
  WHERE b.tenant_id     = p_tenant_id
    AND b.supplier_id   = p_supplier_id
    AND b.ingredient_id = p_ingredient_id
    AND (p_uom IS NULL OR b.uom = p_uom);

  IF FOUND AND v_primary.sample_n >= 3 THEN
    RETURN QUERY SELECT v_primary.avg_30d, v_primary.sample_n, v_primary.last_seen_at, 'same_supplier'::TEXT;
    RETURN;
  END IF;

  -- Fallback: any supplier
  SELECT (SUM(b.avg_30d * b.sample_n) / NULLIF(SUM(b.sample_n), 0))::NUMERIC(15,2) AS avg_30d,
         SUM(b.sample_n)::INT AS sample_n,
         MAX(b.last_seen_at)  AS last_seen_at
    INTO v_fallback
  FROM public.mv_grn_price_baseline b
  WHERE b.tenant_id     = p_tenant_id
    AND b.ingredient_id = p_ingredient_id
    AND (p_uom IS NULL OR b.uom = p_uom);

  IF v_fallback.sample_n IS NOT NULL AND v_fallback.sample_n >= 3 THEN
    RETURN QUERY SELECT v_fallback.avg_30d, v_fallback.sample_n, v_fallback.last_seen_at, 'any_supplier'::TEXT;
    RETURN;
  END IF;

  RETURN QUERY SELECT NULL::NUMERIC(15,2), 0, NULL::DATE, 'none'::TEXT;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public._compute_grn_price_baseline(BIGINT, BIGINT, BIGINT, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public._compute_grn_price_baseline(BIGINT, BIGINT, BIGINT, TEXT) FROM authenticated;

-- Redefine public wrapper to delegate to internal helper
CREATE OR REPLACE FUNCTION public.get_grn_price_baseline(
  p_supplier_id   BIGINT,
  p_ingredient_id BIGINT,
  p_uom           TEXT DEFAULT NULL
)
RETURNS TABLE (
  avg_30d         NUMERIC(15,2),
  sample_n        INT,
  last_seen_at    DATE,
  baseline_source TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_tenant BIGINT := public.auth_tenant_id();
BEGIN
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;
  IF NOT public.has_permission(NULL, 'procurement:price_list_read') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY SELECT * FROM public._compute_grn_price_baseline(v_tenant, p_supplier_id, p_ingredient_id, p_uom);
END;
$function$;


-- =============================================================
-- (G) BEFORE trigger: compute variance on grn_items write
-- =============================================================

CREATE OR REPLACE FUNCTION public.grn_items_compute_variance()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_grn      RECORD;
  v_baseline RECORD;
  v_abs_pct  NUMERIC;
  v_tier     SMALLINT;
BEGIN
  IF NEW.unit_cost IS NULL OR NEW.unit_cost <= 0 THEN
    NEW.variance_tier     := NULL;
    NEW.baseline_source   := NULL;
    NEW.baseline_sample_n := NULL;
    NEW.price_variance_pct:= NULL;
    NEW.is_hard_blocked   := false;
    RETURN NEW;
  END IF;

  SELECT tenant_id, supplier_id INTO v_grn
  FROM public.goods_received_notes
  WHERE id = NEW.grn_id;
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  SELECT avg_30d, sample_n, baseline_source
    INTO v_baseline
  FROM public._compute_grn_price_baseline(v_grn.tenant_id, v_grn.supplier_id, NEW.ingredient_id, NEW.unit);

  NEW.baseline_source   := v_baseline.baseline_source;
  NEW.baseline_sample_n := v_baseline.sample_n;

  IF v_baseline.avg_30d IS NULL THEN
    -- baseline unavailable / paused: require manual approve path at app
    NEW.variance_tier     := NULL;
    NEW.price_variance_pct:= NULL;
    NEW.is_hard_blocked   := false;
    RETURN NEW;
  END IF;

  v_abs_pct := ABS(NEW.unit_cost - v_baseline.avg_30d) / v_baseline.avg_30d;
  NEW.price_variance_pct := (v_abs_pct * 100)::NUMERIC(7,3);

  IF      v_abs_pct < 0.15 THEN v_tier := 0;
  ELSIF   v_abs_pct < 0.30 THEN v_tier := 1;
  ELSIF   v_abs_pct < 1.00 THEN v_tier := 2;
  ELSE                          v_tier := 3;
  END IF;

  NEW.variance_tier   := v_tier;
  NEW.is_hard_blocked := (v_tier = 3)
                         AND NOT EXISTS (
                           SELECT 1 FROM public.grn_hardblock_overrides
                           WHERE grn_item_id = NEW.id
                         );
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_grn_items_compute_variance ON public.grn_items;
CREATE TRIGGER trg_grn_items_compute_variance
  BEFORE INSERT OR UPDATE OF unit_cost, unit, ingredient_id, grn_id
  ON public.grn_items
  FOR EACH ROW
  EXECUTE FUNCTION public.grn_items_compute_variance();


-- =============================================================
-- (H) AFTER trigger: auto-upsert grn_last on confirm
-- =============================================================

CREATE OR REPLACE FUNCTION public.trg_upsert_grn_last_on_confirm()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Only fire on transition INTO 'confirmed', skip express-approved
  IF NEW.status <> 'confirmed' THEN RETURN NEW; END IF;
  IF OLD.status = 'confirmed' THEN RETURN NEW; END IF;
  IF COALESCE(NEW.express_approved, false) THEN RETURN NEW; END IF;

  INSERT INTO public.supplier_price_list (
    tenant_id, supplier_id, ingredient_id, uom,
    unit_price, source, effective_from, source_ref, created_by
  )
  SELECT
    NEW.tenant_id,
    NEW.supplier_id,
    gi.ingredient_id,
    gi.unit,
    gi.unit_cost,
    'grn_last',
    CURRENT_DATE,
    jsonb_build_object('grn_id', NEW.id, 'grn_item_id', gi.id),
    NEW.created_by
  FROM public.grn_items gi
  WHERE gi.grn_id = NEW.id
    AND gi.received_quantity > 0
    AND gi.unit_cost IS NOT NULL
    AND gi.unit_cost > 0
  ON CONFLICT (tenant_id, supplier_id, ingredient_id, uom)
    WHERE source = 'grn_last' AND effective_to IS NULL
  DO UPDATE SET
    unit_price     = EXCLUDED.unit_price,
    effective_from = EXCLUDED.effective_from,
    source_ref     = EXCLUDED.source_ref,
    created_at     = now(),
    created_by     = EXCLUDED.created_by;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_grn_upsert_grn_last ON public.goods_received_notes;
CREATE TRIGGER trg_grn_upsert_grn_last
  AFTER UPDATE OF status ON public.goods_received_notes
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_upsert_grn_last_on_confirm();


-- =============================================================
-- (I) RPC override_grn_hardblock (QLV, 2/week rate-limit)
-- =============================================================

CREATE OR REPLACE FUNCTION public.override_grn_hardblock(
  p_grn_item_id BIGINT,
  p_evidence_url TEXT,
  p_reason_code  TEXT,
  p_note         TEXT
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid       UUID := auth.uid();
  v_grn       RECORD;
  v_item      RECORD;
  v_baseline  RECORD;
  v_recent    INT;
  v_ov_id     BIGINT;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;

  SELECT gi.*, grn.branch_id, grn.tenant_id AS grn_tenant, grn.supplier_id AS grn_supplier
    INTO v_item
  FROM public.grn_items gi
  JOIN public.goods_received_notes grn ON grn.id = gi.grn_id
  WHERE gi.id = p_grn_item_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'grn_item not found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.has_permission(v_item.branch_id, 'inventory:grn_hardblock_override') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF v_item.variance_tier IS NULL OR v_item.variance_tier < 3 THEN
    RAISE EXCEPTION 'grn_item is not hard-blocked' USING ERRCODE = '22023';
  END IF;

  IF length(COALESCE(p_note, '')) < 50 THEN
    RAISE EXCEPTION 'note must be at least 50 characters' USING ERRCODE = '22023';
  END IF;
  IF p_evidence_url IS NULL OR length(p_evidence_url) = 0 THEN
    RAISE EXCEPTION 'evidence_url required' USING ERRCODE = '22023';
  END IF;

  -- Rate limit: 2 overrides / user / rolling 7 days
  SELECT COUNT(*) INTO v_recent
  FROM public.grn_hardblock_overrides
  WHERE overridden_by = v_uid
    AND overridden_at > now() - INTERVAL '7 days';

  IF v_recent >= 2 THEN
    RAISE EXCEPTION 'hardblock override rate-limit (2/week) exceeded — escalate to admin' USING ERRCODE = '54000';
  END IF;

  -- Compute baseline for audit snapshot
  SELECT avg_30d INTO v_baseline
  FROM public._compute_grn_price_baseline(v_item.grn_tenant, v_item.grn_supplier, v_item.ingredient_id, v_item.unit);

  INSERT INTO public.grn_hardblock_overrides (
    tenant_id, branch_id, grn_item_id, supplier_id, ingredient_id, uom,
    submitted_price, baseline_avg_30d, variance_pct,
    evidence_url, reason_code, note, overridden_by
  ) VALUES (
    v_item.grn_tenant, v_item.branch_id, p_grn_item_id, v_item.grn_supplier, v_item.ingredient_id, v_item.unit,
    v_item.unit_cost, v_baseline.avg_30d, v_item.price_variance_pct,
    p_evidence_url, p_reason_code, p_note, v_uid
  )
  RETURNING id INTO v_ov_id;

  -- 30-day baseline pause
  INSERT INTO public.grn_baseline_pause (
    tenant_id, supplier_id, ingredient_id, uom, paused_until, reason, source_ref, created_by
  ) VALUES (
    v_item.grn_tenant, v_item.grn_supplier, v_item.ingredient_id, v_item.unit,
    CURRENT_DATE + INTERVAL '30 days', 'hardblock_override',
    jsonb_build_object('hardblock_override_id', v_ov_id, 'grn_id', v_item.grn_id),
    v_uid
  );

  -- Clear the block on the item
  UPDATE public.grn_items SET is_hard_blocked = false WHERE id = p_grn_item_id;

  RETURN v_ov_id;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.override_grn_hardblock(BIGINT, TEXT, TEXT, TEXT)
  TO authenticated;


-- =============================================================
-- (J) Weekly top-override cron → notifications
-- =============================================================

CREATE OR REPLACE FUNCTION public.weekly_grn_override_report()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_row RECORD;
  v_count INT := 0;
BEGIN
  FOR v_row IN
    SELECT
      ho.tenant_id,
      ho.branch_id,
      COUNT(*) AS override_count,
      COUNT(DISTINCT ho.overridden_by) AS distinct_users,
      SUM(ho.submitted_price - COALESCE(ho.baseline_avg_30d, 0)) AS total_markup_vnd
    FROM public.grn_hardblock_overrides ho
    WHERE ho.overridden_at > now() - INTERVAL '7 days'
    GROUP BY ho.tenant_id, ho.branch_id
    HAVING COUNT(*) >= 1
  LOOP
    INSERT INTO public.notifications (
      tenant_id, target_branch_id, target_roles, kind, severity, title, body, meta, dedup_key
    ) VALUES (
      v_row.tenant_id,
      v_row.branch_id,
      ARRAY['owner','super_manager','quan_ly_vung']::TEXT[],
      'inventory.grn.weekly_override_report',
      CASE WHEN v_row.override_count >= 5 THEN 'warning' ELSE 'info' END,
      'GRN hardblock override — weekly report',
      format('Branch has %s hardblock overrides by %s user(s) in past 7 days. Total markup: %s VND',
             v_row.override_count, v_row.distinct_users, v_row.total_markup_vnd),
      jsonb_build_object(
        'override_count',   v_row.override_count,
        'distinct_users',   v_row.distinct_users,
        'total_markup_vnd', v_row.total_markup_vnd
      ),
      format('grn_override_report:%s:%s', v_row.branch_id, to_char(now(), 'IYYY-IW'))
    );
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$function$;

COMMENT ON FUNCTION public.weekly_grn_override_report() IS
  'Aggregates hardblock overrides of the past 7 days and pushes a notification to admins per branch. Scheduled Friday 09:00 Asia/Ho_Chi_Minh = 02:00 UTC.';

DO $sched$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'weekly_grn_override_report') THEN
    PERFORM cron.schedule(
      'weekly_grn_override_report',
      '0 2 * * 5',     -- 02:00 UTC Friday = 09:00 VN Friday
      'SELECT public.weekly_grn_override_report();'
    );
  END IF;
END $sched$;
