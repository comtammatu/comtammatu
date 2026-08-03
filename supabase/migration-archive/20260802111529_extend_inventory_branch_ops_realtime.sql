DROP TRIGGER IF EXISTS trg_broadcast_branch_ops ON public.stock_requests;
CREATE TRIGGER trg_broadcast_branch_ops
AFTER INSERT OR UPDATE OR DELETE ON public.stock_requests
FOR EACH ROW
EXECUTE FUNCTION public.broadcast_branch_ops();

DROP TRIGGER IF EXISTS trg_broadcast_branch_ops ON public.purchase_requests;
CREATE TRIGGER trg_broadcast_branch_ops
AFTER INSERT OR UPDATE OR DELETE ON public.purchase_requests
FOR EACH ROW
EXECUTE FUNCTION public.broadcast_branch_ops();

DROP TRIGGER IF EXISTS trg_broadcast_branch_ops ON public.production_runs;
CREATE TRIGGER trg_broadcast_branch_ops
AFTER INSERT OR UPDATE OR DELETE ON public.production_runs
FOR EACH ROW
EXECUTE FUNCTION public.broadcast_branch_ops();

ALTER TABLE public.stocktake_sessions
ADD COLUMN IF NOT EXISTS updated_at timestamptz;

UPDATE public.stocktake_sessions
SET updated_at = coalesce(completed_at, created_at, now())
WHERE updated_at IS NULL;

ALTER TABLE public.stocktake_sessions
ALTER COLUMN updated_at SET DEFAULT now(),
ALTER COLUMN updated_at SET NOT NULL;

DROP TRIGGER IF EXISTS trg_stocktake_sessions_updated_at
ON public.stocktake_sessions;
CREATE TRIGGER trg_stocktake_sessions_updated_at
BEFORE UPDATE ON public.stocktake_sessions
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at();

CREATE OR REPLACE FUNCTION private.touch_stocktake_session()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_session_id bigint;
  v_tenant_id bigint;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_session_id := OLD.session_id;
    v_tenant_id := OLD.tenant_id;
  ELSE
    v_session_id := NEW.session_id;
    v_tenant_id := NEW.tenant_id;
  END IF;

  UPDATE public.stocktake_sessions
  SET updated_at = now()
  WHERE id = v_session_id
    AND tenant_id = v_tenant_id;

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION private.touch_stocktake_session()
FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS touch_stocktake_session_after_line_change
ON public.stocktake_lines;
CREATE TRIGGER touch_stocktake_session_after_line_change
AFTER INSERT OR UPDATE OR DELETE ON public.stocktake_lines
FOR EACH ROW
EXECUTE FUNCTION private.touch_stocktake_session();

DROP TRIGGER IF EXISTS touch_stocktake_session_after_conflict_change
ON public.stocktake_conflicts;
CREATE TRIGGER touch_stocktake_session_after_conflict_change
AFTER INSERT OR UPDATE OR DELETE ON public.stocktake_conflicts
FOR EACH ROW
EXECUTE FUNCTION private.touch_stocktake_session();
