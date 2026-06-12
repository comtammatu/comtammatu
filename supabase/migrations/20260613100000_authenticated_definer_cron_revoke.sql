BEGIN;

REVOKE EXECUTE ON FUNCTION public.auto_close_periods()
  FROM authenticated;

REVOKE EXECUTE ON FUNCTION public.cleanup_abandoned_payments(interval)
  FROM authenticated;

REVOKE EXECUTE ON FUNCTION public.compute_branch_daily_waste_caps()
  FROM authenticated;

REVOKE EXECUTE ON FUNCTION public.refresh_abc_classification()
  FROM authenticated;

REVOKE EXECUTE ON FUNCTION public.weekly_grn_override_report()
  FROM authenticated;

REVOKE EXECUTE ON FUNCTION public.weekly_waste_report()
  FROM authenticated;

COMMIT;
