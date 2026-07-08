BEGIN;

DROP TABLE IF EXISTS
  public._ing_backup_a2fix,
  public._ingcost_backup_a2fix,
  public._ingthr_backup_a2fix,
  public._iu_backup_a2fix,
  public._sl_backup_a2fix,
  public._sm_backup_a2fix;

CREATE OR REPLACE FUNCTION public.cancel_production_run(p_run_id bigint) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_uid UUID := auth.uid();
    v_tenant BIGINT := public.auth_tenant_id();
    v_run RECORD;
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
    END IF;

    IF NOT public.is_inventory_production_operator() THEN
        RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
    END IF;

    IF NOT public.has_permission_any('inventory:production_confirm') THEN
        RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
    END IF;

    SELECT * INTO v_run FROM public.production_runs
    WHERE id = p_run_id AND tenant_id = v_tenant FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'production_run_not_found' USING ERRCODE = 'P0002'; END IF;

    IF NOT public.has_permission(v_run.branch_id, 'inventory:production_confirm') THEN
        RAISE EXCEPTION 'branch_scope_violation' USING ERRCODE = '42501';
    END IF;

    IF v_run.status <> 'draft' AND v_run.status <> 'in_progress' THEN
        RAISE EXCEPTION 'production_run_not_cancellable' USING ERRCODE = '22023';
    END IF;

    UPDATE public.production_runs
    SET status = 'cancelled', updated_at = now()
    WHERE id = p_run_id AND tenant_id = v_tenant;

    RETURN jsonb_build_object('production_run_id', p_run_id, 'status', 'cancelled');
END;
$$;

CREATE OR REPLACE FUNCTION public.start_production_run(p_run_id bigint) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_uid UUID := auth.uid();
    v_tenant BIGINT := public.auth_tenant_id();
    v_run RECORD;
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
    END IF;

    IF NOT public.is_inventory_production_operator() THEN
        RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
    END IF;

    IF NOT public.has_permission_any('inventory:production_confirm') THEN
        RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
    END IF;

    SELECT * INTO v_run FROM public.production_runs
    WHERE id = p_run_id AND tenant_id = v_tenant FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'production_run_not_found' USING ERRCODE = 'P0002'; END IF;

    IF NOT public.has_permission(v_run.branch_id, 'inventory:production_confirm') THEN
        RAISE EXCEPTION 'branch_scope_violation' USING ERRCODE = '42501';
    END IF;

    IF v_run.status <> 'draft' THEN
        RAISE EXCEPTION 'production_run_not_draft' USING ERRCODE = '22023';
    END IF;

    UPDATE public.production_runs
    SET status = 'in_progress', started_at = now(), updated_at = now()
    WHERE id = p_run_id AND tenant_id = v_tenant;

    RETURN jsonb_build_object('production_run_id', p_run_id, 'status', 'in_progress');
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_production_run(bigint) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.start_production_run(bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_production_run(bigint) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.start_production_run(bigint) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.confirm_production_run(bigint, numeric) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.confirm_production_run(bigint, numeric, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_production_recipe_context(bigint, bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirm_production_run(bigint, numeric) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.confirm_production_run(bigint, numeric, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_production_recipe_context(bigint, bigint) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.self_order_append_active_batch(bigint, bigint, uuid, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.self_order_canonicalize_cart(bigint, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.self_order_append_active_batch(bigint, bigint, uuid, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.self_order_canonicalize_cart(bigint, jsonb) TO service_role;

COMMIT;
