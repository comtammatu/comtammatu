-- =============================================================
-- S7 — Stocktake offline scaffold (server-side Layer 1+2)
--
-- Sections:
--   (A) stocktake_sessions.offline_enabled flag (per-session pilot)
--   (B) stocktake_lines.client_op_id + offline_created_at
--   (C) stocktake_zone_locks table + RLS
--   (D) stocktake_conflicts table + RLS
--   (E) RPC acquire_zone_lock / heartbeat / release
--   (F) Enhanced submit_count_round with offline guards + conflict
--   (G) RPC resolve_stocktake_conflict (QLV resolves manual)
--
-- Client-side artifacts (Dexie, uuidv7, private-mode detect,
-- quota estimate, fail-safe email) ship outside this migration
-- behind feature flag STOCKTAKE_OFFLINE_ENABLED at app layer.
--
-- Spec: docs/plan/inventory-redesign.md §Q7
-- Regression: tasks/regressions.md OFFLINE-NO-SILENT-CLIENTWINS
-- =============================================================


-- =============================================================
-- (A) stocktake_sessions.offline_enabled
-- =============================================================

ALTER TABLE public.stocktake_sessions
  ADD COLUMN IF NOT EXISTS offline_enabled BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.stocktake_sessions.offline_enabled IS
  'Per-session opt-in for offline mode. When true, submit_count_round accepts offline_created_at and client_op_id, validates clock tamper, and routes conflicts to stocktake_conflicts rather than silent overwrite.';


-- =============================================================
-- (B) stocktake_lines.client_op_id + offline_created_at
-- =============================================================

ALTER TABLE public.stocktake_lines
  ADD COLUMN IF NOT EXISTS client_op_id UUID,
  ADD COLUMN IF NOT EXISTS offline_created_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_stocktake_lines_client_op
  ON public.stocktake_lines (client_op_id)
  WHERE client_op_id IS NOT NULL;


-- =============================================================
-- (C) stocktake_zone_locks
-- =============================================================

CREATE TABLE IF NOT EXISTS public.stocktake_zone_locks (
  id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id        BIGINT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  session_id       BIGINT NOT NULL REFERENCES public.stocktake_sessions(id) ON DELETE CASCADE,
  zone_id          TEXT   NOT NULL,
  locked_by        UUID   NOT NULL REFERENCES auth.users(id),
  acquired_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_heartbeat_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at       TIMESTAMPTZ NOT NULL,
  UNIQUE (session_id, zone_id)
);

CREATE INDEX IF NOT EXISTS idx_zone_lock_expiry
  ON public.stocktake_zone_locks (session_id, expires_at);

COMMENT ON TABLE public.stocktake_zone_locks IS
  'Table-based zone lock (not PG advisory — advisories are per-connection). TTL 30 min default with 10-min heartbeat. Freed either by release RPC, heartbeat expiry, or session close.';

ALTER TABLE public.stocktake_zone_locks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "zone_lock_read_branch" ON public.stocktake_zone_locks
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.stocktake_sessions ss WHERE ss.id = session_id AND ss.tenant_id = public.auth_tenant_id())
  );
CREATE POLICY "zone_lock_rpc_only_write" ON public.stocktake_zone_locks
  FOR ALL TO authenticated USING (false) WITH CHECK (false);


-- =============================================================
-- (D) stocktake_conflicts
-- =============================================================

CREATE TABLE IF NOT EXISTS public.stocktake_conflicts (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id       BIGINT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  session_id      BIGINT NOT NULL REFERENCES public.stocktake_sessions(id) ON DELETE CASCADE,
  ingredient_id   BIGINT NOT NULL REFERENCES public.ingredients(id),
  round_no        SMALLINT NOT NULL,
  conflict_type   TEXT   NOT NULL CHECK (conflict_type IN ('is_final_overwrite','concurrent_round_submit','clock_tamper','unknown')),
  client_payload  JSONB  NOT NULL,
  server_payload  JSONB,
  submitted_by    UUID REFERENCES auth.users(id),
  submitted_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at     TIMESTAMPTZ,
  resolved_by     UUID REFERENCES auth.users(id),
  resolution      TEXT   CHECK (resolution IS NULL OR resolution IN ('keep_server','apply_client','manual_value','reject')),
  resolution_qty  NUMERIC,
  resolution_note TEXT
);

