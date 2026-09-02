-- Drop retired inventory RPCs after a 6-channel scan.
-- Channels (2026-08-13 Production enloyfnuerqgaqderbwb + repo):
--   1 JS .rpc: apps/ and packages/ have no live callers (e2e rewritten to demand).
--   2 SQL PERFORM/SELECT: no remaining public/private callees outside this drop set.
--   3 Triggers: none.
--   4 RLS: none.
--   5 DEFAULT/CHECK: none.
--   6 cron.job: none.
-- KEEP: save_purchase_request (callee of save_purchase_demand),
--   create_grn_draft_from_po, start_stocktake, live production
--   create_production_run(recipe_spec), start/cancel 2/3-arg overloads,
--   upsert_production_recipe_lines(output_unit), adjust_stock_exception(entry unit),
--   transfer confirm_receive/receive, valuation pair, cron wrappers, POS waste.

DROP FUNCTION IF EXISTS public.save_purchase_order_group(uuid, bigint, date, text, jsonb, boolean, uuid);
DROP FUNCTION IF EXISTS public.review_purchase_order(bigint, text, text);
DROP FUNCTION IF EXISTS public.send_purchase_order(bigint);
DROP FUNCTION IF EXISTS public.create_purchase_order_from_request(bigint, bigint, date, text, jsonb);
DROP FUNCTION IF EXISTS public.create_grn_from_approved_po(bigint);
DROP FUNCTION IF EXISTS public.create_purchase_orders_from_grn(bigint);
DROP FUNCTION IF EXISTS public.update_purchase_order_prices_protected(bigint, jsonb);
DROP FUNCTION IF EXISTS public.update_purchase_order_prices(bigint, jsonb);

DROP FUNCTION IF EXISTS public.create_stocktake_session(bigint, bigint);
DROP FUNCTION IF EXISTS public.finalize_stocktake(bigint);
DROP FUNCTION IF EXISTS public.assign_auditor(bigint, uuid, bigint);
DROP FUNCTION IF EXISTS public.resolve_stocktake_conflict(bigint, text, numeric, text);
DROP FUNCTION IF EXISTS public.close_recount_round(bigint, smallint);
DROP FUNCTION IF EXISTS public.escalate_round_4(bigint, bigint, numeric, text);
DROP FUNCTION IF EXISTS public.enable_offline_for_session(bigint);

DROP FUNCTION IF EXISTS public.create_production_run(bigint, bigint, numeric, bigint, text, bigint, jsonb);
DROP FUNCTION IF EXISTS public.create_production_run_with_locations(bigint, bigint, numeric, bigint, text, bigint, jsonb, bigint, bigint);
DROP FUNCTION IF EXISTS public.confirm_production_run(bigint, numeric, jsonb);
DROP FUNCTION IF EXISTS public.record_production_run(bigint, bigint, numeric, bigint, numeric, text, bigint, jsonb, bigint, bigint);
DROP FUNCTION IF EXISTS public.start_production_run(bigint);
DROP FUNCTION IF EXISTS public.cancel_production_run(bigint);
DROP FUNCTION IF EXISTS public.upsert_production_recipe_lines(bigint, jsonb, numeric, bigint);
DROP FUNCTION IF EXISTS public.bulk_import_production_recipes(jsonb);
DROP FUNCTION IF EXISTS public.get_production_recipe_context(bigint, bigint);
DROP FUNCTION IF EXISTS public.get_production_recipe_context_for_location(bigint, bigint, bigint);

DROP FUNCTION IF EXISTS public.create_expiry_writeoff(bigint, bigint, bigint, numeric, bigint, text, text[]);
DROP FUNCTION IF EXISTS public.adjust_stock_exception(bigint, bigint, numeric, text);

