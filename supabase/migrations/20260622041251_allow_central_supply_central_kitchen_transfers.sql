CREATE OR REPLACE FUNCTION public.enforce_stock_transfer_direction()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  v_from_kind text;
  v_to_kind text;
BEGIN
  IF NEW.from_branch_id = NEW.to_branch_id THEN
    RAISE EXCEPTION 'intra_branch_transfer_not_supported' USING ERRCODE = '23514';
  END IF;

  SELECT b.branch_kind
  INTO v_from_kind
  FROM public.branches b
  WHERE b.id = NEW.from_branch_id
    AND b.tenant_id = NEW.tenant_id;

  SELECT b.branch_kind
  INTO v_to_kind
  FROM public.branches b
  WHERE b.id = NEW.to_branch_id
    AND b.tenant_id = NEW.tenant_id;

  IF v_from_kind IS NULL OR v_to_kind IS NULL THEN
    RAISE EXCEPTION 'stock_transfers: invalid branch reference' USING ERRCODE = '23514';
  END IF;

  IF v_from_kind = 'branch' AND v_to_kind = 'branch' THEN
    RETURN NEW;
  END IF;

  IF v_from_kind = 'branch' AND v_to_kind IN ('central_supply', 'central_kitchen') THEN
    RETURN NEW;
  END IF;

  IF v_from_kind IN ('central_supply', 'central_kitchen') AND v_to_kind = 'branch' THEN
    RETURN NEW;
  END IF;

  IF v_from_kind = 'central_supply' AND v_to_kind = 'central_kitchen' THEN
    RETURN NEW;
  END IF;

  IF v_from_kind = 'central_kitchen' AND v_to_kind = 'central_supply' THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'stock_transfers: invalid direction % -> %', v_from_kind, v_to_kind
    USING ERRCODE = '23514';
END;
$$;

COMMENT ON FUNCTION public.enforce_stock_transfer_direction() IS
  'Allowed transfers: branch-to-branch, branch-to-central, central-to-branch, central_supply-to-central_kitchen, and central_kitchen-to-central_supply. Reject same-site.';
