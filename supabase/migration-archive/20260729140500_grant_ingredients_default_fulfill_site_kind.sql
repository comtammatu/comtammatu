-- D093 added ingredients.default_fulfill_site_kind after column-level
-- SELECT lockdown (inventory_monetary_column_hardening). Authenticated
-- clients never received SELECT on the new column, so PostgREST queries
-- that project it (fetchIngredients and catalog embeds) fail with
-- permission denied and callers that swallow the error show empty
-- ingredient pickers for central ops (GRN add-line, stock, transfers).

GRANT SELECT (default_fulfill_site_kind) ON public.ingredients TO authenticated;
