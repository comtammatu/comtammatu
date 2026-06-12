-- Keep internal helpers reachable only through service_role and vetted
-- SECURITY DEFINER wrappers/triggers that own the operational checks.

REVOKE EXECUTE ON FUNCTION public.enforce_period_close()
FROM authenticated;

REVOKE EXECUTE ON FUNCTION public.ensure_branch_inventory_location_defaults(BIGINT, BIGINT)
FROM authenticated;

REVOKE EXECUTE ON FUNCTION public.finance_views_last_refresh()
FROM authenticated;

REVOKE EXECUTE ON FUNCTION public.get_ingredient_abc_class(BIGINT, BIGINT)
FROM authenticated;

REVOKE EXECUTE ON FUNCTION public.inventory_requires_manual_review(BIGINT)
FROM authenticated;

REVOKE EXECUTE ON FUNCTION public.period_status_at(BIGINT, TIMESTAMPTZ)
FROM authenticated;

REVOKE EXECUTE ON FUNCTION public.resolve_branch_printer_for_type(BIGINT, BIGINT, TEXT)
FROM authenticated;

REVOKE EXECUTE ON FUNCTION public.resolve_print_template_version(BIGINT, BIGINT, TEXT)
FROM authenticated;

REVOKE EXECUTE ON FUNCTION public.validate_journal_balance(BIGINT)
FROM authenticated;
