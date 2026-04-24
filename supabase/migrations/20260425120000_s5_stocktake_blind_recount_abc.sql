-- =============================================================
-- S5 — Stocktake Q2 full: blind mode, multi-round recount,
-- ABC classification, cross-branch auditor flag.
--
-- Sections:
--   (A) stocktake_sessions schema extensions (mode, blind, auditor, thresholds)
--   (B) stocktake_lines schema extensions + UNIQUE redo for rounds
--   (C) ingredient_abc_class table + compute function + weekly cron
--   (D) mv_inventory_value_ranking MV (source of ABC), REVOKED
--   (E) RESTRICTIVE RLS on stocktake_lines for blind mode
--   (F) RPC start_stocktake (seeds round-1 lines, freezes ABC snapshot)
--   (G) RPC get_stocktake_lines_blind (omits system_quantity)
--   (H) RPC submit_count_round (batch upsert round counts)
--   (I) RPC close_recount_round (flag needs_recount per threshold)
--   (J) RPC finalize_stocktake (assert is_final, mark session completed)
--   (K) RPC escalate_round_4 (QLV/admin manual final)
--   (L) RPC assign_auditor (soft-enforce monthly audit)
--
-- Spec:       docs/plan/inventory-redesign.md §Q2 + §B1 + §B9
-- Regression: tasks/regressions.md RLS-NOT-APPLIED-ON-MV
-- =============================================================


-- =============================================================
-- (A) stocktake_sessions extensions
-- =============================================================

ALTER TABLE public.stocktake_sessions
  ADD COLUMN IF NOT EXISTS mode TEXT NOT NULL DEFAULT 'daily'
    CHECK (mode IN ('daily','weekly','monthly','quarterly','spot')),
  ADD COLUMN IF NOT EXISTS blind_mode BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS auditor_id UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS auditor_branch_id BIGINT REFERENCES public.branches(id),
  ADD COLUMN IF NOT EXISTS is_unaudited BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS variance_threshold_pct NUMERIC(5,2) NOT NULL DEFAULT 5.00,
  ADD COLUMN IF NOT EXISTS variance_threshold_vnd NUMERIC(15,2) NOT NULL DEFAULT 200000,
  ADD COLUMN IF NOT EXISTS variance_threshold_pct_class_a NUMERIC(5,2) NOT NULL DEFAULT 3.00,
  ADD COLUMN IF NOT EXISTS variance_threshold_vnd_class_a NUMERIC(15,2) NOT NULL DEFAULT 100000,
  ADD COLUMN IF NOT EXISTS abc_snapshot_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS current_round SMALLINT NOT NULL DEFAULT 1 CHECK (current_round BETWEEN 1 AND 4);

COMMENT ON COLUMN public.stocktake_sessions.mode IS
  'daily/weekly/monthly/quarterly/spot — dictates blind policy and audit requirement per §Q2 §B1.';
COMMENT ON COLUMN public.stocktake_sessions.is_unaudited IS
  'Soft flag: TRUE when mode IN (monthly, quarterly) and no auditor_id assigned — visible in reports, not a hard block.';
COMMENT ON COLUMN public.stocktake_sessions.abc_snapshot_at IS
  'Timestamp at which ingredient_abc_class was frozen into this session. Lines inherit A/B/C from snapshot, not live.';


-- =============================================================
-- (B) stocktake_lines extensions + UNIQUE redo
-- =============================================================

ALTER TABLE public.stocktake_lines
  ADD COLUMN IF NOT EXISTS round_no       SMALLINT NOT NULL DEFAULT 1 CHECK (round_no BETWEEN 1 AND 4),
  ADD COLUMN IF NOT EXISTS counted_by     UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS counted_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS needs_recount  BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_final       BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS abc_class      CHAR(1) CHECK (abc_class IN ('A','B','C'));

