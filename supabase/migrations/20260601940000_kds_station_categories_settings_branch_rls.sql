-- =============================================================
-- KDS station categories: branch-settings authority
--
-- The KDS settings UI is gated by settings:branch. Category mapping on a
-- kitchen station is branch floor routing config, not menu taxonomy admin.
-- Keep menu category CRUD on menu:manage_category, but allow station routing
-- rows to be replaced by users who can manage that station's branch settings.
-- =============================================================

DROP POLICY IF EXISTS "kds_station_categories_write" ON public.kds_station_categories;
DROP POLICY IF EXISTS "management_insert" ON public.kds_station_categories;
DROP POLICY IF EXISTS "management_update" ON public.kds_station_categories;
DROP POLICY IF EXISTS "management_delete" ON public.kds_station_categories;
DROP POLICY IF EXISTS "kds_station_categories_insert" ON public.kds_station_categories;
DROP POLICY IF EXISTS "kds_station_categories_update" ON public.kds_station_categories;
DROP POLICY IF EXISTS "kds_station_categories_delete" ON public.kds_station_categories;

CREATE POLICY "kds_station_categories_insert" ON public.kds_station_categories
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND station_id IN (
      SELECT s.id
      FROM public.kds_stations s
      WHERE s.tenant_id = public.auth_tenant_id()
        AND public.has_permission(s.branch_id, 'settings:branch')
    )
    AND category_id IN (
      SELECT c.id
      FROM public.menu_categories c
      WHERE c.tenant_id = public.auth_tenant_id()
    )
  );

CREATE POLICY "kds_station_categories_update" ON public.kds_station_categories
  FOR UPDATE TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND station_id IN (
      SELECT s.id
      FROM public.kds_stations s
      WHERE s.tenant_id = public.auth_tenant_id()
        AND public.has_permission(s.branch_id, 'settings:branch')
    )
  )
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND station_id IN (
      SELECT s.id
      FROM public.kds_stations s
      WHERE s.tenant_id = public.auth_tenant_id()
        AND public.has_permission(s.branch_id, 'settings:branch')
    )
    AND category_id IN (
      SELECT c.id
      FROM public.menu_categories c
      WHERE c.tenant_id = public.auth_tenant_id()
    )
  );

CREATE POLICY "kds_station_categories_delete" ON public.kds_station_categories
  FOR DELETE TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND station_id IN (
      SELECT s.id
      FROM public.kds_stations s
      WHERE s.tenant_id = public.auth_tenant_id()
        AND public.has_permission(s.branch_id, 'settings:branch')
    )
  );

CREATE OR REPLACE FUNCTION public.save_station_categories(
  p_station_id BIGINT,
  p_category_ids BIGINT[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_station RECORD;
  v_distinct_category_count INT;
  v_valid_category_count INT;
BEGIN
  SELECT id, tenant_id, branch_id
    INTO v_station
  FROM public.kds_stations
  WHERE id = p_station_id
    AND tenant_id = public.auth_tenant_id();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Station not found' USING ERRCODE = 'P0002';
  END IF;

  IF COALESCE(array_length(p_category_ids, 1), 0) > 0 THEN
    SELECT COUNT(DISTINCT x.category_id)
      INTO v_distinct_category_count
    FROM unnest(p_category_ids) AS x(category_id)
    WHERE x.category_id IS NOT NULL;

    SELECT COUNT(DISTINCT c.id)
      INTO v_valid_category_count
    FROM public.menu_categories c
    WHERE c.tenant_id = v_station.tenant_id
      AND c.id = ANY(p_category_ids);

    IF v_valid_category_count <> v_distinct_category_count THEN
      RAISE EXCEPTION 'Invalid station category' USING ERRCODE = '22023';
    END IF;
  END IF;

  DELETE FROM public.kds_station_categories
  WHERE station_id = p_station_id
    AND tenant_id = v_station.tenant_id;

  IF COALESCE(array_length(p_category_ids, 1), 0) > 0 THEN
    INSERT INTO public.kds_station_categories (tenant_id, station_id, category_id)
    SELECT DISTINCT v_station.tenant_id, p_station_id, x.category_id
    FROM unnest(p_category_ids) AS x(category_id)
    WHERE x.category_id IS NOT NULL
    ON CONFLICT (station_id, category_id, tenant_id) DO NOTHING;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.save_station_categories(BIGINT, BIGINT[]) TO authenticated;

COMMENT ON POLICY "kds_station_categories_insert" ON public.kds_station_categories IS
  'KDS station category routing is branch floor settings: gate by station branch settings:branch, not menu category admin.';
COMMENT ON POLICY "kds_station_categories_update" ON public.kds_station_categories IS
  'KDS station category routing is branch floor settings: gate by station branch settings:branch, not menu category admin.';
COMMENT ON POLICY "kds_station_categories_delete" ON public.kds_station_categories IS
  'KDS station category routing is branch floor settings: gate by station branch settings:branch, not menu category admin.';
