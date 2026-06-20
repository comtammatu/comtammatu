-- Atomic KDS station + categories write. Mirrors upsert_printer_with_routes.
-- SECURITY DEFINER bypasses RLS, so tenant derivation + has_permission gate ARE
-- the security boundary. No EXCEPTION block: an uncaught RAISE rolls back the
-- station row and its categories together (the orphan station this RPC replaces).
CREATE OR REPLACE FUNCTION public.upsert_station_with_categories(
  p_station_id   bigint DEFAULT NULL,
  p_branch_id    bigint DEFAULT NULL,
  p_name         text DEFAULT NULL,
  p_position     integer DEFAULT 0,
  p_is_active    boolean DEFAULT true,
  p_category_ids bigint[] DEFAULT ARRAY[]::bigint[]
)
  RETURNS bigint
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path TO 'public'
  AS $$
DECLARE
  v_uid             uuid    := auth.uid();
  v_tenant_id       bigint  := public.auth_tenant_id();
  v_claim_branch_id bigint  := public.auth_branch_id();
  v_existing        RECORD;
  v_station_id      bigint;
  v_category_id     bigint;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'tenant_mismatch' USING ERRCODE = '42501';
  END IF;
  IF p_branch_id IS NULL OR NULLIF(btrim(COALESCE(p_name, '')), '') IS NULL THEN
    RAISE EXCEPTION 'invalid_station_payload' USING ERRCODE = '22023';
  END IF;
  IF COALESCE(p_position, 0) < 0 THEN
    RAISE EXCEPTION 'invalid_station_payload' USING ERRCODE = '22023';
  END IF;

  -- Branch-scoped users may only act on their assigned branch.
  IF v_claim_branch_id IS NOT NULL AND v_claim_branch_id <> p_branch_id THEN
    RAISE EXCEPTION 'branch_mismatch' USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_permission(p_branch_id, 'settings:branch') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  PERFORM 1 FROM public.branches WHERE id = p_branch_id AND tenant_id = v_tenant_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'branch_not_found' USING ERRCODE = 'P0002';
  END IF;

  FOREACH v_category_id IN ARRAY COALESCE(p_category_ids, ARRAY[]::bigint[])
  LOOP
    PERFORM 1 FROM public.menu_categories
     WHERE id = v_category_id AND tenant_id = v_tenant_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'category_not_found' USING ERRCODE = 'P0002';
    END IF;
  END LOOP;

  IF p_station_id IS NOT NULL THEN
    SELECT id, branch_id INTO v_existing
      FROM public.kds_stations
     WHERE id = p_station_id AND tenant_id = v_tenant_id
     FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'station_not_found' USING ERRCODE = 'P0002';
    END IF;
    IF v_existing.branch_id <> p_branch_id THEN
      RAISE EXCEPTION 'cannot_move_station_across_branches' USING ERRCODE = '22023';
    END IF;

    UPDATE public.kds_stations
       SET name = btrim(p_name),
           position = COALESCE(p_position, 0),
           is_active = COALESCE(p_is_active, TRUE),
           updated_at = now()
     WHERE id = p_station_id AND tenant_id = v_tenant_id
     RETURNING id INTO v_station_id;
  ELSE
    INSERT INTO public.kds_stations (tenant_id, branch_id, name, position, is_active)
    VALUES (v_tenant_id, p_branch_id, btrim(p_name), COALESCE(p_position, 0), COALESCE(p_is_active, TRUE))
    RETURNING id INTO v_station_id;
  END IF;

  DELETE FROM public.kds_station_categories
   WHERE station_id = v_station_id AND tenant_id = v_tenant_id;

  IF COALESCE(array_length(p_category_ids, 1), 0) > 0 THEN
    INSERT INTO public.kds_station_categories (tenant_id, station_id, category_id)
    SELECT DISTINCT v_tenant_id, v_station_id, x.category_id
      FROM unnest(p_category_ids) AS x(category_id)
     WHERE x.category_id IS NOT NULL
    ON CONFLICT (station_id, category_id, tenant_id) DO NOTHING;
  END IF;

  RETURN v_station_id;
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_station_with_categories(bigint, bigint, text, integer, boolean, bigint[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_station_with_categories(bigint, bigint, text, integer, boolean, bigint[]) TO authenticated;
