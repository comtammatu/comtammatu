-- Applied finance cockpit RPCs revoked PUBLIC but anon still retained EXECUTE
-- via role default grants. Keep authenticated-only; auth checks remain in-body.

REVOKE ALL ON FUNCTION public.get_finance_food_cost_recorded(
  date,
  date,
  bigint
) FROM anon;

REVOKE ALL ON FUNCTION public.get_finance_operating_cockpit(
  text,
  date,
  date,
  bigint
) FROM anon;

REVOKE ALL ON FUNCTION public.list_finance_bank_transactions(
  date,
  date,
  text,
  bigint,
  integer
) FROM anon;

REVOKE ALL ON FUNCTION public.match_bank_by_transfer_token(
  bigint[]
) FROM anon;
