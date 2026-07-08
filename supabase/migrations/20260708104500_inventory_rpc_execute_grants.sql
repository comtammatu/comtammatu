SET search_path TO '';

REVOKE EXECUTE ON FUNCTION public.commit_intra_branch_transfer(
  bigint,
  bigint,
  bigint,
  text,
  text,
  jsonb
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.commit_intra_branch_transfer(
  bigint,
  bigint,
  bigint,
  text,
  text,
  jsonb
) TO service_role;

REVOKE EXECUTE ON FUNCTION public.create_stock_transfer_draft(
  bigint,
  bigint,
  text,
  text,
  text,
  jsonb,
  bigint,
  bigint
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_stock_transfer_draft(
  bigint,
  bigint,
  text,
  text,
  text,
  jsonb,
  bigint,
  bigint
) TO service_role;

REVOKE EXECUTE ON FUNCTION public.create_production_run(
  bigint,
  bigint,
  numeric,
  bigint,
  text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_production_run(
  bigint,
  bigint,
  numeric,
  bigint,
  text
) TO service_role;
