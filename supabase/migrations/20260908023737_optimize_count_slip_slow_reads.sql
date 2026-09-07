-- Migration: optimize_count_slip_slow_reads
-- Optimize list_inventory_count_slip_lines with MATERIALIZED CTE optimization barriers
-- so public.has_permission is called exactly once per distinct branch in p_slip_ids.

CREATE OR REPLACE FUNCTION public.list_inventory_count_slip_lines(p_slip_ids bigint[])
RETURNS TABLE (
  id bigint,
  slip_id bigint,
  ingredient_id bigint,
  system_quantity numeric,
  counted_quantity numeric,
  entry_unit_id bigint,
  entry_to_base_factor numeric,
  counted_base_quantity numeric,
  recount_required boolean,
  last_recount_round integer,
  note text,
  ingredient_name text,
  unit_code text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_tenant bigint := public.auth_tenant_id();
BEGIN
  IF auth.uid() IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  IF p_slip_ids IS NULL OR cardinality(p_slip_ids) = 0 THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH requested_branches AS MATERIALIZED (
    SELECT DISTINCT slip.branch_id
    FROM public.inventory_count_slips AS slip
    WHERE slip.tenant_id = v_tenant
      AND slip.id = ANY (p_slip_ids)
  ),
  allowed_branches AS MATERIALIZED (
    SELECT rb.branch_id
    FROM requested_branches rb
    WHERE public.has_permission(rb.branch_id, 'inventory:count_approve')
  ),
  authorized_slips AS (
    SELECT slip.id
    FROM public.inventory_count_slips AS slip
    JOIN allowed_branches ab ON ab.branch_id = slip.branch_id
    WHERE slip.tenant_id = v_tenant
      AND slip.id = ANY (p_slip_ids)
  )
  SELECT
    line.id,
    line.slip_id,
    line.ingredient_id,
    line.system_quantity,
    line.counted_quantity,
    line.entry_unit_id,
    line.entry_to_base_factor,
    line.counted_base_quantity,
    line.recount_required,
    line.last_recount_round,
    line.note,
    ingredient.name,
    unit.code
  FROM authorized_slips AS auth_slip
  JOIN public.inventory_count_slip_lines AS line
    ON line.slip_id = auth_slip.id
   AND line.tenant_id = v_tenant
  JOIN public.ingredients AS ingredient
    ON ingredient.id = line.ingredient_id
   AND ingredient.tenant_id = v_tenant
  LEFT JOIN public.units AS unit
    ON unit.id = line.entry_unit_id
   AND unit.tenant_id = v_tenant;
END;
$$;

COMMENT ON FUNCTION public.list_inventory_count_slip_lines(bigint[]) IS
  'Count-slip lines with materialized branch permission check. Direct line RLS stays for other callers.';

REVOKE ALL ON FUNCTION public.list_inventory_count_slip_lines(bigint[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_inventory_count_slip_lines(bigint[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.list_inventory_count_slip_lines(bigint[]) TO authenticated;
