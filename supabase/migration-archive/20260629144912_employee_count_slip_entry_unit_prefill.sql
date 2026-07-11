DROP FUNCTION IF EXISTS public.get_my_count_slip(BIGINT);

CREATE FUNCTION public.get_my_count_slip(p_slip_id BIGINT)
RETURNS TABLE (
  ingredient_id BIGINT,
  counted_quantity NUMERIC,
  entry_unit_id BIGINT,
  note TEXT
)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  SELECT l.ingredient_id, l.counted_quantity, l.entry_unit_id, l.note
  FROM public.inventory_count_slip_lines l
  JOIN public.inventory_count_slips s ON s.id = l.slip_id
  JOIN public.employees e ON e.id = s.employee_id
  WHERE l.slip_id = p_slip_id
    AND s.tenant_id = public.auth_tenant_id()
    AND e.profile_id = auth.uid();
$$;

COMMENT ON FUNCTION public.get_my_count_slip(BIGINT) IS
  'Blind read of the caller''s own count slip lines (counted_quantity and entry_unit_id only; never system_quantity/variance).';

REVOKE ALL ON FUNCTION public.get_my_count_slip(BIGINT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_count_slip(BIGINT) TO authenticated, service_role;
