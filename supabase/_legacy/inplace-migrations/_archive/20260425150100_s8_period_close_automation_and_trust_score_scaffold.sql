-- =============================================================
-- S8 — Period-close automation + Q4b trust_score scaffold
--       + Q7 offline rollout RPC
--
-- Sections:
--   (A) RPC close_period_soft / close_period_hard / reopen_period
--   (B) Function auto_close_periods + pg_cron (daily 02:00 VN)
--   (C) Q4b user_trust_score table + RLS
--   (D) Stub compute_user_trust_score (default 50; evaluator wires S9)
--   (E) stocktake_sessions audit cols + enable_offline_for_session RPC
--
-- Spec:
--   Period close (soft day 5 / hard day 15) — inventory-redesign §B8
--   Trust score design — inventory-redesign §Q4b
--   Offline rollout — inventory-redesign §Q7 (pilot gate)
-- =============================================================


-- =============================================================
-- (A) Period-close RPCs (manual trigger + reopen)
-- =============================================================

CREATE OR REPLACE FUNCTION public.close_period_soft(
  p_tenant_id BIGINT,
  p_year      INT,
  p_month     INT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000'; END IF;
  IF p_tenant_id <> public.auth_tenant_id() THEN
    RAISE EXCEPTION 'cross-tenant close forbidden' USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_permission(NULL, 'accounting:period_reopen') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.accounting_periods (tenant_id, year, month, soft_closed_at, closed_by)
  VALUES (p_tenant_id, p_year, p_month, now(), v_uid)
  ON CONFLICT (tenant_id, year, month) DO UPDATE
    SET soft_closed_at = COALESCE(public.accounting_periods.soft_closed_at, EXCLUDED.soft_closed_at),
        closed_by      = COALESCE(public.accounting_periods.closed_by, EXCLUDED.closed_by);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.close_period_soft(BIGINT, INT, INT) TO authenticated;


CREATE OR REPLACE FUNCTION public.close_period_hard(
  p_tenant_id BIGINT,
  p_year      INT,
  p_month     INT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000'; END IF;
  IF p_tenant_id <> public.auth_tenant_id() THEN
    RAISE EXCEPTION 'cross-tenant close forbidden' USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_permission(NULL, 'accounting:period_reopen') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.accounting_periods (tenant_id, year, month, soft_closed_at, hard_closed_at, closed_by)
  VALUES (p_tenant_id, p_year, p_month, now(), now(), v_uid)
  ON CONFLICT (tenant_id, year, month) DO UPDATE
    SET soft_closed_at = COALESCE(public.accounting_periods.soft_closed_at, EXCLUDED.soft_closed_at),
        hard_closed_at = COALESCE(public.accounting_periods.hard_closed_at, EXCLUDED.hard_closed_at),
        closed_by      = EXCLUDED.closed_by;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.close_period_hard(BIGINT, INT, INT) TO authenticated;


CREATE OR REPLACE FUNCTION public.reopen_period(
  p_tenant_id BIGINT,
  p_year      INT,
  p_month     INT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000'; END IF;
  IF p_tenant_id <> public.auth_tenant_id() THEN
    RAISE EXCEPTION 'cross-tenant reopen forbidden' USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_permission(NULL, 'accounting:period_reopen') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  UPDATE public.accounting_periods
     SET soft_closed_at = NULL,
         hard_closed_at = NULL,
         closed_by      = v_uid
   WHERE tenant_id = p_tenant_id AND year = p_year AND month = p_month;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.reopen_period(BIGINT, INT, INT) TO authenticated;


-- =============================================================
-- (B) auto_close_periods + daily cron
-- =============================================================

CREATE OR REPLACE FUNCTION public.auto_close_periods()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_today DATE;
  v_day   INT;
  v_prior DATE;
  v_year  INT;
  v_month INT;
  v_count INT := 0;
  v_row   RECORD;
BEGIN
  -- Evaluate against VN calendar since single-tenant VN today.
  v_today := (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::DATE;
  v_day   := EXTRACT(DAY FROM v_today)::INT;
  v_prior := (date_trunc('month', v_today) - INTERVAL '1 month')::DATE;
  v_year  := EXTRACT(YEAR FROM v_prior)::INT;
  v_month := EXTRACT(MONTH FROM v_prior)::INT;

  IF v_day < 5 THEN
    -- Before soft-close day; nothing to do.
    RETURN 0;
  END IF;

  -- Day 5+: ensure every tenant has soft-closed prior month.
  FOR v_row IN SELECT id FROM public.tenants LOOP
    INSERT INTO public.accounting_periods (tenant_id, year, month, soft_closed_at)
    VALUES (v_row.id, v_year, v_month, now())
    ON CONFLICT (tenant_id, year, month) DO UPDATE
      SET soft_closed_at = COALESCE(public.accounting_periods.soft_closed_at, EXCLUDED.soft_closed_at);
    v_count := v_count + 1;
  END LOOP;

  -- Day 15+: ensure every tenant has hard-closed prior month.
  IF v_day >= 15 THEN
    FOR v_row IN SELECT id FROM public.tenants LOOP
      UPDATE public.accounting_periods
         SET hard_closed_at = COALESCE(hard_closed_at, now())
       WHERE tenant_id = v_row.id AND year = v_year AND month = v_month;
    END LOOP;
  END IF;

  RETURN v_count;
END;
$function$;

COMMENT ON FUNCTION public.auto_close_periods() IS
  'Daily automation — on day 5+ soft-close prior month, on day 15+ hard-close. Idempotent (COALESCE on existing close timestamps). Admins may reopen via accounting:period_reopen perm.';

DO $sched$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'auto_close_periods') THEN
    PERFORM cron.schedule('auto_close_periods', '0 19 * * *', 'SELECT public.auto_close_periods();');
  END IF;
END $sched$;


-- =============================================================
-- (C) Q4b user_trust_score table
-- =============================================================

CREATE TABLE IF NOT EXISTS public.user_trust_score (
  tenant_id               BIGINT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id               BIGINT NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  user_id                 UUID   NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  score                   NUMERIC(5,2) NOT NULL DEFAULT 50.00 CHECK (score BETWEEN 0 AND 100),
  grn_count_30d           INT NOT NULL DEFAULT 0,
  variance_incidents_30d  INT NOT NULL DEFAULT 0,
  last_incident_at        TIMESTAMPTZ,
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, branch_id, user_id)
);

COMMENT ON TABLE public.user_trust_score IS
  'Q4b scaffold per (tenant, branch, user). Default 50 = bootstrap; needs ≥20 clean GRN in 60d to reach 70 threshold per §Q4b. Evaluator wiring DEFERRED to S9 — compute_user_trust_score() returns stub until then.';

ALTER TABLE public.user_trust_score ENABLE ROW LEVEL SECURITY;

CREATE POLICY "trust_score_read_own_or_admin" ON public.user_trust_score
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND (
      user_id = auth.uid()
      OR public.has_permission(branch_id, 'inventory:read')
      OR public.has_permission(NULL, 'reports:view_branch')
      OR public.has_permission(NULL, 'reports:view_tenant')
    )
  );

CREATE POLICY "trust_score_rpc_only_write" ON public.user_trust_score
  FOR ALL TO authenticated USING (false) WITH CHECK (false);


-- =============================================================
-- (D) Stub compute_user_trust_score (evaluator wiring in S9)
-- =============================================================

CREATE OR REPLACE FUNCTION public.compute_user_trust_score(
  p_user_id   UUID,
  p_branch_id BIGINT
)
RETURNS NUMERIC
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_tenant  BIGINT;
  v_score   NUMERIC;
  v_grn_30  INT;
BEGIN
  SELECT tenant_id INTO v_tenant FROM public.branches WHERE id = p_branch_id;
  IF v_tenant IS NULL THEN RETURN 50; END IF;

  -- Count user's confirmed GRN in last 30 days
  SELECT COUNT(*) INTO v_grn_30
    FROM public.goods_received_notes
   WHERE created_by = p_user_id
     AND branch_id  = p_branch_id
     AND status     = 'confirmed'
     AND received_date > now() - INTERVAL '30 days';

  -- Bootstrap stub:
  --   <10 GRN history  → 50 (warmup)
  --   >=10 AND <20     → 60
  --   >=20             → 70 (min threshold for auto-approve)
  -- S9 will replace with asymmetric decay formula from §Q4b.
  v_score := CASE
    WHEN v_grn_30 >= 20 THEN 70
    WHEN v_grn_30 >= 10 THEN 60
    ELSE 50
  END;

  -- Persist snapshot for reporting
  INSERT INTO public.user_trust_score (tenant_id, branch_id, user_id, score, grn_count_30d, updated_at)
  VALUES (v_tenant, p_branch_id, p_user_id, v_score, v_grn_30, now())
  ON CONFLICT (tenant_id, branch_id, user_id) DO UPDATE
    SET score         = EXCLUDED.score,
        grn_count_30d = EXCLUDED.grn_count_30d,
        updated_at    = EXCLUDED.updated_at;

  RETURN v_score;
END;
$function$;

COMMENT ON FUNCTION public.compute_user_trust_score(UUID, BIGINT) IS
  'STUB for S8. Returns 50 / 60 / 70 based on 30d GRN count. S9 will implement asymmetric decay (incident -20, good +0.5, recovery cap 85). Not yet called by grn_is_auto_approvable.';

GRANT EXECUTE ON FUNCTION public.compute_user_trust_score(UUID, BIGINT) TO authenticated;


-- =============================================================
-- (E) stocktake_sessions audit cols + enable_offline_for_session RPC
-- =============================================================

ALTER TABLE public.stocktake_sessions
  ADD COLUMN IF NOT EXISTS offline_enabled_by UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS offline_enabled_at TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION public.enable_offline_for_session(p_session_id BIGINT)
RETURNS JSONB
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

  -- Admin-only gate: use settings:tenant as proxy for "admin/owner" since spec
  -- flags this as pilot-controlled rollout.
  IF NOT public.has_permission(NULL, 'settings:tenant') THEN
    RAISE EXCEPTION 'forbidden: settings:tenant required for offline pilot' USING ERRCODE = '42501';
  END IF;
  IF v_ss.status <> 'in_progress' THEN
    RAISE EXCEPTION 'session not in_progress (status=%)', v_ss.status USING ERRCODE = '22023';
  END IF;
  IF v_ss.offline_enabled THEN
    RAISE EXCEPTION 'offline already enabled for session %', p_session_id USING ERRCODE = '22023';
  END IF;

  UPDATE public.stocktake_sessions
     SET offline_enabled    = true,
         offline_enabled_by = v_uid,
         offline_enabled_at = now()
   WHERE id = p_session_id;

  RETURN jsonb_build_object(
    'session_id',         p_session_id,
    'offline_enabled',    true,
    'enabled_by',         v_uid,
    'enabled_at',         now()
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.enable_offline_for_session(BIGINT) TO authenticated;