CREATE INDEX IF NOT EXISTS idx_conflicts_pending
  ON public.stocktake_conflicts (session_id, submitted_at DESC)
  WHERE resolved_at IS NULL;

COMMENT ON TABLE public.stocktake_conflicts IS
  'Offline sync conflict ledger. Never silently client-wins — QLV resolves via resolve_stocktake_conflict() RPC. Enforces OFFLINE-NO-SILENT-CLIENTWINS regression rule.';

ALTER TABLE public.stocktake_conflicts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "conflicts_read_branch" ON public.stocktake_conflicts
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.stocktake_sessions ss WHERE ss.id = session_id
              AND ss.tenant_id = public.auth_tenant_id()
              AND public.has_permission(ss.branch_id, 'inventory:stocktake_recount'))
  );
CREATE POLICY "conflicts_rpc_only_write" ON public.stocktake_conflicts
  FOR ALL TO authenticated USING (false) WITH CHECK (false);


-- =============================================================
-- (E) Zone lock RPCs
-- =============================================================

CREATE OR REPLACE FUNCTION public.acquire_zone_lock(
  p_session_id   BIGINT,
  p_zone_id      TEXT,
  p_ttl_seconds  INT DEFAULT 1800
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid      UUID := auth.uid();
  v_tenant   BIGINT;
  v_branch   BIGINT;
  v_existing RECORD;
  v_acquired BOOLEAN := false;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000'; END IF;
  IF p_ttl_seconds <= 0 OR p_ttl_seconds > 7200 THEN
    RAISE EXCEPTION 'ttl_seconds must be in (0, 7200]' USING ERRCODE = '22023';
  END IF;

  SELECT ss.tenant_id, ss.branch_id INTO v_tenant, v_branch
  FROM public.stocktake_sessions ss WHERE ss.id = p_session_id;
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'session not found' USING ERRCODE = 'P0002'; END IF;
  IF NOT public.has_permission(v_branch, 'inventory:stocktake_create') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  -- Delete expired lock first
  DELETE FROM public.stocktake_zone_locks
   WHERE session_id = p_session_id AND zone_id = p_zone_id AND expires_at <= now();

  -- Try insert; succeed if absent, update if same user re-acquires
  INSERT INTO public.stocktake_zone_locks (tenant_id, session_id, zone_id, locked_by, acquired_at, last_heartbeat_at, expires_at)
  VALUES (v_tenant, p_session_id, p_zone_id, v_uid, now(), now(), now() + make_interval(secs => p_ttl_seconds))
  ON CONFLICT (session_id, zone_id) DO UPDATE
    SET locked_by         = CASE WHEN public.stocktake_zone_locks.locked_by = v_uid THEN v_uid ELSE public.stocktake_zone_locks.locked_by END,
        acquired_at       = CASE WHEN public.stocktake_zone_locks.locked_by = v_uid THEN now() ELSE public.stocktake_zone_locks.acquired_at END,
        last_heartbeat_at = CASE WHEN public.stocktake_zone_locks.locked_by = v_uid THEN now() ELSE public.stocktake_zone_locks.last_heartbeat_at END,
        expires_at        = CASE WHEN public.stocktake_zone_locks.locked_by = v_uid THEN now() + make_interval(secs => p_ttl_seconds) ELSE public.stocktake_zone_locks.expires_at END
    WHERE public.stocktake_zone_locks.locked_by = v_uid;

  SELECT * INTO v_existing FROM public.stocktake_zone_locks
   WHERE session_id = p_session_id AND zone_id = p_zone_id;

  v_acquired := v_existing.locked_by = v_uid;

  RETURN jsonb_build_object(
    'acquired',    v_acquired,
    'locked_by',   v_existing.locked_by,
    'expires_at',  v_existing.expires_at,
    'acquired_at', v_existing.acquired_at
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.acquire_zone_lock(BIGINT, TEXT, INT) TO authenticated;


CREATE OR REPLACE FUNCTION public.heartbeat_zone_lock(
  p_session_id  BIGINT,
  p_zone_id     TEXT,
  p_ttl_seconds INT DEFAULT 1800
)
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_uid UUID := auth.uid(); v_new TIMESTAMPTZ;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000'; END IF;

  UPDATE public.stocktake_zone_locks
     SET last_heartbeat_at = now(),
         expires_at        = now() + make_interval(secs => p_ttl_seconds)
   WHERE session_id = p_session_id AND zone_id = p_zone_id AND locked_by = v_uid
   RETURNING expires_at INTO v_new;

  IF v_new IS NULL THEN
    RAISE EXCEPTION 'zone lock not held by caller' USING ERRCODE = '42501';
  END IF;
  RETURN v_new;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.heartbeat_zone_lock(BIGINT, TEXT, INT) TO authenticated;


CREATE OR REPLACE FUNCTION public.release_zone_lock(p_session_id BIGINT, p_zone_id TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_uid UUID := auth.uid(); v_count INT;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000'; END IF;
  DELETE FROM public.stocktake_zone_locks
   WHERE session_id = p_session_id AND zone_id = p_zone_id AND locked_by = v_uid;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count > 0;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.release_zone_lock(BIGINT, TEXT) TO authenticated;


-- =============================================================
-- (F) Enhanced submit_count_round — offline guards + conflict
-- =============================================================

DROP FUNCTION IF EXISTS public.submit_count_round(BIGINT, SMALLINT, JSONB);

CREATE OR REPLACE FUNCTION public.submit_count_round(
  p_session_id BIGINT,
  p_round_no   SMALLINT,
  p_counts     JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid    UUID := auth.uid();
  v_ss     RECORD;
  v_count  JSONB;
  v_applied INT := 0;
  v_conflict_count INT := 0;
  v_existing RECORD;
  v_offline_at TIMESTAMPTZ;
  v_ingredient BIGINT;
  v_counted NUMERIC;
  v_op_id  UUID;
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
    RAISE EXCEPTION 'round % does not match current_round %', p_round_no, v_ss.current_round USING ERRCODE = '22023';
  END IF;

  FOR v_count IN SELECT value FROM jsonb_array_elements(p_counts)
  LOOP
    v_ingredient := (v_count->>'ingredient_id')::BIGINT;
    v_counted    := (v_count->>'counted_quantity')::NUMERIC;
    v_op_id      := NULLIF(v_count->>'client_op_id','')::UUID;
    v_offline_at := NULLIF(v_count->>'offline_created_at','')::TIMESTAMPTZ;

    -- Clock tamper check (offline only)
    IF v_ss.offline_enabled AND v_offline_at IS NOT NULL THEN
      IF v_offline_at > now() + INTERVAL '5 minutes' OR v_offline_at < v_ss.started_at THEN
        INSERT INTO public.stocktake_conflicts (tenant_id, session_id, ingredient_id, round_no,
          conflict_type, client_payload, submitted_by)
        VALUES (v_ss.tenant_id, p_session_id, v_ingredient, p_round_no,
          'clock_tamper',
          jsonb_build_object('client_op_id', v_op_id, 'offline_created_at', v_offline_at, 'counted_quantity', v_counted),
          v_uid);
        v_conflict_count := v_conflict_count + 1;
        CONTINUE;
      END IF;
    END IF;

    -- is_final overwrite check
    SELECT id, counted_quantity, is_final INTO v_existing
    FROM public.stocktake_lines
    WHERE session_id = p_session_id AND ingredient_id = v_ingredient AND round_no = p_round_no;

    IF FOUND AND v_existing.is_final AND v_existing.counted_quantity IS DISTINCT FROM v_counted THEN
      INSERT INTO public.stocktake_conflicts (tenant_id, session_id, ingredient_id, round_no,
        conflict_type, client_payload, server_payload, submitted_by)
      VALUES (v_ss.tenant_id, p_session_id, v_ingredient, p_round_no,
        'is_final_overwrite',
        jsonb_build_object('client_op_id', v_op_id, 'counted_quantity', v_counted, 'offline_created_at', v_offline_at),
        jsonb_build_object('existing_counted_quantity', v_existing.counted_quantity, 'is_final', true),
        v_uid);
      v_conflict_count := v_conflict_count + 1;
      CONTINUE;
    END IF;

    -- Upsert (same pattern as before, plus offline fields)
    INSERT INTO public.stocktake_lines (
      tenant_id, session_id, ingredient_id, system_quantity,
      counted_quantity, counted_by, counted_at, round_no, abc_class,
      client_op_id, offline_created_at
    )
    SELECT
      v_ss.tenant_id, p_session_id, v_ingredient,
      (SELECT system_quantity FROM public.stocktake_lines
        WHERE session_id = p_session_id AND ingredient_id = v_ingredient AND round_no = 1),
      v_counted, v_uid, now(), p_round_no,
      (SELECT abc_class FROM public.stocktake_lines
        WHERE session_id = p_session_id AND ingredient_id = v_ingredient AND round_no = 1),
      v_op_id, v_offline_at
    ON CONFLICT (session_id, ingredient_id, round_no) DO UPDATE SET
      counted_quantity    = EXCLUDED.counted_quantity,
      counted_by          = EXCLUDED.counted_by,
      counted_at          = EXCLUDED.counted_at,
      client_op_id        = COALESCE(EXCLUDED.client_op_id, public.stocktake_lines.client_op_id),
      offline_created_at  = COALESCE(EXCLUDED.offline_created_at, public.stocktake_lines.offline_created_at);
    v_applied := v_applied + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'applied_count',  v_applied,
    'conflict_count', v_conflict_count,
    'round_no',       p_round_no
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.submit_count_round(BIGINT, SMALLINT, JSONB) TO authenticated;


-- =============================================================
-- (G) resolve_stocktake_conflict
-- =============================================================

CREATE OR REPLACE FUNCTION public.resolve_stocktake_conflict(
  p_conflict_id BIGINT,
  p_resolution  TEXT,           -- 'keep_server' | 'apply_client' | 'manual_value' | 'reject'
  p_manual_qty  NUMERIC DEFAULT NULL,
  p_note        TEXT    DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid UUID := auth.uid();
  v_conf RECORD;
  v_session RECORD;
  v_final_qty NUMERIC;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000'; END IF;
  IF p_resolution NOT IN ('keep_server','apply_client','manual_value','reject') THEN
    RAISE EXCEPTION 'invalid resolution' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_conf FROM public.stocktake_conflicts WHERE id = p_conflict_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'conflict not found' USING ERRCODE = 'P0002'; END IF;
  IF v_conf.resolved_at IS NOT NULL THEN
    RAISE EXCEPTION 'conflict already resolved' USING ERRCODE = '22023';
  END IF;

  SELECT ss.* INTO v_session FROM public.stocktake_sessions ss WHERE ss.id = v_conf.session_id;
  IF NOT public.has_permission(v_session.branch_id, 'inventory:stocktake_recount') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  v_final_qty := CASE p_resolution
    WHEN 'keep_server'  THEN (v_conf.server_payload->>'existing_counted_quantity')::NUMERIC
    WHEN 'apply_client' THEN (v_conf.client_payload->>'counted_quantity')::NUMERIC
    WHEN 'manual_value' THEN p_manual_qty
    WHEN 'reject'       THEN NULL
  END;

  IF p_resolution = 'manual_value' AND p_manual_qty IS NULL THEN
    RAISE EXCEPTION 'manual_qty required for manual_value resolution' USING ERRCODE = '22023';
  END IF;

  -- Apply the resolution to the target line (except 'reject' which leaves line untouched)
  IF p_resolution <> 'reject' AND v_final_qty IS NOT NULL THEN
    UPDATE public.stocktake_lines
       SET counted_quantity = v_final_qty,
           counted_by       = v_uid,
           counted_at       = now(),
           variance_reason  = COALESCE(variance_reason,'') ||
                              E'\n[conflict#' || p_conflict_id::TEXT || ' resolved=' || p_resolution ||
                              COALESCE(': ' || p_note, '') || ']'
     WHERE session_id = v_conf.session_id
       AND ingredient_id = v_conf.ingredient_id
       AND round_no = v_conf.round_no;
  END IF;

  UPDATE public.stocktake_conflicts
     SET resolved_at     = now(),
         resolved_by     = v_uid,
         resolution      = p_resolution,
         resolution_qty  = v_final_qty,
         resolution_note = p_note
   WHERE id = p_conflict_id;

  RETURN jsonb_build_object(
    'conflict_id', p_conflict_id,
    'resolution',  p_resolution,
    'final_qty',   v_final_qty,
    'resolved_at', now()
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.resolve_stocktake_conflict(BIGINT, TEXT, NUMERIC, TEXT) TO authenticated;
