-- GRN detail always selects these workflow flags for authenticated users.
-- They were added after D091 column lockdown and never received SELECT grants.
-- Money columns (unit_cost, total_cost) stay revoked for authenticated.

GRANT SELECT (cost_pending, provisional_cost_source)
  ON public.grn_items TO authenticated;