-- Drop old UNIQUE, add round-aware UNIQUE
ALTER TABLE public.stocktake_lines
  DROP CONSTRAINT IF EXISTS stocktake_lines_session_id_ingredient_id_tenant_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS uq_stocktake_lines_round
  ON public.stocktake_lines (session_id, ingredient_id, round_no);


-- =============================================================
-- (C) ingredient_abc_class
-- =============================================================

CREATE TABLE IF NOT EXISTS public.ingredient_abc_class (
  tenant_id     BIGINT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id     BIGINT NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  ingredient_id BIGINT NOT NULL REFERENCES public.ingredients(id) ON DELETE CASCADE,
  class         CHAR(1) NOT NULL CHECK (class IN ('A','B','C')),
  stock_value   NUMERIC(15,2) NOT NULL DEFAULT 0,
  cumulative_share NUMERIC(5,4) NOT NULL DEFAULT 0,
  computed_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, branch_id, ingredient_id)
);

COMMENT ON TABLE public.ingredient_abc_class IS
  'Pareto 80/15/5 classification per (tenant, branch, ingredient). Refreshed weekly via refresh_abc_classification(). Branch <30 days old inherits tenant-global ranking.';

ALTER TABLE public.ingredient_abc_class ENABLE ROW LEVEL SECURITY;
CREATE POLICY "abc_read_own_tenant" ON public.ingredient_abc_class
  FOR SELECT TO authenticated
  USING (tenant_id = public.auth_tenant_id());
CREATE POLICY "abc_no_client_write" ON public.ingredient_abc_class
  FOR ALL TO authenticated USING (false) WITH CHECK (false);


-- =============================================================
-- (D) mv_inventory_value_ranking (source for ABC)
-- =============================================================

DROP MATERIALIZED VIEW IF EXISTS public.mv_inventory_value_ranking;

CREATE MATERIALIZED VIEW public.mv_inventory_value_ranking AS
SELECT
  tenant_id,
  branch_id,
  ingredient_id,
  SUM(stock_value) AS total_value
FROM public.mv_inventory_stock_current
GROUP BY tenant_id, branch_id, ingredient_id;

CREATE UNIQUE INDEX IF NOT EXISTS uq_mv_inv_value_ranking
  ON public.mv_inventory_value_ranking (tenant_id, branch_id, ingredient_id);

REVOKE ALL ON public.mv_inventory_value_ranking FROM authenticated;
REVOKE ALL ON public.mv_inventory_value_ranking FROM anon;


