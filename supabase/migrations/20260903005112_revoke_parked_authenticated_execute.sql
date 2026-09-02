-- Park unused authenticated EXECUTE on cutover and high-confidence twin RPCs.
-- Live replacements stay granted: approve_leave_request_with_roster,
-- transition_expense_payment, get_finance_food_cost_recorded,
-- get_revenue_kpis / get_branch_day_report, refresh_inventory_dashboard.
-- Do not DROP. Keep service_role where the baseline already granted it.
-- cron.schedule upserts by jobname so already-applied Production fold still
-- receives the jobs fold historically omitted.

REVOKE ALL ON FUNCTION public.prepare_inventory_valuation_cutover(uuid) FROM authenticated;
REVOKE ALL ON FUNCTION public.activate_inventory_valuation_cutover(uuid) FROM authenticated;
REVOKE ALL ON FUNCTION public.approve_leave_request(bigint) FROM authenticated;
REVOKE ALL ON FUNCTION public.create_expense_transfer_intent(bigint, date, text, jsonb, text, text, text) FROM authenticated;
REVOKE ALL ON FUNCTION public.get_food_cost(bigint, date, date) FROM authenticated;
REVOKE ALL ON FUNCTION public.get_daily_revenue(bigint, date, date) FROM authenticated;
REVOKE ALL ON FUNCTION public.get_inventory_dashboard(bigint) FROM authenticated;
REVOKE ALL ON FUNCTION public.get_branch_day_summary(bigint, date) FROM anon, authenticated;

SELECT cron.schedule(
  'inventory-valuation-reconciliation-daily',
  '15 23 * * *',
  'SELECT public.run_inventory_valuation_reconciliation();'
);
SELECT cron.schedule(
  'scan-order-delay-sla',
  '* * * * *',
  'SELECT public.scan_order_delay_sla();'
);
