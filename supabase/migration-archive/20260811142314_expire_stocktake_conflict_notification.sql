-- Expire inventory.stocktake_conflict notifications when the conflict is
-- resolved or deleted. entity_id is the stocktake session; dedup_key pins the
-- conflict row (stocktake.conflict:{session_id}:{conflict_id}).

CREATE OR REPLACE FUNCTION private.expire_stocktake_conflict_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_tenant_id bigint := COALESCE(NEW.tenant_id, OLD.tenant_id);
  v_session_id bigint := COALESCE(NEW.session_id, OLD.session_id);
  v_conflict_id bigint := COALESCE(NEW.id, OLD.id);
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.resolved_at IS NULL THEN
      RETURN NULL;
    END IF;
    IF OLD.resolved_at IS NOT NULL THEN
      RETURN NULL;
    END IF;
  END IF;

  UPDATE public.notifications
  SET expires_at = now()
  WHERE tenant_id = v_tenant_id
    AND kind = 'inventory.stocktake_conflict'
    AND entity_type = 'stocktake'
    AND entity_id = v_session_id
    AND dedup_key = format(
      'stocktake.conflict:%s:%s',
      v_session_id,
      v_conflict_id
    )
    AND (expires_at IS NULL OR expires_at > now());

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_expire_stocktake_conflict_notification
  ON public.stocktake_conflicts;
CREATE TRIGGER trg_expire_stocktake_conflict_notification
  AFTER UPDATE OF resolved_at OR DELETE
  ON public.stocktake_conflicts
  FOR EACH ROW
  EXECUTE FUNCTION private.expire_stocktake_conflict_notification();

REVOKE ALL ON FUNCTION private.expire_stocktake_conflict_notification()
  FROM PUBLIC;

-- Backfill: hide resolved conflicts that still appear in active work views.
UPDATE public.notifications AS notification
SET expires_at = now()
FROM public.stocktake_conflicts AS conflict
WHERE notification.tenant_id = conflict.tenant_id
  AND notification.kind = 'inventory.stocktake_conflict'
  AND notification.entity_type = 'stocktake'
  AND notification.entity_id = conflict.session_id
  AND notification.dedup_key = format(
    'stocktake.conflict:%s:%s',
    conflict.session_id,
    conflict.id
  )
  AND conflict.resolved_at IS NOT NULL
  AND (
    notification.expires_at IS NULL
    OR notification.expires_at > now()
  );