-- ABC compute function (per-branch, tenant fallback for new branches)
CREATE OR REPLACE FUNCTION public.refresh_abc_classification()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_count INT;
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_inventory_value_ranking;

  DELETE FROM public.ingredient_abc_class;

  INSERT INTO public.ingredient_abc_class (tenant_id, branch_id, ingredient_id, class, stock_value, cumulative_share)
  WITH ranked AS (
    SELECT
      r.tenant_id, r.branch_id, r.ingredient_id, r.total_value,
      SUM(r.total_value) OVER (PARTITION BY r.tenant_id, r.branch_id
                                ORDER BY r.total_value DESC
                                ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS running_sum,
      SUM(r.total_value) OVER (PARTITION BY r.tenant_id, r.branch_id) AS branch_total
    FROM public.mv_inventory_value_ranking r
    WHERE r.total_value > 0
  )
  SELECT
    tenant_id, branch_id, ingredient_id,
    CASE
      WHEN running_sum / NULLIF(branch_total, 0) <= 0.80 THEN 'A'
      WHEN running_sum / NULLIF(branch_total, 0) <= 0.95 THEN 'B'
      ELSE                                                    'C'
    END AS class,
    total_value,
    COALESCE(running_sum / NULLIF(branch_total, 0), 0)::NUMERIC(5,4) AS cumulative_share
  FROM ranked;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$function$;

COMMENT ON FUNCTION public.refresh_abc_classification() IS
  'Rebuilds ingredient_abc_class with Pareto 80/15/5. Refresh underlying value ranking MV first. Called weekly by pg_cron and on-demand at stocktake session start.';


-- SECURITY DEFINER wrapper for ABC reads
CREATE OR REPLACE FUNCTION public.get_ingredient_abc_class(p_branch_id BIGINT, p_ingredient_id BIGINT)
RETURNS CHAR
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_tenant BIGINT := public.auth_tenant_id();
  v_class  CHAR;
  v_age    INT;
BEGIN
  IF v_tenant IS NULL THEN RETURN NULL; END IF;

  -- Primary: branch-specific
  SELECT class INTO v_class
  FROM public.ingredient_abc_class
  WHERE tenant_id = v_tenant AND branch_id = p_branch_id AND ingredient_id = p_ingredient_id;

  IF FOUND THEN RETURN v_class; END IF;

  -- Fallback: branches younger than 30 days inherit tenant-wide mode per (ingredient)
  SELECT EXTRACT(DAY FROM now() - created_at)::INT INTO v_age
  FROM public.branches WHERE id = p_branch_id;

  IF v_age IS NULL OR v_age < 30 THEN
    SELECT MODE() WITHIN GROUP (ORDER BY class) INTO v_class
    FROM public.ingredient_abc_class
    WHERE tenant_id = v_tenant AND ingredient_id = p_ingredient_id;
    IF v_class IS NOT NULL THEN RETURN v_class; END IF;
  END IF;

  RETURN NULL;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_ingredient_abc_class(BIGINT, BIGINT) TO authenticated;


-- Weekly refresh Sunday 02:00 Asia/Ho_Chi_Minh = 19:00 UTC Saturday
DO $sched$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'refresh_abc_classification') THEN
    PERFORM cron.schedule('refresh_abc_classification', '0 19 * * 6',
      'SELECT public.refresh_abc_classification();');
  END IF;
END $sched$;


-- =============================================================
-- (E) RESTRICTIVE RLS on stocktake_lines for blind mode
-- =============================================================

CREATE POLICY "stocktake_lines_blind_block"
  ON public.stocktake_lines
  AS RESTRICTIVE
  FOR SELECT TO authenticated
  USING (
    NOT EXISTS (
      SELECT 1 FROM public.stocktake_sessions ss
      WHERE ss.id = stocktake_lines.session_id
        AND ss.blind_mode = true
        AND ss.status = 'in_progress'
    )
    OR public.has_permission(NULL, 'inventory:stocktake_unblind')
  );


-- =============================================================
-- (F) start_stocktake
-- =============================================================

