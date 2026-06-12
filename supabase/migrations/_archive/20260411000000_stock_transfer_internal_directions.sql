-- Cho phép luân chuyển nội bộ: TS→CN, CN→TS, CN→CN (không cho TS→TS / hai Trụ sở).

DROP TRIGGER IF EXISTS trg_transfer_hq_to_branch ON public.stock_transfers;

CREATE OR REPLACE FUNCTION public.enforce_transfer_from_hq()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_from_hq BOOLEAN;
  v_to_hq   BOOLEAN;
BEGIN
  SELECT b.is_tenant INTO v_from_hq
  FROM public.branches b
  WHERE b.id = NEW.from_branch_id AND b.tenant_id = NEW.tenant_id;

  SELECT b.is_tenant INTO v_to_hq
  FROM public.branches b
  WHERE b.id = NEW.to_branch_id AND b.tenant_id = NEW.tenant_id;

  IF v_from_hq IS NULL OR v_to_hq IS NULL THEN
    RAISE EXCEPTION 'stock_transfers: invalid branch reference' USING ERRCODE = '23514';
  END IF;

  IF v_from_hq AND v_to_hq THEN
    RAISE EXCEPTION 'stock_transfers: cannot transfer between two tenant branches' USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_transfer_hq_to_branch
  BEFORE INSERT OR UPDATE OF from_branch_id, to_branch_id ON public.stock_transfers
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_transfer_from_hq();

COMMENT ON FUNCTION public.enforce_transfer_from_hq() IS
  'Internal transfers: at most one endpoint is tenant (TS↔CN or CN↔CN).';
