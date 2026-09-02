-- Migration: remove_stocktake_zone_locks

DROP FUNCTION IF EXISTS public.acquire_zone_lock(bigint, text, integer);
DROP FUNCTION IF EXISTS public.heartbeat_zone_lock(bigint, text, integer);
DROP FUNCTION IF EXISTS public.release_zone_lock(bigint, text);

DROP TABLE IF EXISTS public.stocktake_zone_locks;

COMMENT ON TABLE public.stocktake_drafts IS
  'Counter auto-save draft. Drafts are never authoritative and remain scoped one-to-one to a stocktake session with cascade cleanup.';