CREATE OR REPLACE FUNCTION public.start_stocktake(
  p_branch_id   BIGINT,
  p_location_id BIGINT DEFAULT NULL,
  p_mode        TEXT   DEFAULT 'daily',
  p_blind_mode  BOOLEAN DEFAULT NULL,
  p_auditor_id  UUID   DEFAULT NULL,
  p_threshold_pct     NUMERIC DEFAULT NULL,
  p_threshold_vnd     NUMERIC DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid      UUID := auth.uid();
  v_tenant   BIGINT;
  v_blind    BOOLEAN;
  v_session  BIGINT;
  v_is_unaud BOOLEAN := false;
  v_rows     INT := 0;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000'; END IF;
  IF NOT public.has_permission(p_branch_id, 'inventory:stocktake_create') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_mode NOT IN ('daily','weekly','monthly','quarterly','spot') THEN
    RAISE EXCEPTION 'invalid mode' USING ERRCODE = '22023';
  END IF;

  SELECT tenant_id INTO v_tenant FROM public.branches WHERE id = p_branch_id;
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'branch not found' USING ERRCODE = 'P0002'; END IF;

  -- Blind default per mode
  v_blind := COALESCE(p_blind_mode,
    CASE p_mode
      WHEN 'daily'    THEN false
      WHEN 'weekly'   THEN false
      WHEN 'monthly'  THEN true
      WHEN 'quarterly' THEN true
      WHEN 'spot'     THEN true
    END);

  -- Unaudited flag soft (§B1)
  IF p_mode IN ('monthly','quarterly') AND p_auditor_id IS NULL THEN
    v_is_unaud := true;
  END IF;

  INSERT INTO public.stocktake_sessions (
    tenant_id, branch_id, location_id, status, started_at, created_by,
    mode, blind_mode, auditor_id, is_unaudited,
    variance_threshold_pct, variance_threshold_vnd,
    abc_snapshot_at, current_round
  ) VALUES (
    v_tenant, p_branch_id, p_location_id, 'in_progress', now(), v_uid,
    p_mode, v_blind, p_auditor_id, v_is_unaud,
    COALESCE(p_threshold_pct, 5.00),
    COALESCE(p_threshold_vnd, 200000),
    now(), 1
  ) RETURNING id INTO v_session;

  -- Seed round-1 lines from stock_levels at (branch, location). Capture ABC from snapshot.
  INSERT INTO public.stocktake_lines (
    tenant_id, session_id, ingredient_id, system_quantity,
    round_no, abc_class
  )
  SELECT
    v_tenant, v_session, sl.ingredient_id, COALESCE(sl.current_quantity, 0),
    1,
    public.get_ingredient_abc_class(p_branch_id, sl.ingredient_id)
  FROM public.stock_levels sl
  JOIN public.ingredients ing ON ing.id = sl.ingredient_id
  WHERE sl.branch_id = p_branch_id
    AND (p_location_id IS NULL OR sl.location_id = p_location_id)
    AND ing.is_active = true;
  GET DIAGNOSTICS v_rows = ROW_COUNT;

  RETURN jsonb_build_object(
    'session_id', v_session,
    'mode', p_mode,
    'blind_mode', v_blind,
    'is_unaudited', v_is_unaud,
    'seeded_lines', v_rows,
    'abc_snapshot_at', now()
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.start_stocktake(BIGINT, BIGINT, TEXT, BOOLEAN, UUID, NUMERIC, NUMERIC)
  TO authenticated;


-- =============================================================
-- (G) get_stocktake_lines_blind
-- =============================================================

CREATE OR REPLACE FUNCTION public.get_stocktake_lines_blind(p_session_id BIGINT)
RETURNS TABLE (
  line_id          BIGINT,
  ingredient_id    BIGINT,
  ingredient_name  TEXT,
  unit             TEXT,
  abc_class        CHAR,
  round_no         SMALLINT,
  counted_quantity NUMERIC,
  counted_by       UUID,
  counted_at       TIMESTAMPTZ,
  needs_recount    BOOLEAN,
  is_final         BOOLEAN
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_tenant BIGINT := public.auth_tenant_id();
  v_ss     RECORD;
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000'; END IF;
  SELECT s.branch_id, s.blind_mode, s.tenant_id INTO v_ss
  FROM public.stocktake_sessions s WHERE s.id = p_session_id;
  IF NOT FOUND OR v_ss.tenant_id <> v_tenant THEN
    RAISE EXCEPTION 'session not found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.has_permission(v_ss.branch_id, 'inventory:stocktake_create') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    sl.id,
    sl.ingredient_id,
    ing.name,
    ing.unit,
    sl.abc_class,
    sl.round_no,
    sl.counted_quantity,
    sl.counted_by,
    sl.counted_at,
    sl.needs_recount,
    sl.is_final
  FROM public.stocktake_lines sl
  JOIN public.ingredients ing ON ing.id = sl.ingredient_id
  WHERE sl.session_id = p_session_id
  ORDER BY sl.round_no, ing.name;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_stocktake_lines_blind(BIGINT) TO authenticated;


-- =============================================================
-- (H) submit_count_round
-- =============================================================

CREATE OR REPLACE FUNCTION public.submit_count_round(
  p_session_id BIGINT,
  p_round_no   SMALLINT,
  p_counts     JSONB    -- [{ingredient_id, counted_quantity, note?}]
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid    UUID := auth.uid();
  v_tenant BIGINT;
  v_ss     RECORD;
  v_count  JSONB;
  v_n      INT := 0;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000'; END IF;
  SELECT * INTO v_ss FROM public.stocktake_sessions WHERE id = p_session_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'session not found' USING ERRCODE = 'P0002'; END IF;
  IF v_ss.status <> 'in_progress' THEN
    RAISE EXCEPTION 'session not in_progress (status=%)', v_ss.status USING ERRCODE = '22023';
  END IF;
  IF NOT public.has_permission(v_ss.branch_id, 'inventory:stocktake_create') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_round_no <> v_ss.current_round THEN
    RAISE EXCEPTION 'round % does not match session current_round %', p_round_no, v_ss.current_round USING ERRCODE = '22023';
  END IF;
  v_tenant := v_ss.tenant_id;

  FOR v_count IN SELECT value FROM jsonb_array_elements(p_counts)
  LOOP
    INSERT INTO public.stocktake_lines (
      tenant_id, session_id, ingredient_id, system_quantity,
      counted_quantity, counted_by, counted_at, round_no, abc_class
    )
    SELECT
      v_tenant, p_session_id, (v_count->>'ingredient_id')::BIGINT,
      -- For round > 1 we need system_qty from round-1 line
      (SELECT system_quantity FROM public.stocktake_lines
        WHERE session_id = p_session_id
          AND ingredient_id = (v_count->>'ingredient_id')::BIGINT
          AND round_no = 1),
      (v_count->>'counted_quantity')::NUMERIC,
      v_uid, now(), p_round_no,
      (SELECT abc_class FROM public.stocktake_lines
        WHERE session_id = p_session_id
          AND ingredient_id = (v_count->>'ingredient_id')::BIGINT
          AND round_no = 1)
    ON CONFLICT (session_id, ingredient_id, round_no) DO UPDATE SET
      counted_quantity = EXCLUDED.counted_quantity,
      counted_by       = EXCLUDED.counted_by,
      counted_at       = EXCLUDED.counted_at;
    v_n := v_n + 1;
  END LOOP;

  RETURN v_n;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.submit_count_round(BIGINT, SMALLINT, JSONB) TO authenticated;


-- =============================================================
-- (I) close_recount_round — flag needs_recount, compute median on close
-- =============================================================

CREATE OR REPLACE FUNCTION public.close_recount_round(
  p_session_id BIGINT,
  p_round_no   SMALLINT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid     UUID := auth.uid();
  v_ss      RECORD;
  v_need    INT := 0;
  v_final   INT := 0;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000'; END IF;
  SELECT * INTO v_ss FROM public.stocktake_sessions WHERE id = p_session_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'session not found' USING ERRCODE = 'P0002'; END IF;
  IF NOT public.has_permission(v_ss.branch_id, 'inventory:stocktake_recount') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_round_no <> v_ss.current_round THEN
    RAISE EXCEPTION 'round % does not match current_round %', p_round_no, v_ss.current_round USING ERRCODE = '22023';
  END IF;

  -- Compute variance per round line; flag needs_recount or mark final.
  -- Tier A uses stricter threshold.
  WITH latest AS (
    SELECT sl.id, sl.ingredient_id, sl.counted_quantity, sl.system_quantity, sl.abc_class,
           COALESCE(sl.counted_quantity, 0) - COALESCE(sl.system_quantity, 0) AS delta,
           CASE WHEN sl.system_quantity IS NULL OR sl.system_quantity = 0 THEN NULL
                ELSE ABS(COALESCE(sl.counted_quantity, 0) - sl.system_quantity) / sl.system_quantity END AS pct
    FROM public.stocktake_lines sl
    WHERE sl.session_id = p_session_id AND sl.round_no = p_round_no
  ),
  decided AS (
    SELECT l.*,
      CASE
        WHEN l.counted_quantity IS NULL THEN false
        WHEN l.abc_class = 'A' THEN
             COALESCE(l.pct, 0) > v_ss.variance_threshold_pct_class_a / 100.0
          OR ABS(l.delta) > v_ss.variance_threshold_vnd_class_a / GREATEST((SELECT avg_unit_cost FROM public.stock_levels WHERE ingredient_id = l.ingredient_id AND branch_id = v_ss.branch_id LIMIT 1), 1)
        ELSE
             COALESCE(l.pct, 0) > v_ss.variance_threshold_pct / 100.0
          OR ABS(l.delta) > v_ss.variance_threshold_vnd / GREATEST((SELECT avg_unit_cost FROM public.stock_levels WHERE ingredient_id = l.ingredient_id AND branch_id = v_ss.branch_id LIMIT 1), 1)
      END AS needs_rc
    FROM latest l
  )
  UPDATE public.stocktake_lines sl
     SET needs_recount = d.needs_rc,
         is_final      = NOT d.needs_rc
  FROM decided d
  WHERE sl.id = d.id;

  -- If this isn't round 1 AND no more recounts needed, compute median across all rounds for each ingredient
  IF p_round_no > 1 THEN
    WITH medians AS (
      SELECT
        sl.ingredient_id,
        percentile_cont(0.5) WITHIN GROUP (ORDER BY sl.counted_quantity) AS med
      FROM public.stocktake_lines sl
      WHERE sl.session_id = p_session_id AND sl.counted_quantity IS NOT NULL
      GROUP BY sl.ingredient_id
      HAVING COUNT(*) >= 2
    )
    UPDATE public.stocktake_lines sl
       SET counted_quantity = m.med
    FROM medians m
    WHERE sl.session_id = p_session_id
      AND sl.ingredient_id = m.ingredient_id
      AND sl.round_no = 1;
  END IF;

  SELECT COUNT(*) FILTER (WHERE needs_recount),
         COUNT(*) FILTER (WHERE is_final)
    INTO v_need, v_final
  FROM public.stocktake_lines
  WHERE session_id = p_session_id AND round_no = p_round_no;

  -- Advance session round_no if there are still items needing recount
  IF v_need > 0 AND v_ss.current_round < 4 THEN
    UPDATE public.stocktake_sessions
       SET current_round = v_ss.current_round + 1
     WHERE id = p_session_id;
  END IF;

  RETURN jsonb_build_object(
    'round_no', p_round_no,
    'needs_recount_count', v_need,
    'final_count', v_final,
    'next_round', CASE WHEN v_need > 0 AND v_ss.current_round < 4 THEN v_ss.current_round + 1 ELSE NULL END,
    'round_4_escalation_required', v_need > 0 AND v_ss.current_round >= 3
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.close_recount_round(BIGINT, SMALLINT) TO authenticated;


-- =============================================================
-- (J) finalize_stocktake
-- =============================================================

CREATE OR REPLACE FUNCTION public.finalize_stocktake(p_session_id BIGINT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid     UUID := auth.uid();
  v_ss      RECORD;
  v_pending INT;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000'; END IF;
  SELECT * INTO v_ss FROM public.stocktake_sessions WHERE id = p_session_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'session not found' USING ERRCODE = 'P0002'; END IF;
  IF NOT public.has_permission(v_ss.branch_id, 'inventory:stocktake_complete') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF v_ss.status <> 'in_progress' THEN
    RAISE EXCEPTION 'session not in_progress' USING ERRCODE = '22023';
  END IF;

  SELECT COUNT(*) INTO v_pending
  FROM public.stocktake_lines
  WHERE session_id = p_session_id AND round_no = 1 AND is_final = false;
  IF v_pending > 0 THEN
    RAISE EXCEPTION 'cannot finalize: % round-1 line(s) still not final', v_pending USING ERRCODE = '22023';
  END IF;

  UPDATE public.stocktake_sessions
     SET status = 'completed', completed_at = now()
   WHERE id = p_session_id;

  RETURN jsonb_build_object('session_id', p_session_id, 'status', 'completed', 'completed_at', now());
END;
$function$;

GRANT EXECUTE ON FUNCTION public.finalize_stocktake(BIGINT) TO authenticated;


-- =============================================================
-- (K) escalate_round_4 — QLV/admin manual final for specific ingredient
-- =============================================================

CREATE OR REPLACE FUNCTION public.escalate_round_4(
  p_session_id   BIGINT,
  p_ingredient_id BIGINT,
  p_final_qty    NUMERIC,
  p_note         TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid UUID := auth.uid();
  v_ss  RECORD;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000'; END IF;
  SELECT * INTO v_ss FROM public.stocktake_sessions WHERE id = p_session_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'session not found' USING ERRCODE = 'P0002'; END IF;
  IF NOT public.has_permission(v_ss.branch_id, 'inventory:stocktake_recount') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF length(COALESCE(p_note, '')) < 20 THEN
    RAISE EXCEPTION 'escalation note must be at least 20 characters' USING ERRCODE = '22023';
  END IF;

  -- Insert round-4 record AND mark round-1 line as final with the escalated qty
  INSERT INTO public.stocktake_lines (tenant_id, session_id, ingredient_id, system_quantity,
    counted_quantity, counted_by, counted_at, round_no, variance_reason, is_final, needs_recount,
    abc_class)
  SELECT v_ss.tenant_id, p_session_id, p_ingredient_id,
    (SELECT system_quantity FROM public.stocktake_lines WHERE session_id=p_session_id AND ingredient_id=p_ingredient_id AND round_no=1),
    p_final_qty, v_uid, now(), 4, '[ROUND4] ' || p_note, true, false,
    (SELECT abc_class FROM public.stocktake_lines WHERE session_id=p_session_id AND ingredient_id=p_ingredient_id AND round_no=1)
  ON CONFLICT (session_id, ingredient_id, round_no) DO UPDATE
    SET counted_quantity = EXCLUDED.counted_quantity,
        counted_by       = EXCLUDED.counted_by,
        counted_at       = EXCLUDED.counted_at,
        variance_reason  = EXCLUDED.variance_reason,
        is_final         = true;

  UPDATE public.stocktake_lines
     SET counted_quantity = p_final_qty,
         is_final = true,
         needs_recount = false,
         variance_reason = COALESCE(variance_reason, '') || E'\n[ROUND4 escalated by ' || v_uid::TEXT || ']'
   WHERE session_id = p_session_id AND ingredient_id = p_ingredient_id AND round_no = 1;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.escalate_round_4(BIGINT, BIGINT, NUMERIC, TEXT) TO authenticated;


-- =============================================================
-- (L) assign_auditor
-- =============================================================

CREATE OR REPLACE FUNCTION public.assign_auditor(
  p_session_id BIGINT,
  p_auditor_id UUID,
  p_auditor_branch_id BIGINT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid UUID := auth.uid();
  v_ss  RECORD;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000'; END IF;
  SELECT * INTO v_ss FROM public.stocktake_sessions WHERE id = p_session_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'session not found' USING ERRCODE = 'P0002'; END IF;
  IF NOT public.has_permission(v_ss.branch_id, 'inventory:stocktake_recount') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  UPDATE public.stocktake_sessions
     SET auditor_id        = p_auditor_id,
         auditor_branch_id = p_auditor_branch_id,
         is_unaudited      = false
   WHERE id = p_session_id;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.assign_auditor(BIGINT, UUID, BIGINT) TO authenticated;