/*
-- RPC-ROLLBACK-MUST-INCLUDE-BODY
-- Snapshot source: Production catalog 2026-08-13, project enloyfnuerqgaqderbwb.
-- Restore with CREATE OR REPLACE + original GRANT/REVOKE. Wrapper stubs below
-- are complete. Large bodies (save_purchase_order_group 10201, review_purchase_order
-- 3829, create_grn_from_approved_po 8255, create_purchase_order_from_request 7755,
-- create_purchase_orders_from_grn 6228, create_stocktake_session 3959,
-- close_recount_round 5716, create_expiry_writeoff 5238, resolve_stocktake_conflict
-- 4165, send_purchase_order 2082, update_purchase_order_prices 2437,
-- assign_auditor 2647, escalate_round_4 3264, enable_offline_for_session 1825,
-- bulk_import_production_recipes 2169, finalize_stocktake 902,
-- adjust_stock_exception quantity_change 1589) were captured via
-- pg_get_functiondef on that catalog; restore those identities from that
-- snapshot, not from older overlay timestamps.

CREATE OR REPLACE FUNCTION public.cancel_production_run(p_run_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$ BEGIN
  PERFORM auth.role();
  RAISE EXCEPTION 'production_maintenance_legacy_rpc' USING ERRCODE = '55000';
END; $function$;

CREATE OR REPLACE FUNCTION public.confirm_production_run(p_run_id bigint, p_actual_quantity numeric DEFAULT NULL::numeric, p_actual_ingredients jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$ BEGIN
  PERFORM auth.role();
  RAISE EXCEPTION 'production_maintenance_legacy_rpc' USING ERRCODE = '55000';
END; $function$;

CREATE OR REPLACE FUNCTION public.create_production_run_with_locations(p_branch_id bigint, p_finished_good_id bigint, p_planned_quantity numeric, p_entry_unit_id bigint, p_notes text DEFAULT NULL::text, p_target_branch_id bigint DEFAULT NULL::bigint, p_ingredients_override jsonb DEFAULT NULL::jsonb, p_source_location_id bigint DEFAULT NULL::bigint, p_target_location_id bigint DEFAULT NULL::bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$ BEGIN
  PERFORM auth.role();
  RAISE EXCEPTION 'production_maintenance_legacy_rpc' USING ERRCODE = '55000';
END; $function$;

CREATE OR REPLACE FUNCTION public.create_production_run(p_branch_id bigint, p_finished_good_id bigint, p_planned_quantity numeric, p_entry_unit_id bigint, p_notes text DEFAULT NULL::text, p_target_branch_id bigint DEFAULT NULL::bigint, p_ingredients_override jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO 'public'
AS $function$
  SELECT public.create_production_run_with_locations(
    p_branch_id,
    p_finished_good_id,
    p_planned_quantity,
    p_entry_unit_id,
    p_notes,
    p_target_branch_id,
    p_ingredients_override,
    NULL::bigint,
    NULL::bigint
  );
$function$;

CREATE OR REPLACE FUNCTION public.get_production_recipe_context_for_location(p_finished_good_id bigint, p_branch_id bigint, p_source_location_id bigint DEFAULT NULL::bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$ BEGIN
  PERFORM auth.role();
  RAISE EXCEPTION 'production_maintenance_legacy_rpc' USING ERRCODE = '55000';
END; $function$;

CREATE OR REPLACE FUNCTION public.get_production_recipe_context(p_finished_good_id bigint, p_branch_id bigint)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO 'public'
AS $function$
  SELECT public.get_production_recipe_context_for_location(
    p_finished_good_id,
    p_branch_id,
    NULL::bigint
  );
$function$;

CREATE OR REPLACE FUNCTION public.record_production_run(p_branch_id bigint, p_finished_good_id bigint, p_planned_quantity numeric, p_entry_unit_id bigint, p_actual_quantity numeric, p_notes text DEFAULT NULL::text, p_target_branch_id bigint DEFAULT NULL::bigint, p_actual_ingredients jsonb DEFAULT NULL::jsonb, p_source_location_id bigint DEFAULT NULL::bigint, p_target_location_id bigint DEFAULT NULL::bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$ BEGIN
  PERFORM auth.role();
  RAISE EXCEPTION 'production_maintenance_legacy_rpc' USING ERRCODE = '55000';
END; $function$;

CREATE OR REPLACE FUNCTION public.start_production_run(p_run_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$ BEGIN
  PERFORM auth.role();
  RAISE EXCEPTION 'production_maintenance_legacy_rpc' USING ERRCODE = '55000';
END; $function$;

CREATE OR REPLACE FUNCTION public.upsert_production_recipe_lines(p_finished_good_id bigint, p_lines jsonb, p_output_quantity numeric, p_old_finished_good_id bigint DEFAULT NULL::bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$ BEGIN
  PERFORM auth.role();
  RAISE EXCEPTION 'production_maintenance_legacy_rpc' USING ERRCODE = '55000';
END; $function$;

CREATE OR REPLACE FUNCTION public.update_purchase_order_prices_protected(p_po_id bigint, p_lines jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF NOT public.can_read_inventory_monetary(
    'procurement:price_list_read'
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  RETURN public.update_purchase_order_prices(p_po_id, p_lines);
END;
$function$;
*/
