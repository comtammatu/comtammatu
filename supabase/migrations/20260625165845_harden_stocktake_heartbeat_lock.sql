CREATE OR REPLACE FUNCTION public.heartbeat_zone_lock(
  p_session_id bigint,
  p_zone_id text,
  p_ttl_seconds integer DEFAULT 1800
)
RETURNS timestamp with time zone
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_tenant bigint;
  v_branch bigint;
  v_new timestamp with time zone;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;

  IF p_ttl_seconds IS NULL OR p_ttl_seconds <= 0 OR p_ttl_seconds > 7200 THEN
    RAISE EXCEPTION 'ttl_seconds must be in (0, 7200]' USING ERRCODE = '22023';
  END IF;

  SELECT ss.tenant_id, ss.branch_id
    INTO v_tenant, v_branch
    FROM public.stocktake_sessions ss
   WHERE ss.id = p_session_id;

  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'session not found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.has_permission(v_branch, 'inventory:stocktake_create') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  UPDATE public.stocktake_zone_locks
     SET last_heartbeat_at = now(),
         expires_at = now() + make_interval(secs => p_ttl_seconds)
   WHERE session_id = p_session_id
     AND zone_id = p_zone_id
     AND locked_by = v_uid
   RETURNING expires_at INTO v_new;

  IF v_new IS NULL THEN
    RAISE EXCEPTION 'zone lock not held by caller' USING ERRCODE = '42501';
  END IF;

  RETURN v_new;
END;
$function$;
